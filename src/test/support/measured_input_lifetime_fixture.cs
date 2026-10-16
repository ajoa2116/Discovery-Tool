using System.Collections;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ApplicationCompanion;
using ApplicationCompanion.TestFixtures;
using Microsoft.Win32.SafeHandles;

internal static class MeasuredInputLifetimeFixture
{
    private static readonly BindingFlags Flags = BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
    private static readonly List<object> results = [];
    private static readonly List<MeasuredInputLifetime> leases = [];
    private static readonly List<Case> cases = []; // strong ownership until explicit successful release
    private static object? measuredEvidence;
    private static readonly List<object> consumptionEvidence = [];
    private static readonly List<OwnedInputProcess> processOwners = [];
    private static readonly List<object> processEvidence = [];
    private static readonly List<object> loaderEvidence = [];
    private static object? nativeLoaderEvidence;
    private static readonly string[] Paths = ["runtime/node.exe", "backend/main.cjs", "native/bridge.node", "owner/ApplicationCompanion.exe",
        "owner/ApplicationCompanion.deps.json", "owner/ApplicationCompanion.runtimeconfig.json", "node_modules/inert/package.json", "node_modules/inert/index.cjs", "owner/ApplicationCompanion.dll"];
    private static readonly string[] Roles = ["node-runtime", "backend-entry", "native-addon", "native-owner", "configuration", "configuration", "metadata", "dependency", "dependency"];
    private const string Config = """{"runtimeOptions":{"tfm":"net10.0"}}""";
    private const string Deps = """{"runtimeTarget":{"name":".NETCoreApp,Version=v10.0"},"targets":{".NETCoreApp,Version=v10.0":{"ApplicationCompanion/1.0.0":{"runtime":{"ApplicationCompanion.dll":{}}}}},"libraries":{"ApplicationCompanion/1.0.0":{"type":"project"}}}""";
    private static object? FixtureNative(string name, params object?[] args) => typeof(InstalledRootFixture).GetMethod(name, Flags)!.Invoke(null, args);
    private static void Assert(bool condition, string message) { if (!condition) throw new IOException(message); }
    private sealed class Case : IDisposable
    {
        internal enum CleanupPhase { Active, Restored, RecoveryPending, Terminal, Released }
        private sealed class Restore(string path, SafeFileHandle handle, byte[] original)
        {
            internal readonly string Path = path;
            internal readonly SafeFileHandle Handle = handle;
            internal readonly byte[] Original = original;
            internal bool Restored;
        }
        private static bool StillAtPath(Restore item, string path)
        {
            if (item.Handle.IsClosed || item.Handle.IsInvalid) return false;
            try
            {
                // Existing native check binds retained kernel identity to its
                // canonical current name. A replacement needs its OWN escrow.
                var identity = typeof(InstalledRootAdmission).GetMethod("Identity", Flags)!;
                var retained = identity.Invoke(null, [item.Handle, path])!;
                using var currentHandle = (SafeFileHandle)typeof(InstalledRootAdmission).GetMethod("Open", Flags)!.Invoke(null, [path])!;
                var current = identity.Invoke(null, [currentHandle, path])!;
                return new[] { "Volume", "IndexHigh", "IndexLow" }.All(name =>
                    Equals(retained.GetType().GetField(name)!.GetValue(retained), current.GetType().GetField(name)!.GetValue(current)));
            }
            catch (TargetInvocationException) { return false; }
        }
        internal sealed record Failure(string Path, string Operation, string Error);
        internal readonly string Boundary, Root;
        internal readonly MeasuredInputLifetime.Input[] Inputs;
        private readonly List<Restore> restore = [];
        internal CleanupPhase CleanupState { get; private set; } = CleanupPhase.Active;
        internal readonly List<Failure> Failures = [];
        internal readonly List<string> Attempts = [];
        internal Func<string, bool>? InjectRestoreFailure; // private deterministic fixture hook, never external policy
        internal int OpenRecoveryHandles => restore.Count(r => !r.Handle.IsClosed);
        internal string[] RestorationOrder => restore.AsEnumerable().Reverse().Select(r => r.Path).ToArray();
        internal Case(string basePath, string name, string? deps = null, string? config = null, bool extra = false, string? packageMetadata = null, string? nativeBuild = null)
        {
            Boundary = Path.Combine(basePath, name); Root = Path.Combine(Boundary, "application", "v1");
            for (int i = 0; i < Paths.Length; i++)
            {
                string path = At(Paths[i]); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, "INERT SYNTHETIC INPUT " + Paths[i]);
            }
            File.WriteAllText(At(Paths[4]), deps ?? Deps);
            File.WriteAllText(At(Paths[5]), config ?? Config);
            if (packageMetadata is not null) File.WriteAllText(At(Paths[6]), packageMetadata);
            if (extra) File.WriteAllText(At("owner/InertDependency.dll"), "INERT MANAGED DEPENDENCY");
            string[] nativeExtras = [];
            if (nativeBuild is not null)
            {
                string dependency = File.ReadAllText(Path.Combine(nativeBuild, "dependency-name.txt"));
                Assert(System.Text.RegularExpressions.Regex.IsMatch(dependency, "^experiment_dep_[a-f0-9]{32}\\.dll$"), "native dependency name");
                nativeExtras = ["native/probe.dll", "node_modules/inert/" + dependency, "allowed/probe.dll", "allowed/" + dependency];
                File.Copy(Path.Combine(nativeBuild, "primary.dll"), At(Paths[2]), true);
                File.Copy(Path.Combine(nativeBuild, "probe.dll"), At(nativeExtras[0]));
                File.Copy(Path.Combine(nativeBuild, dependency), At(nativeExtras[1]));
                Directory.CreateDirectory(Path.Combine(Root, "allowed"));
                File.Copy(Path.Combine(nativeBuild, "probe.dll"), At(nativeExtras[2]));
                File.Copy(Path.Combine(nativeBuild, dependency), At(nativeExtras[3]));
            }
            var selected = Paths.Concat(extra ? new[] { "owner/InertDependency.dll" } : Array.Empty<string>()).Concat(nativeExtras).ToArray();
            Inputs = selected.Select((path, i) => { var bytes = File.ReadAllBytes(At(path)); return new MeasuredInputLifetime.Input(i < Roles.Length ? Roles[i] : "dependency", path, bytes.Length, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()); }).ToArray();
            cases.Add(this);
        }
        internal string At(string relative) => Path.Combine(Root, relative.Replace('/', '\\'));
        internal void Protect()
        {
            if (CleanupState is CleanupPhase.RecoveryPending or CleanupPhase.Terminal or CleanupPhase.Released)
                throw new IOException("Protection blocked during recovery/after release: " + Boundary);
            var all = new List<string>();
            void Walk(string dir) { all.Add(dir); foreach (var child in Directory.EnumerateFileSystemEntries(dir)) {
                var attrs = File.GetAttributes(child); if ((attrs & FileAttributes.ReparsePoint) != 0) continue;
                if ((attrs & FileAttributes.Directory) != 0) Walk(child); else all.Add(child);
            }}
            Walk(Boundary);
            foreach (string path in all.OrderByDescending(p => p.Length))
            {
                // Re-protection reuses one original baseline and one escrow handle
                // per retained object. Layered snapshots could otherwise replay a protected
                // intermediate ACL after a partial restore failure.
                var item = restore.LastOrDefault(r => r.Path == path && StillAtPath(r, path));
                if (item is null)
                {
                    bool directory = Directory.Exists(path);
                    byte[] original = directory ? new DirectoryInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm() : new FileInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm();
                    var handle = (SafeFileHandle)FixtureNative("CreateFile", path, 0x60000u, 7u, IntPtr.Zero, 3u, 0x02200000u, IntPtr.Zero)!;
                    if (handle.IsInvalid) { handle.Dispose(); throw new IOException("escrow acquisition: " + path); }
                    item = new(path, handle, original); restore.Add(item);
                }
                item.Restored = false; CleanupState = CleanupPhase.Active; // register before mutation
                var caseType = typeof(InstalledRootFixture).GetNestedType("Case", Flags)!;
                byte[] protectedBytes = (byte[])caseType.GetMethod("ProtectedDescriptor", Flags)!.Invoke(null, [item.Original, null, true])!;
                if (!(bool)FixtureNative("SetKernelObjectSecurity", item.Handle, 4u, protectedBytes)!) throw new IOException("private fixture protection: " + path);
            }
        }
        internal void Writable()
            => RestoreAll(reviewedSyntheticRetry: false);
        internal void RetryInjectedRestoration()
        {
            if (CleanupState != CleanupPhase.RecoveryPending || InjectRestoreFailure is not null ||
                Failures.Count == 0 || Failures.Any(f => !f.Error.Contains("Injected restoration failure")))
                throw new IOException("Only reviewed deterministic injected failures may retry in this fixture.");
            RestoreAll(reviewedSyntheticRetry: true);
        }
        private void RestoreAll(bool reviewedSyntheticRetry)
        {
            if (leases.Any(l => (l.CompletionPending || l.CleanupState == MeasuredInputLifetime.CleanupPhase.Pending) &&
                LeaseRoot(l) == Root)) throw new IOException("Consumer completion/cleanup pending; fixture restoration blocked.");
            if (CleanupState == CleanupPhase.Released) return;
            if (CleanupState == CleanupPhase.Terminal || (CleanupState == CleanupPhase.RecoveryPending && !reviewedSyntheticRetry))
                throw new IOException("Owner review required before restoration/release: " + JsonSerializer.Serialize(RecoverySnapshot()));
            var failed = new List<Failure>();
            foreach (var item in restore.AsEnumerable().Reverse().Where(r => !r.Restored))
            {
                Attempts.Add(item.Path);
                string operation = "restore-dacl";
                try
                {
                    if (item.Handle.IsClosed || item.Handle.IsInvalid) { operation = "retained-handle-unavailable"; throw new IOException("Original recovery capability lost; cannot reconstruct."); }
                    if (InjectRestoreFailure?.Invoke(item.Path) == true) throw new IOException("Injected restoration failure");
                    if (!(bool)FixtureNative("SetKernelObjectSecurity", item.Handle, 4u, item.Original)!)
                        throw new IOException("SetKernelObjectSecurity returned false");
                    item.Restored = true;
                }
                catch (Exception error)
                {
                    var failure = new Failure(item.Path, operation, error.ToString()); failed.Add(failure); Failures.Add(failure);
                }
            }
            if (failed.Count != 0)
            {
                CleanupState = failed.Any(f => f.Operation == "retained-handle-unavailable") || CleanupState == CleanupPhase.Terminal
                    ? CleanupPhase.Terminal : CleanupPhase.RecoveryPending;
                throw new IOException("Fixture restoration incomplete: " + JsonSerializer.Serialize(failed));
            }
            CleanupState = CleanupPhase.Restored;
        }
        private static string? LeaseRoot(MeasuredInputLifetime lease) => typeof(MeasuredInputLifetime).GetField("root", Flags)!.GetValue(lease) as string;
        internal object RecoverySnapshot() => new { Boundary, state = CleanupState.ToString(), failures = Failures.ToArray(),
            resources = restore.Select(r => new { r.Path, r.Restored, handleClosed = r.Handle.IsClosed, handleInvalid = r.Handle.IsInvalid,
                originalDescriptor = Convert.ToBase64String(r.Original) }).ToArray() };
        internal void AssertRestoredExcept(params string[] pending)
        {
            foreach (var item in restore)
            {
                Assert(item.Restored == !pending.Contains(item.Path), "incorrect restoration accounting: " + item.Path);
                if (!item.Restored) continue;
                byte[] current = Directory.Exists(item.Path) ? new DirectoryInfo(item.Path).GetAccessControl().GetSecurityDescriptorBinaryForm() : new FileInfo(item.Path).GetAccessControl().GetSecurityDescriptorBinaryForm();
                var expectedSd = new RawSecurityDescriptor(item.Original, 0); var currentSd = new RawSecurityDescriptor(current, 0);
                static byte[] Dacl(RawSecurityDescriptor sd) { byte[] b = new byte[sd.DiscretionaryAcl!.BinaryLength]; sd.DiscretionaryAcl.GetBinaryForm(b, 0); return b; }
                Assert(expectedSd.Owner == currentSd.Owner && expectedSd.Group == currentSd.Group && Dacl(expectedSd).SequenceEqual(Dacl(currentSd)), "restored DACL mismatch: " + item.Path);
            }
        }
        public void Dispose()
        {
            if (CleanupState == CleanupPhase.Released) return;
            Writable(); // failure keeps EVERY escrow handle owned and open; no blanket finally
            var failed = new List<Failure>();
            foreach (var item in restore.AsEnumerable().Reverse())
            {
                try { item.Handle.Dispose(); if (!item.Handle.IsClosed) throw new IOException("Release remains pending"); }
                catch (Exception error) { var failure = new Failure(item.Path, "release-restored-handle", error.ToString()); failed.Add(failure); Failures.Add(failure); }
            }
            CleanupState = failed.Count == 0 ? CleanupPhase.Released : CleanupPhase.RecoveryPending;
            if (failed.Count != 0) throw new IOException("Fixture handle release incomplete: " + JsonSerializer.Serialize(failed));
        }
    }
    private static MeasuredInputLifetime Open(Case c, MeasuredInputLifetime.Input[]? inputs = null)
    {
        if (c.CleanupState != Case.CleanupPhase.Active) throw new IOException("Measured use blocked outside active protected fixture: " + c.Boundary);
        var lease = MeasuredInputLifetime.PreOpen(c.Root, c.Boundary, inputs ?? c.Inputs); leases.Add(lease); return lease;
    }
    private static void Record(string name, Action body) { body(); results.Add(new { name, passed = true }); }
    private static void Denied(Action body, string? reason = null)
    {
        try { body(); } catch (MeasuredInputLifetime.Rejected failure) {
            if (reason is not null) Assert(failure.Reason == reason, "wrong denial: " + failure.Reason + " expected " + reason);
            return;
        }
        throw new IOException("expected classified denial");
    }
    private static void PreserveRecoveryOwners(string basePath)
    {
        var unresolved = cases.Where(c => c.OpenRecoveryHandles != 0 || c.CleanupState != Case.CleanupPhase.Released).ToArray();
        var pendingLeases = leases.Where(l => l.CompletionPending || l.OutstandingHandles != 0).ToArray();
        if (unresolved.Length == 0 && pendingLeases.Length == 0) return;
        // No retry, handle closure, ACL mutation or process exit on an unexpected
        // failure. The runner must preserve this process, not timeout-kill it.
        try { File.AppendAllText(Path.Combine(basePath, "recovery-pending.jsonl"), JsonSerializer.Serialize(new {
            pid = Environment.ProcessId, utc = DateTime.UtcNow, productionAuthority = false,
            owners = unresolved.Select(c => c.RecoverySnapshot()).ToArray(),
            processOwners = processOwners.Where(p => !p.ResourcesReleased).Select(p => p.Evidence).ToArray(),
            measuredOwners = pendingLeases.Select(l => new { state = l.State.ToString(), consumer = l.ConsumptionState.ToString(),
                stop = l.ConsumptionStop.ToString(), cleanup = l.CleanupState.ToString(), l.CompletionPending,
                l.OutstandingHandles, failures = l.CleanupFailures, files = l.Measurements, process = l.ProcessEvidence }).ToArray() }) + Environment.NewLine); }
        catch (Exception error) { Console.Error.WriteLine("Recovery evidence write failed: " + error); }
        Console.Error.WriteLine("FIXTURE_RECOVERY_PENDING pid=" + Environment.ProcessId + " root=" + basePath);
        Console.Error.Flush();
        // Strong references in cases preserve capabilities ONLY while this owner
        // lives. Owner-reviewed intervention is required; there is no live-control
        // adapter or automatic reconstruction/retry mechanism.
        using var hold = new ManualResetEvent(false); hold.WaitOne();
    }
    private static SafeFileHandle[] Handles(MeasuredInputLifetime lease)
    {
        var resources = new[] { "files", "pins" }.SelectMany(field =>
            ((IEnumerable)typeof(MeasuredInputLifetime).GetField(field, Flags)!.GetValue(lease)!).Cast<object>());
        return resources.Select(r => (SafeFileHandle)r.GetType().GetProperty("Handle")!.GetValue(r)!).ToArray();
    }
    private static T Copy<T>(T value) where T : class => (T)typeof(object).GetMethod("MemberwiseClone", Flags)!.Invoke(value, null)!;
    private static void NativeLoaderCase(string basePath)
    {
        using var c = new Case(basePath, "native-dll-loader", nativeBuild: Path.Combine(basePath, "native-build")); c.Protect();
        using var lease = Open(c); lease.Measure(); var handoff = lease.Handoff(); var held = Handles(lease);
        string probe = "native/probe.dll", dependency = c.Inputs.Single(i => i.RelativePath.StartsWith("node_modules/inert/experiment_dep_", StringComparison.Ordinal)).RelativePath;
        string allowedProbe = "allowed/probe.dll", allowedDependency = "allowed/" + Path.GetFileName(dependency);
        NativeDllExperiment.Inspect(c.At(Paths[2])); NativeDllExperiment.Inspect(c.At(dependency));
        NativeDllExperiment.Inspect(c.At(probe), Path.GetFileName(dependency));
        Record("native-loader-unexpected-import-rejected-before-load", () => {
            bool rejected = false;
            try { NativeDllExperiment.Inspect(c.At(probe)); }
            catch (IOException error) when (error.Message == "unexpected-native-dependency") { rejected = true; }
            Assert(rejected, "unexpected import accepted");
        });
        var process = OwnedInputProcess.Start(lease, handoff, "native-loader", c.Inputs.Select(i => i.RelativePath).ToArray()); processOwners.Add(process);
        var token = process.Consumer;
        var loader = lease.OpenInertLoader(token, handoff, new(Paths[1], "fixture:primary", Paths[2], "static"),
            new(Paths[1], "fixture:probe", probe, "static"), new(probe, "fixture:excluded", dependency, "static"),
            new(Paths[1], "fixture:allowed-probe", allowedProbe, "static"), new(allowedProbe, "fixture:allowed-dependency", allowedDependency, "static"));
        var primaryRequest = loader.Issue(token, Paths[1], "fixture:primary");
        var probeRequest = loader.Issue(token, Paths[1], "fixture:probe");
        var dependencyRequest = loader.Issue(token, probe, "fixture:excluded");
        var allowedProbeRequest = loader.Issue(token, Paths[1], "fixture:allowed-probe");
        var allowedDependencyRequest = loader.Issue(token, allowedProbe, "fixture:allowed-dependency");
        Record("native-loader-attempted-substitution-blocked", () => {
            bool blocked = false;
            try { File.Move(c.At(Paths[2]), Path.Combine(basePath, "native-substitution-parked")); }
            catch (IOException) { blocked = true; } catch (UnauthorizedAccessException) { blocked = true; }
            Assert(blocked, "safe substitution control unavailable; do not load");
        });
        lease.CheckConsumption(token);
        var report = process.RunNativeExperiment(loader, primaryRequest, probeRequest, dependencyRequest, allowedProbeRequest, allowedDependencyRequest);
        File.WriteAllText(Path.Combine(basePath, "native-observation.json"), JsonSerializer.Serialize(report));
        if (!report.Passed) { lease.FailConsumption(token); throw new IOException("Native experiment stopped: " + report.Failure); }
        Record("native-loader-postload-identity-corroborated", () => {
            var observed = report.PostLoadFile!; var expected = lease.Measurements.Single(f => f.RelativePath == Paths[2]);
            Assert(report.ModulePath == c.At(Paths[2]) && report.ImageMapping && report.MarkerMatched &&
                observed.Volume == expected.Volume && observed.FileId == expected.FileId && observed.Length == expected.Length &&
                observed.Sha256 == expected.Sha256 && !report.AtomicMeasuredHandleBinding && !report.ProductionAuthority, "native identity corroboration");
        });
        Record("native-loader-excluded-dependency-denied", () => Assert(report.SearchError == 126 && report.NewModules.SequenceEqual(new[] { c.At(Paths[2]) }), "dependency restriction"));
        var control = report.Control ?? throw new IOException("missing dependency control evidence");
        Record("native-loader-comparable-dependency-inputs", () => Assert(control.ComparableBytes && control.FreshBeforePositive, "dependency comparison/reuse"));
        Record("native-loader-allowed-dependency-resolved", () => Assert(control.AllowedProbePath == c.At(allowedProbe) &&
            control.LoadedDependencyPath == c.At(allowedDependency) && control.ImportAddressMatched && control.ImageMappings &&
            control.ProbeFile.Sha256 == lease.Measurements.Single(f => f.RelativePath == probe).Sha256 &&
            control.DependencyFile.Sha256 == lease.Measurements.Single(f => f.RelativePath == dependency).Sha256, "allowed dependency control"));
        Record("native-loader-allowed-fresh-modules-only", () => Assert(control.NewModules.ToHashSet().SetEquals(new[] { c.At(allowedProbe), c.At(allowedDependency) }), "unexpected allowed module"));
        Record("native-loader-allowed-dependency-unloaded", () => Assert(control.AbsentAfterProbeFree && control.ExplicitLoads == 1 && control.SuccessfulFrees == 1, "dependency mapping/reference cleanup"));
        Record("native-loader-negative-after-unload-denied", () => Assert(control.NegativeAfterUnloadError == 126, "reuse contaminated negative control"));
        Record("native-loader-reuse-and-unload-accounted", () => Assert(report.ReusedSameModule && report.RetainedAfterFirstFree &&
            report.AbsentAfterFinalFree && report.LoadReferences == 3 && report.FreeCalls == 3 && report.SuccessfulFrees == 3 && report.RemainingReferences == 0, "module reference accounting"));
        lease.CheckConsumption(token);
        Record("native-loader-pins-retained-until-process-exit", () => Assert(lease.CompletionPending && held.All(h => !h.IsClosed), "native pins prematurely released"));
        Record("native-loader-unadmitted-dependency-request-denied", () => Denied(() => loader.Issue(token, allowedProbe, "fixture:unexpected"), "unapproved-dependency-edge"));
        Record("native-loader-denial-retains-pins", () => Assert(lease.CompletionPending && held.All(h => !h.IsClosed), "denial prematurely released pins"));
        var end = lease.ObserveProcessEnd(token, 3000); lease.CompleteConsumption(token, end); process.AwaitMonitor();
        Record("native-loader-final-cleanup", () => Assert(process.ResourcesReleased && process.OutstandingHandles == 0 &&
            lease.OutstandingHandles == 0 && held.All(h => h.IsClosed), "native cleanup unconfirmed"));
        nativeLoaderEvidence = new { report, process = process.Evidence, inputs = lease.Measurements, pinsClosed = true, monitorCompleted = true };
    }
    private static void LoaderCases(string basePath)
    {
        const string package = """{"name":"inert","main":"index.cjs"}""";
        MeasuredInputLifetime.InertLoadRequest? stale = null;
        foreach (string mode in new[] { "positive", "copied-request", "forged-request", "request-replay", "duplicate-issue",
            "substituted-target", "unselected-dependency", "missing-metadata", "metadata-role", "metadata-map", "metadata-duplicate",
            "metadata-unsupported", "dynamic-request", "dynamic-edge", "wrong-edge", "copied-boundary", "foreign-consumer",
            "stale-request", "cancelled", "failed", "cleanup", "replacement-blocked", "copied-handoff", "duplicate-boundary" })
        {
            string metadata = mode switch {
                "metadata-map" => package.Replace("index.cjs", "other.cjs"),
                "metadata-duplicate" => """{"name":"inert","main":"index.cjs","main":"other.cjs"}""",
                "metadata-unsupported" => """{"name":"inert","main":"index.cjs","exports":"./index.cjs"}""",
                _ => package
            };
            using var c = new Case(basePath, "loader-" + mode, packageMetadata: metadata); c.Protect(); using var lease = Open(c);
            lease.Measure(); var handoff = lease.Handoff(); var held = Handles(lease);
            var process = OwnedInputProcess.Start(lease, handoff, "normal", Paths); processOwners.Add(process);
            var token = process.Consumer;
            MeasuredInputLifetime.DependencyEdge[] edges = [new(Paths[1], "inert", Paths[7], "package", Paths[6]),
                new(Paths[7], "fixture:bridge", Paths[2], "static")];
            var evidence = new List<MeasuredInputLifetime.InertLoadEvidence>();
            string? denial = null;
            bool invalidGraph = mode is "unselected-dependency" or "missing-metadata" or "metadata-role" or "metadata-map" or
                "metadata-duplicate" or "metadata-unsupported" or "dynamic-edge" or "copied-handoff";
            if (mode == "unselected-dependency") edges[0] = edges[0] with { To = "node_modules/inert/missing.cjs" };
            if (mode == "missing-metadata") edges[0] = edges[0] with { Metadata = "node_modules/inert/missing.json" };
            if (mode == "metadata-role") edges[0] = edges[0] with { Metadata = Paths[4] };
            if (mode == "dynamic-edge") edges[0] = edges[0] with { Kind = "dynamic" };
            if (invalidGraph)
            {
                denial = mode switch {
                    "unselected-dependency" or "missing-metadata" => "unselected-loader-input",
                    "metadata-role" => "unverified-loader-metadata",
                    "metadata-map" => "loader-metadata-resolution",
                    "metadata-duplicate" or "metadata-unsupported" => "sidecar-form",
                    "dynamic-edge" => "unsupported-loader-edge",
                    "copied-handoff" => "foreign-handoff",
                    _ => throw new IOException("unknown loader graph case")
                };
                Record("loader-denied:" + mode, () => Denied(() => lease.OpenInertLoader(token, mode == "copied-handoff" ? Copy(handoff) : handoff, edges), denial));
            }
            else
            {
                var loader = lease.OpenInertLoader(token, handoff, edges);
                var request = loader.Issue(token, Paths[1], "inert");
                if (mode == "positive") stale = request;
                switch (mode)
                {
                    case "positive": case "cleanup": case "replacement-blocked":
                        if (mode == "replacement-blocked") Record("loader-namespace-replacement-blocked", () => {
                            bool blocked = false;
                            try { File.Move(c.At(Paths[7]), Path.Combine(basePath, "loader-parked-input")); }
                            catch (IOException) { blocked = true; } catch (UnauthorizedAccessException) { blocked = true; }
                            Assert(blocked, "unexpected writable namespace; stop without substitution repair");
                        });
                        evidence.Add(loader.Consume(token, request, Paths[7]));
                        evidence.Add(loader.Consume(token, loader.Issue(token, Paths[7], "fixture:bridge"), Paths[2]));
                        Record("loader-accepted-exact-objects:" + mode, () => {
                            Assert(evidence.Count == 2 && evidence.All(e => e.Target.FileId != 0 && e.Target.Volume != 0 &&
                                lease.Measurements.Any(f => f == e.Target) && lease.Measurements.Any(f => f == e.Importer) &&
                                e.RetainedFileObjectIdentityChecked && e.NamespaceObservedStable && e.FixtureRequestAccepted &&
                                !e.RealLoaderConsumedMeasuredHandle && !e.ProductionAuthority && !e.CompleteClosure && !e.RaceFree), "loader evidence overclaim/identity");
                            Assert(evidence[0].Metadata is not null && lease.Measurements.Any(f => f == evidence[0].Metadata) &&
                                evidence[1].Metadata is null, "metadata did not use selected measured object");
                        });
                        break;
                    default:
                        denial = mode switch {
                            "copied-request" or "forged-request" or "request-replay" or "stale-request" => "foreign-or-replayed-load-request",
                            "duplicate-issue" => "dependency-edge-replay",
                            "substituted-target" => "load-target-substitution",
                            "dynamic-request" or "wrong-edge" => "unapproved-dependency-edge",
                            "copied-boundary" => "foreign-loader-boundary",
                            "foreign-consumer" => "foreign-consumer",
                            "cancelled" or "failed" => "consumer-terminal",
                            "duplicate-boundary" => "loader-boundary-replay",
                            _ => throw new IOException("unknown loader request case")
                        };
                        Record("loader-denied:" + mode, () => Denied(() => {
                            switch (mode)
                            {
                                case "copied-request": loader.Consume(token, Copy(request), Paths[7]); break;
                                case "forged-request": loader.Consume(token, new(), Paths[7]); break;
                                case "stale-request": loader.Consume(token, stale!, Paths[7]); break;
                                case "request-replay": loader.Consume(token, request, Paths[7]); loader.Consume(token, request, Paths[7]); break;
                                case "duplicate-issue": loader.Issue(token, Paths[1], "inert"); break;
                                case "substituted-target": loader.Consume(token, request, Paths[2]); break;
                                case "dynamic-request": loader.Issue(token, Paths[1], "computed:unexpected"); break;
                                case "wrong-edge": loader.Issue(token, Paths[2], "inert"); break;
                                case "copied-boundary": Copy(loader).Consume(token, request, Paths[7]); break;
                                case "foreign-consumer": loader.Consume(Copy(token), request, Paths[7]); break;
                                case "cancelled": lease.CancelConsumption(token); loader.Consume(token, request, Paths[7]); break;
                                case "failed": lease.FailConsumption(token); loader.Issue(token, Paths[7], "fixture:bridge"); break;
                                case "duplicate-boundary": lease.OpenInertLoader(token, handoff, edges); break;
                            }
                        }, denial));
                        break;
                }
                if (denial is not null) Record("loader-terminal-rejects-further-requests:" + mode, () =>
                    Denied(() => loader.Issue(token, Paths[7], "fixture:bridge"), "consumer-terminal"));
            }
            Record("loader-retains-inputs-until-exit:" + mode, () => {
                Assert(held.All(h => !h.IsClosed) && lease.CompletionPending && process.OutstandingHandles > 0, "loader released ownership before exit");
                if (denial is not null) Assert(lease.State == MeasuredInputLifetime.Phase.Denied, "loader failure not terminal");
            });
            if (denial is null) process.FinishNormally();
            var end = lease.ObserveProcessEnd(token, 3000);
            if (mode == "cleanup")
            {
                var suppress = (HashSet<string>)typeof(MeasuredInputLifetime).GetField("suppressedCloses", Flags)!.GetValue(lease)!;
                suppress.Add("stream:" + c.At(Paths[7]));
                Denied(() => lease.CompleteConsumption(token, end), "release-pending");
                Record("loader-cleanup-retains-process-evidence", () => Assert(!process.ResourcesReleased && lease.OutstandingHandles > 0 &&
                    lease.CleanupState == MeasuredInputLifetime.CleanupPhase.Pending, "loader cleanup failure hidden"));
                suppress.Clear(); lease.Dispose();
            }
            else lease.CompleteConsumption(token, end);
            process.AwaitMonitor();
            Record("loader-final-cleanup:" + mode, () => Assert(process.ResourcesReleased && process.OutstandingHandles == 0 &&
                lease.OutstandingHandles == 0 && held.All(h => h.IsClosed), "loader process/input handle leak"));
            loaderEvidence.Add(new { mode, denial, evidence, process = process.Evidence });
        }
    }
    private static void ProcessCases(string basePath)
    {
        MeasuredInputLifetime.CompletionEvidence? stale = null;
        foreach (string mode in new[] { "normal", "delayed", "denial-live", "cancel", "failure", "channel-loss", "crash",
            "simulated-bypass", "stale", "copied", "duplicate", "dispose", "timeout", "wait-failure", "wrong-process", "input-cleanup", "evidence-cleanup" })
        {
            using var c = new Case(basePath, "process-" + mode); c.Protect(); using var lease = Open(c);
            lease.Measure(); var handoff = lease.Handoff(); var inputs = Handles(lease);
            var process = OwnedInputProcess.Start(lease, handoff, mode is "delayed" or "crash" or "channel-loss" ? mode : "normal", Paths);
            processOwners.Add(process); var token = process.Consumer;
            void Inject(string name, bool value) => typeof(OwnedInputProcess).GetField(name, Flags)!.SetValue(process, value);
            Record("process-registered:" + mode, () => Assert(lease.CompletionPending && inputs.All(h => !h.IsClosed) &&
                process.OutstandingHandles >= 1, "missing birth evidence or input pins"));
            MeasuredInputLifetime.CompletionEvidence? end = null;
            switch (mode)
            {
                case "normal": case "input-cleanup": case "evidence-cleanup": case "stale": case "copied":
                    process.FinishNormally(); break;
                case "crash":
                    process.FinishNormally();
                    Assert(process.ConfirmExit(lease, token, 3000), "abrupt fixture did not exit");
                    Record("process-death-blocks-consumption", () => Denied(() => lease.CheckConsumption(token), "process-not-active"));
                    break;
                case "delayed":
                    process.FinishNormally(); Inject("suppressShutdown", true);
                    Denied(() => lease.ObserveProcessEnd(token), "process-exit-unconfirmed");
                    Record("process-delayed-retains-pins", () => Assert(inputs.All(h => !h.IsClosed), "delayed exit released inputs"));
                    process.AllowDelayedExit();
                    break;
                case "denial-live":
                    Inject("suppressShutdown", true); Denied(lease.Release, "consumer-completion-pending");
                    Record("process-live-denial-retains-birth-and-pins", () => {
                        Assert(inputs.All(h => !h.IsClosed), "live denial released pins");
                        Denied(() => lease.ObserveProcessEnd(token), "process-exit-unconfirmed");
                    });
                    Inject("suppressShutdown", false); process.RequestShutdown(); break;
                case "cancel": lease.CancelConsumption(token); break;
                case "failure": lease.FailConsumption(token); break;
                case "channel-loss":
                    // Wait for the real owned pipe's EOF monitor, not a caller claim.
                    process.AwaitMonitor();
                    Record("process-channel-loss-denies", () => Assert(lease.ConsumptionStop == MeasuredInputLifetime.StopReason.ChannelLost,
                        "channel loss did not deny")); break;
                case "simulated-bypass": Denied(() => lease.ObserveSimulatedEnd(token), "process-exit-required"); break;
                case "duplicate": Denied(() => lease.BeginConsumption(handoff, Paths), "duplicate-consumer"); break;
                case "dispose": lease.Dispose(); lease.Dispose(); break;
                case "timeout":
                    Inject("suppressShutdown", true);
                    Denied(() => lease.ObserveProcessEnd(token, 20), "process-exit-unconfirmed");
                    lease.Dispose();
                    Record("process-timeout-no-exit-inference", () => Assert(lease.CompletionPending && inputs.All(h => !h.IsClosed) &&
                        process.OutstandingHandles == 3, "timeout disposed identity/pins"));
                    Inject("suppressShutdown", false); process.RequestShutdown(); break;
                case "wait-failure":
                    Inject("suppressShutdown", true); Inject("suppressWait", true);
                    bool unconfirmed = false;
                    try { lease.ObserveProcessEnd(token); } catch (IOException e) { unconfirmed = e.Message == "process-wait-unconfirmed:4294967295"; }
                    Record("process-failed-wait-retains-pins", () => Assert(unconfirmed && lease.CompletionPending && inputs.All(h => !h.IsClosed),
                        "failed wait accepted as exit"));
                    Inject("suppressWait", false); Inject("suppressShutdown", false); process.RequestShutdown(); break;
                case "wrong-process":
                    // A real handle to this different process cannot replace the registered child's birth object.
                    var field = typeof(OwnedInputProcess).GetField("observation", Flags)!;
                    var original = (SafeFileHandle)field.GetValue(process)!;
                    using (var self = System.Diagnostics.Process.GetCurrentProcess())
                    using (var foreign = new SafeFileHandle(self.Handle, false))
                    {
                        field.SetValue(process, foreign);
                        bool rejected = false;
                        try { lease.ObserveProcessEnd(token); } catch (IOException e) { rejected = e.Message.Contains("process-identity-lost"); }
                        field.SetValue(process, original);
                        Record("process-substituted-handle-denied", () => Assert(rejected && inputs.All(h => !h.IsClosed), "wrong process accepted"));
                    }
                    break;
            }
            // Real bounded wait over the retained original birth handle. Nonzero
            // status throws and leaves this owner/pins available to preservation.
            end = lease.ObserveProcessEnd(token, 3000);
            Record("process-exit-before-release:" + mode, () => Assert(inputs.All(h => !h.IsClosed) && process.OutstandingHandles > 0 &&
                lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.EndObserved, "identity/pins released before validation"));
            if (mode == "stale") Denied(() => lease.CompleteConsumption(token, stale!), "foreign-or-replayed-completion");
            if (mode == "copied") Denied(() => lease.CompleteConsumption(token, Copy(end)), "foreign-or-replayed-completion");
            if (mode == "input-cleanup")
            {
                var suppressed = (HashSet<string>)typeof(MeasuredInputLifetime).GetField("suppressedCloses", Flags)!.GetValue(lease)!;
                suppressed.Add("stream:" + c.At(Paths[0]));
                Denied(() => lease.CompleteConsumption(token, end), "release-pending");
                Record("process-identity-retained-during-input-cleanup", () => Assert(!process.ResourcesReleased && process.OutstandingHandles > 0,
                    "evidence closed before input cleanup"));
                suppressed.Clear(); lease.Dispose();
            }
            else if (mode == "evidence-cleanup")
            {
                Inject("suppressEvidenceCleanup", true);
                Denied(() => lease.CompleteConsumption(token, end), "release-pending");
                Record("process-evidence-cleanup-pending", () => {
                    Assert(inputs.All(h => h.IsClosed) && !process.ResourcesReleased && lease.CleanupState == MeasuredInputLifetime.CleanupPhase.Pending,
                        "cleanup failure hidden");
                    using var other = Open(c); Denied(other.Measure, "duplicate-ownership");
                });
                Inject("suppressEvidenceCleanup", false); lease.Dispose();
            }
            else lease.CompleteConsumption(token, end);
            process.AwaitMonitor();
            Record("process-final-cleanup:" + mode, () => {
                Assert(process.ResourcesReleased && process.OutstandingHandles == 0 && lease.OutstandingHandles == 0 && inputs.All(h => h.IsClosed),
                    "process/input resource leak");
                Denied(() => lease.CompleteConsumption(token, end), "foreign-or-replayed-completion");
                Denied(() => lease.ObserveProcessEnd(token), "completion-replay");
                lease.Dispose();
            });
            processEvidence.Add(new { mode, proof = process.Evidence });
            if (mode == "normal") stale = end;
        }
    }
    private static void ConsumptionCases(string basePath)
    {
        MeasuredInputLifetime.HandoffEvidence? staleHandoff = null;
        MeasuredInputLifetime.ConsumerLease? staleConsumer = null;
        MeasuredInputLifetime.CompletionEvidence? staleCompletion = null;
        foreach (string mode in new[] { "normal", "denial", "release", "dispose", "duplicate", "cancel", "failure", "inconclusive",
            "copied-consumer", "forged-consumer", "forged-completion", "copied-completion", "stale-completion", "end-replay",
            "copied-completion-consumer", "check-after-end", "release-after-end", "stream-cleanup", "pin-cleanup" })
        {
            using var c = new Case(basePath, "consumption-" + mode); c.Protect(); using var lease = Open(c);
            lease.Measure(); var handoff = lease.Handoff(); var held = Handles(lease);
            var token = lease.BeginConsumption(handoff, Paths);
            Record("consumer-active:" + mode, () => {
                lease.CheckConsumption(token);
                Assert(lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.Active && held.Length == lease.OutstandingHandles, "begin retention");
            });
            MeasuredInputLifetime.CompletionEvidence? end = null;
            switch (mode)
            {
                case "denial": Denied(() => lease.SimulateUse(handoff, Paths)); break;
                case "release": Denied(lease.Release, "consumer-completion-pending"); break;
                case "dispose": lease.Dispose(); lease.Dispose(); break;
                case "duplicate": Denied(() => lease.BeginConsumption(handoff, Paths), "duplicate-consumer"); break;
                case "cancel": lease.CancelConsumption(token); break;
                case "failure": lease.FailConsumption(token); break;
                case "inconclusive":
                    Denied(() => lease.CompleteConsumption(token, new()), "foreign-or-replayed-completion");
                    lease.Dispose();
                    Record("consumer-inconclusive-blocks-restoration", () => {
                        bool blocked = false; try { c.Writable(); } catch (IOException e) { blocked = e.Message.Contains("Consumer completion/cleanup pending"); }
                        Assert(blocked && c.CleanupState == Case.CleanupPhase.Active, "inconclusive owner restoration");
                    }); break;
                case "copied-consumer": Denied(() => lease.ObserveSimulatedEnd(Copy(token)), "foreign-consumer"); break;
                case "forged-consumer": Denied(() => lease.ObserveSimulatedEnd(new()), "foreign-consumer"); break;
                case "forged-completion":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.CompleteConsumption(token, new()), "foreign-or-replayed-completion"); break;
                case "copied-completion":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.CompleteConsumption(token, Copy(end)), "foreign-or-replayed-completion"); break;
                case "stale-completion":
                    Denied(() => lease.CompleteConsumption(staleConsumer!, staleCompletion!), "foreign-consumer");
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.CompleteConsumption(token, staleCompletion!), "foreign-or-replayed-completion"); break;
                case "end-replay":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.ObserveSimulatedEnd(token), "completion-replay"); break;
                case "copied-completion-consumer":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.CompleteConsumption(Copy(token), end), "foreign-consumer"); break;
                case "check-after-end":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(() => lease.CheckConsumption(token), "consumer-terminal"); break;
                case "release-after-end":
                    end = lease.ObserveSimulatedEnd(token);
                    Denied(lease.Release, "consumer-completion-pending"); break;
            }
            bool denied = lease.State == MeasuredInputLifetime.Phase.Denied;
            if (denied) Record("consumer-terminal-blocks-use:" + mode, () => {
                var reason = lease.ConsumptionStop;
                Denied(() => lease.CheckConsumption(token), "consumer-terminal");
                Assert(lease.ConsumptionStop == reason, "first stop reason lost");
                if (mode == "cancel") Assert(reason == MeasuredInputLifetime.StopReason.Cancelled, "cancel classification");
                if (mode == "failure") Assert(reason == MeasuredInputLifetime.StopReason.Failed, "failure classification");
            });
            Record("consumer-retains-exact-handles:" + mode, () => {
                Assert(lease.CompletionPending && held.All(h => !h.IsClosed && !h.IsInvalid) && lease.OutstandingHandles == held.Length,
                    "premature pin release");
                Assert(lease.CleanupState == MeasuredInputLifetime.CleanupPhase.RetainedForConsumer, "retention state");
                // A second measured owner cannot acquire the same exact objects.
                using var duplicate = Open(c); Denied(duplicate.Measure, "duplicate-ownership");
                Assert(held.All(h => !h.IsClosed), "foreign owner released pins");
            });
            consumptionEvidence.Add(new { mode, stage = "before-completion", consumer = lease.ConsumptionState.ToString(),
                stop = lease.ConsumptionStop.ToString(), retained = lease.OutstandingHandles });
            end ??= lease.ObserveSimulatedEnd(token);
            Record("consumer-end-retains-until-ack:" + mode, () => {
                Assert(lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.EndObserved && held.All(h => !h.IsClosed), "end without ack released pins");
            });
            if (mode is "stream-cleanup" or "pin-cleanup")
            {
                var suppression = (HashSet<string>)typeof(MeasuredInputLifetime).GetField("suppressedCloses", Flags)!.GetValue(lease)!;
                string operation = mode == "stream-cleanup" ? "stream" : "pin";
                suppression.Add(operation + ":" + c.At(Paths[0]));
                Denied(() => lease.CompleteConsumption(token, end), "release-pending");
                Record("consumer-cleanup-pending:" + mode, () => {
                    Assert(!lease.CompletionPending && lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.Completed &&
                        lease.CleanupState == MeasuredInputLifetime.CleanupPhase.Pending && lease.OutstandingHandles > 0 &&
                        lease.CleanupFailures.Count == 1 && lease.CleanupFailures[0].Operation == operation, "cleanup evidence");
                    if (operation == "stream") Assert(held.Take(Paths.Length).Count(h => !h.IsClosed) == 1 &&
                        held.Skip(Paths.Length).All(h => !h.IsClosed), "pins closed ahead of stream/other streams not attempted");
                    else Assert(held.Take(Paths.Length).All(h => h.IsClosed) && held.Count(h => !h.IsClosed) == 1, "pin cleanup scope/order");
                    using var duplicate = Open(c); Denied(duplicate.Measure, "duplicate-ownership");
                });
                suppression.Clear(); lease.Dispose();
                denied = true;
            }
            else lease.CompleteConsumption(token, end);
            Record("consumer-completed-release:" + mode, () => {
                Assert(!lease.CompletionPending && lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.Completed &&
                    lease.CleanupState == MeasuredInputLifetime.CleanupPhase.Released && held.All(h => h.IsClosed) && lease.OutstandingHandles == 0,
                    "final consumer release");
                Assert(lease.State == (denied ? MeasuredInputLifetime.Phase.Denied : MeasuredInputLifetime.Phase.Released), "denial revived");
                lease.Dispose(); lease.Dispose();
            });
            Record("consumer-completion-replay-denied:" + mode, () => {
                Denied(() => lease.CompleteConsumption(token, end), "foreign-or-replayed-completion");
                Denied(() => lease.BeginConsumption(handoff, Paths));
                Assert(held.All(h => h.IsClosed), "replay reacquired resource");
            });
            using var next = Open(c); next.Measure(); next.Release();
            consumptionEvidence.Add(new { mode, stage = "released", retained = lease.OutstandingHandles,
                failures = lease.CleanupFailures, consumer = lease.ConsumptionState.ToString() });
            if (mode == "normal") { staleHandoff = handoff; staleConsumer = token; staleCompletion = end; }
        }
        foreach (string mode in new[] { "before-measure", "before-handoff", "copied-handoff", "stale-handoff", "wrong-selection", "after-release" })
        {
            using var c = new Case(basePath, "consumer-begin-" + mode); c.Protect(); using var lease = Open(c);
            if (mode != "before-measure") lease.Measure();
            var handoff = mode is "before-measure" or "before-handoff" ? staleHandoff! : lease.Handoff();
            if (mode == "copied-handoff") handoff = Copy(handoff);
            if (mode == "stale-handoff") handoff = staleHandoff!;
            if (mode == "after-release") lease.Release();
            Record("consumer-begin-denied:" + mode, () => {
                Denied(() => lease.BeginConsumption(handoff, mode == "wrong-selection" ? Paths[..^1] : Paths));
                Assert(lease.ConsumptionState == MeasuredInputLifetime.ConsumerPhase.None && lease.State == MeasuredInputLifetime.Phase.Denied &&
                    lease.OutstandingHandles == 0, "failed begin published consumer/leaked handles");
            });
        }
    }
    public static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--owned-input-child") return OwnedInputProcess.Child(args);
        bool nativeExperiment = args.Length == 2 && args[1] == "--native-dll-experiment";
        if ((args.Length != 1 && !nativeExperiment) || !Path.GetFileName(args[0]).StartsWith("discovery-measured-input-", StringComparison.Ordinal) ||
            !File.Exists(Path.Combine(args[0], "fixture-marker"))) return 2;
        string basePath = args[0];
        try
        {
            WindowsBoundary.RequireUnelevated();
            foreach (string mode in new[] { "early", "late", "both" })
            {
                using var c = new Case(basePath, "restoration-failure-" + mode); c.Protect();
                var order = c.RestorationOrder; int retained = c.OpenRecoveryHandles;
                string[] pending = mode == "early" ? [order[0]] : mode == "late" ? [order[^1]] : [order[0], order[^1]];
                c.InjectRestoreFailure = path => pending.Contains(path);
                bool failed = false;
                try { if (mode == "early") c.Writable(); else c.Dispose(); } catch (IOException) { failed = true; }
                Record("restore-failure-all-attempted:" + mode, () => Assert(failed && c.Attempts.SequenceEqual(order) && c.Failures.Count == pending.Length &&
                    c.Failures.All(f => pending.Contains(f.Path) && f.Operation == "restore-dacl" && f.Error.Contains("Injected restoration failure")), "restoration attempts/failures"));
                Record("restore-failure-retains-capabilities:" + mode, () => Assert(c.CleanupState == Case.CleanupPhase.RecoveryPending && c.OpenRecoveryHandles == retained, "lost recovery handles"));
                Record("restore-successful-objects-verified:" + mode, () => c.AssertRestoredExcept(pending));
                Record("restore-pending-blocks-protect:" + mode, () => { bool blocked = false; try { c.Protect(); } catch (IOException) { blocked = true; } Assert(blocked, "re-protection while pending"); });
                Record("restore-pending-blocks-implicit-retry:" + mode, () => {
                    int attempts = c.Attempts.Count;
                    bool blocked = false; try { c.Dispose(); } catch (IOException) { blocked = true; }
                    Assert(blocked && c.Attempts.Count == attempts && c.OpenRecoveryHandles == retained, "implicit retry/disposal");
                    blocked = false; try { _ = Open(c); } catch (IOException) { blocked = true; } Assert(blocked, "use while pending");
                });
                // Explicitly reviewed synthetic recovery: remove ONLY our known
                // injection and retry pending objects using original capabilities.
                c.InjectRestoreFailure = null; int before = c.Attempts.Count; c.RetryInjectedRestoration();
                Record("restore-retry-only-pending:" + mode, () => Assert(c.Attempts.Skip(before).SequenceEqual(order.Where(p => pending.Contains(p))) && c.CleanupState == Case.CleanupPhase.Restored, "retry scope"));
                Record("restore-all-baselines-verified:" + mode, () => c.AssertRestoredExcept());
                c.Protect();
                Record("reprotect-reuses-original-capabilities:" + mode, () => Assert(c.OpenRecoveryHandles == retained, "duplicate escrow ownership"));
                c.Dispose(); c.Dispose();
                Record("restoration-normal-disposal-no-leaks:" + mode, () => {
                    Assert(c.CleanupState == Case.CleanupPhase.Released && c.OpenRecoveryHandles == 0, "escrow leak"); c.AssertRestoredExcept();
                });
            }
            ConsumptionCases(basePath);
            ProcessCases(basePath);
            LoaderCases(basePath);
            if (nativeExperiment) NativeLoaderCase(basePath);
            using (var c = new Case(basePath, "positive"))
            {
                c.Protect(); using var lease = Open(c);
                Record("pre-open-has-no-retained-handles", () => Assert(lease.State == MeasuredInputLifetime.Phase.PreOpen && lease.OutstandingHandles == 0, "pre-open"));
                lease.Measure();
                Record("explicit-nine-input-measurement", () => Assert(lease.State == MeasuredInputLifetime.Phase.Measured && lease.Measurements.Count == 9 &&
                    lease.Measurements.All(f => f.FileId != 0 && f.Length > 0 && f.Sha256.Length == 64 && f.Links == 1 && f.FixtureOwner != Guid.Empty), "measurements"));
                var evidence = lease.Handoff();
                measuredEvidence = new { canonicalRoot = evidence.Root, completeAncestry = evidence.CompleteAncestry, rootObservation = evidence.RootObservation, files = evidence.Files, productionAuthority = false, raceFree = false, completeClosure = false };
                Record("handoff-retains-non-authorizing-evidence", () => Assert(!evidence.ProductionAuthority && !evidence.RaceFree && !evidence.CompleteClosure && !evidence.CompleteAncestry && lease.OutstandingHandles > 8, "authority"));
                Record("rename-while-held-blocked", () => {
                    bool blocked = false; try { File.Move(c.At(Paths[0]), Path.Combine(basePath, "forbidden-rename")); } catch (IOException) { blocked = true; } catch (UnauthorizedAccessException) { blocked = true; }
                    Assert(blocked, "rename unexpectedly allowed");
                });
                Record("write-while-held-blocked", () => {
                    bool blocked = false; try { File.AppendAllText(c.At(Paths[0]), "mutation"); } catch (IOException) { blocked = true; } catch (UnauthorizedAccessException) { blocked = true; }
                    Assert(blocked, "write unexpectedly allowed");
                });
                lease.SimulateUse(evidence, Paths);
                Record("inert-use-no-release", () => Assert(lease.State == MeasuredInputLifetime.Phase.SimulatedUse && lease.OutstandingHandles > 0, "use"));
                lease.Release();
                Record("release-closes-all", () => Assert(lease.State == MeasuredInputLifetime.Phase.Released && lease.OutstandingHandles == 0, "release"));
            }
            Record("released-file-rename-after-restoration", () => {
                string from = Path.Combine(basePath, "positive/application/v1/runtime/node.exe"), to = from + ".moved";
                File.Move(from, to); File.Move(to, from);
            });
            foreach (string mode in new[] { "content", "replacement", "rename", "missing", "extra-dependency", "acl-change" })
            {
                using var c = new Case(basePath, mode); c.Protect(); using var lease = Open(c);
                if (mode == "acl-change") lease.Measure();
                c.Writable();
                switch (mode)
                {
                    case "content":
                        byte[] bytes = File.ReadAllBytes(c.At(Paths[0])); bytes[0] ^= 1; File.WriteAllBytes(c.At(Paths[0]), bytes); break;
                    case "replacement":
                        byte[] original = File.ReadAllBytes(c.At(Paths[0]));
                        File.Move(c.At(Paths[0]), Path.Combine(basePath, "parked-original")); File.WriteAllBytes(c.At(Paths[0]), original); break;
                    case "rename": File.Move(c.At(Paths[0]), Path.Combine(basePath, "parked-rename")); break;
                    case "missing": File.Delete(c.At(Paths[0])); break;
                    case "extra-dependency": File.WriteAllText(c.At("node_modules/inert/extra.cjs"), "INERT"); break;
                }
                if (mode != "acl-change") c.Protect();
                Record(mode + "-denied", () => Denied(() => { if (mode == "acl-change") lease.Handoff(); else lease.Measure(); },
                    mode == "content" ? "content-or-metadata" : mode == "replacement" ? "root-observation-changed" : null));
                Record(mode + "-terminal-and-no-handles", () => Assert(lease.State == MeasuredInputLifetime.Phase.Denied && lease.OutstandingHandles == 0, "failure cleanup"));
            }
            string withDependency = Deps.Replace("\"ApplicationCompanion.dll\":{}", "\"ApplicationCompanion.dll\":{},\"InertDependency.dll\":{}");
            using (var c = new Case(basePath, "managed-dependency-positive", deps: withDependency, extra: true))
            {
                c.Protect(); using var lease = Open(c); lease.Measure();
                var evidence = lease.Handoff(); lease.SimulateUse(evidence, c.Inputs.Select(i => i.RelativePath).ToArray()); lease.Release();
                Record("managed-entry-and-explicit-dependency", () => Assert(lease.Measurements.Count == 10 && lease.OutstandingHandles == 0 && evidence.Unresolved.Contains("framework selection"), "managed subset"));
            }
            var sidecarCases = new (string Name, string? Deps, string? Config, bool Extra)[] {
                ("malformed-deps", "{", null, false),
                ("malformed-config", null, "{", false),
                ("duplicate-config", null, "{\"runtimeOptions\":{\"tfm\":\"net10.0\",\"tfm\":\"net10.0\"}}", false),
                ("duplicate-deps", Deps.Replace("\"ApplicationCompanion.dll\":{}", "\"ApplicationCompanion.dll\":{},\"ApplicationCompanion.dll\":{}"), null, false),
                ("case-alias", Deps.Replace("ApplicationCompanion.dll", "applicationcompanion.dll"), null, false),
                ("traversing", Deps.Replace("ApplicationCompanion.dll", "../ApplicationCompanion.dll"), null, false),
                ("absolute-target", Deps.Replace("ApplicationCompanion.dll", "C:/ApplicationCompanion.dll"), null, false),
                ("url-target", Deps.Replace("ApplicationCompanion.dll", "file:///C:/ApplicationCompanion.dll"), null, false),
                ("unselected-target", Deps.Replace("ApplicationCompanion.dll", "Unselected.dll"), null, false),
                ("missing-declaration", Deps.Replace("\"ApplicationCompanion.dll\":{}", ""), null, false),
                ("undeclared-selected-dependency", Deps, null, true),
                ("library-mismatch", Deps.Replace("\"libraries\":{\"ApplicationCompanion/1.0.0\"", "\"libraries\":{\"Other/1.0.0\""), null, false),
                ("unsupported-asset-form", Deps.Replace("\"runtime\":", "\"native\":"), null, false),
                ("rid-target", Deps.Replace(".NETCoreApp,Version=v10.0", ".NETCoreApp,Version=v10.0/win-x64"), null, false),
                ("framework-unresolved", null, Config.Replace("\"tfm\":", "\"framework\":{},\"tfm\":"), false),
                ("roll-forward-unresolved", null, Config.Replace("\"tfm\":", "\"rollForward\":\"LatestMajor\",\"tfm\":"), false),
                ("probing-unresolved", null, Config.Replace("\"tfm\":", "\"additionalProbingPaths\":[],\"tfm\":"), false),
                ("unsupported-config", null, Config.Replace("\"tfm\":", "\"configProperties\":{},\"tfm\":"), false),
                ("duplicate-target-owner", Deps.Replace("\"ApplicationCompanion/1.0.0\":{\"runtime\":{\"ApplicationCompanion.dll\":{}}}", "\"ApplicationCompanion/1.0.0\":{\"runtime\":{\"ApplicationCompanion.dll\":{}}},\"Other/1.0.0\":{\"runtime\":{\"ApplicationCompanion.dll\":{}}}").Replace("\"type\":\"project\"}}}", "\"type\":\"project\"},\"Other/1.0.0\":{\"type\":\"project\"}}}"), null, false),
            };
            foreach (var test in sidecarCases)
            {
                using var c = new Case(basePath, "sidecar-" + test.Name, test.Deps, test.Config, test.Extra);
                c.Protect(); using var lease = Open(c);
                string reason = test.Name switch {
                    "malformed-deps" or "malformed-config" => "sidecar-json",
                    "duplicate-deps" or "missing-declaration" => "sidecar-duplicate-or-bound",
                    "duplicate-config" or "unsupported-asset-form" or "unsupported-config" => "sidecar-form",
                    "case-alias" or "unselected-target" => "sidecar-unselected-target",
                    "traversing" or "absolute-target" or "url-target" => "sidecar-path",
                    "undeclared-selected-dependency" => "sidecar-target-set",
                    "library-mismatch" => "sidecar-library-mismatch",
                    "rid-target" => "unresolved-runtime-target",
                    "framework-unresolved" or "roll-forward-unresolved" or "probing-unresolved" => "unresolved-runtime-provider",
                    "duplicate-target-owner" => "sidecar-target-duplicate",
                    _ => throw new IOException("unclassified test")
                };
                Record("sidecar-denied:" + test.Name, () => Denied(lease.Measure, reason));
                Record("sidecar-terminal:" + test.Name, () => {
                    Assert(lease.State == MeasuredInputLifetime.Phase.Denied && lease.OutstandingHandles == 0, "sidecar failure cleanup");
                    Denied(() => lease.Handoff());
                });
            }
            foreach (int index in new[] { 4, 5, 8 })
            {
                using var c = new Case(basePath, "sidecar-tamper-" + index); c.Protect(); using var lease = Open(c);
                c.Writable(); byte[] bytes = File.ReadAllBytes(c.At(Paths[index])); bytes[0] ^= 1; File.WriteAllBytes(c.At(Paths[index]), bytes); c.Protect();
                Record("sidecar-or-entry-tamper:" + index, () => Denied(lease.Measure, "content-or-metadata"));
                Record("tamper-terminal:" + index, () => Assert(lease.State == MeasuredInputLifetime.Phase.Denied && lease.OutstandingHandles == 0, "tamper cleanup"));
            }
            foreach (int index in new[] { 4, 5, 8 })
            {
                using var c = new Case(basePath, "managed-premature-close-" + index); c.Protect(); using var lease = Open(c); lease.Measure();
                var owned = ((IEnumerable)typeof(MeasuredInputLifetime).GetField("files", Flags)!.GetValue(lease)!).Cast<object>().ToArray();
                ((SafeFileHandle)owned[index].GetType().GetProperty("Handle")!.GetValue(owned[index])!).Dispose();
                Record("managed-premature-close:" + index, () => Denied(() => lease.Handoff(), "premature-close"));
                Record("managed-close-terminal:" + index, () => Assert(lease.State == MeasuredInputLifetime.Phase.Denied && lease.OutstandingHandles == 0, "managed close cleanup"));
            }
            using (var c = new Case(basePath, "paths"))
            {
                c.Protect();
                foreach (string bad in new[] { "../escape.exe", "runtime/../node.exe", "C:/outside.exe", "/absolute", "runtime//node.exe", @"runtime\node.exe", "file:///C:/outside", "runtime/node.exe:stream", "runtime/*.exe" })
                {
                    var altered = c.Inputs.ToArray(); altered[0] = altered[0] with { RelativePath = bad };
                    Record("path-denied:" + bad, () => Denied(() => Open(c, altered)));
                }
                Record("duplicate-canonical-ownership-denied", () => Denied(() => Open(c, c.Inputs.Append(c.Inputs[0] with { Role = "dependency" }).ToArray()), "duplicate-input"));
                Record("missing-configuration-denied", () => Denied(() => Open(c, c.Inputs.Where(i => i.RelativePath != Paths[4]).ToArray()), "missing-owner-configuration"));
                Record("missing-managed-entry-denied", () => Denied(() => Open(c, c.Inputs.Where(i => i.RelativePath != Paths[8]).ToArray()), "missing-managed-entry"));
                Record("unsupported-role-denied", () => Denied(() => Open(c, c.Inputs.Select(i => i.Role == "dependency" ? i with { Role = "external-loader" } : i).ToArray()), "input-role"));
                Record("64-file-ceiling", () => Denied(() => Open(c, Enumerable.Range(0, 65).Select(i => c.Inputs[0] with { RelativePath = "input" + i }).ToArray()), "input-bound"));
                Record("per-file-length-ceiling", () => Denied(() => Open(c, c.Inputs.Select((i,n) => n == 0 ? i with { Length = 134217729 } : i).ToArray()), "input-length"));
                Record("strict-temporary-ancestry-remains-denied", () => Denied(() => MeasuredInputLifetime.PreOpen(c.Root, null, c.Inputs)));
            }
            using (var c = new Case(basePath, "hardlink"))
            {
                string alias = Path.Combine(basePath, "hardlink-outside");
                Assert((bool)FixtureNative("CreateHardLink", alias, c.At(Paths[0]), IntPtr.Zero)!, "hardlink setup");
                c.Protect(); Record("hardlink-alias-denied", () => Denied(() => Open(c)));
            }
            using (var c = new Case(basePath, "junction"))
            {
                c.Protect(); Record("junction-redirection-denied", () => Denied(() => Open(c)));
            }
            foreach (string mode in new[] { "handoff-before-measure", "double-measure", "double-handoff", "premature-close", "foreign-evidence",
                "unsupported-loader", "external-loader", "use-replay", "release-replay", "use-after-release" })
            {
                using var c = new Case(basePath, mode); c.Protect(); using var lease = Open(c);
                if (mode != "handoff-before-measure") lease.Measure();
                Record(mode + "-denied", () => {
                    switch (mode)
                    {
                        case "handoff-before-measure": Denied(() => lease.Handoff()); break;
                        case "double-measure": Denied(lease.Measure); break;
                        case "double-handoff": lease.Handoff(); Denied(() => lease.Handoff()); break;
                        case "premature-close":
                            var files = ((IEnumerable)typeof(MeasuredInputLifetime).GetField("files", Flags)!.GetValue(lease)!).Cast<object>().ToArray();
                            ((SafeFileHandle)files[0].GetType().GetProperty("Handle")!.GetValue(files[0])!).Dispose();
                            Denied(() => lease.Handoff(), "premature-close"); break;
                        case "foreign-evidence":
                            var original = lease.Handoff(); Denied(() => lease.SimulateUse(new MeasuredInputLifetime.HandoffEvidence(original.Files, original.CompleteAncestry, original.Root, original.RootObservation), Paths), "foreign-handoff"); break;
                        case "unsupported-loader": Denied(() => lease.SimulateUse(lease.Handoff(), Paths.Append("node_modules/inert/unlisted.cjs").ToArray()), "unapproved-dependency"); break;
                        case "external-loader": Denied(() => lease.SimulateUse(lease.Handoff(), Paths.Append("C:/Windows/System32/external.dll").ToArray())); break;
                        case "use-replay":
                            var evidence = lease.Handoff();
                measuredEvidence = new { canonicalRoot = evidence.Root, completeAncestry = evidence.CompleteAncestry, rootObservation = evidence.RootObservation, files = evidence.Files, productionAuthority = false, raceFree = false, completeClosure = false }; lease.SimulateUse(evidence, Paths); Denied(() => lease.SimulateUse(evidence, Paths)); break;
                        case "release-replay": lease.Release(); Denied(lease.Release); break;
                        case "use-after-release":
                            var old = lease.Handoff(); lease.Release(); Denied(() => lease.SimulateUse(old, Paths)); break;
                    }
                });
                Record(mode + "-terminal-and-released", () => Assert(lease.State == MeasuredInputLifetime.Phase.Denied && lease.OutstandingHandles == 0, "terminal cleanup"));
            }
            using (var c = new Case(basePath, "pre-open-release"))
            {
                c.Protect(); using var lease = Open(c); lease.Release();
                Record("pre-open-release-without-acquisition", () => Assert(lease.State == MeasuredInputLifetime.Phase.Released && lease.OutstandingHandles == 0, "pre-open release"));
                lease.Dispose(); lease.Dispose();
                Record("dispose-idempotent", () => Assert(lease.State == MeasuredInputLifetime.Phase.Released && lease.OutstandingHandles == 0, "dispose"));
            }
            using (var c = new Case(basePath, "ownership"))
            {
                c.Protect(); using var first = Open(c); first.Measure(); using var second = Open(c);
                Record("simultaneous-duplicate-ownership-denied", () => Denied(second.Measure, "duplicate-ownership"));
                Record("foreign-denial-does-not-close-owner", () => Assert(first.OutstandingHandles > 0 && second.OutstandingHandles == 0, "ownership isolation"));
                first.SimulateUse(first.Handoff(), Paths); first.Release();
                using var third = Open(c); third.Measure(); third.Release();
                Record("ownership-reusable-only-after-release", () => Assert(third.OutstandingHandles == 0, "ownership release"));
            }
            Assert(leases.All(l => l.OutstandingHandles == 0), "outstanding handles at completion");
            Assert(cases.All(c => c.CleanupState == Case.CleanupPhase.Released && c.OpenRecoveryHandles == 0), "outstanding restoration owners");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, scenarioCount = results.Count, results, inputs = Paths,
                measuredEvidence, consumptionEvidence, processEvidence, loaderEvidence, nativeLoaderEvidence, allHandlesClosed = true, restorationOwnersReleased = cases.Count, recoveryHandlesOpen = 0,
                restorationFailureEvidence = cases.Where(c => c.Failures.Count != 0).Select(c => c.RecoverySnapshot()).ToArray(),
                productionAuthority = false, completeClosure = false, raceFree = false,
                unresolved = new[] { "Node builtins/conditions/dynamic imports", "Node/native DLL dependency closure", ".NET/CLR/framework selection", "WASM/helpers/providers", "mapped image reuse and pre-existing mappings", "production use after final observation" } }));
            return 0;
        }
        catch (Exception failure) { Console.Error.WriteLine(failure); return 1; }
        finally { try { foreach (var lease in leases) lease.Dispose(); } finally { PreserveRecoveryOwners(basePath); } }
    }
}
