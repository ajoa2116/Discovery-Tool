using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

internal sealed class BackendArtifactException(string reason) : IOException("Backend artifact verification unavailable.")
{ internal string Reason { get; } = reason; }

// No production trust root exists yet. A caller/manifest cannot approve its own key.
internal sealed class BackendReleaseTrust
{
    internal static BackendReleaseTrust? Production => null;
    private readonly byte[] key;
    private readonly HashSet<Guid> consumed = [];
    private BackendReleaseTrust(byte[] key) { this.key = key; }
    internal static BackendReleaseTrust ForIsolatedTests(RSA signer) => new(signer.ExportSubjectPublicKeyInfo());
    internal bool Verify(byte[] manifest, byte[] signature)
    {
        using var rsa = RSA.Create(); rsa.ImportSubjectPublicKeyInfo(key, out _);
        return rsa.KeySize is >= 2048 and <= 4096 && rsa.VerifyData(manifest, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
    }
    internal void Consume(Guid id)
    {
        lock (consumed)
        {
            if (consumed.Contains(id)) throw new BackendArtifactException("replay");
            if (consumed.Count >= 32) throw new BackendArtifactException("capacity");
            consumed.Add(id);
        }
    }
}

// Signature-authenticated measurements and retained file objects, not executable
// authorization. Isolated trust policies and results never grant production access.
internal sealed class VerifiedBackendArtifacts : IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    private struct FileInformation
    {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);
    private sealed record Artifact(FileStream File, byte[] Digest, long Length, string Role);
    private readonly List<Artifact> files = [];
    private readonly CancellationTokenSource ended = new();
    private readonly CancellationToken endedToken;
    private CancellationTokenRegistration ownerRegistration;
    private System.Threading.Timer? expiryTimer;
    private readonly long started = Stopwatch.GetTimestamp();
    private long expiresAt;
    private double lifetime;
    private int terminal, bound;
    internal CancellationToken Ended => endedToken;
    internal bool ProductionAuthority => false;
    private VerifiedBackendArtifacts() { endedToken = ended.Token; }
    private static BackendArtifactException Denied(string reason) => new(reason);
    private static void Shape(JsonElement value, params string[] fields)
    {
        if (value.ValueKind != JsonValueKind.Object) throw Denied("manifest");
        var expected = new HashSet<string>(fields);
        foreach (var property in value.EnumerateObject()) if (!expected.Remove(property.Name)) throw Denied("manifest");
        if (expected.Count != 0) throw Denied("manifest");
    }
    internal static VerifiedBackendArtifacts Verify(string root, byte[] manifest, byte[] signature,
        BackendReleaseTrust? trust, CancellationToken owner)
    {
        var result = new VerifiedBackendArtifacts();
        try
        {
            if (trust is null) throw Denied("trust-root");
            if (owner.IsCancellationRequested) throw Denied("owner");
            // Copy before validation; a mutable caller buffer cannot change signed fields.
            if (manifest.Length is < 1 or > 65536 || signature.Length is < 256 or > 512) throw Denied("manifest");
            manifest = (byte[])manifest.Clone(); signature = (byte[])signature.Clone();
            if (!trust.Verify(manifest, signature)) throw Denied("signature");
            using var document = JsonDocument.Parse(manifest, new JsonDocumentOptions { MaxDepth = 4 });
            var release = document.RootElement;
            Shape(release, "v", "purpose", "releaseId", "expiresAt", "files");
            if (release.GetProperty("v").GetInt32() != 1 || release.GetProperty("purpose").GetString() != "isolated-runtime-reservation" ||
                !Guid.TryParseExact(release.GetProperty("releaseId").GetString(), "D", out var id) || id == Guid.Empty) throw Denied("manifest");
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            result.expiresAt = release.GetProperty("expiresAt").GetInt64();
            result.lifetime = result.expiresAt - now;
            if (result.lifetime is <= 0 or > 10000) throw Denied("expiry");
            trust.Consume(id); // Signed approval is one-use, even when a file check fails.
            string directory = Path.GetFullPath(root);
            if (!Path.IsPathFullyQualified(root) || !System.Text.RegularExpressions.Regex.IsMatch(directory, @"^[A-Za-z]:\\") ||
                new DriveInfo(Path.GetPathRoot(directory)!).DriveType != DriveType.Fixed) throw Denied("path");
            for (var parent = new DirectoryInfo(directory); parent is not null; parent = parent.Parent)
                if ((parent.Attributes & FileAttributes.ReparsePoint) != 0) throw Denied("path");
            var entries = release.GetProperty("files");
            if (entries.ValueKind != JsonValueKind.Array || entries.GetArrayLength() is < 2 or > 64) throw Denied("manifest");
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int runtimes = 0, entrypoints = 0; long total = 0;
            foreach (var entry in entries.EnumerateArray())
            {
                Shape(entry, "path", "role", "sha256", "length");
                string relative = entry.GetProperty("path").GetString() ?? "", role = entry.GetProperty("role").GetString() ?? "";
                if (relative.Length is < 1 or > 240 || relative.Split('/').Any(part =>
                    !System.Text.RegularExpressions.Regex.IsMatch(part, "^[A-Za-z0-9_-][A-Za-z0-9_.-]*$") || part.EndsWith('.') ||
                    System.Text.RegularExpressions.Regex.IsMatch(part.Split('.')[0], "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) ||
                    !paths.Add(relative) || role is not ("runtime" or "entry" or "dependency")) throw Denied("path");
                runtimes += role == "runtime" ? 1 : 0; entrypoints += role == "entry" ? 1 : 0;
                string digest = entry.GetProperty("sha256").GetString() ?? "";
                long length = entry.GetProperty("length").GetInt64();
                if (!System.Text.RegularExpressions.Regex.IsMatch(digest, "^[a-f0-9]{64}$") || length is <= 0 or > 134217728 ||
                    (total += length) > 268435456) throw Denied("manifest");
                string path = directory;
                foreach (string component in relative.Split('/'))
                {
                    path = Path.Combine(path, component);
                    if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw Denied("path");
                }
                // Deny ordinary writes, deletion and replacement for the measured lifetime.
                var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                result.files.Add(new Artifact(file, Convert.FromHexString(digest), length, role));
                if (!GetFileInformationByHandle(file.SafeFileHandle, out var info) || (info.Attributes & 0x400) != 0) throw Denied("path");
                result.Measure(result.files[^1]);
                if (owner.IsCancellationRequested) throw Denied("owner");
                result.CheckDeadline();
            }
            if (runtimes != 1 || entrypoints != 1) throw Denied("manifest");
            result.ownerRegistration = owner.Register(result.Revoke);
            result.expiryTimer = new System.Threading.Timer(_ => result.Revoke(), null,
                TimeSpan.FromMilliseconds(Math.Max(0, result.lifetime - Stopwatch.GetElapsedTime(result.started).TotalMilliseconds)), Timeout.InfiniteTimeSpan);
            result.Check(); return result;
        }
        catch (Exception failure)
        {
            result.Dispose();
            throw failure is BackendArtifactException classified ? classified : Denied("artifact");
        }
    }
    private void CheckDeadline()
    {
        if (Volatile.Read(ref terminal) != 0 || Stopwatch.GetElapsedTime(started).TotalMilliseconds >= lifetime ||
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expiresAt) throw Denied("expiry");
    }
    private void Measure(Artifact artifact)
    {
        if (artifact.File.Length != artifact.Length) throw Denied("measurement");
        artifact.File.Position = 0;
        if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(artifact.File), artifact.Digest)) throw Denied("measurement");
    }
    internal void Check()
    {
        try { lock (files) { CheckDeadline(); foreach (var file in files) Measure(file); CheckDeadline(); } }
        catch (Exception failure) { Revoke(); throw failure is BackendArtifactException classified ? classified : Denied("artifact"); }
    }
    internal void MatchImageFile(string kernelImagePath)
    {
        Check();
        using var loaded = new FileStream(kernelImagePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var approved = files.Single(file => file.Role == "runtime").File;
        if (!GetFileInformationByHandle(approved.SafeFileHandle, out var expected) ||
            !GetFileInformationByHandle(loaded.SafeFileHandle, out var actual) || expected.Volume != actual.Volume ||
            expected.IndexHigh != actual.IndexHigh || expected.IndexLow != actual.IndexLow) throw Denied("runtime-instance");
        Check();
    }
    internal NativeArtifactReservation Bind(NativeLauncherLease lease, Guid instance, Guid receipt)
    {
        try
        {
            if (Interlocked.Exchange(ref bound, 1) != 0) throw Denied("replay");
            Check(); lease.Check();
            if (lease.InstanceId != instance || lease.ReceiptId != receipt) throw Denied("binding");
            lease.VerifyRuntimeIdentity(this);
            return new NativeArtifactReservation(this, lease);
        }
        catch { Revoke(); throw; }
    }
    internal void Revoke()
    {
        if (Interlocked.Exchange(ref terminal, 1) != 0) return;
        try { ended.Cancel(); } catch (AggregateException) { }
        finally { expiryTimer?.Dispose(); lock (files) foreach (var artifact in files) artifact.File.Dispose(); }
    }
    public void Dispose() { Revoke(); ownerRegistration.Dispose(); expiryTimer?.Dispose(); }
}

// Exact native object/lifetime association, not a transferable Node/18C.7Q proof.
internal sealed class NativeArtifactReservation : IDisposable
{
    private readonly VerifiedBackendArtifacts artifacts;
    private readonly NativeLauncherLease lease;
    private readonly CancellationTokenRegistration revoked;
    private readonly CancellationTokenRegistration ownerLost;
    internal bool ProductionAuthority => false;
    internal NativeArtifactReservation(VerifiedBackendArtifacts artifacts, NativeLauncherLease lease)
    {
        this.artifacts = artifacts; this.lease = lease;
        revoked = artifacts.Ended.Register(() => lease.Revoke("artifacts"));
        ownerLost = lease.Ended.Register(artifacts.Revoke);
        try { Check(); } catch { revoked.Dispose(); ownerLost.Dispose(); throw; }
    }
    internal void Check() { artifacts.Check(); lease.Check(); lease.VerifyRuntimeIdentity(artifacts); }
    public void Dispose() { revoked.Dispose(); ownerLost.Dispose(); lease.Revoke(); artifacts.Revoke(); }
}
