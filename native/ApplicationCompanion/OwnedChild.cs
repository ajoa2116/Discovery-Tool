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
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(SafeFileHandle process, uint flags, StringBuilder image, ref uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern SafeFileHandle OpenProcess(uint access, bool inherit, uint pid);
    private readonly SafeFileHandle processHandle;
    private readonly SafeFileHandle job;
    private int disposed;
    internal Process Process { get; }
    internal bool Alive => Volatile.Read(ref disposed) == 0 && WaitForSingleObject(processHandle, 0) == 0x102;
    private OwnedChild(SafeFileHandle handle, SafeFileHandle ownedJob, Process process) { processHandle = handle; job = ownedJob; Process = process; }
    internal static OwnedChild Start(string pipe, string mode)
    {
        if (!WindowsBoundary.ValidPipeName(pipe) || !Program.Modes.Contains(mode)) throw new IOException();
        string image = Environment.ProcessPath!;
        var command = new StringBuilder($"\"{image}\" --fixture {pipe} {Environment.ProcessId} {mode}");
        return StartOwned(image, command, mode == "assignment-failure");
    }
    // Headless launcher boundary only. Never accepts an arbitrary executable or arguments.
    internal static OwnedChild StartLauncherPeer(string pipe, string mode)
    {
        if (!WindowsBoundary.ValidPipeName(pipe) || !NativeLauncherLease.Modes.Contains(mode)) throw new IOException();
        string image = Environment.ProcessPath!;
        return StartOwned(image, new StringBuilder($"\"{image}\" --launcher-peer {pipe} {Environment.ProcessId} {mode}"), false);
    }
    // Separate fixture-only Node path. Existing same-image peer verification is unchanged.
    internal static OwnedChild StartNodeFixture(string stage, VerifiedBackendArtifacts artifacts, CancellationToken cancellation,
        string mode, Action<int> created)
    {
        if (mode is not ("normal" or "wrong-image" or "job-failure" or "resume-failure" or "cancel-before-resume" or "hold")) throw new IOException("fixture-mode");
        string image = mode == "wrong-image" ? Environment.ProcessPath! : VerifiedNodeFixture.RuntimePath;
        string report = Path.Combine(stage, "node-launch-result.json");
        string[] arguments = [image, "--permission", "--allow-fs-read=" + stage, "--allow-fs-write=" + report,
            "--no-addons", "--no-experimental-strip-types", Path.Combine(stage, "node-launch-driver.cjs"), mode == "hold" ? "hold" : "normal"];
        string Quote(string value)
        {
            if (value.Contains('"') || value.Contains('\0')) throw new IOException("fixture-argument");
            return "\"" + value.TrimEnd('\\') + new string('\\', 2 * (value.Length - value.TrimEnd('\\').Length)) + "\"";
        }
        var command = new StringBuilder(string.Join(" ", arguments.Select(Quote)));
        string environment = "NODE_ENV=production\0SystemRoot=" + Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\0\0";
        IntPtr block = Marshal.StringToHGlobalUni(environment);
        try
        {
            artifacts.Check(); cancellation.ThrowIfCancellationRequested();
            return StartOwned(image, command, mode == "job-failure", block, stage, child =>
            {
                created(child.Process.Id);
                child.VerifyRuntimeIdentity(artifacts); // Still suspended; retained birth handle + measured file identity.
                cancellation.ThrowIfCancellationRequested();
                if (mode == "cancel-before-resume") throw new OperationCanceledException();
                artifacts.Check();
            }, mode == "resume-failure");
        }
        finally { Marshal.FreeHGlobal(block); }
    }
    private static OwnedChild StartOwned(string image, StringBuilder command, bool assignmentFailure,
        IntPtr environment = default, string? directory = null, Action<OwnedChild>? beforeResume = null, bool resumeFailure = false,
        SafeFileHandle? inheritedOwner = null)
    {
        var ownedJob = WindowsBoundary.CreateOwnedJob();
        SafeFileHandle? handle = null; Process? child = null;
        IntPtr attributes = IntPtr.Zero, jobValue = IntPtr.Zero, handleValue = IntPtr.Zero; bool initialized = false;
        try
        {
            int count = inheritedOwner is null ? 1 : 2;
            nuint size = 0; InitializeProcThreadAttributeList(IntPtr.Zero, count, 0, ref size);
            if (size == 0 || size > 65536) throw new IOException();
            attributes = Marshal.AllocHGlobal((int)size);
            if (!InitializeProcThreadAttributeList(attributes, count, 0, ref size)) throw new IOException();
            initialized = true; jobValue = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(jobValue, assignmentFailure ? IntPtr.Zero : ownedJob.DangerousGetHandle());
            if (!UpdateProcThreadAttribute(attributes, 0, 0x2000D /* JOB_LIST */, jobValue, (nuint)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) throw new IOException("job-list:" + Marshal.GetLastWin32Error());
            if (inheritedOwner is not null)
            {
                handleValue = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(handleValue, inheritedOwner.DangerousGetHandle());
                if (!UpdateProcThreadAttribute(attributes, 0, 0x20002 /* HANDLE_LIST */, handleValue, (nuint)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) throw new IOException("handle-list");
            }
            var startup = new StartupInfoEx { Startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfoEx>() }, Attributes = attributes };
            if (!CreateProcess(image, command, IntPtr.Zero, IntPtr.Zero, inheritedOwner is not null, 0x4 | 0x08000000 | 0x80000 | (environment == IntPtr.Zero ? 0u : 0x400u) /* SUSPENDED, NO_WINDOW, EXTENDED, optional UNICODE_ENVIRONMENT */,
                environment, directory ?? AppContext.BaseDirectory, ref startup, out var info)) throw new IOException("create-process:" + Marshal.GetLastWin32Error());
            handle = new SafeFileHandle(info.Process, true);
            using var thread = new SafeFileHandle(info.Thread, true);
            if (!IsProcessInJob(handle, ownedJob, out bool member) || !member) throw new IOException();
            child = Process.GetProcessById(info.Pid);
            var owned = new OwnedChild(handle, ownedJob, child);
            beforeResume?.Invoke(owned);
            using var invalidThread = new SafeFileHandle(IntPtr.Zero, false);
            if (ResumeThread(resumeFailure ? invalidThread : thread) != 1)
                throw new IOException(resumeFailure ? "fixture-resume-failure:" + Marshal.GetLastWin32Error() : "resume-thread:" + Marshal.GetLastWin32Error());
            return owned;
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
            if (handleValue != IntPtr.Zero) Marshal.FreeHGlobal(handleValue);
            GC.KeepAlive(ownedJob);
            GC.KeepAlive(inheritedOwner);
        }
    }
    internal static OwnedChild StartIntegratedFixture(string stage, string pipe, string mode, VerifiedBackendArtifacts artifacts, int? foreignOwnerFixturePid = null)
    {
        if (!WindowsBoundary.ValidPipeName(pipe) || !(NodeBridgeFixture.Modes.Contains(mode) || mode == "no-connect")) throw new IOException("fixture-mode");
        if (foreignOwnerFixturePid.HasValue && mode != "foreign-owner") throw new IOException("fixture-mode");
        using var owner = OpenProcess(0x1000 | 0x100000 /* QUERY_LIMITED_INFORMATION, SYNCHRONIZE only */, true,
            (uint)(foreignOwnerFixturePid ?? Environment.ProcessId));
        if (owner.IsInvalid) throw new IOException("owner-handle");
        string[] args = [VerifiedNodeFixture.RuntimePath, "--permission", "--allow-addons", "--allow-fs-read=" + stage,
            "--allow-fs-write=" + Path.Combine(stage, "node-launch-result.json"), "--no-experimental-strip-types",
            Path.Combine(stage, "node-launch-driver.cjs"), pipe,
            mode == "wrong-owner" ? "0" : owner.DangerousGetHandle().ToInt64().ToString(), mode];
        if (args.Any(a => a.Contains('"') || a.Contains('\0') || a.EndsWith('\\'))) throw new IOException("fixture-argument");
        var command = new StringBuilder(string.Join(" ", args.Select(a => "\"" + a + "\"")));
        IntPtr environment = Marshal.StringToHGlobalUni("NODE_ENV=production\0SystemRoot=" + Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\0\0");
        try
        {
            artifacts.ClaimNodeFixture();
            return StartOwned(VerifiedNodeFixture.RuntimePath, command, false, environment, stage,
                child => child.VerifyRuntimeIdentity(artifacts), inheritedOwner: owner);
        }
        finally { Marshal.FreeHGlobal(environment); }
    }
    internal void VerifyNodePipe(System.IO.Pipes.PipeStream pipe, VerifiedBackendArtifacts artifacts)
    {
        void Identity() {
            if (!Alive) throw new BackendArtifactException("runtime-instance");
            var image = new StringBuilder(32768); uint size = (uint)image.Capacity;
            if (!QueryFullProcessImageName(processHandle, 0, image, ref size)) throw new BackendArtifactException("runtime-instance");
            artifacts.MatchNodeFixtureImage(image.ToString());
            if (!Alive) throw new BackendArtifactException("runtime-instance");
        }
        Identity();
        NodeBridgeFixture.VerifyClient(pipe, processHandle, Process.Id);
        Identity();
    }
    internal void Verify(System.IO.Pipes.PipeStream pipe)
    {
        if (!Alive) throw new IOException();
        WindowsBoundary.VerifyPeer(pipe, Process.Id, true);
        if (!Alive) throw new IOException();
    }
    internal void VerifyRuntimeIdentity(VerifiedBackendArtifacts artifacts)
    {
        if (!Alive) throw new BackendArtifactException("runtime-instance");
        var image = new StringBuilder(32768); uint size = (uint)image.Capacity;
        // Ask the kernel through the retained birth-specific process handle, not
        // a PID lookup or a child-supplied image/entrypoint string.
        if (!QueryFullProcessImageName(processHandle, 0, image, ref size)) throw new BackendArtifactException("runtime-instance");
        artifacts.MatchImageFile(image.ToString());
        if (!Alive) throw new BackendArtifactException("runtime-instance");
    }
    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        job.Dispose(); // Kills companion and any descendants, including on broker failure.
        if (WaitForSingleObject(processHandle, 2000) != 0) { TerminateProcess(processHandle, 3); WaitForSingleObject(processHandle, 1000); }
        Process.Dispose(); processHandle.Dispose();
    }
}
