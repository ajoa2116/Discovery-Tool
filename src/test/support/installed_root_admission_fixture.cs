using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using ApplicationCompanion;

// Independent console fixture. No production CLI dispatch or launcher changes.
internal static class InstalledRootFixture
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr attributes, uint creation, uint flags, IntPtr template);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool SetKernelObjectSecurity(SafeFileHandle handle, uint information, byte[] descriptor);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateHardLink(string file, string existing, IntPtr security);
    private static readonly List<object> results = [];
    private sealed class Case : IDisposable
    {
        internal string Boundary, Root, Payload;
        private readonly List<(SafeFileHandle Handle, byte[] Original)> restore = [];
        internal Case(string basePath, string name)
        {
            Boundary = Path.Combine(basePath, name); Root = Path.Combine(Boundary, "application", "v1");
            Payload = Path.Combine(Root, "backend.cjs");
            Directory.CreateDirectory(Path.Combine(Root, "helpers")); File.WriteAllText(Payload, "SYNTHETIC_INERT_BYTES");
            try
            {
                foreach (string path in new[] { Boundary, Path.GetDirectoryName(Root)!, Root, Path.Combine(Root, "helpers"), Payload }) Protect(path);
            }
            catch { Dispose(); throw; }
        }
        internal void Protect(string path)
        {
            bool directory = Directory.Exists(path);
            var original = directory ? new DirectoryInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm() : new FileInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm();
            var handle = CreateFile(path, 0x60000, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
            if (handle.IsInvalid) throw new IOException("Fixture restore handle unavailable.");
            restore.Add((handle, original)); Set(path, ProtectedDescriptor(original));
        }
        internal static byte[] ProtectedDescriptor(byte[] original, string? additional = null, bool suppressOwner = true)
        {
            var sd = new RawSecurityDescriptor(original, 0);
            string sddl = $"O:{sd.Owner!.Value}G:{sd.Group!.Value}D:P" +
                (suppressOwner ? "(D;;0x000D0156;;;OW)" : "") + "(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;WD)" + (additional ?? "");
            var secure = new RawSecurityDescriptor(sddl); var bytes = new byte[secure.BinaryLength]; secure.GetBinaryForm(bytes, 0); return bytes;
        }
        internal void Grant(string path, uint mask, string sid = "WD", bool suppressOwner = true)
        {
            var original = Directory.Exists(path) ? new DirectoryInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm() : new FileInfo(path).GetAccessControl().GetSecurityDescriptorBinaryForm();
            Set(path, ProtectedDescriptor(original, $"(A;;0x{mask:X8};;;{sid})", suppressOwner));
        }
        private void Set(string path, byte[] bytes)
        {
            // Previously acquired WRITE_DAC handles permit deterministic restoration
            // even after OWNER RIGHTS removes the fixture owner's implicit control.
            int index = new[] { Boundary, Path.GetDirectoryName(Root)!, Root, Path.Combine(Root, "helpers"), Payload }.ToList().IndexOf(path);
            if (index < 0 || !SetKernelObjectSecurity(restore[index].Handle, 4, bytes)) throw new IOException("Fixture DACL change unavailable.");
        }
        public void Dispose()
        {
            Exception? failure = null;
            foreach (var item in restore.AsEnumerable().Reverse())
            {
                if (!SetKernelObjectSecurity(item.Handle, 4, item.Original)) failure = new IOException("Fixture DACL restoration failed.");
                item.Handle.Dispose();
            }
            if (failure is not null) throw failure;
        }
    }
    private static void Check(bool condition) { if (!condition) throw new IOException("Installed-root assertion failed."); }
    private static void Capture(string name, InstalledRootAdmission.Evidence evidence, string? denial)
    {
        Check(evidence.Denial == denial); Check(!evidence.ProductionAuthority && !evidence.RaceFree);
        if (!evidence.CompleteAncestry) Check(!evidence.InstalledRootAdmitted);
        results.Add(new { name, evidence });
    }
    public static int Main(string[] args)
    {
        if (args.Length != 1 || !Path.IsPathFullyQualified(args[0]) ||
            !Path.GetFileName(args[0]).StartsWith("discovery-installed-root-", StringComparison.Ordinal) ||
            !File.Exists(Path.Combine(args[0], "fixture-marker"))) return 2;
        string basePath = args[0];
        Directory.CreateDirectory(basePath);
        try
        {
            WindowsBoundary.RequireUnelevated();
            using (var positive = new Case(basePath, "positive"))
            {
                var evidence = InstalledRootAdmission.ObserveFixtureSubtree(positive.Root, positive.Boundary);
                Capture("protected-scoped-positive", evidence, null); Check(evidence.ObservedScopeProtected && evidence.Facts.Count == 5);
                bool writeDenied = false, deleteDenied = false, aclDenied = false;
                try { File.AppendAllText(positive.Payload, "MUTATION"); } catch (UnauthorizedAccessException) { writeDenied = true; }
                try { File.Delete(positive.Payload); } catch (UnauthorizedAccessException) { deleteDenied = true; }
                try
                {
                    var acl = new FileInfo(positive.Payload).GetAccessControl();
                    acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-1-0"), FileSystemRights.WriteData, AccessControlType.Allow));
                    new FileInfo(positive.Payload).SetAccessControl(acl);
                }
                catch (UnauthorizedAccessException) { aclDenied = true; }
                Check(writeDenied && deleteDenied && aclDenied);
                results.Add(new { name = "actual-protected-file-operations-denied", writeDenied, deleteDenied, aclDenied });
                var strict = InstalledRootAdmission.Verify(positive.Root);
                Check(!strict.InstalledRootAdmitted && strict.CompleteAncestry && strict.Denial is not null);
                results.Add(new { name = "strict-full-ancestry-denies-temporary-root", evidence = strict });
                Capture("missing", InstalledRootAdmission.ObserveFixtureSubtree(Path.Combine(positive.Root, "absent"), positive.Boundary), "missing-or-unreadable");
                foreach (string input in new[] { positive.Root + "\\..\\v1", positive.Root + ".", positive.Root + ":stream", @"\\?\" + positive.Root, "C:relative", positive.Root + "/helpers" })
                    Capture("ambiguous-path", InstalledRootAdmission.ObserveFixtureSubtree(input, positive.Boundary), "ambiguous-path");
            }
            foreach (var item in new[] { ("payload-write", 2u, "file"), ("payload-append", 4u, "file"),
                ("payload-delete", 0x10000u, "file"), ("payload-dacl", 0x40000u, "file"), ("payload-owner", 0x80000u, "file"),
                ("root-create", 2u, "root"), ("root-delete-child", 0x40u, "root"), ("ancestor-delete-child", 0x40u, "ancestor"),
                ("ancestor-dacl", 0x40000u, "ancestor"), ("ancestor-delete", 0x10000u, "ancestor"),
                ("ancestor-owner", 0x80000u, "ancestor"), ("ancestor-attributes", 0x100u, "ancestor"),
                ("nested-directory-write", 2u, "nested") })
            {
                using var negative = new Case(basePath, item.Item1);
                string target = item.Item3 switch { "file" => negative.Payload, "root" => negative.Root,
                    "nested" => Path.Combine(negative.Root, "helpers"), _ => negative.Boundary };
                // OWNER RIGHTS deny masks owner grants; grant to a different SID
                // demonstrates conservative other-user evaluation independently.
                negative.Grant(target, item.Item2, "S-1-5-21-100-200-300-9999");
                Capture(item.Item1, InstalledRootAdmission.ObserveFixtureSubtree(negative.Root, negative.Boundary), "ordinary-principal-mutation");
            }
            using (var writable = new Case(basePath, "effective-token"))
            {
                writable.Grant(writable.Payload, 2, suppressOwner: false);
                Capture("effective-current-token-write", InstalledRootAdmission.ObserveFixtureSubtree(writable.Root, writable.Boundary), "effective-token-mutation");
            }
            using (var owner = new Case(basePath, "implicit-owner"))
            {
                owner.Grant(owner.Payload, 0, suppressOwner: false);
                Capture("implicit-owner-dacl-control", InstalledRootAdmission.ObserveFixtureSubtree(owner.Root, owner.Boundary), "effective-token-mutation");
            }
            using (var linked = new Case(basePath, "redirection"))
            {
                string alias = Path.Combine(linked.Root, "alias.cjs");
                // Restore root rights through the retained fixture handle, create alias,
                // then restore protected observation before validating.
                linked.Grant(linked.Root, 2, suppressOwner: false);
                linked.Grant(linked.Payload, 0x100, suppressOwner: false);
                if (!CreateHardLink(alias, linked.Payload, IntPtr.Zero)) throw new IOException("Fixture hardlink creation failed: " + Marshal.GetLastWin32Error());
                linked.Grant(linked.Payload, 0);
                linked.Grant(linked.Root, 0);
                Capture("hardlink-alias", InstalledRootAdmission.ObserveFixtureSubtree(linked.Root, linked.Boundary), "file-alias");
            }
            using (var redirected = new Case(basePath, "junction"))
            {
                Capture("junction-to-private-outside-stage", InstalledRootAdmission.ObserveFixtureSubtree(redirected.Root, redirected.Boundary), "reparse-point");
                Capture("redirected-root", InstalledRootAdmission.ObserveFixtureSubtree(Path.Combine(redirected.Root, "redirect"), redirected.Boundary), "reparse-point");
            }
            // OS AccessCheck exercises deny-only Administrators on the current token;
            // unknown/callback ACEs and null DACLs are never guessed safe.
            var nullDacl = new RawSecurityDescriptor("O:SYG:SYD:NO_ACCESS_CONTROL");
            var nullBytes = new byte[nullDacl.BinaryLength]; nullDacl.GetBinaryForm(nullBytes, 0);
            Check(InstalledRootAdmission.DescriptorDenial(nullBytes, 0xD0156) == "unverified-descriptor");
            results.Add(new { name = "null-dacl-denied" });
            var unsupported = new RawSecurityDescriptor("O:SYG:SYD:P(OA;;FW;00000000-0000-0000-0000-000000000001;;WD)");
            var unsupportedBytes = new byte[unsupported.BinaryLength]; unsupported.GetBinaryForm(unsupportedBytes, 0);
            Check(InstalledRootAdmission.DescriptorDenial(unsupportedBytes, 0xD0156) == "unsupported-ace");
            results.Add(new { name = "unsupported-object-ace-denied" });
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, productionAuthority = false, raceFree = false, results,
                limitations = new[] { "Protected positive scope excludes writable temporary ancestors; no full installation positive is claimed.",
                    "ACL allows to untrusted SIDs are conservatively denied even when another deny could override them.",
                    "Sequential path/ACL observations do not attest mapped code or eliminate races after handle disposal." } }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(JsonSerializer.Serialize(new { passed = false, results })); Console.Error.WriteLine(error); return 1; }
        // The harness owns deletion after all restoration handles have closed.
    }
}
