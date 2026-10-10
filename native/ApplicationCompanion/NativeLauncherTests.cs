using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;

namespace ApplicationCompanion;

internal static class NativeLauncherTests
{
    internal static int Run()
    {
        try { RunAsync().GetAwaiter().GetResult(); return 0; }
        catch { Console.Error.WriteLine("Native launcher self-test failed."); return 1; }
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
    private static async Task RunAsync()
    {
        int checks = 0, cases = 0;
        void Check(bool value) { if (!value) throw new IOException(); checks++; }
        bool Alive(int pid) { try { using var p = Process.GetProcessById(pid); return !p.HasExited; } catch (ArgumentException) { return false; } }
        async Task Deny(string reason, Func<Task<NativeLauncherLease>> create)
        {
            bool denied = false;
            try { using var unexpected = await create(); }
            catch (NativeLauncherException failure) { denied = failure.Reason == reason; }
            Check(denied); cases++;
        }
        using var owner = new CancellationTokenSource();
        Guid instance = Guid.NewGuid(), receipt = Guid.NewGuid();
        // Test the reused real ACL/first-instance primitive.
        string name = WindowsBoundary.NewPipeName();
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
        using (var lease = await Launch())
        {
            int pid = lease.PeerPid; using (var peer = Process.GetProcessById(pid)) peer.Kill();
            await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(lease.EndReason == "channel"); Check(!Alive(pid)); cases++;
        }
        // Deterministic cancellation during pending connect, not an arbitrary transport fault.
        using (var cancelled = new CancellationTokenSource(300))
        { await Deny("owner", () => NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(), cancelled.Token, "no-connect")); }
        await Deny("expiry", () => Launch("stall"));
        using (var lease = await NativeLauncherLease.Start(Guid.NewGuid(), Guid.NewGuid(), Expiry(2000), owner.Token))
        {
            int pid = lease.PeerPid;
            await lease.Completion.WaitAsync(TimeSpan.FromSeconds(4));
            Check(lease.Ended.IsCancellationRequested); Check(lease.EndReason == "expiry"); Check(!Alive(pid)); cases++;
        }
        // Second native owner verifies the kernel job handles close on abrupt owner loss.
        var start = new ProcessStartInfo(Environment.ProcessPath!, "--launcher-owner-loss-test")
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
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
