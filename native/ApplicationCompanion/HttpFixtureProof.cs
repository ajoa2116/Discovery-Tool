using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ApplicationCompanion;

// Isolated proof only. No document API, arbitrary destination or production composition.
internal sealed class HttpFixtureProof : IDisposable
{
    private int port;
    private string pin = "";
    private readonly CancellationTokenSource ended = new();
    private readonly Func<double>? elapsed;
    private readonly Action<CancellationTokenSource> scheduleTimeout;
    // Internal deterministic test seam only; never accepted from IPC or caller endpoints.
    internal HttpFixtureProof(Func<double>? elapsed = null, Action<CancellationTokenSource>? scheduleTimeout = null)
    {
        this.elapsed = elapsed;
        this.scheduleTimeout = scheduleTimeout ?? (source => source.CancelAfter(1800));
    }
    internal static void Identity()
    {
        if (!Console.IsOutputRedirected) throw new IOException();
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=CCTV isolated proof", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(20));
        Console.Write(JsonSerializer.Serialize(new { cert = certificate.ExportCertificatePem(), key = key.ExportPkcs8PrivateKeyPem() }));
    }
    internal static bool VerifyLive(X509Certificate? certificate, string expected, Action check)
    {
        try
        {
            check();
            bool verified = certificate is not null && CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(certificate.GetRawCertData()), Convert.FromHexString(expected));
            check(); // Certificate processing must not carry a late handshake across the deadline.
            return verified;
        }
        catch { return false; }
    }
    internal async Task Probe(JsonElement value, Func<string> credential, Action live)
    {
        int destination = value.GetProperty("port").GetInt32(); string expected = Wire.Text(value, "pin");
        string operation = Wire.Text(value, "operation");
        if (destination < 1 || destination > 65535 || !Regex.IsMatch(expected, "^[a-f0-9]{64}$") || operation is not ("read" or "events")) throw new IOException();
        if (port == 0) { port = destination; pin = expected; }
        if (port != destination || pin != expected || ended.IsCancellationRequested) throw new IOException();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ended.Token);
        var deadline = new HttpFixtureDeadline(elapsed);
        scheduleTimeout(timeout);
        void Check() { deadline.Check(); timeout.Token.ThrowIfCancellationRequested(); live(); deadline.Check(); }
        Check();
        if (operation == "read")
        {
            using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, UseCookies = false,
                ServerCertificateCustomValidationCallback = (_, certificate, _, _) => VerifyLive(certificate, pin, Check) };
            using var client = new HttpClient(handler) { MaxResponseContentBufferSize = 256 };
            using var request = new HttpRequestMessage(HttpMethod.Get, $"https://127.0.0.1:{port}/proof");
            request.Headers.Add("Origin", "https://companion-fixture.invalid");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential());
            Check();
            // TLS validation occurs before HttpClient writes any HTTP headers. No redirects/proxies/cookies.
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseContentRead, timeout.Token);
            Check();
            if ((int)response.StatusCode != 200) throw new IOException();
            string content = await response.Content.ReadAsStringAsync(timeout.Token);
            Check();
            if (content != "{\"fixture\":\"read-only\"}") throw new IOException();
        }
        else
        {
            using var socket = new ClientWebSocket();
            using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, UseCookies = false,
                ServerCertificateCustomValidationCallback = (_, certificate, _, _) => VerifyLive(certificate, pin, Check) };
            using var invoker = new HttpMessageInvoker(handler);
            socket.Options.SetRequestHeader("Origin", "https://companion-fixture.invalid");
            socket.Options.SetRequestHeader("Authorization", "Bearer " + credential());
            Check();
            await socket.ConnectAsync(new Uri($"wss://127.0.0.1:{port}/events"), invoker, timeout.Token);
            Check();
            var bytes = new byte[256];
            var result = await socket.ReceiveAsync(new ArraySegment<byte>(bytes), timeout.Token);
            Check();
            if (!result.EndOfMessage || result.MessageType != WebSocketMessageType.Text ||
                Encoding.UTF8.GetString(bytes, 0, result.Count) != "{\"type\":\"FIXTURE_EVENT\",\"value\":1}") throw new IOException();
            socket.Abort();
        }
        Check();
    }
    public void Dispose() { ended.Cancel(); pin = ""; }
}
