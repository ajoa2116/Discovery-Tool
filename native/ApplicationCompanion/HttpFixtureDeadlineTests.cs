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
    internal static int Run() => RunAsync().GetAwaiter().GetResult();
    private static async Task<int> RunAsync()
    {
        int count = 0;
        void Check(bool good) { if (!good) throw new IOException(); count++; }
        void Deny(Action action) { bool denied = false; try { action(); } catch { denied = true; } Check(denied); }
        // The cancellation timer has deliberately not fired. Elapsed time alone must reject late work.
        using var cancellation = new CancellationTokenSource();
        foreach (string stage in new[] { "HTTP response", "HTTP body", "WS connect", "WS receive", "completion" })
        {
            double elapsed = 0; var deadline = new HttpFixtureDeadline(() => elapsed); deadline.Check();
            await Task.Yield(); elapsed = 1800;
            Check(!cancellation.IsCancellationRequested); Deny(deadline.Check);
        }
        foreach (double invalid in new[] { -1, double.NaN, double.PositiveInfinity })
            Deny(new HttpFixtureDeadline(() => invalid).Check);
        double clock = 20; var backwards = new HttpFixtureDeadline(() => clock); backwards.Check(); clock = 19; Deny(backwards.Check);
        using var key = RSA.Create(2048);
        using var cert = new CertificateRequest("CN=fixture deadline self test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        string pin = Convert.ToHexString(SHA256.HashData(cert.RawData)).ToLowerInvariant();
        Check(HttpFixtureProof.VerifyLive(cert, pin, () => {}));
        Check(!HttpFixtureProof.VerifyLive(cert, new string('0', 64), () => {}));
        foreach (int expireAtCheck in new[] { 1, 2 })
        {
            double elapsed = 0; int checks = 0; var deadline = new HttpFixtureDeadline(() => elapsed);
            Check(!HttpFixtureProof.VerifyLive(cert, pin, () => { if (++checks == expireAtCheck) elapsed = 1800; deadline.Check(); }));
        }
        foreach (string operation in new[] { "read", "events" })
        {
            // Real loopback TLS with a correct pin and fixed responses; suppress cancellation timer
            // delivery and expire the monotonic clock after receiving the authenticated request.
            double elapsed = 0;
            using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(1);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            using var watchdog = new CancellationTokenSource(5000);
            async Task Serve()
            {
                using var client = await listener.AcceptTcpClientAsync(watchdog.Token);
                using var stream = new SslStream(client.GetStream());
                using var serverCertificate = X509CertificateLoader.LoadPkcs12(cert.Export(X509ContentType.Pfx), null);
                await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = serverCertificate }, watchdog.Token);
                var header = new StringBuilder(); var one = new byte[1];
                while (!header.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal))
                {
                    if (header.Length >= 4096 || await stream.ReadAsync(one, watchdog.Token) != 1) throw new IOException();
                    header.Append((char)one[0]);
                }
                Volatile.Write(ref elapsed, 1800);
                string response;
                if (operation == "read")
                {
                    const string body = "{\"fixture\":\"read-only\"}";
                    response = "HTTP/1.1 200 OK\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n" + body;
                }
                else
                {
                    string wsKey = header.ToString().Split("\r\n").Single(line => line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
                    string accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                    response = "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n";
                }
                await stream.WriteAsync(Encoding.ASCII.GetBytes(response), watchdog.Token);
            }
            var serving = Serve();
            CancellationTokenSource? timer = null;
            using var proof = new HttpFixtureProof(() => Volatile.Read(ref elapsed), source => timer = source);
            bool denied = false;
            try { await proof.Probe(JsonSerializer.SerializeToElement(new { port, pin, operation }), () => "session_" + new string('a', 43), () => {}); }
            catch { denied = true; }
            await serving;
            Check(denied); Check(timer is not null && !timer.IsCancellationRequested);
        }
        Console.WriteLine("{\"v\":1,\"type\":\"HTTP_FIXTURE_DEADLINE_TEST_OK\",\"checks\":" + count + "}");
        return 0;
    }
}
