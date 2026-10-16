using System.Reflection;
using System.Reflection.PortableExecutable;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ApplicationCompanion;

namespace ApplicationCompanion.TestFixtures;

// Diagnostic experiment ONLY. LoadLibraryExW accepts a path, not our measured
// handle. No result here supplies admission, release or production authority.
internal static class NativeDllExperiment
{
    internal sealed record Command(string Root, string Primary, string Probe, string Dependency,
        MeasuredInputLifetime.Fact PrimaryFact, MeasuredInputLifetime.Fact ProbeFact, MeasuredInputLifetime.Fact DependencyFact,
        string AllowedProbe, string AllowedDependency, MeasuredInputLifetime.Fact AllowedProbeFact, MeasuredInputLifetime.Fact AllowedDependencyFact);
    internal sealed record FileObservation(uint Volume, ulong FileId, long Length, string Sha256);
    internal sealed record DependencyControl(bool ComparableBytes, bool FreshBeforePositive, string AllowedProbePath,
        string LoadedDependencyPath, string ProbeMappedPath, string DependencyMappedPath, FileObservation ProbeFile,
        FileObservation DependencyFile, bool ImportAddressMatched, bool ImageMappings, string[] NewModules,
        bool AbsentAfterProbeFree, int ExplicitLoads, int SuccessfulFrees, int NegativeAfterUnloadError);
    internal sealed record Report(bool Passed, string? Failure, string ModulePath, string MappedPath,
        FileObservation? PostLoadFile, bool ImageMapping, bool MarkerMatched, bool ReusedSameModule,
        bool RetainedAfterFirstFree, bool AbsentAfterFinalFree, int SearchError, int LoadReferences,
        int FreeCalls, int SuccessfulFrees, int RemainingReferences, string[] NewModules,
        bool AtomicMeasuredHandleBinding = false, bool ProductionAuthority = false, DependencyControl? Control = null);
    private const uint SearchDllLoadDir = 0x100;
    private const BindingFlags Flags = BindingFlags.NonPublic | BindingFlags.Static;
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern uint GetModuleFileNameW(IntPtr module, StringBuilder name, int size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)] private static extern IntPtr GetProcAddress(IntPtr module, string name);
    [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern uint K32GetMappedFileNameW(IntPtr process, IntPtr address, StringBuilder name, int size);
    [DllImport("kernel32.dll")] private static extern bool K32EnumProcessModules(IntPtr process, [Out] IntPtr[] modules, uint bytes, out uint needed);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern uint QueryDosDeviceW(string drive, StringBuilder device, int size);
    [DllImport("kernel32.dll")] private static extern nuint VirtualQuery(IntPtr address, out MemoryInfo info, nuint length);
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryInfo
    {
        internal IntPtr Base, AllocationBase;
        internal uint AllocationProtect;
        internal ushort PartitionId;
        internal nuint RegionSize;
        internal uint State, Protect, Type;
    }
    private static void Require(bool value, string reason) { if (!value) throw new IOException(reason); }
    private static string ModuleName(IntPtr module)
    {
        var b = new StringBuilder(32768); uint n = GetModuleFileNameW(module, b, b.Capacity);
        Require(n > 0 && n < b.Capacity, "module-path-unconfirmed"); return b.ToString();
    }
    private static HashSet<IntPtr> Modules()
    {
        var modules = new IntPtr[1024];
        Require(K32EnumProcessModules(GetCurrentProcess(), modules, (uint)(modules.Length * IntPtr.Size), out uint needed) &&
            needed > 0 && needed <= modules.Length * IntPtr.Size && needed % IntPtr.Size == 0, "module-inventory-unconfirmed");
        // Inventory handles only in this owned child. Resolve paths/identity only
        // for the explicitly selected fixture images, never unrelated modules.
        return modules.Take((int)needed / IntPtr.Size).ToHashSet();
    }
    internal static FileObservation Observe(string path)
    {
        // Reuses existing native identity observations. This NEW path open is
        // post-load namespace corroboration, NOT the loader's section handle.
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var identity = typeof(InstalledRootAdmission).GetMethod("Identity", Flags)!;
        object before = identity.Invoke(null, [stream.SafeFileHandle, path])!;
        uint F(object obj, string name) => (uint)obj.GetType().GetField(name)!.GetValue(obj)!;
        string digest = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
        object after = identity.Invoke(null, [stream.SafeFileHandle, path])!;
        foreach (string name in new[] { "Volume", "IndexHigh", "IndexLow", "SizeHigh", "SizeLow", "Attributes", "Links" })
            Require(F(before, name) == F(after, name), "diagnostic-file-changed");
        return new(F(after, "Volume"), ((ulong)F(after, "IndexHigh") << 32) | F(after, "IndexLow"), stream.Length, digest);
    }
    private static void Match(FileObservation value, MeasuredInputLifetime.Fact expected) =>
        Require(value.Volume == expected.Volume && value.FileId == expected.FileId && value.Length == expected.Length &&
            value.Sha256 == expected.Sha256, "diagnostic-file-identity-mismatch");
    internal static int Inspect(string path, params string[] expectedImports)
    {
        using var stream = File.OpenRead(path); using var pe = new PEReader(stream);
        var h = pe.PEHeaders; var p = h.PEHeader ?? throw new IOException("not-native-pe");
        Require(h.CoffHeader.Machine == Machine.Amd64 && (h.CoffHeader.Characteristics & Characteristics.Dll) != 0 &&
            p.Magic == PEMagic.PE32Plus && p.AddressOfEntryPoint == 0 && h.CorHeader is null &&
            p.ThreadLocalStorageTableDirectory.Size == 0 && p.DelayImportTableDirectory.Size == 0 &&
            p.ResourceTableDirectory.Size == 0, "unreviewed-native-pe-feature");
        var imports = new List<string>(); int importSlot = 0;
        if (p.ImportTableDirectory.Size != 0)
        {
            Require(p.ImportTableDirectory.Size <= 4096, "import-bound");
            var r = pe.GetSectionData(p.ImportTableDirectory.RelativeVirtualAddress).GetReader(0, p.ImportTableDirectory.Size);
            bool terminated = false;
            while (r.RemainingBytes >= 20)
            {
                uint lookup = r.ReadUInt32(), stamp = r.ReadUInt32(), forward = r.ReadUInt32(), name = r.ReadUInt32(), iat = r.ReadUInt32();
                if ((lookup | stamp | forward | name | iat) == 0) { terminated = true; break; }
                Require(name != 0 && imports.Count < 8, "invalid-import");
                Require(iat > 0 && iat <= p.SizeOfImage - IntPtr.Size, "invalid-import-slot");
                importSlot = checked((int)iat);
                var n = pe.GetSectionData(checked((int)name)).GetReader(); var bytes = new List<byte>();
                byte ch; while ((ch = n.ReadByte()) != 0) { Require(bytes.Count < 128 && ch < 128, "import-name-bound"); bytes.Add(ch); }
                imports.Add(Encoding.ASCII.GetString(bytes.ToArray()));
            }
            Require(terminated, "unterminated-imports");
        }
        Require(imports.SequenceEqual(expectedImports), "unexpected-native-dependency");
        return importSlot;
    }
    private static string ImageName(IntPtr module, string expected, string devicePrefix)
    {
        Require(ModuleName(module) == expected, "control-module-path-mismatch");
        var mapped = new StringBuilder(32768); uint count = K32GetMappedFileNameW(GetCurrentProcess(), module, mapped, mapped.Capacity);
        Require(count > 0 && count < mapped.Capacity && mapped.ToString() == devicePrefix + expected[2..], "control-mapped-name-mismatch");
        Require(VirtualQuery(module, out var info, (nuint)Marshal.SizeOf<MemoryInfo>()) == (nuint)Marshal.SizeOf<MemoryInfo>() &&
            info.AllocationBase == module && info.Type == 0x1000000, "control-not-image");
        return mapped.ToString();
    }
    internal static void Write<T>(Stream stream, T value)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(value); Require(bytes.Length is > 0 and <= 32768, "experiment-message-bound");
        stream.Write(BitConverter.GetBytes(bytes.Length)); stream.Write(bytes); stream.Flush();
    }
    internal static T Read<T>(Stream stream)
    {
        using var timeout = new CancellationTokenSource(10000);
        byte[] length = new byte[4]; stream.ReadExactlyAsync(length, timeout.Token).AsTask().GetAwaiter().GetResult();
        int count = BitConverter.ToInt32(length); Require(count is > 0 and <= 32768, "experiment-message-bound");
        byte[] bytes = new byte[count]; stream.ReadExactlyAsync(bytes, timeout.Token).AsTask().GetAwaiter().GetResult();
        return JsonSerializer.Deserialize<T>(bytes) ?? throw new IOException("experiment-message");
    }
    internal static Report Child(Command c)
    {
        int loads = 0, calls = 0, frees = 0; string modulePath = "", mappedPath = "";
        bool image = false, marker = false, reuse = false, retained = false, absent = false;
        int searchError = 0; FileObservation? observed = null; string[] added = [];
        DependencyControl? control = null;
        // On any uncertainty do NOT retry an unload or continue loading. Report,
        // then remain in the owned child until bounded parent shutdown/exact exit.
        try
        {
            Require(Environment.Is64BitProcess && Path.IsPathFullyQualified(c.Root), "experiment-root");
            foreach (string path in new[] { c.Primary, c.Probe, c.Dependency, c.AllowedProbe, c.AllowedDependency })
            {
                Require(Path.IsPathFullyQualified(path) && Path.GetFullPath(path) == path && path.StartsWith(c.Root + "\\", StringComparison.Ordinal), "experiment-containment");
                for (string? part = path; part is not null; part = Path.GetDirectoryName(part))
                    Require((File.GetAttributes(part) & FileAttributes.ReparsePoint) == 0, "experiment-reparse");
            }
            Match(Observe(c.Primary), c.PrimaryFact); Match(Observe(c.Probe), c.ProbeFact); Match(Observe(c.Dependency), c.DependencyFact);
            Match(Observe(c.AllowedProbe), c.AllowedProbeFact); Match(Observe(c.AllowedDependency), c.AllowedDependencyFact);
            Inspect(c.Primary); Inspect(c.Dependency); Inspect(c.Probe, Path.GetFileName(c.Dependency));
            Inspect(c.AllowedDependency); int importSlot = Inspect(c.AllowedProbe, Path.GetFileName(c.Dependency));
            bool comparable = c.ProbeFact.Sha256 == c.AllowedProbeFact.Sha256 && c.ProbeFact.Length == c.AllowedProbeFact.Length &&
                c.DependencyFact.Sha256 == c.AllowedDependencyFact.Sha256 && c.DependencyFact.Length == c.AllowedDependencyFact.Length &&
                (c.ProbeFact.Volume, c.ProbeFact.FileId) != (c.AllowedProbeFact.Volume, c.AllowedProbeFact.FileId) &&
                (c.DependencyFact.Volume, c.DependencyFact.FileId) != (c.AllowedDependencyFact.Volume, c.AllowedDependencyFact.FileId) &&
                Path.GetFileName(c.AllowedDependency) == Path.GetFileName(c.Dependency);
            Require(comparable, "noncomparable-dependency-controls");
            Require(GetModuleHandleW(c.Primary) == IntPtr.Zero && GetModuleHandleW(c.Probe) == IntPtr.Zero &&
                GetModuleHandleW(c.AllowedProbe) == IntPtr.Zero && GetModuleHandleW(Path.GetFileName(c.Dependency)) == IntPtr.Zero, "experiment-preexisting-module");
            // Make the reviewed excluded dependency AVAILABLE in this child's CWD.
            // The explicit load flags must still exclude it. Never mutate PATH.
            Directory.SetCurrentDirectory(Path.GetDirectoryName(c.Dependency)!);
            _ = ModuleName(IntPtr.Zero); // own fixture apphost; warm bindings without inspecting OS modules
            var warm = new StringBuilder(32768); _ = K32GetMappedFileNameW(GetCurrentProcess(), IntPtr.Zero, warm, warm.Capacity);
            _ = VirtualQuery(IntPtr.Zero, out _, (nuint)Marshal.SizeOf<MemoryInfo>());
            var device = new StringBuilder(32768); Require(QueryDosDeviceW(c.Primary[..2], device, device.Capacity) > 0, "device-path-unconfirmed");
            var baseline = Modules();
            int DeniedSearch()
            {
                IntPtr probe = LoadLibraryExW(c.Probe, IntPtr.Zero, SearchDllLoadDir);
                int error = Marshal.GetLastWin32Error();
                if (probe != IntPtr.Zero) { loads++; throw new IOException("excluded-dependency-unexpectedly-loaded"); }
                Require(error == 126 && GetModuleHandleW(c.Probe) == IntPtr.Zero &&
                    GetModuleHandleW(Path.GetFileName(c.Dependency)) == IntPtr.Zero, "search-restriction-unconfirmed");
                Require(Modules().SetEquals(baseline), "unexpected-search-module");
                return error;
            }
            searchError = DeniedSearch();
            bool fresh = GetModuleHandleW(c.AllowedProbe) == IntPtr.Zero && GetModuleHandleW(Path.GetFileName(c.Dependency)) == IntPtr.Zero;
            Require(fresh, "positive-control-not-fresh");
            IntPtr allowed = LoadLibraryExW(c.AllowedProbe, IntPtr.Zero, SearchDllLoadDir);
            Require(allowed != IntPtr.Zero, "allowed-probe-load-failed:" + Marshal.GetLastWin32Error()); loads++;
            IntPtr dependency = GetModuleHandleW(Path.GetFileName(c.AllowedDependency)); // borrowed: NEVER FreeLibrary this handle
            Require(dependency != IntPtr.Zero && dependency != allowed, "allowed-dependency-missing");
            string probeMapped = ImageName(allowed, c.AllowedProbe, device.ToString());
            string depMapped = ImageName(dependency, c.AllowedDependency, device.ToString());
            var probeFile = Observe(c.AllowedProbe); var depFile = Observe(c.AllowedDependency);
            Match(probeFile, c.AllowedProbeFact); Match(depFile, c.AllowedDependencyFact);
            var allowedModules = Modules(); var expectedModules = baseline.Append(allowed).Append(dependency).ToHashSet();
            Require(allowedModules.SetEquals(expectedModules), "unexpected-allowed-module");
            IntPtr slot = IntPtr.Add(allowed, importSlot);
            Require(VirtualQuery(slot, out var slotInfo, (nuint)Marshal.SizeOf<MemoryInfo>()) == (nuint)Marshal.SizeOf<MemoryInfo>() &&
                slotInfo.AllocationBase == allowed && slotInfo.Type == 0x1000000 &&
                slot.ToInt64() + IntPtr.Size <= slotInfo.Base.ToInt64() + checked((long)slotInfo.RegionSize), "import-slot-unconfirmed");
            IntPtr expectedImport = GetProcAddress(dependency, "fixture_dependency");
            bool importMatched = expectedImport != IntPtr.Zero && Marshal.ReadIntPtr(slot) == expectedImport;
            Require(importMatched, "resolved-import-mismatch"); // no fixture function is called
            calls++; Require(FreeLibrary(allowed), "allowed-probe-free-unconfirmed"); frees++;
            bool controlAbsent = GetModuleHandleW(c.AllowedProbe) == IntPtr.Zero &&
                GetModuleHandleW(Path.GetFileName(c.Dependency)) == IntPtr.Zero && Modules().SetEquals(baseline);
            Require(controlAbsent, "allowed-dependency-unload-unconfirmed");
            int afterUnload = DeniedSearch();
            control = new(comparable, fresh, c.AllowedProbe, c.AllowedDependency, probeMapped, depMapped, probeFile, depFile,
                importMatched, true, [c.AllowedProbe, c.AllowedDependency], controlAbsent, 1, 1, afterUnload);
            IntPtr first = LoadLibraryExW(c.Primary, IntPtr.Zero, SearchDllLoadDir);
            Require(first != IntPtr.Zero, "positive-load-failed:" + Marshal.GetLastWin32Error()); loads++;
            modulePath = ModuleName(first);
            Require(modulePath == c.Primary, "loaded-path-mismatch");
            var mapped = new StringBuilder(32768); uint size = K32GetMappedFileNameW(GetCurrentProcess(), first, mapped, mapped.Capacity);
            Require(size > 0 && size < mapped.Capacity, "mapped-name-unconfirmed"); mappedPath = mapped.ToString();
            Require(mappedPath == device.ToString() + c.Primary[2..], "mapped-name-mismatch");
            image = VirtualQuery(first, out var memory, (nuint)Marshal.SizeOf<MemoryInfo>()) == (nuint)Marshal.SizeOf<MemoryInfo>() &&
                memory.AllocationBase == first && memory.Type == 0x1000000; Require(image, "not-image-mapping");
            IntPtr export = GetProcAddress(first, "fixture_marker");
            Require(export != IntPtr.Zero && VirtualQuery(export, out var exportMemory, (nuint)Marshal.SizeOf<MemoryInfo>()) != 0 &&
                exportMemory.AllocationBase == first, "marker-not-in-image");
            marker = Marshal.ReadInt32(export) == 0x183c7d11; Require(marker, "mapped-marker-mismatch");
            observed = Observe(modulePath); Match(observed, c.PrimaryFact);
            Require(Modules().SetEquals(baseline.Append(first)), "unexpected-loaded-module"); added = [c.Primary];
            IntPtr second = LoadLibraryExW(c.Primary, IntPtr.Zero, SearchDllLoadDir);
            Require(second != IntPtr.Zero, "reuse-load-failed"); loads++; reuse = first == second; Require(reuse, "reuse-different-module");
            calls++; Require(FreeLibrary(second), "first-free-unconfirmed"); frees++;
            retained = GetModuleHandleW(c.Primary) == first; Require(retained, "reuse-reference-not-retained");
            calls++; Require(FreeLibrary(first), "final-free-unconfirmed"); frees++;
            absent = GetModuleHandleW(c.Primary) == IntPtr.Zero && Modules().SetEquals(baseline);
            Require(absent, "module-unload-unconfirmed");
            return new(true, null, modulePath, mappedPath, observed, image, marker, reuse, retained, absent, searchError, loads, calls, frees, loads - frees, added, Control: control);
        }
        catch (Exception error)
        { return new(false, error.ToString(), modulePath, mappedPath, observed, image, marker, reuse, retained, absent, searchError, loads, calls, frees, loads - frees, added, Control: control); }
    }
}
