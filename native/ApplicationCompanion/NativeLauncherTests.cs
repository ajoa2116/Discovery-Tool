using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Reflection;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

internal static class NativeLauncherTests
{
    internal static int Run(bool diagnostics = false)
    {
        var trace = new NativeSelfTestTrace("launcher", diagnostics);
        try { RunAsync(trace).GetAwaiter().GetResult(); trace.Report(); return 0; }
        catch (Exception error) { trace.Report(error); return 1; }
    }
    internal static async Task OwnerLoss()
    {
        using var owner = new CancellationTokenSource();
        var lease = await NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), owner.Token);
        Console.WriteLine(lease.PeerPid); Console.Out.Flush();
        // Deliberate owner crash; do not dispose. Atomic kill-on-close job must collect peer.
        Environment.Exit(0);
    }
    private static long Expiry(int duration = 10000) => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + duration;
    private static async Task RunAsync(NativeSelfTestTrace trace)
    {
        int checks = 0, cases = 0;
        void Check(bool value, [System.Runtime.CompilerServices.CallerLineNumber] int line = 0) { trace.Check(value, line); checks++; }
        void RecordDenial(string expected, string actual, [System.Runtime.CompilerServices.CallerLineNumber] int line = 0) => trace.Denial(expected, actual, line);
        bool Alive(int pid) { try { using var p = Process.GetProcessById(pid); return !p.HasExited; } catch (ArgumentException) { return false; } }
        async Task Deny(string reason, Func<Task<NativeLauncherLease>> create, [System.Runtime.CompilerServices.CallerLineNumber] int line = 0)
        {
            bool denied = false; string actual = "accepted"; trace.Step("deny", line);
            try { using var unexpected = await create(); }
            catch (NativeLauncherException failure) { actual = failure.Reason; denied = actual == reason; }
            trace.Denial(reason, actual, line); Check(denied, line); cases++;
        }
        // Exercise the real private suspended-creation seam, never arbitrary images or Node.
        const BindingFlags hidden = BindingFlags.Instance | BindingFlags.Static | BindingFlags.NonPublic;
        var startOwned = typeof(OwnedChild).GetMethod("StartOwned", hidden)!;
        var recheck = typeof(OwnedChild).GetMethod("RequirePreResumeOwnership", hidden)!;
        var construct = typeof(OwnedChild).GetConstructors(hidden).Single();
        T Field<T>(OwnedChild owned, string field) => (T)typeof(OwnedChild).GetField(field, hidden)!.GetValue(owned)!;
        uint Wait(SafeFileHandle handle, uint milliseconds) => (uint)typeof(OwnedChild)
            .GetMethod("WaitForSingleObject", hidden)!.Invoke(null, [handle, milliseconds])!;
        foreach (string scenario in new[] { "positive", "disposed", "callback-exception", "exited", "job-query", "job-membership", "closed-job", "invalid-process" })
        {
            OwnedChild? observed = null, launched = null;
            SafeFileHandle? birth = null, originalJob = null, extraJob = null, invalid = null;
            bool retained = false, callbackReached = false;
            string actual = "accepted";
            string expected = scenario switch {
                "positive" => "accepted", "callback-exception" => "callback-denied",
                "exited" => "resume-process-not-live", "job-query" => "resume-job-query",
                "job-membership" => "resume-job-membership", _ => "resume-owner-unavailable"
            };
            try
            {
                Action<OwnedChild> callback = owned => {
                    callbackReached = true; observed = owned;
                    birth = Field<SafeFileHandle>(owned, "processHandle"); originalJob = Field<SafeFileHandle>(owned, "job");
                    // Retain the ORIGINAL SafeHandle, never reopen a PID or duplicate a raw value.
                    birth.DangerousAddRef(ref retained);
                    Check(owned.Alive && Wait(birth, 0) == 0x102);
                    if (scenario == "disposed") owned.Dispose();
                    else if (scenario == "callback-exception") throw new IOException("callback-denied");
                    else if (scenario == "exited") {
                        Check((bool)typeof(OwnedChild).GetMethod("TerminateProcess", hidden)!.Invoke(null, [birth, 3u])!);
                        Check(Wait(birth, 2000) == 0); // A timeout is failure, never exit evidence.
                    }
                    else if (scenario is "job-query" or "job-membership" or "closed-job" or "invalid-process") {
                        // Negative owner objects reuse the exact process SafeHandle reference.
                        // They are never resumed, disposed as owners or returned as launch results.
                        extraJob = WindowsBoundary.CreateOwnedJob();
                        invalid = new SafeFileHandle(IntPtr.Zero, false);
                        if (scenario == "closed-job") extraJob.Dispose();
                        var negative = (OwnedChild)construct.Invoke([
                            scenario == "invalid-process" ? invalid : birth,
                            scenario == "job-query" ? birth : extraJob, owned.Process]);
                        recheck.Invoke(negative, null);
                        throw new IOException("unexpected-recheck-success");
                    }
                };
                string image = Environment.ProcessPath!;
                string pipeName = WindowsBoundary.NewPipeName();
                try {
                    launched = (OwnedChild)startOwned.Invoke(null, [image,
                        new StringBuilder($"\"{image}\" --launcher-peer {pipeName} {Environment.ProcessId} no-connect"),
                        false, IntPtr.Zero, AppContext.BaseDirectory, callback, false, null])!;
                }
                catch (TargetInvocationException error) {
                    Exception cause = error;
                    while (cause is TargetInvocationException wrapped && wrapped.InnerException is not null) cause = wrapped.InnerException;
                    actual = cause is IOException ? cause.Message : cause.GetType().Name;
                }
                RecordDenial(expected, actual);
                Check(callbackReached && actual == expected);
                if (scenario == "positive") Check(ReferenceEquals(launched, observed) && launched!.Alive);
                else Check(launched is null);
            }
            finally
            {
                // Exact child only. Keep its birth reference until signaled exit is observed.
                if (observed is not null && birth is not null) {
                    observed.Dispose();
                    Check(Wait(birth, 2000) == 0);
                    Check(originalJob!.IsClosed);
                }
                extraJob?.Dispose(); invalid?.Dispose();
                if (retained) { birth!.DangerousRelease(); retained = false; }
            }
            Check(birth is { IsClosed: true } && originalJob is { IsClosed: true });
            Check(extraJob is null || extraJob.IsClosed);
            cases++;
        }
        // Closed-handle regression: deliberately NO DangerousAddRef, duplicate or reopened process.
        // Atomic Job membership was checked by StartOwned before this callback. Disposing
        // the kill-on-close Job requests containment; closed handles do NOT prove observed exit.
        {
            OwnedChild? observed = null, launched = null;
            SafeFileHandle? birth = null, originalJob = null;
            bool callbackReached = false;
            string actual = "accepted";
            trace.Step("callback-disposed-without-extra-reference");
            try
            {
                Action<OwnedChild> callback = owned => {
                    observed = owned; callbackReached = true;
                    birth = Field<SafeFileHandle>(owned, "processHandle");
                    originalJob = Field<SafeFileHandle>(owned, "job");
                    Check(owned.Alive && !birth.IsClosed && !originalJob.IsClosed);
                    owned.Dispose();
                    Check(birth.IsClosed && originalJob.IsClosed);
                    // No native wait/termination call is valid through birth after disposal.
                };
                string image = Environment.ProcessPath!;
                string pipeName = WindowsBoundary.NewPipeName();
                try {
                    launched = (OwnedChild)startOwned.Invoke(null, [image,
                        new StringBuilder($"\"{image}\" --launcher-peer {pipeName} {Environment.ProcessId} no-connect"),
                        false, IntPtr.Zero, AppContext.BaseDirectory, callback, false, null])!;
                }
                catch (TargetInvocationException error) {
                    Exception cause = error;
                    while (cause is TargetInvocationException wrapped && wrapped.InnerException is not null) cause = wrapped.InnerException;
                    actual = cause is IOException ? cause.Message : cause.GetType().Name;
                }
                RecordDenial("resume-owner-unavailable", actual);
                Check(callbackReached && actual == "resume-owner-unavailable");
                Check(launched is null);
                Check(birth is { IsClosed: true } && originalJob is { IsClosed: true });
                // Exact exit is deliberately unobserved once the birth handle is closed.
                cases++;
            }
            finally { observed?.Dispose(); } // Existing idempotent disposal; no closed-handle probing.
        }
        using var owner = new CancellationTokenSource();
        Guid instance = Guid.NewGuid(), receipt = Guid.NewGuid();
        // Test the reused real ACL/first-instance primitive.
        string name = WindowsBoundary.NewPipeName();
        trace.Step("acquire-or-wait");
        using (var pipe = WindowsBoundary.CreatePipe(name))
        {
            var descriptor = WindowsBoundary.Descriptor(pipe);
            Check(descriptor.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected));
            Check(descriptor.DiscretionaryAcl!.Count == 1);
            Check(((CommonAce)descriptor.DiscretionaryAcl[0]).SecurityIdentifier.Value == WindowsBoundary.LogonSid);
            bool rejected = false; try { using var duplicate = WindowsBoundary.CreatePipe(name); } catch (IOException) { rejected = true; }
            Check(rejected); cases++;
        }
        // A real connected kernel server is required, even when another same-image
        // native owner has the right session/logon identity and is still alive.
        string ownerPipe = WindowsBoundary.NewPipeName();
        trace.Step("acquire-or-wait");
        using (var server = WindowsBoundary.CreatePipe(ownerPipe))
        using (var foreignOwner = OwnedChild.StartLauncherPeer(WindowsBoundary.NewPipeName(), "no-connect"))
        {
            var connected = server.WaitForConnectionAsync();
            using var client = await WindowsBoundary.Connect(ownerPipe, Environment.ProcessId);
            await connected; WindowsBoundary.VerifyPeer(client, Environment.ProcessId, false); Check(true);
            bool rejected = false;
            try { WindowsBoundary.VerifyPeer(client, foreignOwner.Process.Id, false); }
            catch (IOException failure) { rejected = failure.Message == "PIPE_PEER_REJECTED"; }
            Check(rejected); cases++;
        }
        trace.Step("acquire-or-wait");
        using (var lease = await NativeLauncherLease.Start(instance, receipt, Expiry(), owner.Token))
        {
            lease.Check(); Check(lease.InstanceId == instance && lease.ReceiptId == receipt);
            Check(!lease.Ended.IsCancellationRequested); Check(Alive(lease.PeerPid));
            int pid = lease.PeerPid; lease.Dispose(); await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(!Alive(pid)); cases++;
        }
        await Deny("replay", () => NativeLauncherLease.Start(instance, Guid.NewGuid(), Expiry(), owner.Token));
        await Deny("replay", () => NativeLauncherLease.Start(Guid.NewGuid(), receipt, Expiry(), owner.Token));
        Task<NativeLauncherLease> Launch(string mode = "normal", bool substitute = false) =>
            NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), owner.Token, mode, substitute);
        await Deny("nonce", () => Launch("bad-nonce"));
        await Deny("binding", () => Launch("bad-instance"));
        await Deny("binding", () => Launch("bad-receipt"));
        // Same executable, session and logon SID; still foreign to the exact owned child.
        await Deny("peer", () => Launch(substitute: true));
        await Deny("invalid", () => NativeLauncherLease.Start(instance, receipt, Expiry(-1), owner.Token));
        await Deny("invalid", () => NativeLauncherLease.Start(instance, receipt, Expiry(11000), owner.Token));
        await Deny("invalid", () => NativeLauncherLease.Start(Guid.Empty, receipt, Expiry(), owner.Token));
        await Deny("invalid", () => NativeLauncherLease.Start(instance, receipt, Expiry(), new CancellationToken(true)));
        foreach (var mode in new[] { "replay", "disconnect" })
        {
            using var lease = await Launch(mode);
            int pid = lease.PeerPid;
            trace.Step("acquire-or-wait");
            await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(lease.EndReason == (mode == "replay" ? "replay" : "channel"));
            Check(!Alive(pid)); cases++;
        }
        using (var lifetime = new CancellationTokenSource())
        using (var lease = await NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), lifetime.Token))
        {
            int pid = lease.PeerPid; bool reentrantDenied = false;
            lease.Ended.Register(() => { try { lease.Check(); } catch (NativeLauncherException) { reentrantDenied = true; } });
            lifetime.Cancel(); await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.EndReason == "owner"); Check(reentrantDenied); Check(!Alive(pid)); cases++;
        }
        trace.Step("acquire-or-wait");
        using (var lease = await Launch())
        {
            int pid = lease.PeerPid; using (var peer = Process.GetProcessById(pid)) peer.Kill();
            trace.Step("acquire-or-wait");
            await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(lease.EndReason == "channel"); Check(!Alive(pid)); cases++;
        }
        // Deterministic cancellation during pending connect, not an arbitrary transport fault.
        using (var cancelled = new CancellationTokenSource(300))
        { await Deny("owner", () => NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), cancelled.Token, "no-connect")); }
        await Deny("expiry", () => Launch("stall"));
        trace.Step("acquire-or-wait");
        using (var lease = await NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(2000), owner.Token))
        {
            int pid = lease.PeerPid;
            trace.Step("acquire-or-wait");
            await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(lease.EndReason == "expiry"); Check(!Alive(pid)); cases++;
        }
        // Second native owner verifies the kernel job handles close on abrupt owner loss.
        var start = new ProcessStartInfo(Environment.ProcessPath!, "--launcher-owner-loss-test")
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        trace.Step("acquire-or-wait");
        using (var crashedOwner = Process.Start(start)!)
        {
            string pidLine = await crashedOwner.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)) ?? "";
            Check(int.TryParse(pidLine, out int pid));
            await crashedOwner.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Check(crashedOwner.ExitCode == 0); Check(await crashedOwner.StandardError.ReadToEndAsync() == "");
            long started = Stopwatch.GetTimestamp();
            while (Alive(pid) && Stopwatch.GetElapsedTime(started).TotalMilliseconds < 3000) await Task.Delay(20);
            Check(!Alive(pid)); cases++;
        }
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { v = 1, type = "LAUNCHER_SELF_TEST_OK", cases, checks }));
    }
}
