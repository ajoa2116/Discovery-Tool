using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;

namespace CameraBrowserHost;

internal static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            Console.SetOut(new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true });
            WindowsBoundary.RequireUnelevated();
            if (args.SequenceEqual(new[] { "--capability" }))
            {
                string runtime;
                try { runtime = Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString(); }
                catch { runtime = ""; }
                Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "CAPABILITY", elevated = false, runtime }));
                return 0;
            }
            if (args.SequenceEqual(new[] { "--self-test" })) return NativeTests.Run().GetAwaiter().GetResult();
            if (args.Length is 1 or 2 && args[0] == "--broker" && (args.Length == 1 || args[1] is "--smoke" or "--integration-smoke" or "--runtime-missing")) { Broker(args.Length == 2 ? args[1] : "").GetAwaiter().GetResult(); return 0; }
            if (args.Length is 3 or 4 && args[0] == "--host" && WindowsBoundary.ValidPipeName(args[1]) && int.TryParse(args[2], out int parent) && (args.Length == 3 || args[3] is "--smoke" or "--integration-smoke" or "--runtime-missing"))
            {
                ApplicationConfiguration.Initialize();
                Application.Run(new CameraWindow(args[1], parent, args.Length == 4 ? args[3] : "")); return 0;
            }
            return 2;
        }
        catch (Exception error)
        {
            var code = new[] { "UNELEVATED_REQUIRED", "INTERACTIVE_REQUIRED", "LOGON_SID_UNAVAILABLE", "PIPE_ACL_FAILED", "PIPE_CREATE_FAILED", "ACL_READ_FAILED", "NATIVE_TEST_FAILED" }.Contains(error.Message) ? error.Message : "NATIVE_START_FAILED";
            try { Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "BROKER_FAILED", code })); } catch { } return 3;
        } // No raw exception, IPC payload, URL or token in diagnostics.
    }
    private static async Task Broker(string mode)
    {
        var app = new Wire(Console.OpenStandardInput(), Console.OpenStandardOutput());
        await BrokerWithNames(app, mode);
    }
    private static async Task BrokerWithNames(Wire app, string mode)
    {
        string bootstrapName = WindowsBoundary.NewPipeName(), activeName = WindowsBoundary.NewPipeName();
        using var bootstrap = WindowsBoundary.CreatePipe(bootstrapName);
        using var active = WindowsBoundary.CreatePipe(activeName);
        Process? host = null;
        try
        {
            await app.Send(new { v = 1, type = "BROKER_READY", elevated = false });
            var offer = await app.Read(10_000); Wire.Shape(offer, "OFFER", "sessionId", "deviceId", "token");
            var info = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true };
            info.ArgumentList.Add("--host"); info.ArgumentList.Add(bootstrapName); info.ArgumentList.Add(Environment.ProcessId.ToString());
            if (mode != "") info.ArgumentList.Add(mode);
            host = Process.Start(info) ?? throw new IOException("HOST_UNAVAILABLE");
            using var ownedTree = WindowsBoundary.OwnProcessTree(host);
            using (var timeout = new CancellationTokenSource(10_000)) await bootstrap.WaitForConnectionAsync(timeout.Token);
            WindowsBoundary.VerifyPeer(bootstrap, host.Id, true);
            var boot = new Wire(bootstrap, bootstrap);
            var hello = await boot.Read(); Wire.Shape(hello, "HELLO");
            await boot.Send(new { v = 1, type = "OFFER", sessionId = Wire.Text(offer, "sessionId"), deviceId = Wire.Text(offer, "deviceId"), token = Wire.Text(offer, "token"), activePipe = activeName });
            var redeem = await boot.Read(); Wire.Shape(redeem, "REDEEM", "sessionId", "deviceId", "token");
            await app.Send(redeem);
            var grant = await app.Read(); Wire.Shape(grant, "GRANT", "session", "token");
            await boot.Send(grant); bootstrap.Dispose(); // No reconnect/re-redemption endpoint survives.
            using (var timeout = new CancellationTokenSource(10_000)) await active.WaitForConnectionAsync(timeout.Token);
            WindowsBoundary.VerifyPeer(active, host.Id, true);
            var channel = new Wire(active, active);
            while (true)
            {
                var message = await channel.Read(10_000); Wire.Shape(message, "MESSAGE", "message", "event", "runtime");
                await app.Send(message);
                var ack = await app.Read(); Wire.Shape(ack, "ACK", "session", "state", "command");
                await channel.Send(ack);
                if (Wire.Text(ack, "state") == "CLOSED") break;
            }
            await host.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
        }
        finally
        {
            if (host is not null) { if (!host.HasExited) host.Kill(entireProcessTree: true); host.Dispose(); }
        }
    }
}
