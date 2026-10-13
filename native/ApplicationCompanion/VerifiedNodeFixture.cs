using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;

namespace ApplicationCompanion;

// Self-test only. No production key, owner proof, listener binding or caller executable.
internal static class VerifiedNodeFixture
{
    internal const string RuntimePath = @"C:\Program Files\nodejs\node.exe";
    internal const string RuntimeDigest = "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237";
    private sealed class Launch : IDisposable
    {
        private readonly object gate = new();
        private OwnedChild? child;
        private bool stopped;
        private readonly CancellationTokenRegistration ended, cancelled;
        internal Launch(string root, VerifiedBackendArtifacts artifacts, CancellationToken owner, string mode, Action<int> created)
        {
            ended = artifacts.Ended.Register(Stop);
            cancelled = owner.Register(Stop);
            try
            {
                artifacts.ClaimNodeFixture();
                lock (gate)
                {
                    if (stopped) throw new OperationCanceledException();
                    child = OwnedChild.StartNodeFixture(root, artifacts, owner, mode, created);
                    artifacts.Check(); owner.ThrowIfCancellationRequested();
                }
            }
            catch { Dispose(); throw; }
        }
        private void Stop() { lock (gate) { stopped = true; child?.Dispose(); child = null; } }
        public void Dispose() { Stop(); ended.Dispose(); cancelled.Dispose(); }
    }
    internal static int Run(string stage, string? focused=null)
    {
        var cases = new List<object>(); var processes = new List<Process>();
        string active = "runtime";
        try
        {
            using (var runtime = new FileStream(RuntimePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                if (Convert.ToHexString(SHA256.HashData(runtime)).ToLowerInvariant() != RuntimeDigest) throw new IOException("runtime-mismatch-stop");
            string root = Path.GetFullPath(stage);
            if (!Path.IsPathFullyQualified(stage) || root.StartsWith(Path.GetFullPath(AppContext.BaseDirectory), StringComparison.OrdinalIgnoreCase)) throw new IOException("fixture-root");
            using var signer = RSA.Create(3072);
            var trust = BackendReleaseTrust.ForIsolatedTests(signer);
            object Row(string file, string role) { string path = role == "runtime" ? RuntimePath : Path.Combine(root, file);
                return new { path = file, role, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant(), length = new FileInfo(path).Length }; }
            byte[] Manifest(int lifetime = 10000) => JsonSerializer.SerializeToUtf8Bytes(new { v = 1, purpose = "isolated-node-launch-fixture",
                releaseId = Guid.NewGuid(), expiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + lifetime,
                files = new[] { Row("node.exe", "runtime"), Row("node-launch-driver.cjs", "entry"), Row("node-launch-review.cjs", "dependency"),
                    Row("src/test/backend_lifecycle_fixture.js", "dependency") } });
            byte[] Sign(byte[] bytes) => signer.SignData(bytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
            VerifiedBackendArtifacts Verify(byte[] bytes, CancellationToken owner = default) => VerifiedBackendArtifacts.VerifyNodeFixture(root, bytes, Sign(bytes), trust, owner);
            var timing=Stopwatch.StartNew();
            void Check(bool ok,[System.Runtime.CompilerServices.CallerLineNumber]int line=0) { if (!ok) throw new IOException("fixture-assertion:" + active+":line="+line+":elapsedMs="+timing.ElapsedMilliseconds); }
            void Created(int pid) { var p = Process.GetProcessById(pid); _ = p.Handle; processes.Add(p); }
            void Cleanup() { foreach (var p in processes) Check(p.WaitForExit(3000)); }
            void Deny(string name, Action action, Func<Exception, bool> expected)
            {
                active = name; Exception? failure = null;
                try { action(); } catch (Exception e) { failure = e; }
                Check(failure is not null && expected(failure)); Cleanup();
                Check(!File.Exists(Path.Combine(root, "node-launch-result.json")));
                cases.Add(new { name, outcome = "denied", reason = failure is BackendArtifactException b ? b.Reason : failure is OperationCanceledException ? "cancelled" : failure!.Message });
            }
            string result = Path.Combine(root, "node-launch-result.json");
            Check(!File.Exists(result));
            if(focused is null){
            active = "positive";
            using (var artifacts = Verify(Manifest()))
            using (var launch = new Launch(root, artifacts, default, "normal", Created))
            {
                Check(processes[^1].WaitForExit(7000)); Check(processes[^1].ExitCode == 0);
                using var report = JsonDocument.Parse(File.ReadAllBytes(result));
                FixtureCompletion.Require(processes[^1].ExitCode,report.RootElement,true,false);
                Check(report.RootElement.GetProperty("passed").GetBoolean());
                Check(report.RootElement.GetProperty("stagedComposition").GetBoolean());
                Check(!report.RootElement.GetProperty("productionAuthority").GetBoolean());
                Check(report.RootElement.GetProperty("runtime").GetString() == "v24.19.0");
                Check(report.RootElement.GetProperty("executable").GetString() == RuntimePath);
                Check(!artifacts.ProductionAuthority); Check(BackendReleaseTrust.Production is null);
                bool replay = false;
                try { using var duplicate = new Launch(root, artifacts, default, "normal", Created); }
                catch (BackendArtifactException e) { replay = e.Reason == "replay"; }
                Check(replay);
            }
            File.Move(result, Path.Combine(root, "node-launch-positive.json")); Cleanup(); cases.Add(new { name = active, outcome = "passed" });
            cases.Add(new { name = "one-use-launch", outcome = "denied", reason = "replay" });
            byte[] approval = Manifest(); byte[] signature = Sign(approval); byte[] altered = (byte[])approval.Clone(); altered[^2] ^= 1;
            Deny("manifest-tamper", () => { using var a = VerifiedBackendArtifacts.VerifyNodeFixture(root, altered, signature, trust, default); }, e => e is BackendArtifactException { Reason: "signature" });
            string driver = Path.Combine(root, "node-launch-driver.cjs"), original = File.ReadAllText(driver);
            approval = Manifest(); File.AppendAllText(driver, "\n// tampered\n");
            try { Deny("entry-tamper", () => { using var a = Verify(approval); }, e => e is BackendArtifactException { Reason: "measurement" }); }
            finally { File.WriteAllText(driver, original); }
            byte[] wrongRuntime = System.Text.Encoding.UTF8.GetBytes(System.Text.Encoding.UTF8.GetString(Manifest()).Replace(RuntimeDigest, new string('0', 64)));
            Deny("runtime-digest-policy", () => { using var a = Verify(wrongRuntime); }, e => e is BackendArtifactException { Reason: "runtime-policy" });
            var excessive = System.Text.Json.Nodes.JsonNode.Parse(Manifest())!;
            var rows = excessive["files"]!.AsArray(); var row = rows[1]!.DeepClone();
            while (rows.Count < 65) rows.Add(row.DeepClone());
            Deny("manifest-file-limit", () => { using var a = Verify(System.Text.Encoding.UTF8.GetBytes(excessive.ToJsonString())); }, e => e is BackendArtifactException { Reason: "manifest" });
            Deny("manifest-expiry-limit", () => { using var a = Verify(Manifest(11000)); }, e => e is BackendArtifactException { Reason: "expiry" });
            Deny("expired-before-create", () => { using var a = Verify(Manifest(-1)); }, e => e is BackendArtifactException { Reason: "expiry" });
            Deny("cancelled-before-create", () => { using var a = Verify(Manifest(), new CancellationToken(true)); }, e => e is BackendArtifactException { Reason: "owner" });
            foreach (string mode in new[] { "wrong-image", "job-failure", "resume-failure", "cancel-before-resume" })
                Deny(mode, () => { using var a = Verify(Manifest()); using var launch = new Launch(root, a, default, mode, Created); },
                    e => mode switch { "wrong-image" => e is BackendArtifactException { Reason: "runtime-instance" },
                        "cancel-before-resume" => e is OperationCanceledException,
                        "resume-failure" => e is IOException && e.Message == "fixture-resume-failure:6",
                        _ => e is IOException && (e.Message == "create-process:6" || e.Message == "create-process:87" || e.Message == "job-list:6" || e.Message == "job-list:87") });
            }
            foreach (bool expire in focused is null ? new[] { false, true } : new[] { true })
            {
                active = expire ? "expiry-live" : "cancellation-live";
                using var owner = new CancellationTokenSource();
                using var a = Verify(Manifest(expire ? 3500 : 10000), owner.Token);
                using var launch = new Launch(root, a, owner.Token, "hold", Created);
                var clock = Stopwatch.StartNew(); while (!File.Exists(result) && clock.ElapsedMilliseconds < 2500) Thread.Sleep(10);
                Check(File.Exists(result));
                using(var report=FixtureCompletion.Read(result)){
                    Check(report.RootElement.GetProperty("lifetimeReady").GetBoolean());
                    Check(!report.RootElement.GetProperty("terminal").GetBoolean());
                    Check(!report.RootElement.GetProperty("passed").GetBoolean());
                    Check(!report.RootElement.GetProperty("productionAuthority").GetBoolean());
                    Check(report.RootElement.GetProperty("runtime").GetString()=="v24.19.0");
                    Check(report.RootElement.GetProperty("executable").GetString()==RuntimePath);
                }
                if (!expire) owner.Cancel();
                Check(processes[^1].WaitForExit(5000)); Check(a.Ended.IsCancellationRequested);
                Check(processes[^1].ExitCode is 0 or 3); // Job-close termination, or existing explicit TerminateProcess fallback.
                File.Move(result, Path.Combine(root, "node-launch-" + active + ".json")); Cleanup();
                cases.Add(new { name = active, outcome = "revoked-and-cleaned",exitCode=processes[^1].ExitCode,controlOnly=true,completionVerified=false });
            }
            Cleanup();
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, productionAuthority = false, completeClosure = false,
                runtime = new { path = RuntimePath, version = "v24.19.0", sha256 = RuntimeDigest }, cases,
                createdProcesses = processes.Count, residualProcesses = processes.Count(p => !p.HasExited),
                signedCoverage = "Runtime and three fixture control files only; other staged dependencies remain unverified.",
                manifestLimits = new { files = 64, bytes = 268435456, expiryMs = 10000 } })); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(JsonSerializer.Serialize(new { passed = false, test = active, error = e.GetType().Name,
            reason = e is BackendArtifactException b ? b.Reason : e.Message })); return 1; }
        finally { foreach (var p in processes) p.Dispose(); }
    }
}
