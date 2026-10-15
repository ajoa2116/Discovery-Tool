using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

// Isolated observation only. No launcher, trust key, manifest or authority consumer.
internal static class InstalledRootAdmission
{
    internal sealed record Fact(string Path, string Role, string Owner, uint EffectiveGranted,
        uint Forbidden, uint Volume, ulong FileId, string Descriptor);
    internal sealed record Evidence(bool ObservedScopeProtected, bool CompleteAncestry, string? Denial,
        string? DeniedPath, IReadOnlyList<Fact> Facts)
    {
        public bool ProductionAuthority => false;
        public bool RaceFree => false;
        public bool InstalledRootAdmitted => ObservedScopeProtected && CompleteAncestry;
    }
    private sealed class Denied(string reason, string path) : IOException
    { internal string Reason = reason; internal string PathName = path; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Information
    {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Mapping { public uint Read, Write, Execute, All; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetFileInformationByHandle(SafeFileHandle file, out Information info);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint capacity, uint flags);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint GetSecurityInfo(SafeFileHandle file, int type, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")] private static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool DuplicateToken(IntPtr token, int level, out SafeAccessTokenHandle copy);
    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AccessCheck(byte[] descriptor, SafeAccessTokenHandle token, uint desired, ref Mapping mapping,
        byte[] privileges, ref uint size, out uint granted, [MarshalAs(UnmanagedType.Bool)] out bool allowed);
    private const uint Mutation = 0x000D0156; // write/append/EA/attributes, delete-child, DELETE, WRITE_DAC/OWNER
    private const uint AncestorMutation = 0x000D0150; // existing ancestors may permit creation of unrelated siblings
    private static bool Privileged(string sid) => sid is "S-1-5-18" or "S-1-5-32-544" or
        "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"; // TrustedInstaller
    private static uint Expand(uint mask)
    {
        uint result = mask & 0x0FFFFFFF;
        if ((mask & 0x80000000) != 0) result |= 0x120089;
        if ((mask & 0x40000000) != 0) result |= 0x120116;
        if ((mask & 0x20000000) != 0) result |= 0x1200A0;
        if ((mask & 0x10000000) != 0) result |= 0x1F01FF;
        return result;
    }
    // AccessCheck covers the live token, including deny-only groups and owner rights.
    // This additional conservative scan covers other users without inventing tokens:
    // dangerous allows to any non-privileged SID deny even if another ACE might deny it.
    internal static string? DescriptorDenial(byte[] bytes, uint forbidden)
    {
        var sd = new RawSecurityDescriptor(bytes, 0);
        if (sd.Owner is null || sd.Group is null || sd.DiscretionaryAcl is null) return "unverified-descriptor";
        bool ownerSuppressed = false;
        foreach (GenericAce generic in sd.DiscretionaryAcl)
        {
            if (generic is not CommonAce ace || ace.IsCallback || ace.AceQualifier is not (AceQualifier.AccessAllowed or AceQualifier.AccessDenied))
                return "unsupported-ace";
            if ((ace.AceFlags & AceFlags.InheritOnly) != 0) continue;
            uint mask = Expand(unchecked((uint)ace.AccessMask));
            string sid = ace.SecurityIdentifier.Value;
            if (sid == "S-1-3-4" && ace.AceQualifier == AceQualifier.AccessDenied && (mask & 0x40000) != 0) ownerSuppressed = true;
            if (ace.AceQualifier == AceQualifier.AccessAllowed && !Privileged(sid) && (mask & forbidden) != 0)
                return "ordinary-principal-mutation";
        }
        if (!Privileged(sd.Owner.Value) && !ownerSuppressed) return "ordinary-owner-control";
        return null;
    }
    private static byte[] Descriptor(SafeFileHandle handle, string path)
    {
        uint error = GetSecurityInfo(handle, 1, 7, out _, out _, out _, out _, out var pointer);
        if (error != 0) throw new Denied("acl-unreadable", path);
        try
        {
            uint length = GetSecurityDescriptorLength(pointer);
            if (length is < 20 or > 65536) throw new Denied("descriptor-bound", path);
            var bytes = new byte[length]; Marshal.Copy(pointer, bytes, 0, bytes.Length); return bytes;
        }
        finally { LocalFree(pointer); }
    }
    private static string Canonical(string path)
    {
        if (!Path.IsPathFullyQualified(path) || !System.Text.RegularExpressions.Regex.IsMatch(path, @"^[A-Za-z]:\\") ||
            path.Contains('/') || path[2..].Contains(':') || path.Contains('\0')) throw new Denied("ambiguous-path", path);
        string full = Path.GetFullPath(path);
        if (!string.Equals(full.TrimEnd('\\'), path.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) ||
            (path.Length > 3 && path[3..].TrimEnd('\\').Split('\\').Any(p => p.Length == 0 || p.EndsWith('.') || p.EndsWith(' ') ||
                System.Text.RegularExpressions.Regex.IsMatch(p.Split('.')[0], "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
            )
            throw new Denied("ambiguous-path", path);
        if (new DriveInfo(Path.GetPathRoot(full)!).DriveType != DriveType.Fixed) throw new Denied("nonlocal-root", path);
        return full.Length > 3 ? full.TrimEnd('\\') : full;
    }
    private static SafeFileHandle Open(string path)
    {
        var handle = CreateFile(path, 0x20080, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero); // READ_CONTROL/attributes, share-read, backup/open-reparse
        if (handle.IsInvalid) { handle.Dispose(); throw new Denied("missing-or-unreadable", path); }
        return handle;
    }
    private static Information Identity(SafeFileHandle handle, string path)
    {
        if (!GetFileInformationByHandle(handle, out var info)) throw new Denied("identity-unverified", path);
        if ((info.Attributes & 0x400) != 0) throw new Denied("reparse-point", path);
        if ((info.Attributes & 0x10) == 0 && info.Links != 1) throw new Denied("file-alias", path);
        var name = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandle(handle, name, (uint)name.Capacity, 0);
        if (length == 0 || length >= name.Capacity || !string.Equals(name.ToString(), @"\\?\" + path, StringComparison.OrdinalIgnoreCase))
            throw new Denied("redirected-or-ambiguous-path", path);
        return info;
    }
    internal static Evidence Verify(string root) => Observe(root, null);
    // Deliberate test-only scoped observation; NEVER full installed-root admission.
    internal static Evidence ObserveFixtureSubtree(string root, string fixtureBoundary) => Observe(root, fixtureBoundary);
    private static Evidence Observe(string root, string? boundary)
    {
        var facts = new List<Fact>(); var held = new List<(SafeFileHandle Handle, Information Info, byte[] Bytes, string Path)>();
        try
        {
            try { WindowsBoundary.RequireUnelevated(); }
            catch { throw new Denied("unelevated-interactive-token-required", root); }
            root = Canonical(root); boundary = boundary is null ? null : Canonical(boundary);
            if (boundary is not null && root != boundary && !root.StartsWith(boundary + "\\", StringComparison.OrdinalIgnoreCase))
                throw new Denied("fixture-boundary", root);
            using var identity = WindowsIdentity.GetCurrent();
            if (!DuplicateToken(identity.Token, 2, out var token)) throw new Denied("token-unverified", root);
            using (token)
            {
                void Inspect(string path, string role)
                {
                    path = Canonical(path);
                    var handle = Open(path); held.Add((handle, default, [], path));
                    var info = Identity(handle, path);
                    if (role != "payload-file" && (info.Attributes & 0x10) == 0) throw new Denied("not-directory", path);
                    var bytes = Descriptor(handle, path);
                    uint forbidden = role == "ancestor" ? AncestorMutation : Mutation;
                    var mapping = new Mapping { Read = 0x120089, Write = 0x120116, Execute = 0x1200A0, All = 0x1F01FF };
                    var privileges = new byte[65536]; uint size = (uint)privileges.Length;
                    if (!AccessCheck(bytes, token, 0x02000000, ref mapping, privileges, ref size, out uint granted, out bool allowed) || !allowed)
                        throw new Denied("effective-access-unverified", path);
                    facts.Add(new(path, role, new RawSecurityDescriptor(bytes, 0).Owner!.Value, granted, forbidden,
                        info.Volume, ((ulong)info.IndexHigh << 32) | info.IndexLow, Convert.ToBase64String(bytes)));
                    if ((granted & forbidden) != 0) throw new Denied("effective-token-mutation", path);
                    string? denial = DescriptorDenial(bytes, forbidden);
                    if (denial is not null) throw new Denied(denial, path);
                    held[^1] = (handle, info, bytes, path);
                }
                var ancestors = new List<string>();
                for (var parent = Directory.GetParent(root); parent is not null; parent = parent.Parent)
                {
                    if (boundary is not null && !parent.FullName.StartsWith(boundary + "\\", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(parent.FullName, boundary, StringComparison.OrdinalIgnoreCase)) break;
                    ancestors.Add(parent.FullName);
                    if (ancestors.Count > 64) throw new Denied("ancestor-bound", root);
                }
                ancestors.Reverse(); foreach (string ancestor in ancestors) Inspect(ancestor, "ancestor");
                Inspect(root, "root");
                int files = 0, directories = 0;
                void Walk(string directory)
                {
                    foreach (string child in Directory.EnumerateFileSystemEntries(directory).Order(StringComparer.OrdinalIgnoreCase))
                    {
                        bool isDirectory = (File.GetAttributes(child) & FileAttributes.Directory) != 0;
                        if (isDirectory ? ++directories > 64 : ++files > 64) throw new Denied("content-bound", child);
                        Inspect(child, isDirectory ? "payload-directory" : "payload-file");
                        if (isDirectory) Walk(child);
                    }
                }
                Walk(root);
                foreach (var item in held)
                {
                    using var reopened = Open(item.Path); var current = Identity(reopened, item.Path);
                    if (current.Volume != item.Info.Volume || current.IndexHigh != item.Info.IndexHigh || current.IndexLow != item.Info.IndexLow ||
                        !Descriptor(item.Handle, item.Path).AsSpan().SequenceEqual(item.Bytes) ||
                        !Descriptor(reopened, item.Path).AsSpan().SequenceEqual(item.Bytes)) throw new Denied("changed-observation", item.Path);
                }
            }
            return new(true, boundary is null, null, null, facts);
        }
        catch (Denied error) { return new(false, boundary is null, error.Reason, error.PathName, facts); }
        catch { return new(false, boundary is null, "unverified", root, facts); }
        finally { foreach (var item in held) item.Handle.Dispose(); }
    }
}
