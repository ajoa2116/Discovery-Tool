using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ApplicationCompanion;

internal static class Program
{
    internal static readonly string[] Modes = ["normal", "exit", "disconnect", "timeout", "wrong-peer", "assignment-failure",
        "bad-nonce", "bad-generation", "bad-navigation-id", "extra-field", "malformed-message", "oversized-message", "replay",
        "challenge-timeout", "late-response", "early-message", "unapproved-navigation", "redirect", "same-url-redirect",
        "popup", "frame", "post-ready-navigation", "reload", "fragment", "renderer-loss", "delivery-wrong-ack",
        "delivery-duplicate-ack", "delivery-timeout", "delivery-navigation", "delivery-stale-generation", "delivery-exit", "delivery-partial-done", "delivery-replay", "activation-navigation", "redeemed-navigation", "session-wrong-ack", "session-late-ack", "session-wrong-expiry", "session-lost-activation", "session-duplicate-ack", "session-timeout", "session-navigation", "session-stale-generation", "session-exit", "session-partial-done", "session-lost-done", "session-replay", "session-activation-loss", "session-active-navigation", "session-renderer-loss", "session-channel-loss", "session-heartbeat-stall"];
    internal static readonly string[] FailureCodes = ["READINESS_TIMEOUT", "CHANNEL_LOST", "POPUP_REJECTED", "FRAME_REJECTED",
        "RESOURCE_REJECTED", "RENDERER_LOST", "NAVIGATION_REJECTED", "MESSAGE_REJECTED", "RUNTIME_UNAVAILABLE", "BOOTSTRAP_REJECTED", "SESSION_REJECTED", "SESSION_EXPIRED", "JOB_PROCESS_EXITED", "JOB_QUERY_FAILED", "JOB_ATTACH_DENIED", "JOB_ATTACH_FAILED", "JOB_BROWSER_MISSING"];
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            WindowsBoundary.RequireUnelevated();
            if (args.SequenceEqual(new[] { "--http-fixture-identity" })) { HttpFixtureProof.Identity(); return 0; }
            if (args.SequenceEqual(new[] { "--http-fixture-deadline-self-test" })) return HttpFixtureDeadlineTests.Run();
            if (args.SequenceEqual(new[] { "--document-self-test" })) return DocumentTests.Run();
            if (args.SequenceEqual(new[] { "--session-self-test" })) return SessionTests.Run();
            if (args.SequenceEqual(new[] { "--bootstrap-self-test" })) return BootstrapTests.Run();
            if (args.SequenceEqual(new[] { "--self-test" }))
            {
                var name = WindowsBoundary.NewPipeName(); using var pipe = WindowsBoundary.CreatePipe(name);
                var descriptor = WindowsBoundary.Descriptor(pipe);
                if (!descriptor.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected) || descriptor.DiscretionaryAcl!.Count != 1 ||
                    ((CommonAce)descriptor.DiscretionaryAcl[0]).SecurityIdentifier.Value != WindowsBoundary.LogonSid) throw new IOException();
                bool rejected = false; try { using var duplicate = WindowsBoundary.CreatePipe(name); } catch (IOException) { rejected = true; }
                if (!rejected) throw new IOException();
                Console.WriteLine("{\"v\":1,\"type\":\"SELF_TEST_OK\"}"); return 0;
            }
            if (args.Length == 2 && args[0] == "--broker" && Modes.Contains(args[1])) { Broker(args[1]).GetAwaiter().GetResult(); return 0; }
            if (args.Length == 4 && args[0] == "--fixture" && WindowsBoundary.ValidPipeName(args[1]) && int.TryParse(args[2], out int pid) && Modes.Contains(args[3]))
            { ApplicationConfiguration.Initialize(); Application.Run(new FixtureWindow(args[1], pid, args[3])); return 0; }
            return 2;
        }
        catch { return 3; }
    }
    static async Task Broker(string mode)
    {
        var parent = new Wire(Console.OpenStandardInput(), Console.OpenStandardOutput());
        Wire.Shape(await parent.Read(5000), "START");
        string name = WindowsBoundary.NewPipeName(); using var pipe = WindowsBoundary.CreatePipe(name);
        using var child = OwnedChild.Start(name, mode);
        var command = parent.Read(int.MaxValue);
        using var startup = new CancellationTokenSource(5000);
        var connected = pipe.WaitForConnectionAsync(startup.Token);
        if (await Task.WhenAny(connected, command) == command) { startup.Cancel(); try { await connected; } catch { } Wire.Shape(await command, "STOP"); return; }
        await connected; child.Verify(pipe);
        if (mode == "wrong-peer") WindowsBoundary.VerifyPeer(pipe, Environment.ProcessId, true);
        var channel = new Wire(pipe, pipe);
        var readiness = await ReadChild(channel, command, child, parent, pipe, mode == "timeout" ? 5000 : 15000);
        Wire.Shape(readiness, "READY", "generation"); int generation = readiness.GetProperty("generation").GetInt32();
        if (generation < 1) throw new IOException();
        await parent.Send(new { v = 1, type = "READY", pid = child.Process.Id, generation });
        bool offered = false, delivered = false, activated = false, redeemed = false;
        var session = new SessionRelay(generation);
        string id = "", nonce = "", digest = ""; long expiresAt = 0;
        while (true)
        {
            var pulse = channel.Read(3000);
            await Task.WhenAny(pulse, command);
            if (!command.IsCompleted)
            {
                var value = await pulse; child.Verify(pipe); await RejectFailure(parent, channel, value);
                Pulse(value, generation); await channel.Send(new { v = 1, type = "ACK" }); await parent.Send(new { v = 1, type = "ALIVE" }); continue;
            }
            var request = await command; string type = Wire.Text(request, "type");
            if (type == "STOP")
            {
                Wire.Shape(request, "STOP");
                try
                {
                    var lastPulse = await pulse; child.Verify(pipe); Pulse(lastPulse, generation);
                    await channel.Send(new { v = 1, type = "CLOSE" });
                    await child.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(1));
                }
                catch { /* Job disposal is the bounded fallback. */ }
                return;
            }
            command = parent.Read(int.MaxValue); // Exactly one reader on each channel.
            if (type.StartsWith("SESSION_", StringComparison.Ordinal))
            {
                if (!redeemed) throw new IOException();
                var next = await Await(pulse, command, pipe); child.Verify(pipe); await RejectFailure(parent, channel, next); Pulse(next, generation);
                await session.Handle(request, channel, parent, () => ReadChild(channel, command, child, parent, pipe, type == "SESSION_PROBE" ? 4000 : 2000));
                if (mode == "session-heartbeat-stall" && type == "SESSION_ACTIVATE") await Task.Delay(10000);
                continue;
            }
            if (type == "OFFER")
            {
                Wire.Shape(request, "OFFER", "token", "id", "nonce", "expiresAt", "generation");
                if (offered) throw new IOException(); offered = true;
                id = Wire.Text(request, "id"); nonce = Wire.Text(request, "nonce"); expiresAt = request.GetProperty("expiresAt").GetInt64();
                if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^[a-f0-9-]{36}$") || !System.Text.RegularExpressions.Regex.IsMatch(nonce, "^[a-f0-9]{64}$") ||
                    !System.Text.RegularExpressions.Regex.IsMatch(Wire.Text(request, "token"), "^bootstrap_[A-Za-z0-9_-]{43}$")) throw new IOException();
                digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Wire.Text(request, "token")))).ToLowerInvariant();
            }
            else
            {
                Wire.Shape(request, type, "id", "generation");
                if (!delivered || Wire.Text(request, "id") != id || (type == "ACTIVATE" ? activated : type != "REDEEM" || !activated || redeemed)) throw new IOException();
            }
            Live(request, generation, expiresAt);
            var nextPulse = await Await(pulse, command, pipe); child.Verify(pipe); await RejectFailure(parent, channel, nextPulse); Pulse(nextPulse, generation);
            await channel.Send(request);
            var response = await ReadChild(channel, command, child, parent, pipe, 2000);
            if (type.StartsWith("SESSION_", StringComparison.Ordinal))
            {
                if (!redeemed) throw new IOException();
                var next = await Await(pulse, command, pipe); child.Verify(pipe); await RejectFailure(parent, channel, next); Pulse(next, generation);
                await session.Handle(request, channel, parent, () => ReadChild(channel, command, child, parent, pipe, 2000));
                continue;
            }
            if (type == "OFFER")
            {
                Wire.Shape(response, "ACK", "id", "nonce", "digest", "generation");
                if (Wire.Text(response, "id") != id || Wire.Text(response, "nonce") != nonce || Wire.Text(response, "digest") != digest) throw new IOException();
                Live(response, generation, expiresAt);
                await channel.Send(new { v = 1, type = "COMMIT", nonce, generation });
                var done = await ReadChild(channel, command, child, parent, pipe, 2000); Wire.Shape(done, "DONE", "nonce", "generation");
                if (Wire.Text(done, "nonce") != nonce) throw new IOException(); Live(done, generation, expiresAt); delivered = true;
                await parent.Send(new { v = 1, type = "DELIVERED", id, nonce, digest });
            }
            else if (type == "ACTIVATE")
            {
                Wire.Shape(response, "ACTIVATED", "id", "generation"); if (Wire.Text(response, "id") != id) throw new IOException();
                Live(response, generation, expiresAt); activated = true; await parent.Send(response);
            }
            else
            {
                Wire.Shape(response, "REDEEMED", "id", "generation", "token");
                if (Wire.Text(response, "id") != id || Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Wire.Text(response, "token")))).ToLowerInvariant() != digest) throw new IOException();
                Live(response, generation, expiresAt); redeemed = true; await parent.Send(response);
            }
        }
    }
    static void Pulse(JsonElement value, int generation) { Wire.Shape(value, "PULSE", "generation"); if (value.GetProperty("generation").GetInt32() != generation) throw new IOException(); }
    static void Live(JsonElement value, int generation, long expiry) { if (value.GetProperty("generation").GetInt32() != generation || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expiry) throw new IOException(); }
    static async Task<T> Await<T>(Task<T> value, Task<JsonElement> command, System.IO.Pipes.PipeStream pipe)
    {
        if (await Task.WhenAny(value, command) == command) { pipe.Dispose(); try { await value; } catch { } await command; throw new IOException(); }
        return await value;
    }
    static async Task<JsonElement> ReadChild(Wire channel, Task<JsonElement> command, OwnedChild child, Wire parent, System.IO.Pipes.PipeStream pipe, int timeout)
    {
        // Disposing the broker-owned pipe on failure also unblocks any outstanding read.
        var response = await Await(channel.Read(timeout), command, pipe);
        child.Verify(pipe); await RejectFailure(parent, channel, response); return response;
    }
    static async Task RejectFailure(Wire parent, Wire channel, JsonElement message)
    {
        if (Wire.Text(message, "type") != "FAILED") return;
        Wire.Shape(message, "FAILED", "code"); string code = Wire.Text(message, "code");
        if (!FailureCodes.Contains(code)) throw new IOException();
        await parent.Send(new { v = 1, type = "FAILED", code }); await channel.Send(new { v = 1, type = "FAILURE_ACK" }); throw new IOException();
    }
}
