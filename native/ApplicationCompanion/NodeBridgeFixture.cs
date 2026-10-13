using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Pipes;
using System.Net.Http;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion;

// Strict fixture dispatch only. Never returns a production owner/receipt.
internal static class NodeBridgeFixture
{
    internal static readonly string[] ResourceModes = ["owner-wire-oversized", "owner-wire-zero", "owner-wire-limit", "owner-wire-type", "owner-wire-short", "owner-tls-malformed",
        "node-wire-oversized", "node-wire-zero", "duplicate-load", "cancel-load", "port-wrap", "port-fraction"];
    internal static readonly string[] Modes = ["normal", "wrong-owner", "foreign-owner", "foreign-node", "bad-nonce", "replay", "wrong-pin",
        "object-swap", "bind-replay", "bind-queue-failure", "pipe-loss", "listener-loss", "ws-loss", "cancel", "expiry", "node-exit", "owner-exit", "addon-tamper", .. ResourceModes,
        "composition-normal", "composition-object-swap", "composition-endpoint-swap", "composition-ws-failure", "composition-bind-cancel", "composition-listener-loss", "composition-ws-loss", "composition-pipe-loss", "composition-expiry"];
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(SafeFileHandle process, uint access, out SafeFileHandle token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(SafeFileHandle token, int kind, IntPtr data, int size, out int needed);
    [DllImport("iphlpapi.dll")] private static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int kind, uint reserved);
    [StructLayout(LayoutKind.Sequential)] private struct Group { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)] private struct Groups { public uint Count; public Group First; }
    internal static void VerifyClient(PipeStream pipe, SafeFileHandle birthHandle, int pid)
    {
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out uint actual) || actual != pid) throw new IOException("node-peer");
        using var self = WindowsIdentity.GetCurrent();
        if (!OpenProcessToken(birthHandle, 8, out var token)) throw new IOException("node-token");
        using (token)
        {
            string Logon(SafeFileHandle t)
            {
                GetTokenInformation(t, 28, IntPtr.Zero, 0, out int needed);
                if (needed <= 0 || needed > 65536) throw new IOException("node-token");
                IntPtr memory = Marshal.AllocHGlobal(needed);
                try { if (!GetTokenInformation(t, 28, memory, needed, out _)) throw new IOException("node-token");
                    var groups = Marshal.PtrToStructure<Groups>(memory); if (groups.Count != 1) throw new IOException("node-token");
                    return new SecurityIdentifier(groups.First.Sid).Value; }
                finally { Marshal.FreeHGlobal(memory); }
            }
            if (Logon(token) != WindowsBoundary.LogonSid) throw new IOException("node-logon");
            foreach (int kind in new[] { 12, 20 }) // Session ID and elevation.
            {
                IntPtr value = Marshal.AllocHGlobal(4);
                try { if (!GetTokenInformation(token, kind, value, 4, out _)) throw new IOException("node-token");
                    int expected = kind == 20 ? 0 : Process.GetCurrentProcess().SessionId;
                    if (Marshal.ReadInt32(value) != expected) throw new IOException("node-token"); }
                finally { Marshal.FreeHGlobal(value); }
            }
        }
    }
    private static void Listener(int pid, int port)
    {
        int size = 0; _ = GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 3 /* OWNER_PID_LISTENER */, 0);
        if (size < 4 || size > 4 * 1024 * 1024) throw new IOException("listener-table");
        IntPtr table = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(table, ref size, false, 2, 3, 0) != 0) throw new IOException("listener-table");
            byte[] data = new byte[size]; Marshal.Copy(table, data, 0, size);
            int count = BinaryPrimitives.ReadInt32LittleEndian(data);
            if (count < 0 || 4L + count * 24L > size) throw new IOException("listener-table");
            for (int i = 0; i < count; i++)
            {
                var row = data.AsSpan(4 + i * 24, 24);
                if (BinaryPrimitives.ReadUInt32LittleEndian(row) == 2 && BinaryPrimitives.ReadUInt32LittleEndian(row[4..]) == 0x0100007f &&
                    BinaryPrimitives.ReadUInt16BigEndian(row[8..]) == port && BinaryPrimitives.ReadInt32LittleEndian(row[20..]) == pid) return;
            }
            throw new IOException("listener-owner");
        }
        finally { Marshal.FreeHGlobal(table); }
    }
    private static async Task<byte[]> Read(PipeStream pipe, byte type, CancellationToken token)
    {
        byte[] prefix = new byte[4]; await pipe.ReadExactlyAsync(prefix, token);
        int size = BinaryPrimitives.ReadInt32LittleEndian(prefix);
        if (size < 1 || size > 16384) throw new IOException("frame");
        byte[] frame = new byte[size]; await pipe.ReadExactlyAsync(frame, token);
        if (frame[0] != type) throw new IOException("protocol"); return frame[1..];
    }
    private static async Task Send(PipeStream pipe, byte type, byte[] data, CancellationToken token)
    {
        if (data.Length + 1 > 16384) throw new IOException("frame");
        byte[] frame = new byte[data.Length + 5]; BinaryPrimitives.WriteInt32LittleEndian(frame, data.Length + 1); frame[4] = type;
        try { data.CopyTo(frame, 5); await pipe.WriteAsync(frame, token); await pipe.FlushAsync(token); }
        finally { CryptographicOperations.ZeroMemory(frame); }
    }
    internal static int Run(string stage, string mode)
    {
        var clock = Stopwatch.StartNew();
        var phases = new List<object>();
        void Phase(string name) { if (phases.Count >= 16) throw new IOException("fixture-diagnostic-limit"); phases.Add(new { name, elapsedMs = clock.ElapsedMilliseconds }); }
        try { return RunAsync(Path.GetFullPath(stage), mode, Phase).GetAwaiter().GetResult(); }
        catch (BackendArtifactException e) when (mode == "addon-tamper" && e.Reason == "measurement")
        { Console.WriteLine(JsonSerializer.Serialize(new { passed = true, mode, denied = "measurement", launched = false, productionAuthority = false })); return 0; }
        catch (Exception e) { Console.Error.WriteLine(JsonSerializer.Serialize(new { passed = false, reason = e is BackendArtifactException b ? b.Reason : e.Message, exception = e.GetType().Name, phases })); return 1; }
    }
    private static async Task<int> RunAsync(string stage, string mode, Action<string> phase)
    {
        phase("approval");
        using var signer = RSA.Create(3072); var trust = BackendReleaseTrust.ForIsolatedTests(signer);
        int duration = 10000;
        long expires = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + duration;
        object Row(string file, string role, string root) { string path = Path.Combine(root, file);
            return new { path = file, role, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant(), length = new FileInfo(path).Length }; }
        VerifiedBackendArtifacts Approval(string root, bool node)
        {
            var files = node ? new[] { Row("node.exe", "runtime", Path.GetDirectoryName(VerifiedNodeFixture.RuntimePath)!),
                Row("node-launch-driver.cjs", "entry", root), Row("node-launch-entry.cjs", "dependency", root), Row("node-owner-bridge.node", "dependency", root),
                Row("src/test/support/synthetic_tls_binding.js", "dependency", root), Row("node-launch-review.cjs", "dependency", root),
                Row("src/test/support/backend_tls_binding.js", "dependency", root), Row("src/server/backend_application.js", "dependency", root),
                Row("package.json", "dependency", root) } : new[] { Row(Path.GetFileName(Environment.ProcessPath!), "runtime", root),
                Row("ApplicationCompanion.dll", "entry", root), Row("ApplicationCompanion.deps.json", "dependency", root), Row("ApplicationCompanion.runtimeconfig.json", "dependency", root) };
            byte[] manifest = JsonSerializer.SerializeToUtf8Bytes(new { v = 1, purpose = node ? "isolated-node-launch-fixture" : "isolated-runtime-reservation",
                releaseId = Guid.NewGuid(), expiresAt = expires, files });
            byte[] signature = signer.SignData(manifest, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
            byte[]? original = null; string addon = Path.Combine(root, "node-owner-bridge.node");
            if (node && mode == "addon-tamper") { original = File.ReadAllBytes(addon); File.WriteAllBytes(addon, [.. original, 0]); }
            try { return node ? VerifiedBackendArtifacts.VerifyNodeFixture(root, manifest, signature, trust, default) : VerifiedBackendArtifacts.Verify(root, manifest, signature, trust, default); }
            finally { if (original is not null) File.WriteAllBytes(addon, original); }
        }
        using var ownerApproval = Approval(AppContext.BaseDirectory, false);
        using var approval = Approval(stage, true);
        using var tlsKey = RSA.Create(2048);
        var request = new CertificateRequest("CN=CCTV integrated fixture", tlsKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(20));
        byte[] pin = SHA256.HashData(certificate.RawData);
        byte[] publicCert = Encoding.UTF8.GetBytes(certificate.ExportCertificatePem()), privateKey = Encoding.UTF8.GetBytes(tlsKey.ExportPkcs8PrivateKeyPem());
        byte[] material = new byte[8 + publicCert.Length + privateKey.Length];
        BinaryPrimitives.WriteInt32LittleEndian(material, publicCert.Length); publicCert.CopyTo(material, 4);
        BinaryPrimitives.WriteInt32LittleEndian(material.AsSpan(4 + publicCert.Length), privateKey.Length); privateKey.CopyTo(material, 8 + publicCert.Length);
        string name = WindowsBoundary.NewPipeName(); using var pipe = WindowsBoundary.CreatePipe(name);
        phase("launch");
        using var foreignOwner = mode == "foreign-owner" ? OwnedChild.StartLauncherPeer(WindowsBoundary.NewPipeName(), "no-connect") : null;
        using var child = OwnedChild.StartIntegratedFixture(stage, name, mode == "foreign-node" ? "no-connect" : mode, approval, foreignOwner?.Process.Id);
        using var observed = Process.GetProcessById(child.Process.Id); _ = observed.Handle;
        using var foreignApproval = mode == "foreign-node" ? Approval(stage, true) : null;
        using var foreign = foreignApproval is null ? null : OwnedChild.StartIntegratedFixture(stage, name, "normal", foreignApproval);
        var started = Stopwatch.StartNew(); bool authenticated = false, materialSent = false, bound = false; int port = 0;
        string outcome = "closed";
        using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(Math.Max(1, expires - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())));
        void Live() { deadline.Token.ThrowIfCancellationRequested(); ownerApproval.Check(); approval.Check();
            child.VerifyNodePipe(pipe, approval); }
        try
        {
            using var startup = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token); startup.CancelAfter(3000);
            var connecting = pipe.WaitForConnectionAsync(startup.Token);
            phase("pipe-connect");
            var exited = observed.WaitForExitAsync(startup.Token);
            if (await Task.WhenAny(connecting, exited) == exited && observed.HasExited) throw new IOException("child-before-peer");
            await connecting; Live();
            phase("challenge");
            var hello = await Read(pipe, 1, startup.Token); if (hello.Length != 32) throw new IOException("challenge"); Live();
            byte[] nonce = RandomNumberGenerator.GetBytes(32), session = Guid.NewGuid().ToByteArray();
            try
            {
                byte[] offer = new byte[88]; hello.CopyTo(offer, 0); nonce.CopyTo(offer, 32); session.CopyTo(offer, 64);
                BinaryPrimitives.WriteInt64LittleEndian(offer.AsSpan(80), expires);
                if (mode is "owner-wire-oversized" or "owner-wire-zero") {
                    byte[] prefix = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(prefix, mode == "owner-wire-zero" ? 0u : uint.MaxValue);
                    await pipe.WriteAsync(prefix, startup.Token);
                } else if (mode == "owner-wire-limit") await Send(pipe, 2, new byte[16383], startup.Token);
                else if (mode == "owner-wire-type") await Send(pipe, 99, [], startup.Token);
                else if (mode == "owner-wire-short") await Send(pipe, 2, [], startup.Token);
                else await Send(pipe, 2, offer, startup.Token);
                var ack = await Read(pipe, 3, startup.Token); Live();
                if (ack.Length != 80 || !CryptographicOperations.FixedTimeEquals(ack.AsSpan(0, 32), hello) ||
                    !CryptographicOperations.FixedTimeEquals(ack.AsSpan(32, 32), nonce) || !CryptographicOperations.FixedTimeEquals(ack.AsSpan(64), session)) throw new IOException("challenge");
                authenticated = true;
                phase("tls-transfer");
                if(mode == "owner-tls-malformed") { byte[] invalid = new byte[8]; BinaryPrimitives.WriteUInt32LittleEndian(invalid, uint.MaxValue); await Send(pipe, 4, invalid, startup.Token); }
                else { await Send(pipe, 4, material, startup.Token); materialSent = true; }
                CryptographicOperations.ZeroMemory(material); CryptographicOperations.ZeroMemory(privateKey);
                phase("endpoint");
                var endpoint = await Read(pipe, 5, deadline.Token); Live();
                if (endpoint.Length != 18 || !CryptographicOperations.FixedTimeEquals(endpoint.AsSpan(0, 16), session)) throw new IOException("session");
                port = BinaryPrimitives.ReadUInt16LittleEndian(endpoint.AsSpan(16)); if (port == 0) throw new IOException("endpoint");
                Listener(child.Process.Id, port);
                byte[] expectedPin = mode == "wrong-pin" ? new byte[32] : pin;
                void Check() { deadline.Token.ThrowIfCancellationRequested(); approval.CheckNodeFixtureLifetime();
                    child.VerifyNodePipe(pipe, approval); Listener(child.Process.Id, port); }
                Live(); // Full remeasurement at the endpoint operation boundary.
                phase("endpoint-proof");
                using var handler = new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false, UseCookies = false,
                    ServerCertificateCustomValidationCallback = (_, cert, _, _) => {
                        try { Check(); bool valid = cert is not null && CryptographicOperations.FixedTimeEquals(SHA256.HashData(cert.RawData), expectedPin); Check(); return valid; }
                        catch { return false; } } };
                using var client = new HttpClient(handler) { MaxResponseContentBufferSize = 256, Timeout = TimeSpan.FromMilliseconds(1800) };
                if(mode.StartsWith("composition-",StringComparison.Ordinal)) {
                    client.DefaultRequestHeaders.Host="127.0.0.1:3001";
                    using var deniedApi=await client.GetAsync($"https://127.0.0.1:{port}/api/system/about",deadline.Token);
                    if((int)deniedApi.StatusCode!=401)throw new IOException("production-api");Check();Live();
                    using var deniedEvents=new ClientWebSocket();deniedEvents.Options.SetRequestHeader("Host","127.0.0.1:3001");
                    using var actualInvoker=new HttpMessageInvoker(handler,false);bool denied=false;
                    try {await deniedEvents.ConnectAsync(new Uri($"wss://127.0.0.1:{port}/ws"),actualInvoker,deadline.Token);}
                    catch(WebSocketException){denied=true;}
                    if(!denied)throw new IOException("production-ws");Check();Live();
                } else {
                string body = await client.GetStringAsync($"https://127.0.0.1:{port}/fixture/read", deadline.Token);
                Check(); Live(); if (body != "{\"fixture\":\"synthetic-read-only\"}") throw new IOException("http-proof");
                using var ws = new ClientWebSocket(); using var invoker = new HttpMessageInvoker(handler, false);
                await ws.ConnectAsync(new Uri($"wss://127.0.0.1:{port}/fixture/events"), invoker, deadline.Token);
                byte[] bytes = new byte[256]; var message = await ws.ReceiveAsync(bytes.AsMemory(), deadline.Token); Check(); Live();
                if (!message.EndOfMessage || Encoding.UTF8.GetString(bytes, 0, message.Count) != "{\"fixture\":\"synthetic-event\"}") throw new IOException("ws-proof");
                ws.Abort();
                using var api = await client.GetAsync($"https://127.0.0.1:{port}/api/system/about", deadline.Token);
                if ((int)api.StatusCode != 401) throw new IOException("production-api"); Check();
                using var deniedWs = new ClientWebSocket(); bool upgradeDenied = false;
                try { await deniedWs.ConnectAsync(new Uri($"wss://127.0.0.1:{port}/ws"), invoker, deadline.Token); }
                catch (WebSocketException) { upgradeDenied = true; }
                if (!upgradeDenied) throw new IOException("production-ws"); Check(); Live();
                }
                await Send(pipe, 6, session, deadline.Token); bound = true;
                phase("bound");
            }
            finally { CryptographicOperations.ZeroMemory(nonce); CryptographicOperations.ZeroMemory(hello); }
            if(mode is "pipe-loss" or "composition-pipe-loss") {
                // Scheduling barrier only, after native peer/session/listener/pin verification.
                // A diagnostic file never authenticates a peer or grants authority.
                phase("terminal-ready");
                while(true){
                    Live();bool ready=false;
                    try{using var snapshot=FixtureCompletion.Read(Path.Combine(stage,"node-launch-result.json"));
                        ready=snapshot.RootElement.TryGetProperty("readyForTerminal",out var flag)&&flag.ValueKind==JsonValueKind.True;}
                    catch(IOException){}catch(JsonException){}
                    if(ready)break;
                    await Task.Delay(10,deadline.Token);
                }
            }
            if (mode == "owner-exit")
            { Console.WriteLine(JsonSerializer.Serialize(new { passed = true, mode, bound, pid = child.Process.Id, port, ownerExit = true,controlOnly=true,completionVerified=false,productionAuthority = false })); Console.Out.Flush(); Environment.Exit(0); }
            if (mode is "pipe-loss" or "composition-pipe-loss") pipe.Dispose();
            else if (mode == "cancel") { outcome = "cancelled"; deadline.Cancel(); pipe.Dispose(); child.Dispose(); }
            else { try { phase("terminal-channel"); _ = await Read(pipe, 255, deadline.Token); throw new IOException("replay"); }
                catch (EndOfStreamException) { outcome = "channel-ended"; }
                catch (OperationCanceledException) when (mode is "expiry" or "composition-expiry") { outcome = "expired"; pipe.Dispose(); if(mode=="expiry")child.Dispose(); } }
        }
        catch (Exception e) when (mode is "composition-ws-failure" or "composition-bind-cancel" or "composition-endpoint-swap" && !bound &&
            (e is IOException || e is BackendArtifactException {Reason:"runtime-instance"} || e is HttpRequestException))
        {
            if(mode=="composition-endpoint-swap" && !(e is IOException && e.Message=="listener-owner"))throw new IOException("unexpected-endpoint-denial");
            outcome=mode=="composition-endpoint-swap"?"listener-owner":"composition-denied";pipe.Dispose();
        }
        catch (Exception e) when (ResourceModes.Contains(mode) && !bound &&
            (e is EndOfStreamException || e is BackendArtifactException { Reason: "runtime-instance" } || e is IOException || e is HttpRequestException))
        { outcome="resource-denied"; pipe.Dispose(); }
        catch (Exception e) when (mode is "wrong-owner" or "foreign-owner" or "foreign-node" or "bad-nonce" or "replay" or "wrong-pin" or "bind-queue-failure")
        {
            outcome = mode switch { "foreign-node" when e is IOException && e.Message == "node-peer" => "node-peer",
                "bad-nonce" when e is IOException && e.Message == "challenge" => "challenge",
                "replay" when e is IOException && e.Message == "protocol" => "protocol",
                "wrong-pin" when e is HttpRequestException && authenticated => "pin-denied",
                "bind-queue-failure" when e is EndOfStreamException && authenticated && !bound => "queue-denied",
                "foreign-owner" when !authenticated && (e is EndOfStreamException || e is IOException && e.Message == "child-before-peer" || e is BackendArtifactException { Reason: "runtime-instance" }) => "owner-peer",
                "wrong-owner" when !authenticated && (e is EndOfStreamException || e is IOException && e.Message == "child-before-peer") => "owner-rejected", _ => throw new IOException("unexpected-denial:" + e.GetType().Name) };
            if (mode == "foreign-owner") outcome = "owner-peer";
            pipe.Dispose();
        }
        finally { CryptographicOperations.ZeroMemory(material); CryptographicOperations.ZeroMemory(privateKey); }
        // Let a terminal notification finish test-only Node cleanup; Job disposal
        // remains the bounded fallback, never a retry or authority grant.
        if (!observed.WaitForExit(2500)) { child.Dispose(); if (!observed.WaitForExit(1000)) throw new IOException("child-cleanup"); }
        foreign?.Dispose();
        foreignOwner?.Dispose();
        if (!observed.HasExited) throw new IOException("child-cleanup");
        bool controlOnly = mode is "node-exit" or "cancel" or "expiry" or "foreign-node";
        if(!controlOnly){
            using var completion=FixtureCompletion.Read(Path.Combine(stage,"node-launch-result.json"));
            bool expectedPassed=bound && !mode.StartsWith("composition-bind-cancel",StringComparison.Ordinal);
            FixtureCompletion.Require(observed.ExitCode,completion.RootElement,expectedPassed,true);
        }
        if (mode == "foreign-owner")
        {
            using var result = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(stage, "node-launch-result.json")));
            if (authenticated || materialSent || result.RootElement.GetProperty("denial").GetString() != "owner-peer") throw new IOException("owner-peer-denial");
        }
        Console.WriteLine(JsonSerializer.Serialize(new { passed = true, mode, authenticated, materialSent, bound, port,
            outcome, exitCode=observed.ExitCode,completionVerified=!controlOnly,controlOnly,elapsedMs = started.ElapsedMilliseconds, residualProcesses = 0, productionAuthority = false, completeClosure = false }));
        return 0;
    }
}
