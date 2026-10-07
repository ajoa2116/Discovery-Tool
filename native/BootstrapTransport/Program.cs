using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using CameraBrowserHost;

internal static class Program
{
    static readonly string[] Modes = ["normal", "malformed", "duplicate", "oversized", "wrong-ack", "replay", "timeout", "disconnect", "wrong-peer"];
    static int Main(string[] args)
    {
        try
        {
            WindowsBoundary.RequireUnelevated();
            if (args.SequenceEqual(new[] { "--self-test" }))
            {
                string name = WindowsBoundary.NewPipeName();
                using var pipe = WindowsBoundary.CreatePipe(name);
                var d = WindowsBoundary.Descriptor(pipe);
                if (!d.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected) || d.DiscretionaryAcl!.Count != 1 ||
                    ((CommonAce)d.DiscretionaryAcl[0]).SecurityIdentifier.Value != WindowsBoundary.LogonSid) throw new IOException();
                // A second first-instance server cannot replace the owned endpoint.
                bool rejected = false;
                try { using var duplicate = WindowsBoundary.CreatePipe(name); } catch (IOException) { rejected = true; }
                if (!rejected) throw new IOException();
                Console.WriteLine("{\"v\":1,\"type\":\"SELF_TEST_OK\"}"); return 0;
            }
            if (args.Length == 2 && args[0] == "--deliver" && Modes.Contains(args[1])) { Deliver(args[1]).GetAwaiter().GetResult(); return 0; }
            if (args.Length == 4 && args[0] == "--stub" && WindowsBoundary.ValidPipeName(args[1]) && int.TryParse(args[2], out var pid) && Modes.Contains(args[3]))
            { Stub(args[1], pid, args[3]).GetAwaiter().GetResult(); return 0; }
            return 2;
        }
        catch { Console.WriteLine("{\"v\":1,\"type\":\"DELIVERY_FAILED\"}"); return 3; }
    }
    static async Task Deliver(string mode)
    {
        var parent = new Wire(Console.OpenStandardInput(), Console.OpenStandardOutput());
        var offer = await parent.Read(1500); Wire.Shape(offer, "OFFER", "token", "id", "nonce");
        string token = Wire.Text(offer, "token"), id = Wire.Text(offer, "id"), nonce = Wire.Text(offer, "nonce");
        if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^bootstrap_[A-Za-z0-9_-]{43}$")) throw new IOException();
        string name = WindowsBoundary.NewPipeName();
        using var pipe = WindowsBoundary.CreatePipe(name);
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { "--stub", name, Environment.ProcessId.ToString(), mode }) start.ArgumentList.Add(arg);
        using var child = Process.Start(start) ?? throw new IOException();
        try
        {
            using var owned = WindowsBoundary.OwnProcessTree(child);
            using var timeout = new CancellationTokenSource(1500);
            await pipe.WaitForConnectionAsync(timeout.Token);
            WindowsBoundary.VerifyPeer(pipe, mode == "wrong-peer" ? Environment.ProcessId : child.Id, true);
            var channel = new Wire(pipe, pipe);
            var hello = await channel.Read(1500); Wire.Shape(hello, "HELLO");
            await channel.Send(offer);
            var ack = await channel.Read(1500); Wire.Shape(ack, "ACK", "id", "nonce", "digest");
            string digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
            if (Wire.Text(ack, "id") != id || Wire.Text(ack, "nonce") != nonce || Wire.Text(ack, "digest") != digest) throw new IOException();
            await channel.Send(new { v = 1, type = "COMMIT", nonce });
            var done = await channel.Read(1500); Wire.Shape(done, "DONE", "nonce");
            if (Wire.Text(done, "nonce") != nonce) throw new IOException();
            await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2));
            if (child.ExitCode != 0) throw new IOException();
            await parent.Send(new { v = 1, type = "DELIVERED", id, nonce, digest });
        }
        finally
        {
            if (!child.HasExited) child.Kill(entireProcessTree: true);
            await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2));
        }
    }
    static async Task Stub(string name, int pid, string mode)
    {
        using var pipe = await WindowsBoundary.Connect(name, pid);
        var wire = new Wire(pipe, pipe);
        await wire.Send(new { v = 1, type = "HELLO" });
        var offer = await wire.Read(1500); Wire.Shape(offer, "OFFER", "token", "id", "nonce");
        if (mode == "disconnect") return;
        if (mode == "timeout") { await Task.Delay(5000); return; }
        string token = Wire.Text(offer, "token"), nonce = Wire.Text(offer, "nonce"), id = Wire.Text(offer, "id");
        if (mode == "oversized")
        {
            await pipe.WriteAsync(Encoding.UTF8.GetBytes(new string('x', Wire.Maximum + 1) + "\n"));
            await pipe.FlushAsync(); return;
        }
        if (mode == "wrong-ack") nonce = "wrong";
        var ack = new { v = 1, type = "ACK", id, nonce, digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant() };
        if (mode is "malformed" or "duplicate")
        {
            var bytes = Encoding.UTF8.GetBytes(mode == "malformed" ? "{broken\n" : "{\"v\":1,\"type\":\"ACK\",\"type\":\"ACK\"}\n");
            await pipe.WriteAsync(bytes); await pipe.FlushAsync(); return;
        }
        await wire.Send(ack);
        if (mode == "replay") await wire.Send(ack);
        var commit = await wire.Read(1500); Wire.Shape(commit, "COMMIT", "nonce");
        if (Wire.Text(commit, "nonce") != nonce) throw new IOException();
        await wire.Send(new { v = 1, type = "DONE", nonce });
        // Stub holds no session authority and exits without persistence.
    }
}
