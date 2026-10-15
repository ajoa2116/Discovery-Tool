using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Text.Json;
using ApplicationCompanion;
using Microsoft.Win32.SafeHandles;

// Compiled ONLY by the independent test project, never the native application's
// default compile glob. Reflection reuses existing native path/descriptor APIs;
// any private layout change denies rather than introducing fallback verification.
namespace ApplicationCompanion.TestFixtures;
internal sealed class MeasuredInputLifetime : IDisposable
{
    internal sealed record Input(string Role, string RelativePath, long Length, string Sha256);
    internal sealed record Fact(string Role, string RelativePath, uint Volume, ulong FileId, long Length,
        string Sha256, ulong Created, ulong Written, uint Attributes, uint Links, Guid FixtureOwner);
    internal sealed class HandoffEvidence(IReadOnlyList<Fact> files, bool completeAncestry, string root, IReadOnlyList<InstalledRootAdmission.Fact> observation)
    {
        internal IReadOnlyList<Fact> Files { get; } = files;
        internal bool CompleteAncestry { get; } = completeAncestry;
        internal string Root { get; } = root;
        internal IReadOnlyList<InstalledRootAdmission.Fact> RootObservation { get; } = observation;
        public bool ProductionAuthority => false;
        public bool CompleteClosure => false;
        public bool RaceFree => false;
        public IReadOnlyList<string> Unresolved => Array.AsReadOnly(new[] { "framework selection", "RID alternatives", "roll-forward", "additional probing paths", "WebView2/runtime providers", "actual loader mappings" });
    }
    internal sealed class Rejected(string reason) : IOException(reason) { internal string Reason { get; } = reason; }
    internal enum Phase { PreOpen, Measuring, Measured, HandedOff, SimulatedUse, Released, Denied }
    private sealed record Pin(string Path, SafeFileHandle Handle, object Identity);
    private sealed record FileInput(Input Input, string Path, FileStream Stream, SafeFileHandle Handle, object Identity);
    private static readonly BindingFlags NativeFlags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
    private static readonly object OwnershipLock = new();
    private static readonly Dictionary<(uint, ulong), MeasuredInputLifetime> Owners = [];
    private readonly object sync = new();
    private readonly List<Pin> pins = [];
    private readonly List<FileInput> files = [];
    private readonly List<(uint, ulong)> claims = [];
    private readonly Input[] inputs;
    private readonly string root;
    private readonly string? boundary;
    private readonly InstalledRootAdmission.Fact[] observed;
    private readonly Guid owner = Guid.NewGuid(); // diagnostic correlation, never authorization
    private readonly bool completeAncestry;
    private HandoffEvidence? handoff;
    private Phase phase = Phase.PreOpen;
    internal Phase State { get { lock (sync) return phase; } }
    internal int OutstandingHandles { get { lock (sync) return pins.Count(p => !p.Handle.IsClosed) + files.Count(f => !f.Handle.IsClosed); } }
    internal IReadOnlyList<Fact> Measurements { get; private set; } = Array.Empty<Fact>();

    private static object Native(string name, params object[] args)
    {
        var method = typeof(InstalledRootAdmission).GetMethod(name, NativeFlags) ?? throw new Rejected("admission-layout");
        try { return method.Invoke(null, args) ?? throw new Rejected("admission-layout"); }
        catch (TargetInvocationException error)
        {
            var failure = error.InnerException!;
            string reason = failure.GetType().GetField("Reason", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(failure) as string ?? "native-observation";
            throw new Rejected(reason);
        }
    }
    private static object Field(object info, string field) => info.GetType().GetField(field)?.GetValue(info) ?? throw new Rejected("identity-layout");
    private static uint U(object info, string field) => (uint)Field(info, field);
    private static ulong T(object info, string field)
    {
        var t = (System.Runtime.InteropServices.ComTypes.FILETIME)Field(info, field);
        return ((ulong)(uint)t.dwHighDateTime << 32) | (uint)t.dwLowDateTime;
    }
    private static (uint, ulong) Id(object info) => (U(info, "Volume"), ((ulong)U(info, "IndexHigh") << 32) | U(info, "IndexLow"));
    private static long Length(object info) => checked((long)(((ulong)U(info, "SizeHigh") << 32) | U(info, "SizeLow")));
    private static bool Same(object a, object b) =>
        new[] { "Volume", "IndexHigh", "IndexLow", "Attributes", "Links", "SizeHigh", "SizeLow" }.All(f => Equals(Field(a, f), Field(b, f)))
        && T(a, "Created") == T(b, "Created") && T(a, "Written") == T(b, "Written"); // access time is not invariant
    private string Resolve(string relative)
    {
        if (string.IsNullOrEmpty(relative) || !Regex.IsMatch(relative, "^[A-Za-z0-9_@./-]+$") ||
            relative.Split('/').Any(p => p is "" or "." or "..") || relative.StartsWith('/'))
            throw new Rejected("relative-path");
        string path = (string)Native("Canonical", Path.Combine(root, relative.Replace('/', '\\')));
        if (!path.StartsWith(root + "\\", StringComparison.Ordinal)) throw new Rejected("relative-path");
        return path;
    }
    private InstalledRootAdmission.Evidence Observe()
    {
        var evidence = boundary is null ? InstalledRootAdmission.Verify(root) : InstalledRootAdmission.ObserveFixtureSubtree(root, boundary);
        if (!evidence.ObservedScopeProtected || evidence.Denial is not null) throw new Rejected("admission:" + evidence.Denial);
        return evidence;
    }
    private MeasuredInputLifetime(string requestedRoot, string? fixtureBoundary, Input[] requested)
    {
        root = (string)Native("Canonical", requestedRoot);
        boundary = fixtureBoundary is null ? null : (string)Native("Canonical", fixtureBoundary);
        inputs = requested.ToArray();
        if (inputs.Length is < 6 or > 64 || inputs.Sum(i => i.Length > 0 && i.Length <= 134217728 ? i.Length : throw new Rejected("input-length")) > 268435456)
            throw new Rejected("input-bound");
        string[] required = ["node-runtime", "backend-entry", "native-addon", "native-owner"];
        if (required.Any(role => inputs.Count(i => i.Role == role) != 1) ||
            inputs.Any(i => !required.Contains(i.Role) && i.Role is not ("configuration" or "dependency" or "metadata")))
            throw new Rejected("input-role");
        var paths = inputs.Select(i => Resolve(i.RelativePath)).ToArray();
        if (paths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != paths.Length) throw new Rejected("duplicate-input");
        if (inputs.Any(i => !Regex.IsMatch(i.Sha256, "^[a-f0-9]{64}$"))) throw new Rejected("input-digest");
        string ownerPath = inputs.Single(i => i.Role == "native-owner").RelativePath;
        foreach (string extension in new[] { ".deps.json", ".runtimeconfig.json" })
            if (!inputs.Any(i => i.Role == "configuration" && i.RelativePath == Path.ChangeExtension(ownerPath, extension)))
                throw new Rejected("missing-owner-configuration");
        if (!inputs.Any(i => i.Role == "dependency" && i.RelativePath == Path.ChangeExtension(ownerPath, ".dll")))
            throw new Rejected("missing-managed-entry");
        var admission = Observe(); completeAncestry = admission.CompleteAncestry;
        observed = admission.Facts.ToArray();
        CheckObservation();
    }
    internal static MeasuredInputLifetime PreOpen(string root, string? fixtureBoundary, params Input[] inputs) => new(root, fixtureBoundary, inputs);
    private void CheckObservation()
    {
        var current = Observe().Facts;
        if (current.Count != observed.Length) throw new Rejected("path-set");
        foreach (var original in observed)
        {
            var matches = current.Where(f => f.Path == original.Path).ToArray();
            if (matches.Length != 1 || matches[0] != original) throw new Rejected("root-observation-changed");
        }
        string[] selected = inputs.Select(i => Resolve(i.RelativePath)).Order(StringComparer.Ordinal).ToArray();
        string[] present = current.Where(f => f.Role == "payload-file").Select(f => f.Path).Order(StringComparer.Ordinal).ToArray();
        if (!selected.SequenceEqual(present)) throw new Rejected("unapproved-dependency");
    }
    private void Require(Phase expected) { if (phase != expected) throw new Rejected("state:" + phase); }
    private void Claim(object info)
    {
        var id = Id(info);
        lock (OwnershipLock)
        {
            if (Owners.ContainsKey(id)) throw new Rejected("duplicate-ownership");
            Owners.Add(id, this); claims.Add(id);
        }
    }
    private Fact MeasureFile(FileInput f)
    {
        if (f.Handle.IsClosed) throw new Rejected("premature-close");
        object before = Native("Identity", f.Handle, f.Path);
        if (!Same(f.Identity, before) || Length(before) != f.Input.Length) throw new Rejected("file-metadata");
        f.Stream.Position = 0;
        byte[] digest = SHA256.HashData(f.Stream);
        object after = Native("Identity", f.Handle, f.Path);
        if (!Same(before, after) || !CryptographicOperations.FixedTimeEquals(digest, Convert.FromHexString(f.Input.Sha256)))
            throw new Rejected("content-or-metadata");
        var id = Id(after);
        return new(f.Input.Role, f.Input.RelativePath, id.Item1, id.Item2, Length(after),
            Convert.ToHexString(digest).ToLowerInvariant(), T(after, "Created"), T(after, "Written"),
            U(after, "Attributes"), U(after, "Links"), owner);
    }
    private void Recheck()
    {
        CheckObservation();
        foreach (var pin in pins)
        {
            if (pin.Handle.IsClosed || pin.Handle.IsInvalid) throw new Rejected("premature-close");
            if (!Same(pin.Identity, Native("Identity", pin.Handle, pin.Path))) throw new Rejected("retained-metadata");
            byte[] expected = Convert.FromBase64String(observed.Single(f => f.Path == pin.Path).Descriptor);
            if (!((byte[])Native("Descriptor", pin.Handle, pin.Path)).SequenceEqual(expected)) throw new Rejected("retained-descriptor");
        }
        foreach (var file in files) _ = MeasureFile(file);
        CheckSidecars();
        CheckObservation(); // no loader/process executes after these sequential observations
    }
    // Deliberately small data-only subset, NOT a CLR resolver. Parse only bytes
    // read from our retained streams and matched to the selected measurements.
    private JsonDocument Sidecar(string relative)
    {
        var file = files.Single(f => f.Input.RelativePath == relative);
        if (file.Input.Length > 65536) throw new Rejected("sidecar-bound");
        _ = MeasureFile(file);
        file.Stream.Position = 0;
        byte[] bytes = new byte[checked((int)file.Input.Length)];
        file.Stream.ReadExactly(bytes);
        if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(bytes), Convert.FromHexString(file.Input.Sha256)) ||
            !Same(file.Identity, Native("Identity", file.Handle, file.Path))) throw new Rejected("sidecar-content");
        try { return JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 }); }
        catch (JsonException) { throw new Rejected("sidecar-json"); }
    }
    private static void Shape(JsonElement element, params string[] names)
    {
        if (element.ValueKind != JsonValueKind.Object) throw new Rejected("sidecar-form");
        var actual = element.EnumerateObject().Select(p => p.Name).ToArray();
        if (actual.Distinct(StringComparer.OrdinalIgnoreCase).Count() != actual.Length ||
            !actual.Order(StringComparer.Ordinal).SequenceEqual(names.Order(StringComparer.Ordinal))) throw new Rejected("sidecar-form");
    }
    private static JsonProperty[] Members(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) throw new Rejected("sidecar-form");
        var members = element.EnumerateObject().ToArray();
        if (members.Length is < 1 or > 64 || members.Select(p => p.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != members.Length)
            throw new Rejected("sidecar-duplicate-or-bound");
        return members;
    }
    private void CheckSidecars()
    {
        string executable = inputs.Single(i => i.Role == "native-owner").RelativePath;
        string folder = executable[..(executable.LastIndexOf('/') + 1)];
        string entry = Path.ChangeExtension(executable, ".dll");
        using var config = Sidecar(Path.ChangeExtension(executable, ".runtimeconfig.json"));
        Shape(config.RootElement, "runtimeOptions");
        var options = config.RootElement.GetProperty("runtimeOptions");
        if (options.ValueKind == JsonValueKind.Object && options.EnumerateObject().Any(p => p.Name is "framework" or "frameworks" or "includedFrameworks" or "rollForward" or "additionalProbingPaths"))
            throw new Rejected("unresolved-runtime-provider");
        Shape(options, "tfm");
        if (options.GetProperty("tfm").ValueKind != JsonValueKind.String || options.GetProperty("tfm").GetString() != "net10.0") throw new Rejected("sidecar-form");
        using var deps = Sidecar(Path.ChangeExtension(executable, ".deps.json"));
        var rootElement = deps.RootElement;
        Shape(rootElement, "runtimeTarget", "targets", "libraries");
        var target = rootElement.GetProperty("runtimeTarget"); Shape(target, "name");
        const string targetName = ".NETCoreApp,Version=v10.0";
        if (target.GetProperty("name").ValueKind != JsonValueKind.String || target.GetProperty("name").GetString() != targetName)
            throw new Rejected("unresolved-runtime-target");
        var targets = rootElement.GetProperty("targets"); Shape(targets, targetName);
        var libraries = Members(rootElement.GetProperty("libraries"));
        var declarations = Members(targets.GetProperty(targetName));
        if (!libraries.Select(p => p.Name).Order(StringComparer.Ordinal).SequenceEqual(declarations.Select(p => p.Name).Order(StringComparer.Ordinal)))
            throw new Rejected("sidecar-library-mismatch");
        var declared = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var library in libraries)
        {
            if (!Regex.IsMatch(library.Name, "^[A-Za-z0-9_.-]+/[0-9]+\\.[0-9]+\\.[0-9]+$")) throw new Rejected("sidecar-library");
            Shape(library.Value, "type");
            if (library.Value.GetProperty("type").ValueKind != JsonValueKind.String || library.Value.GetProperty("type").GetString() != "project") throw new Rejected("sidecar-form");
        }
        foreach (var declaration in declarations)
        {
            Shape(declaration.Value, "runtime"); // native/resources/runtimeTargets/dependency graphs unsupported
            foreach (var asset in Members(declaration.Value.GetProperty("runtime")))
            {
                Shape(asset.Value);
                // Only exact app-local DLL basenames: no URL, subfolder, RID, alias or search fallback.
                if (!Regex.IsMatch(asset.Name, "^[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.dll$") || asset.Name.Contains("..")) throw new Rejected("sidecar-path");
                string relative = folder + asset.Name;
                _ = Resolve(relative);
                if (!declared.Add(relative)) throw new Rejected("sidecar-target-duplicate");
                if (!files.Any(f => f.Input.Role == "dependency" && f.Input.RelativePath == relative)) throw new Rejected("sidecar-unselected-target");
            }
        }
        string[] selected = files.Where(f => f.Input.RelativePath.StartsWith(folder, StringComparison.Ordinal) &&
            f.Input.RelativePath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)).Select(f => f.Input.RelativePath).ToArray();
        if (!declared.Contains(entry) || !declared.Order(StringComparer.Ordinal).SequenceEqual(selected.Order(StringComparer.Ordinal)))
            throw new Rejected("sidecar-target-set");
    }
    internal void Measure()
    {
        lock (sync) try
        {
            Require(Phase.PreOpen); phase = Phase.Measuring; CheckObservation();
            foreach (var fact in observed)
            {
                var handle = (SafeFileHandle)Native("Open", fact.Path);
                pins.Add(new(fact.Path, handle, null!)); // own acquisition even if Identity fails
                pins[^1] = pins[^1] with { Identity = Native("Identity", handle, fact.Path) };
                object identity = pins[^1].Identity;
                if (Id(identity) != (fact.Volume, fact.FileId) ||
                    !((byte[])Native("Descriptor", handle, fact.Path)).SequenceEqual(Convert.FromBase64String(fact.Descriptor)))
                    throw new Rejected("open-substitution");
            }
            foreach (var input in inputs)
            {
                string path = Resolve(input.RelativePath);
                object initialIdentity = pins.Single(p => p.Path == path).Identity;
                var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                // Register acquisition BEFORE any identity collection can fail.
                var entry = new FileInput(input, path, stream, stream.SafeFileHandle, initialIdentity);
                files.Add(entry);
                if (Id(Native("Identity", entry.Handle, path)) != Id(entry.Identity)) throw new Rejected("open-substitution");
                Claim(entry.Identity);
            }
            Measurements = Array.AsReadOnly(files.Select(MeasureFile).ToArray());
            Recheck(); phase = Phase.Measured;
        }
        catch { Deny(); throw; }
    }
    internal HandoffEvidence Handoff()
    {
        lock (sync) try
        {
            Require(Phase.Measured); Recheck();
            handoff = new(Measurements, completeAncestry, root, Array.AsReadOnly(observed)); phase = Phase.HandedOff; return handoff;
        }
        catch { Deny(); throw; }
    }
    internal void SimulateUse(HandoffEvidence evidence, params string[] requestedPaths)
    {
        lock (sync) try
        {
            Require(Phase.HandedOff);
            if (!ReferenceEquals(evidence, handoff)) throw new Rejected("foreign-handoff");
            if (requestedPaths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != requestedPaths.Length ||
                !requestedPaths.Select(Resolve).Order(StringComparer.Ordinal).SequenceEqual(inputs.Select(i => Resolve(i.RelativePath)).Order(StringComparer.Ordinal)))
                throw new Rejected("unapproved-dependency");
            Recheck(); phase = Phase.SimulatedUse; // inert: no callback, image loading or process creation
        }
        catch { Deny(); throw; }
    }
    private void Cleanup()
    {
        foreach (var file in files.AsEnumerable().Reverse()) try { file.Stream.Dispose(); } catch { /* outstanding remains reported */ }
        foreach (var pin in pins.AsEnumerable().Reverse()) try { pin.Handle.Dispose(); } catch { /* outstanding remains reported */ }
        if (OutstandingHandles == 0) lock (OwnershipLock)
        {
            foreach (var claim in claims) if (Owners.TryGetValue(claim, out var holder) && ReferenceEquals(holder, this)) Owners.Remove(claim);
            claims.Clear();
        }
    }
    private void Deny() { phase = Phase.Denied; Cleanup(); }
    internal void Release()
    {
        lock (sync) try
        {
            if (phase is Phase.Released or Phase.Denied or Phase.Measuring) throw new Rejected("state:" + phase);
            Cleanup();
            if (OutstandingHandles != 0) throw new Rejected("release-pending");
            phase = Phase.Released;
        }
        catch { Deny(); throw; }
    }
    public void Dispose()
    {
        lock (sync) { Cleanup(); if (phase != Phase.Denied) phase = OutstandingHandles == 0 ? Phase.Released : Phase.Denied; }
    }
}
