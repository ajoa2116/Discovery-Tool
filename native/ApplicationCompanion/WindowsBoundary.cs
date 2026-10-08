using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

internal static class WindowsBoundary
{
    [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes { public int Length; public IntPtr Descriptor; public int Inherit; }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafePipeHandle CreateNamedPipe(string name, uint openMode, uint pipeMode, uint instances, uint output, uint input, uint timeout, ref SecurityAttributes attributes);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetKernelObjectSecurity(SafePipeHandle handle, uint information, byte[]? descriptor, uint length, out uint needed);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int information, out int value, int length, out int needed);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int information, IntPtr buffer, int length, out int needed);
    [StructLayout(LayoutKind.Sequential)] private struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)] private struct TokenGroups { public uint Count; public SidAndAttributes First; }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { public long ProcessTime, JobTime; public uint Flags; public nuint Minimum, Maximum; public uint Active; public nuint Affinity; public uint Priority, Scheduling; }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct JobLimits { public BasicLimits Basic; public IoCounters Io; public nuint ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll")] private static extern bool SetInformationJobObject(SafeFileHandle job, int information, ref JobLimits limits, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool IsProcessInJob(IntPtr process, SafeFileHandle job, out bool member);
    public static void AttachOwnedProcess(SafeFileHandle job, Process process)
    {
        if (process.HasExited) throw new IOException("JOB_PROCESS_EXITED");
        if (!IsProcessInJob(process.Handle, job, out bool member)) throw new IOException("JOB_QUERY_FAILED");
        if (!member && !AssignProcessToJobObject(job, process.Handle)) throw new IOException(Marshal.GetLastWin32Error() == 5 ? "JOB_ATTACH_DENIED" : "JOB_ATTACH_FAILED");
    }
    public static SafeFileHandle CreateOwnedJob()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        var limits = new JobLimits { Basic = new BasicLimits { Flags = 0x2000 /* KILL_ON_JOB_CLOSE */ } };
        if (job.IsInvalid || !SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf<JobLimits>()))
        { job.Dispose(); throw new IOException("PROCESS_OWNERSHIP_FAILED"); }
        return job;
    }

    public static string LogonSid
    {
        get
        {
            using var identity = WindowsIdentity.GetCurrent();
            GetTokenInformation(identity.Token, 28 /* TokenLogonSid */, IntPtr.Zero, 0, out int needed);
            if (needed <= 0 || needed > 65536) throw new InvalidOperationException("LOGON_SID_UNAVAILABLE");
            var buffer = Marshal.AllocHGlobal(needed);
            try
            {
                if (!GetTokenInformation(identity.Token, 28, buffer, needed, out _)) throw new InvalidOperationException("LOGON_SID_UNAVAILABLE");
                var groups = Marshal.PtrToStructure<TokenGroups>(buffer);
                if (groups.Count != 1) throw new InvalidOperationException("LOGON_SID_UNAVAILABLE");
                var sid = new SecurityIdentifier(groups.First.Sid).Value;
                if (!sid.StartsWith("S-1-5-5-", StringComparison.Ordinal)) throw new InvalidOperationException("LOGON_SID_UNAVAILABLE");
                return sid;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
    }
    public static void RequireUnelevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!GetTokenInformation(identity.Token, 20 /* TokenElevation */, out int elevated, sizeof(int), out _) || elevated != 0 || Process.GetCurrentProcess().SessionId == 0)
            throw new InvalidOperationException("UNELEVATED_REQUIRED");
        // Reject service/noninteractive tokens even if they happen to be non-elevated.
        if (!identity.Groups!.Any(g => g.Value == "S-1-5-4")) throw new InvalidOperationException("INTERACTIVE_REQUIRED");
        _ = LogonSid;
    }
    public static string NewPipeName() => "cctv-application-" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    public static bool ValidPipeName(string value) => System.Text.RegularExpressions.Regex.IsMatch(value, "^cctv-application-[a-f0-9]{48}$");
    public static NamedPipeServerStream CreatePipe(string name)
    {
        if (!ValidPipeName(name)) throw new InvalidDataException("INVALID_PIPE");
        // Protected DACL: this interactive logon SID only. No Everyone, network or other-user ACE.
        if (!ConvertStringSecurityDescriptorToSecurityDescriptor($"D:P(A;;GA;;;{LogonSid})", 1, out var descriptor, out _)) throw new IOException("PIPE_ACL_FAILED");
        try
        {
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = descriptor, Inherit = 0 };
            var handle = CreateNamedPipe(@"\\.\pipe\" + name, 0x40080003 /* overlapped, first instance, duplex */, 8 /* reject remote clients */, 1, 16384, 16384, 0, ref attributes);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("PIPE_CREATE_FAILED"); }
            return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
        }
        finally { LocalFree(descriptor); }
    }
    public static RawSecurityDescriptor Descriptor(NamedPipeServerStream pipe)
    {
        GetKernelObjectSecurity(pipe.SafePipeHandle, 4, null, 0, out var needed);
        var bytes = new byte[needed];
        if (!GetKernelObjectSecurity(pipe.SafePipeHandle, 4, bytes, needed, out _)) throw new IOException("ACL_READ_FAILED");
        return new RawSecurityDescriptor(bytes, 0);
    }
    public static void VerifyPeer(PipeStream pipe, int expectedPid, bool serverSide)
    {
        uint pid;
        bool ok = serverSide ? GetNamedPipeClientProcessId(pipe.SafePipeHandle, out pid) : GetNamedPipeServerProcessId(pipe.SafePipeHandle, out pid);
        if (!ok || pid != expectedPid) throw new IOException("PIPE_PEER_REJECTED");
        using var peer = Process.GetProcessById(expectedPid);
        if (peer.HasExited || peer.SessionId != Process.GetCurrentProcess().SessionId || !string.Equals(peer.MainModule?.FileName, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase))
            throw new IOException("PIPE_PEER_REJECTED");
    }
    public static async Task<NamedPipeClientStream> Connect(string name, int serverPid)
    {
        if (!ValidPipeName(name)) throw new IOException("INVALID_PIPE");
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        try { using var timeout = new CancellationTokenSource(10_000); await pipe.ConnectAsync(timeout.Token); VerifyPeer(pipe, serverPid, false); return pipe; }
        catch { pipe.Dispose(); throw; }
    }
}
