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
        internal Case(string basePath, string name, string? deps = null, string? config = null, bool extra = false)
        {
            Boundary = Path.Combine(basePath, name); Root = Path.Combine(Boundary, "application", "v1");
            for (int i = 0; i < Paths.Length; i++)
            {
                string path = At(Paths[i]); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, "INERT SYNTHETIC INPUT " + Paths[i]);
            }
            File.WriteAllText(At(Paths[4]), deps ?? Deps);
            File.WriteAllText(At(Paths[5]), config ?? Config);
            if (extra) File.WriteAllText(At("owner/InertDependency.dll"), "INERT MANAGED DEPENDENCY");
            var selected = Paths.Concat(extra ? new[] { "owner/InertDependency.dll" } : Array.Empty<string>()).ToArray();
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
        if (unresolved.Length == 0) return;
        // No retry, handle closure, ACL mutation or process exit on an unexpected
        // failure. The runner must preserve this process, not timeout-kill it.
        try { File.AppendAllText(Path.Combine(basePath, "recovery-pending.jsonl"), JsonSerializer.Serialize(new {
            pid = Environment.ProcessId, utc = DateTime.UtcNow, productionAuthority = false,
            owners = unresolved.Select(c => c.RecoverySnapshot()).ToArray() }) + Environment.NewLine); }
        catch (Exception error) { Console.Error.WriteLine("Recovery evidence write failed: " + error); }
        Console.Error.WriteLine("FIXTURE_RECOVERY_PENDING pid=" + Environment.ProcessId + " root=" + basePath);
        Console.Error.Flush();
        // Strong references in cases preserve capabilities ONLY while this owner
        // lives. Owner-reviewed intervention is required; there is no live-control
        // adapter or automatic reconstruction/retry mechanism.
        using var hold = new ManualResetEvent(false); hold.WaitOne();
    }
    public static int Main(string[] args)
    {
        if (args.Length != 1 || !Path.GetFileName(args[0]).StartsWith("discovery-measured-input-", StringComparison.Ordinal) ||
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
                measuredEvidence, allHandlesClosed = true, restorationOwnersReleased = cases.Count, recoveryHandlesOpen = 0,
                restorationFailureEvidence = cases.Where(c => c.Failures.Count != 0).Select(c => c.RecoverySnapshot()).ToArray(),
                productionAuthority = false, completeClosure = false, raceFree = false,
                unresolved = new[] { "Node builtins/conditions/dynamic imports", "Node/native DLL dependency closure", ".NET/CLR/framework selection", "WASM/helpers/providers", "mapped image reuse and pre-existing mappings", "production use after final observation" } }));
            return 0;
        }
        catch (Exception failure) { Console.Error.WriteLine(failure); return 1; }
        finally { try { foreach (var lease in leases) lease.Dispose(); } finally { PreserveRecoveryOwners(basePath); } }
    }
}
