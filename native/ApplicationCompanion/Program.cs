using System.Security.AccessControl;

namespace ApplicationCompanion;

internal static class Program
{
    internal static readonly string[] Modes = ["normal", "exit", "disconnect", "timeout", "wrong-peer", "assignment-failure",
        "bad-nonce", "bad-generation", "bad-navigation-id", "extra-field", "malformed-message", "oversized-message", "replay",
        "challenge-timeout", "late-response", "early-message", "unapproved-navigation", "redirect", "same-url-redirect",
        "popup", "frame", "post-ready-navigation", "reload", "fragment", "renderer-loss"];
    internal static readonly string[] FailureCodes = ["READINESS_TIMEOUT", "CHANNEL_LOST", "POPUP_REJECTED", "FRAME_REJECTED",
        "RESOURCE_REJECTED", "RENDERER_LOST", "NAVIGATION_REJECTED", "MESSAGE_REJECTED", "RUNTIME_UNAVAILABLE"];
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            WindowsBoundary.RequireUnelevated();
            if (args.SequenceEqual(new[] { "--document-self-test" })) return DocumentTests.Run();
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
            {
                ApplicationConfiguration.Initialize(); Application.Run(new FixtureWindow(args[1], pid, args[3])); return 0;
            }
            return 2;
        }
        catch { return 3; } // No payloads or raw diagnostics.
    }
    static async Task Broker(string mode)
    {
        var parent = new Wire(Console.OpenStandardInput(), Console.OpenStandardOutput());
        var start = await parent.Read(5000); Wire.Shape(start, "START");
        string name = WindowsBoundary.NewPipeName(); using var pipe = WindowsBoundary.CreatePipe(name);
        using var child = OwnedChild.Start(name, mode);
        // Start monitoring parent immediately, including during UI initialization.
        var stop = ReadStop(parent);
        using var startup = new CancellationTokenSource(5000);
        var connected = pipe.WaitForConnectionAsync(startup.Token);
        if (await Task.WhenAny(connected, stop) == stop) { startup.Cancel(); try { await connected; } catch { } await stop; return; }
        await connected; child.Verify(pipe);
        if (mode == "wrong-peer") WindowsBoundary.VerifyPeer(pipe, Environment.ProcessId, true);
        var channel = new Wire(pipe, pipe);
        var ready = channel.Read(mode == "timeout" ? 5000 : 15000);
        if (await Task.WhenAny(ready, stop) == stop) { pipe.Dispose(); try { await ready; } catch { } await stop; return; }
        var readiness = await ready; child.Verify(pipe);
        await RejectFailure(parent, channel, readiness);
        Wire.Shape(readiness, "READY");
        await parent.Send(new { v = 1, type = "READY", pid = child.Process.Id });
        try
        {
            while (true)
            {
                var pulse = channel.Read(3000);
                if (await Task.WhenAny(pulse, stop) == stop) { pipe.Dispose(); try { await pulse; } catch { } await stop; return; }
                var message = await pulse; child.Verify(pipe);
                await RejectFailure(parent, channel, message);
                Wire.Shape(message, "PULSE");
                await channel.Send(new { v = 1, type = "ACK" });
                await parent.Send(new { v = 1, type = "ALIVE" });
            }
        }
        finally { pipe.Dispose(); }
    }
    static async Task ReadStop(Wire parent) { var stop = await parent.Read(int.MaxValue); Wire.Shape(stop, "STOP"); }
    static async Task RejectFailure(Wire parent, Wire channel, System.Text.Json.JsonElement message)
    {
        if (Wire.Text(message, "type") != "FAILED") return;
        Wire.Shape(message, "FAILED", "code"); string code = Wire.Text(message, "code");
        if (!FailureCodes.Contains(code)) throw new IOException();
        await parent.Send(new { v = 1, type = "FAILED", code });
        await channel.Send(new { v = 1, type = "FAILURE_ACK" }); throw new IOException();
    }
}
