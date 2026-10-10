using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ApplicationCompanion;

internal static class BackendArtifactTests
{
    internal static int Run()
    {
        try { RunAsync().GetAwaiter().GetResult(); return 0; }
        catch { Console.Error.WriteLine("Backend artifact self-test failed."); return 1; }
    }
    private static async Task RunAsync()
    {
        int checks = 0, cases = 0;
        void Check(bool value) { if (!value) throw new IOException(); checks++; }
        void Deny(string reason, Action action)
        {
            bool denied = false;
            try { action(); } catch (BackendArtifactException failure) { denied = failure.Reason == reason; }
            Check(denied);
        }
        long Expiry(int duration = 10000) => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + duration;
        using var signer = RSA.Create(2048); using var attacker = RSA.Create(2048);
        var trust = BackendReleaseTrust.ForIsolatedTests(signer);
        byte[] Sign(byte[] manifest) => signer.SignData(manifest, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
        object Row(string root, string name, string role) => new {
            path = name, role, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, name)))).ToLowerInvariant(),
            length = new FileInfo(Path.Combine(root, name)).Length,
        };
        byte[] Manifest(string root, string runtime = "runtime.bin", string entry = "entry.ts", int duration = 10000) =>
            JsonSerializer.SerializeToUtf8Bytes(new { v = 1, purpose = "isolated-runtime-reservation", releaseId = Guid.NewGuid(),
                expiresAt = Expiry(duration), files = new[] { Row(root, runtime, "runtime"), Row(root, entry, "entry") } });
        string temporary = Path.GetFullPath(Path.GetTempPath());
        string root = Path.GetFullPath(Path.Combine(temporary, "CCTVBackendArtifactTests-" + Guid.NewGuid().ToString("N")));
        if (Path.GetDirectoryName(root) != Path.TrimEndingDirectorySeparator(temporary)) throw new IOException();
        Directory.CreateDirectory(root);
        try
        {
            File.WriteAllText(Path.Combine(root, "runtime.bin"), "isolated runtime bytes");
            File.WriteAllText(Path.Combine(root, "entry.ts"), "export const isolated = true;");
            byte[] approval = Manifest(root), signature = Sign(approval);
            Deny("trust-root", () => VerifiedBackendArtifacts.Verify(root, approval, signature, BackendReleaseTrust.Production, CancellationToken.None)); cases++;
            var forged = attacker.SignData(approval, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
            Deny("signature", () => VerifiedBackendArtifacts.Verify(root, approval, forged, trust, CancellationToken.None)); cases++;
            var tampered = (byte[])approval.Clone(); tampered[^2] ^= 1;
            Deny("signature", () => VerifiedBackendArtifacts.Verify(root, tampered, signature, trust, CancellationToken.None)); cases++;
            using (var verified = VerifiedBackendArtifacts.Verify(root, approval, signature, trust, CancellationToken.None))
            {
                verified.Check(); Check(!verified.ProductionAuthority); Check(!verified.Ended.IsCancellationRequested);
                // Fixture files were writable before approval; denials below are held locks.
                foreach (Action mutation in new Action[] {
                    () => File.WriteAllText(Path.Combine(root, "runtime.bin"), "replacement"),
                    () => File.Delete(Path.Combine(root, "entry.ts")),
                    () => File.Move(Path.Combine(root, "runtime.bin"), Path.Combine(root, "replaced.bin")),
                })
                {
                    bool denied = false; try { mutation(); } catch (IOException) { denied = true; }
                    Check(denied); verified.Check();
                }
                Deny("replay", () => VerifiedBackendArtifacts.Verify(root, approval, signature, trust, CancellationToken.None)); cases++;
            }
            File.WriteAllText(Path.Combine(root, "runtime.bin"), "replacement");
            Deny("measurement", () => VerifiedBackendArtifacts.Verify(root, approval,
                signature, BackendReleaseTrust.ForIsolatedTests(signer), CancellationToken.None)); cases++;
            approval = Manifest(root); signature = Sign(approval);
            File.WriteAllText(Path.Combine(root, "entry.ts"), "substituted entrypoint");
            Deny("measurement", () => VerifiedBackendArtifacts.Verify(root, approval, signature, trust, CancellationToken.None)); cases++;
            // Correctly signed, but malformed/traversing descriptors are still denied.
            foreach (string path in new[] { "../runtime.bin", "runtime.bin:alternate", "runtime.bin/", "RUNTIME.BIN" })
            {
                var good = Manifest(root);
                string json = Encoding.UTF8.GetString(good);
                if (path == "RUNTIME.BIN") json = json.Replace("entry.ts", path);
                else json = json.Replace("runtime.bin", path);
                byte[] bad = Encoding.UTF8.GetBytes(json);
                Deny("path", () => VerifiedBackendArtifacts.Verify(root, bad, Sign(bad), trust, CancellationToken.None));
            }
            cases++;
            foreach (int malformed in new[] { 0, 1, 2 })
            {
                string json = Encoding.UTF8.GetString(Manifest(root));
                if (malformed == 0) json = json.Insert(1, "\"v\":1,");
                if (malformed == 1) json = json.Replace("isolated-runtime-reservation", "production");
                if (malformed == 2) json = json.Replace("\"role\":\"entry\"", "\"role\":\"runtime\"");
                byte[] bad = Encoding.UTF8.GetBytes(json);
                Deny("manifest", () => VerifiedBackendArtifacts.Verify(root, bad, Sign(bad), trust, CancellationToken.None));
            }
            cases++;
            foreach (int duration in new[] { -1, 11000 })
            {
                var expired = Manifest(root, duration: duration);
                Deny("expiry", () => VerifiedBackendArtifacts.Verify(root, expired, Sign(expired), trust, CancellationToken.None));
            }
            cases++;
            var cancelledApproval = Manifest(root);
            Deny("owner", () => VerifiedBackendArtifacts.Verify(root, cancelledApproval, Sign(cancelledApproval), trust, new CancellationToken(true))); cases++;
            using (var cancellation = new CancellationTokenSource())
            using (var verified = VerifiedBackendArtifacts.Verify(root, cancelledApproval, Sign(cancelledApproval), trust, cancellation.Token))
            {
                cancellation.Cancel(); Check(verified.Ended.IsCancellationRequested);
                Deny("expiry", verified.Check);
                File.WriteAllText(Path.Combine(root, "runtime.bin"), "locks released"); cases++;
            }

            string imageRoot = Path.GetDirectoryName(Environment.ProcessPath!)!;
            string imageName = Path.GetFileName(Environment.ProcessPath!);
            string entryName = Path.GetFileName(typeof(BackendArtifactTests).Assembly.Location);
            byte[] NativeApproval(int duration = 10000) => Manifest(imageRoot, imageName, entryName, duration);
            async Task<NativeLauncherLease> Launch(CancellationToken owner) =>
                await NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), owner);
            // A signed copy of the exact executable bytes still has the wrong kernel file identity.
            File.Copy(Environment.ProcessPath!, Path.Combine(root, "runtime.bin"), true);
            approval = Manifest(root);
            using (var verified = VerifiedBackendArtifacts.Verify(root, approval, Sign(approval), trust, CancellationToken.None))
            using (var lease = await Launch(CancellationToken.None))
            {
                verified.Check(); lease.Check();
                Deny("runtime-instance", () => verified.Bind(lease, lease.InstanceId, lease.ReceiptId));
                Check(verified.Ended.IsCancellationRequested); lease.Check(); cases++;
            }
            foreach (bool wrongReceipt in new[] { false, true })
            {
                approval = NativeApproval();
                using var verified = VerifiedBackendArtifacts.Verify(imageRoot, approval, Sign(approval), trust, CancellationToken.None);
                using var lease = await Launch(CancellationToken.None);
                Deny("binding", () => verified.Bind(lease, wrongReceipt ? lease.InstanceId : Guid.NewGuid(), wrongReceipt ? Guid.NewGuid() : lease.ReceiptId));
                Check(verified.Ended.IsCancellationRequested); lease.Check();
            }
            cases++;
            approval = NativeApproval();
            using (var verified = VerifiedBackendArtifacts.Verify(imageRoot, approval, Sign(approval), trust, CancellationToken.None))
            using (var lease = await Launch(CancellationToken.None))
            using (var reservation = verified.Bind(lease, lease.InstanceId, lease.ReceiptId))
            {
                reservation.Check(); Check(!reservation.ProductionAuthority); Check(!lease.Ended.IsCancellationRequested);
                Deny("replay", () => verified.Bind(lease, lease.InstanceId, lease.ReceiptId));
                await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4)); Check(lease.Ended.IsCancellationRequested); cases++;
            }
            // Both directions of lifetime loss: cancellation of files or native owner.
            foreach (bool cancelArtifacts in new[] { false, true })
            {
                using var artifactOwner = new CancellationTokenSource(); using var nativeOwner = new CancellationTokenSource();
                approval = NativeApproval();
                using var verified = VerifiedBackendArtifacts.Verify(imageRoot, approval, Sign(approval), trust, artifactOwner.Token);
                using var lease = await Launch(nativeOwner.Token);
                using var reservation = verified.Bind(lease, lease.InstanceId, lease.ReceiptId);
                reservation.Check();
                (cancelArtifacts ? artifactOwner : nativeOwner).Cancel();
                await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
                Check(verified.Ended.IsCancellationRequested && lease.Ended.IsCancellationRequested);
                Check(lease.EndReason == (cancelArtifacts ? "artifacts" : "owner"));
                Deny("expiry", reservation.Check);
            }
            cases++;
            approval = NativeApproval();
            using (var verified = VerifiedBackendArtifacts.Verify(imageRoot, approval, Sign(approval), trust, CancellationToken.None))
            using (var lease = await Launch(CancellationToken.None))
            using (var reservation = verified.Bind(lease, lease.InstanceId, lease.ReceiptId))
            {
                using (var peer = Process.GetProcessById(lease.PeerPid)) peer.Kill();
                await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
                using var replacement = await Launch(CancellationToken.None);
                replacement.Check(); Check(verified.Ended.IsCancellationRequested);
                Deny("expiry", reservation.Check); replacement.Check(); cases++;
            }
            approval = Manifest(root, duration: 600);
            using (var verified = VerifiedBackendArtifacts.Verify(root, approval, Sign(approval), trust, CancellationToken.None))
            {
                var lost = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                using var registration = verified.Ended.Register(() => lost.TrySetResult());
                await lost.Task.WaitAsync(TimeSpan.FromSeconds(3));
                Check(verified.Ended.IsCancellationRequested); Deny("expiry", verified.Check); cases++;
            }
            Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "BACKEND_ARTIFACT_SELF_TEST_OK", cases, checks }));
        }
        finally
        {
            // This fixed, verified temporary child directory is the only recursive target.
            if (Path.GetDirectoryName(Path.GetFullPath(root)) == Path.TrimEndingDirectorySeparator(temporary)) Directory.Delete(root, true);
        }
    }
}
