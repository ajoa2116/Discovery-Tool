using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace ApplicationCompanion;

internal static class HttpFixtureDeadlineTests
{
    private const string Body = "{\"fixture\":\"read-only\"}";
    private const string Event = "{\"type\":\"FIXTURE_EVENT\",\"value\":1}";
    internal static int Run() => RunAsync().GetAwaiter().GetResult();
    private static async Task<int> RunAsync()
    {
        int count = 0, cases = 0;
        void Check(bool good) { if (!good) throw new IOException(); count++; }
        void Deny(Action action) { bool denied = false; try { action(); } catch (HttpFixtureDeadlineException) { denied = true; } Check(denied); }
        using var cancellation = new CancellationTokenSource();
        double clock = 0; var deadline = new HttpFixtureDeadline(() => clock); deadline.Check();
        clock = 1799; deadline.Check(); await Task.Yield(); clock = 1800;
        Check(!cancellation.IsCancellationRequested); Deny(deadline.Check);
        foreach (double invalid in new[] { -1, double.NaN, double.PositiveInfinity })
            Deny(new HttpFixtureDeadline(() => invalid).Check);
        clock = 20; var backwards = new HttpFixtureDeadline(() => clock); backwards.Check(); clock = 19; Deny(backwards.Check);
        using var key = RSA.Create(2048);
        using var cert = new CertificateRequest("CN=fixture deadline self test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        using var serverCertificate = X509CertificateLoader.LoadPkcs12(cert.Export(X509ContentType.Pfx), null);
        string pin = Convert.ToHexString(SHA256.HashData(cert.RawData)).ToLowerInvariant();
        Check(HttpFixtureProof.VerifyLive(cert, pin, () => {}));
        Check(!HttpFixtureProof.VerifyLive(cert, new string('0', 64), () => {}));
        foreach (int expireAtCheck in new[] { 1, 2 })
        {
            double elapsed = 0; int checks = 0; var certificateDeadline = new HttpFixtureDeadline(() => elapsed);
            Check(!HttpFixtureProof.VerifyLive(cert, pin, () => { if (++checks == expireAtCheck) elapsed = 1800; certificateDeadline.Check(); }));
        }
        foreach (string scenario in new[] { "http-response", "http-body", "ws-upgrade", "ws-event" })
        {
            // Identical valid wire data must succeed before expiry and fail specifically because
            // of elapsed time at/after expiry. No scheduled cancellation callbacks run.
            foreach (double elapsed in new[] { 1799d, 1800d, 1801d }) await Case(scenario, elapsed, false);
            await Case(scenario, 0, true);
        }
        Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "HTTP_FIXTURE_DEADLINE_TEST_OK", checks = count, cases }));
        return 0;

        async Task Case(string scenario, double atCompletion, bool revoke)
        {
            var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var receiving = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var observed = new HashSet<HttpFixtureCheckpoint>();
            double elapsed = 0; bool sent = false;
            using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(1);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            using var watchdog = new CancellationTokenSource(5000);
            string operation = scenario.StartsWith("http", StringComparison.Ordinal) ? "read" : "events";
            async Task Serve()
            {
                using var client = await listener.AcceptTcpClientAsync(watchdog.Token);
                using var stream = new SslStream(client.GetStream());
                await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = serverCertificate }, watchdog.Token);
                var header = new StringBuilder(); var one = new byte[1];
                while (!header.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal))
                {
                    if (header.Length >= 4096 || await stream.ReadAsync(one, watchdog.Token) != 1) throw new IOException();
                    header.Append((char)one[0]);
                }
                async Task Write(string value) => await stream.WriteAsync(Encoding.ASCII.GetBytes(value), watchdog.Token);
                if (operation == "read")
                {
                    string response = "HTTP/1.1 200 OK\r\nContent-Length: " + Body.Length + "\r\nConnection: close\r\n\r\n";
                    if (scenario == "http-body") await Write(response + Body[..1]);
                    ready.TrySetResult(); await release.Task.WaitAsync(watchdog.Token);
                    await Write(scenario == "http-body" ? Body[1..] : response + Body);
                }
                else
                {
                    string wsKey = header.ToString().Split("\r\n").Single(line => line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
                    string accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                    string response = "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n";
                    if (scenario == "ws-event")
                    {
                        await Write(response);
                        // This checkpoint is after successful connect and its liveness check.
                        await receiving.Task.WaitAsync(watchdog.Token);
                    }
                    ready.TrySetResult(); await release.Task.WaitAsync(watchdog.Token);
                    var payload = Encoding.UTF8.GetBytes(Event);
                    var frame = new byte[payload.Length + 2]; frame[0] = 0x81; frame[1] = (byte)payload.Length;
                    payload.CopyTo(frame, 2);
                    if (scenario == "ws-upgrade")
                    {
                        byte[] handshake = Encoding.ASCII.GetBytes(response);
                        byte[] complete = new byte[handshake.Length + frame.Length];
                        handshake.CopyTo(complete, 0); frame.CopyTo(complete, handshake.Length);
                        await stream.WriteAsync(complete, watchdog.Token);
                    }
                    else await stream.WriteAsync(frame, watchdog.Token);
                }
                sent = true;
                // Keep TLS open until the probe has completed: peer closure cannot masquerade
                // as deadline rejection, and the WS data is a complete valid text event.
                await finished.Task.WaitAsync(watchdog.Token);
            }
            var serving = Serve();
            CancellationTokenSource? timer = null;
            using var proof = new HttpFixtureProof(() => Volatile.Read(ref elapsed), source => timer = source, stage => {
                observed.Add(stage); if (stage == HttpFixtureCheckpoint.WsReceiving) receiving.TrySetResult();
            });
            var probing = proof.Probe(JsonSerializer.SerializeToElement(new { port, pin, operation }), () => "session_" + new string('a', 43), () => {});
            Exception? failure = null, serverFailure = null;
            bool cancelled = false;
            try
            {
                await ready.Task.WaitAsync(watchdog.Token);
                Check(!probing.IsCompleted);
                if (revoke) proof.Dispose(); else Volatile.Write(ref elapsed, atCompletion);
                release.TrySetResult();
                try { await probing.WaitAsync(watchdog.Token); } catch (Exception error) { failure = error; }
                cancelled = timer is not null && timer.IsCancellationRequested;
            }
            finally { release.TrySetResult(); finished.TrySetResult(); proof.Dispose(); }
            try { await serving; } catch (Exception error) { serverFailure = error; }
            if (revoke)
            {
                Check(failure is not null && failure is not HttpFixtureDeadlineException);
                Check(cancelled);
            }
            else
            {
                Check(serverFailure is null); Check(sent); Check(timer is not null && !cancelled);
                var completed = scenario == "ws-event" ? HttpFixtureCheckpoint.WsReceived :
                    scenario == "ws-upgrade" ? HttpFixtureCheckpoint.WsConnected : HttpFixtureCheckpoint.HttpResponse;
                Check(observed.Contains(completed));
                Check(atCompletion < 1800 ? failure is null : failure is HttpFixtureDeadlineException);
            }
            cases++;
        }
    }
}
