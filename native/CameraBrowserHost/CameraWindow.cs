using System.IO.Pipes;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace CameraBrowserHost;

internal static class NavigationPolicy
{
    public static string Decide(Uri approved, string target)
    {
        if (!Uri.TryCreate(target, UriKind.Absolute, out var uri) || uri.UserInfo.Length != 0 || uri.Scheme is not ("http" or "https")) return "NAVIGATION_BLOCKED";
        if (uri.GetLeftPart(UriPartial.Authority) == approved.GetLeftPart(UriPartial.Authority)) return "ALLOW";
        return uri.Host == approved.Host ? "TRANSITION_BLOCKED" : "NAVIGATION_BLOCKED";
    }
}

internal sealed class CameraWindow : Form
{
    private readonly Label status = new() { Dock = DockStyle.Top, Height = 65, Text = "Authorizing Camera Browser…", Padding = new Padding(12) };
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer heartbeat = new() { Interval = 1000 };
    private readonly SemaphoreSlim serial = new(1);
    private NamedPipeClientStream? pipe;
    private Wire? channel;
    private string sessionId = "", deviceId = "", token = "", runtime = "";
    private long expiresAt;
    private Uri? origin;
    private bool terminal, closing, ticking, failing;
    private readonly bool smoke;
    private readonly bool missingRuntime;
    private string? profile;

    internal CameraWindow(string bootstrap, int serverPid, string mode)
    {
        smoke = mode == "--smoke"; missingRuntime = mode == "--runtime-missing";
        Text = "CCTV Camera Browser — native proof"; Width = 960; Height = 720;
        Controls.Add(view); Controls.Add(status);
        Shown += async (_, _) => await Start(bootstrap, serverPid);
        heartbeat.Tick += async (_, _) => {
            if (ticking || terminal || failing) return; ticking = true;
            try { await Report("STATUS"); } catch { await Fail("AUTHORIZATION_ENDED"); } finally { ticking = false; }
        };
        FormClosing += async (_, e) => {
            if (closing) return; e.Cancel = true; closing = true; heartbeat.Stop();
            if (!terminal && channel is not null) { try { await Report("CLOSE"); } catch { } }
            terminal = true; view.Dispose(); pipe?.Dispose();
            await CleanupProfile(); Close();
        };
        FormClosed += (_, _) => { heartbeat.Dispose(); view.Dispose(); pipe?.Dispose(); };
    }
    private async Task Start(string bootstrap, int serverPid)
    {
        try
        {
            using (var bootPipe = await WindowsBoundary.Connect(bootstrap, serverPid))
            {
                var boot = new Wire(bootPipe, bootPipe); await boot.Send(new { v = 1, type = "HELLO" });
                var offer = await boot.Read(); Wire.Shape(offer, "OFFER", "sessionId", "deviceId", "token", "activePipe");
                sessionId = Wire.Text(offer, "sessionId"); deviceId = Wire.Text(offer, "deviceId");
                await boot.Send(new { v = 1, type = "REDEEM", sessionId, deviceId, token = Wire.Text(offer, "token") });
                var grant = await boot.Read(); Wire.Shape(grant, "GRANT", "session", "token");
                Accept(grant.GetProperty("session")); token = Wire.Text(grant, "token");
                pipe = await WindowsBoundary.Connect(Wire.Text(offer, "activePipe"), serverPid);
                channel = new Wire(pipe, pipe);
            }
            await Report("STATUS"); heartbeat.Start();
            status.Text = $"Loading authorized camera {deviceId} at {origin!.Host}…";
            CoreWebView2Environment environment;
            try
            {
                runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
                profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CCTVNativeProof", Guid.NewGuid().ToString("N"));
                environment = await CoreWebView2Environment.CreateAsync(missingRuntime ? Path.Combine(profile, "missing-runtime") : null, profile);
                var options = environment.CreateCoreWebView2ControllerOptions(); options.IsInPrivateModeEnabled = true;
                await view.EnsureCoreWebView2Async(environment, options);
            }
            catch { await Fail("RUNTIME_UNAVAILABLE"); return; }
            if (terminal) return;
            var core = view.CoreWebView2;
            core.Settings.IsWebMessageEnabled = false; core.Settings.AreHostObjectsAllowed = false;
            core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false; core.Settings.IsGeneralAutofillEnabled = false;
            core.NewWindowRequested += (_, e) => { e.Handled = true; };
            core.DownloadStarting += (_, e) => { e.Cancel = true; };
            core.PermissionRequested += (_, e) => { e.State = CoreWebView2PermissionState.Deny; };
            core.ServerCertificateErrorDetected += async (_, e) => { e.Action = CoreWebView2ServerCertificateErrorAction.Cancel; await Fail("CERTIFICATE_REJECTED"); };
            core.ProcessFailed += async (_, _) => await Fail("RENDERER_FAILED");
            core.NavigationStarting += (_, e) => {
                var decision = NavigationPolicy.Decide(origin!, e.Uri);
                if (terminal || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expiresAt || decision != "ALLOW") { e.Cancel = true; status.Text = "Navigation blocked. Return to the application for Open External."; }
            };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) => {
                if (terminal || NavigationPolicy.Decide(origin!, e.Request.Uri) != "ALLOW")
                    e.Response = environment.CreateWebResourceResponse(Stream.Null, 403, "Blocked", "Content-Type: text/plain");
            };
            core.NavigationCompleted += async (_, e) => {
                if (terminal) return;
                if (!e.IsSuccess) { await Fail("NAVIGATION_FAILED"); return; }
                status.Text = "Authorized camera page loaded. Identity ownership and login are not verified.";
                if (smoke)
                {
                    try
                    {
                        // Fixed test assertion only. No camera password or arbitrary script bridge.
                        var marker = await core.ExecuteScriptAsync("document.getElementById('fixture-proof')?.textContent === 'CCTV controlled native fixture'");
                        if (marker != "true") throw new InvalidDataException();
                        using (var png = File.Create(Path.Combine(AppContext.BaseDirectory, $"smoke-{Environment.ProcessId}.png")))
                            await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, png);
                        await Report("READY", "PAGE_RENDERED"); Close();
                    }
                    catch { await Fail("SMOKE_FAILED"); }
                }
            };
            await Report("READY", "INITIALIZED");
            core.Navigate(origin!.AbsoluteUri);
        }
        catch { await Fail("BOOTSTRAP_FAILED"); }
    }
    private void Accept(JsonElement session)
    {
        if (Wire.Text(session, "sessionId") != sessionId || Wire.Text(session, "deviceId") != deviceId || Wire.Text(session, "renderer") != "WINDOWS_WEBVIEW2" || session.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
        var approved = new Uri(Wire.Text(session, "origin", 512));
        if (approved.Scheme is not ("http" or "https") || approved.Host != Wire.Text(session, "address") || approved.UserInfo.Length != 0 || approved.Query.Length != 0 || approved.Fragment.Length != 0 || approved.AbsolutePath != "/") throw new InvalidDataException();
        if (origin is not null && approved != origin) throw new InvalidDataException();
        expiresAt = session.GetProperty("expiresAt").GetInt64();
        if (expiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) throw new InvalidDataException();
        origin = approved;
        Text = $"Camera Browser — {Wire.Text(session.GetProperty("display"), "name")} — {approved.Host}";
    }
    private async Task Report(string type, string eventCode = "NONE")
    {
        await serial.WaitAsync();
        try
        {
            if (channel is null || terminal) throw new IOException();
            await channel.Send(new { v = 1, type = "MESSAGE", message = new { type, sessionId, deviceId, token }, @event = eventCode, runtime });
            var ack = await channel.Read(); Wire.Shape(ack, "ACK", "session", "state");
            if (type is not ("CLOSE" or "FAILED")) Accept(ack.GetProperty("session"));
            if (Wire.Text(ack, "state") != (type is "CLOSE" or "FAILED" ? "CLOSED" : "ACTIVE")) throw new IOException();
        }
        finally { serial.Release(); }
    }
    private async Task Fail(string code)
    {
        if (terminal || closing || failing) return;
        failing = true;
        heartbeat.Stop(); view.Dispose();
        status.Text = $"{deviceId} at {origin?.Host ?? "unapproved target"}: renderer unavailable ({code}). Return to CCTV Network Assistant and use Open External.";
        try { if (channel is not null) await Report("FAILED", code); } catch { }
        terminal = true;
        await Task.Delay(1000); if (!IsDisposed) Close();
    }
    private async Task CleanupProfile()
    {
        if (profile is null) return;
        var root = Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CCTVNativeProof")) + Path.DirectorySeparatorChar;
        var target = Path.GetFullPath(profile);
        if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !Guid.TryParseExact(Path.GetFileName(target), "N", out _)) return;
        // Only this window's generated directory; browser shutdown may leave it busy after a crash.
        for (int attempt = 0; attempt < 5; attempt++)
        {
            try { if (Directory.Exists(target)) Directory.Delete(target, true); return; }
            catch (IOException) { await Task.Delay(200); }
            catch (UnauthorizedAccessException) { return; }
        }
    }
}
