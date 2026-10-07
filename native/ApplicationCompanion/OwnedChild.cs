using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

// Atomic Job-list creation closes even the broker-crash-before-assignment window.
internal sealed class OwnedChild : IDisposable
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size; public string? Reserved, Desktop, Title;
        public int X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
        public short Show, ReservedSize; public IntPtr ReservedBytes, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr Process, Thread; public int Pid, Tid; }
    [StructLayout(LayoutKind.Sequential)] private struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
        bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref nuint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, nuint attribute, IntPtr value, nuint size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool IsProcessInJob(SafeFileHandle process, SafeFileHandle job, out bool member);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(SafeFileHandle thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(SafeFileHandle process, uint code);
    [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(SafeFileHandle handle, uint milliseconds);
    private readonly SafeFileHandle processHandle;
    private readonly SafeFileHandle job;
    internal Process Process { get; }
    internal bool Alive => WaitForSingleObject(processHandle, 0) == 0x102;
    private OwnedChild(SafeFileHandle handle, SafeFileHandle ownedJob, Process process) { processHandle = handle; job = ownedJob; Process = process; }
    internal static OwnedChild Start(string pipe, string mode)
    {
        if (!WindowsBoundary.ValidPipeName(pipe) || !Program.Modes.Contains(mode)) throw new IOException();
        string image = Environment.ProcessPath!;
        var command = new StringBuilder($"\"{image}\" --fixture {pipe} {Environment.ProcessId} {mode}");
        var ownedJob = WindowsBoundary.CreateOwnedJob();
        SafeFileHandle? handle = null; Process? child = null;
        IntPtr attributes = IntPtr.Zero, jobValue = IntPtr.Zero; bool initialized = false;
        try
        {
            nuint size = 0; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            if (size == 0 || size > 65536) throw new IOException();
            attributes = Marshal.AllocHGlobal((int)size);
            if (!InitializeProcThreadAttributeList(attributes, 1, 0, ref size)) throw new IOException();
            initialized = true; jobValue = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(jobValue, mode == "assignment-failure" ? IntPtr.Zero : ownedJob.DangerousGetHandle());
            if (!UpdateProcThreadAttribute(attributes, 0, 0x2000D /* JOB_LIST */, jobValue, (nuint)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) throw new IOException();
            var startup = new StartupInfoEx { Startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfoEx>() }, Attributes = attributes };
            if (!CreateProcess(image, command, IntPtr.Zero, IntPtr.Zero, false, 0x4 | 0x08000000 | 0x80000 /* SUSPENDED, NO_WINDOW, EXTENDED */,
                IntPtr.Zero, AppContext.BaseDirectory, ref startup, out var info)) throw new IOException();
            handle = new SafeFileHandle(info.Process, true);
            using var thread = new SafeFileHandle(info.Thread, true);
            if (!IsProcessInJob(handle, ownedJob, out bool member) || !member) throw new IOException();
            child = Process.GetProcessById(info.Pid);
            if (ResumeThread(thread) != 1) throw new IOException();
            return new OwnedChild(handle, ownedJob, child);
        }
        catch
        {
            if (handle is not null) { TerminateProcess(handle, 3); WaitForSingleObject(handle, 2000); }
            ownedJob.Dispose(); child?.Dispose(); handle?.Dispose(); throw;
        }
        finally
        {
            if (initialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
            GC.KeepAlive(ownedJob);
        }
    }
    internal void Verify(System.IO.Pipes.PipeStream pipe)
    {
        if (!Alive) throw new IOException();
        WindowsBoundary.VerifyPeer(pipe, Process.Id, true);
        if (!Alive) throw new IOException();
    }
    public void Dispose()
    {
        job.Dispose(); // Kills companion and any descendants, including on broker failure.
        if (WaitForSingleObject(processHandle, 2000) != 0) { TerminateProcess(processHandle, 3); WaitForSingleObject(processHandle, 1000); }
        Process.Dispose(); processHandle.Dispose();
    }
}
