using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace CameraBrowserHost;

internal static class NativeTests
{
    public static async Task<int> Run()
    {
        var passed = 0;
        void Check(bool value, string label) { if (!value) throw new Exception("NATIVE_TEST_FAILED"); passed++; Console.WriteLine("PASS: " + label); }
        WindowsBoundary.RequireUnelevated(); Check(true, "interactive non-elevated process token");
        var name = WindowsBoundary.NewPipeName();
        using (var server = WindowsBoundary.CreatePipe(name))
        {
            var descriptor = WindowsBoundary.Descriptor(server);
            Check(descriptor.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected), "pipe DACL protected");
            Check(descriptor.DiscretionaryAcl!.Count == 1 && ((CommonAce)descriptor.DiscretionaryAcl[0]).SecurityIdentifier.Value == WindowsBoundary.LogonSid, "only intended logon SID allowed by DACL");
            bool refused = false; try { using var duplicate = WindowsBoundary.CreatePipe(name); } catch { refused = true; }
            Check(refused, "first-instance pipe name cannot be replaced");
            using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
            var waiting = server.WaitForConnectionAsync(); await client.ConnectAsync(1000); await waiting;
            WindowsBoundary.VerifyPeer(server, Environment.ProcessId, true); WindowsBoundary.VerifyPeer(client, Environment.ProcessId, false);
            Check(true, "kernel peer PID/session/image checks accept intended process");
            refused = false; try { WindowsBoundary.VerifyPeer(server, 1, true); } catch { refused = true; }
            Check(refused, "incorrect peer PID rejected before secret transfer");
            using var second = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
            refused = false; try { await second.ConnectAsync(100); } catch { refused = true; }
            Check(refused, "duplicate simultaneous client cannot connect");
            var from = new Wire(client, client); var to = new Wire(server, server);
            await from.Send(new { v = 1, type = "HELLO" }); var frame = await to.Read(); Wire.Shape(frame, "HELLO");
            Check(true, "bounded protocol frame crosses restricted real Windows pipe");
        }
        using (var absent = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous))
        {
            bool refused = false; try { await absent.ConnectAsync(100); } catch { refused = true; } Check(refused, "disposed bootstrap endpoint no longer connects");
        }
        foreach (var invalid in new[] { "{bad}\n", "{\"v\":2,\"type\":\"HELLO\"}\n", new string('x', Wire.Maximum + 1) + "\n" })
        {
            bool refused = false; try { await new Wire(new MemoryStream(Encoding.UTF8.GetBytes(invalid)), Stream.Null).Read(); } catch { refused = true; }
            Check(refused, "malformed/version/oversize frame rejected");
        }
        using (var timeout = WindowsBoundary.CreatePipe(WindowsBoundary.NewPipeName()))
        {
            using var cancel = new CancellationTokenSource(50); bool refused = false;
            try { await timeout.WaitForConnectionAsync(cancel.Token); } catch (OperationCanceledException) { refused = true; }
            Check(refused, "abandoned bootstrap wait is cancellable and bounded");
        }
        var origin = new Uri("http://192.0.2.100:8080");
        Check(NavigationPolicy.Decide(origin, "http://192.0.2.100:8080/camera") == "ALLOW", "same authorized origin navigation allowed");
        Check(NavigationPolicy.Decide(origin, "https://192.0.2.100/camera") == "TRANSITION_BLOCKED", "same-IP scheme change requires new authorization");
        foreach (var uri in new[] { "http://192.0.2.101/", "file:///c:/x", "javascript:alert(1)", "http://user:pass@192.0.2.100:8080" })
            Check(NavigationPolicy.Decide(origin, uri) != "ALLOW", "unrelated or unsafe navigation blocked");
        Console.WriteLine($"Native boundary: {passed} passed, 0 failed"); return 0;
    }
}
