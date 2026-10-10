using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;

namespace ApplicationCompanion;

internal sealed class NativeLauncherException(string reason) : IOException("Native launcher unavailable.")
{ internal string Reason { get; } = reason; }

// Native process/channel ownership only. No production authority or Node launcher.
// IDs correlate a future 18C.7Q reservation; supplied metadata never authenticates a peer.
internal sealed class NativeLauncherLease : IDisposable
{
    private static readonly object reservationLock = new();
    private static readonly HashSet<Guid> instances = [], receipts = [];
    internal static readonly string[] Modes = ["normal", "bad-nonce", "bad-instance", "bad-receipt", "replay", "disconnect", "stall", "no-connect"];
    private readonly OwnedChild child;
    private readonly NamedPipeServerStream pipe;
    private readonly CancellationTokenSource ended = new();
    private readonly CancellationTokenSource timeout;
    private readonly CancellationTokenRegistration ownerRegistration, timeoutRegistration;
    private readonly long started;
    private readonly double lifetimeMs;
    private readonly long expiresAt;
    private int terminal;
    internal Guid InstanceId { get; }
    internal Guid ReceiptId { get; }
    internal CancellationToken Ended => ended.Token;
    internal int PeerPid => child.Process.Id; // Diagnostics/tests only, never an authority input.
    internal Task Completion { get; private set; } = Task.CompletedTask;
    internal string? EndReason { get; private set; }
    private NativeLauncherLease(OwnedChild child, NamedPipeServerStream pipe, Guid instance, Guid receipt,
        long expiresAt, CancellationToken owner, long started, double lifetimeMs)
    {
        this.child = child; this.pipe = pipe; InstanceId = instance; ReceiptId = receipt; this.expiresAt = expiresAt;
        this.started = started; this.lifetimeMs = lifetimeMs;
        double remaining = Math.Min(lifetimeMs - Stopwatch.GetElapsedTime(started).TotalMilliseconds,
            expiresAt - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(Math.Max(0, remaining)));
        ownerRegistration = owner.Register(() => Revoke("owner"));
        timeoutRegistration = timeout.Token.Register(() => Revoke("expiry"));
    }
    internal void Check()
    {
        if (Volatile.Read(ref terminal) != 0 || Stopwatch.GetElapsedTime(started).TotalMilliseconds >= lifetimeMs ||
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expiresAt) { Revoke("expiry"); throw Denied("expiry"); }
        try { child.Verify(pipe); } catch { Revoke("peer"); throw Denied("peer"); }
    }
    private static NativeLauncherException Denied(string reason = "invalid") => new(reason);
    internal static async Task<NativeLauncherLease> Start(Guid instance, Guid receipt, long expiresAt,
        CancellationToken owner, string mode = "normal", bool substitutePeer = false)
    {
        WindowsBoundary.RequireUnelevated();
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (instance == Guid.Empty || receipt == Guid.Empty || expiresAt <= now || expiresAt > now + 10000 ||
            owner.IsCancellationRequested || !Modes.Contains(mode)) throw Denied();
        lock (reservationLock)
        {
            if (instances.Contains(instance) || receipts.Contains(receipt)) throw Denied("replay");
            // Bounded, lifetime-long one-use reservations; never recycle a failed identity.
            if (instances.Count >= 32) throw Denied("capacity");
            instances.Add(instance); receipts.Add(receipt);
        }
        string name = WindowsBoundary.NewPipeName();
        var pipe = WindowsBoundary.CreatePipe(name);
        OwnedChild? child = null, substitute = null; NativeLauncherLease? lease = null;
        using var startup = CancellationTokenSource.CreateLinkedTokenSource(owner);
        startup.CancelAfter(TimeSpan.FromMilliseconds(Math.Min(3000, expiresAt - now)));
        long begun = Stopwatch.GetTimestamp();
        void Deadline()
        {
            if (startup.IsCancellationRequested) throw Denied(owner.IsCancellationRequested ? "owner" : "expiry");
            if (Stopwatch.GetElapsedTime(begun).TotalMilliseconds >= 3000 || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expiresAt) throw Denied("expiry");
        }
        try
        {
            child = OwnedChild.StartLauncherPeer(name, substitutePeer ? "no-connect" : mode);
            if (substitutePeer) substitute = OwnedChild.StartLauncherPeer(name, "normal");
            await pipe.WaitForConnectionAsync(startup.Token); Deadline();
            try { child.Verify(pipe); } catch { throw Denied("peer"); }
            var wire = new Wire(pipe, pipe);
            string nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            var read = wire.Read(3000);
            var ready = await read.WaitAsync(startup.Token); Deadline(); child.Verify(pipe); Wire.Shape(ready, "LAUNCHER_READY");
            await wire.Send(new { v = 1, type = "LAUNCHER_CHALLENGE", nonce, instance = instance.ToString(), receipt = receipt.ToString(), expiresAt }).WaitAsync(startup.Token);
            var ack = await wire.Read(3000).WaitAsync(startup.Token); Deadline(); child.Verify(pipe);
            Wire.Shape(ack, "LAUNCHER_ACK", "nonce", "instance", "receipt", "expiresAt");
            if (!CryptographicOperations.FixedTimeEquals(System.Text.Encoding.ASCII.GetBytes(Wire.Text(ack, "nonce", 64)), System.Text.Encoding.ASCII.GetBytes(nonce))) throw Denied("nonce");
            if (Wire.Text(ack, "instance") != instance.ToString() || Wire.Text(ack, "receipt") != receipt.ToString() ||
                ack.GetProperty("expiresAt").GetInt64() != expiresAt) throw Denied("binding");
            Deadline();
            lease = new NativeLauncherLease(child, pipe, instance, receipt, expiresAt, owner, begun, expiresAt - now);
            // Publish revocation and close the pipe on owner loss before any further handshake.
            lease.Check();
            await wire.Send(new { v = 1, type = "LAUNCHER_BOUND" }).WaitAsync(startup.Token);
            Deadline(); lease.Check();
            lease.Completion = lease.Observe(wire);
            return lease;
        }
        catch (Exception failure)
        {
            lease?.Dispose(); if (lease is null) { pipe.Dispose(); child?.Dispose(); }
            throw failure is NativeLauncherException classified ? classified :
                Denied(owner.IsCancellationRequested ? "owner" : startup.IsCancellationRequested ? "expiry" : "transport");
        }
        finally { substitute?.Dispose(); }
    }
    private async Task Observe(Wire wire)
    {
        try
        {
            // This channel carries no further messages. Replay, EOF and expiry revoke.
            await wire.Read(10000); Revoke("replay");
        }
        catch { Revoke("channel"); }
    }
    internal void Revoke(string reason = "disposed")
    {
        if (Interlocked.Exchange(ref terminal, 1) != 0) return;
        EndReason = reason;
        // Terminal before cancellation callbacks or process cleanup can reenter.
        try { ended.Cancel(); } catch (AggregateException) { /* Cleanup must survive observers. */ }
        finally { pipe.Dispose(); child.Dispose(); }
    }
    public void Dispose()
    {
        Revoke(); ownerRegistration.Dispose(); timeoutRegistration.Dispose(); timeout.Dispose();
    }
    internal static async Task Peer(string name, int ownerPid, string mode)
    {
        if (mode == "no-connect") { await Task.Delay(15000); return; }
        using var pipe = await WindowsBoundary.Connect(name, ownerPid); // Kernel server peer + same-image/session verification.
        var wire = new Wire(pipe, pipe);
        await wire.Send(new { v = 1, type = "LAUNCHER_READY" });
        if (mode == "stall") { await Task.Delay(15000); return; }
        var offer = await wire.Read(3000);
        WindowsBoundary.VerifyPeer(pipe, ownerPid, false);
        Wire.Shape(offer, "LAUNCHER_CHALLENGE", "nonce", "instance", "receipt", "expiresAt");
        string nonce = Wire.Text(offer, "nonce", 64), instance = Wire.Text(offer, "instance"), receipt = Wire.Text(offer, "receipt");
        long expiry = offer.GetProperty("expiresAt").GetInt64();
        if (!System.Text.RegularExpressions.Regex.IsMatch(nonce, "^[a-f0-9]{64}$") || !Guid.TryParseExact(instance, "D", out var instanceId) || instanceId == Guid.Empty ||
            !Guid.TryParseExact(receipt, "D", out var receiptId) || receiptId == Guid.Empty || expiry <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() ||
            expiry > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 10000) throw Denied();
        var ack = new { v = 1, type = "LAUNCHER_ACK", nonce = mode == "bad-nonce" ? new string('0', 64) : nonce,
            instance = mode == "bad-instance" ? Guid.NewGuid().ToString() : instance,
            receipt = mode == "bad-receipt" ? Guid.NewGuid().ToString() : receipt, expiresAt = expiry };
        await wire.Send(ack);
        Wire.Shape(await wire.Read(3000), "LAUNCHER_BOUND"); WindowsBoundary.VerifyPeer(pipe, ownerPid, false);
        if (mode == "disconnect") return;
        if (mode == "replay") await wire.Send(ack);
        // EOF/owner loss ends this headless child. No listeners, UI or operations.
        try { await wire.Read(10000); } catch { }
    }
}
