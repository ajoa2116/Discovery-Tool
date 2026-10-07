using System.Text;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ApplicationCompanion;

internal sealed class FixtureWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 100 };
    private readonly DocumentReadiness document = new();
    private readonly SemaphoreSlim ipc = new(1);
    private System.IO.Pipes.NamedPipeClientStream? pipe;
    private Wire? wire;
    private bool busy, terminal, announced;
    private long started, lastPulse;
    private readonly string mode;
    internal FixtureWindow(string name, int parent, string mode)
    {
        this.mode = mode;
        Text = "CCTV Application Companion — trusted fixture"; Width = 640; Height = 360;
        Controls.Add(view);
        Shown += async (_, _) => await Start(name, parent);
        timer.Tick += async (_, _) =>
        {
            if (terminal) return;
            if ((!announced && Environment.TickCount64 - started >= 12000) || document.Expired) { await Fail("READINESS_TIMEOUT"); return; }
            if (!document.IsReady || busy || Environment.TickCount64 - lastPulse < 500) return;
            busy = true;
            try
            {
                await ipc.WaitAsync();
                try { if (terminal) return; await wire!.Send(new { v = 1, type = "PULSE" }); Wire.Shape(await wire.Read(3000), "ACK"); lastPulse = Environment.TickCount64; }
                finally { ipc.Release(); }
            }
            catch { await Fail("CHANNEL_LOST"); }
            finally { busy = false; }
        };
        FormClosing += (_, _) => { terminal = true; document.Invalidate(); timer.Stop(); view.Dispose(); pipe?.Dispose(); };
        FormClosed += (_, _) => { timer.Dispose(); };
    }
    private async Task Start(string name, int parent)
    {
        try
        {
            pipe = await WindowsBoundary.Connect(name, parent); wire = new Wire(pipe, pipe);
            started = Environment.TickCount64; timer.Start();
            if (mode == "timeout") return;
            string profile = Path.Combine(Path.GetTempPath(), "CCTVApplicationCompanion", Guid.NewGuid().ToString("N"));
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            var options = environment.CreateCoreWebView2ControllerOptions(); options.IsInPrivateModeEnabled = true;
            await view.EnsureCoreWebView2Async(environment, options);
            if (terminal) return;
            var core = view.CoreWebView2;
            core.Settings.IsWebMessageEnabled = true; core.Settings.AreHostObjectsAllowed = false;
            core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = false; core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.NewWindowRequested += async (_, e) => { e.Handled = true; await Fail("POPUP_REJECTED"); };
            core.FrameCreated += async (_, e) => { e.Frame.NavigationStarting += (_, navigation) => navigation.Cancel = true; await Fail("FRAME_REJECTED"); };
            core.DownloadStarting += async (_, e) => { e.Cancel = true; await Fail("RESOURCE_REJECTED"); };
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.ServerCertificateErrorDetected += async (_, e) => { e.Action = CoreWebView2ServerCertificateErrorAction.Cancel; await Fail("RESOURCE_REJECTED"); };
            core.ProcessFailed += async (_, _) => await Fail("RENDERER_LOST");
            environment.BrowserProcessExited += (_, _) => { if (!terminal && !IsDisposed) BeginInvoke(async () => await Fail("RENDERER_LOST")); };
            core.NavigationStarting += async (_, e) =>
            {
                if (terminal || !document.Start(e.Uri, e.NavigationId, e.IsRedirected)) { e.Cancel = true; await Fail("NAVIGATION_REJECTED"); }
            };
            core.SourceChanged += async (_, _) => { if (core.Source != DocumentReadiness.ApprovedUrl) await Fail("NAVIGATION_REJECTED"); };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (terminal || e.Request.Uri != DocumentReadiness.ApprovedUrl || e.ResourceContext != CoreWebView2WebResourceContext.Document)
                { e.Response = environment.CreateWebResourceResponse(Stream.Null, 403, "Blocked", "Content-Type: text/plain"); return; }
                if (mode is "redirect" or "same-url-redirect")
                {
                    string target = mode == "redirect" ? "https://rejected.invalid/" : DocumentReadiness.ApprovedUrl;
                    e.Response = environment.CreateWebResourceResponse(Stream.Null, 302, "Found", "Location: " + target + "\r\nCache-Control: no-store"); return;
                }
                // Frame mode relaxes CSP solely to exercise the independent native frame boundary.
                string framePolicy = mode == "frame" ? "frame-src about:" : "frame-src 'none'";
                e.Response = environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes(FixtureDocument.Html(mode))), 200, "OK",
                    "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; " + framePolicy + "; connect-src 'none'; base-uri 'none'; form-action 'none'");
            };
            core.NavigationCompleted += async (_, e) =>
            {
                if (terminal) return;
                try { core.PostWebMessageAsJson(document.Complete(core.Source, e.NavigationId, e.IsSuccess)); }
                catch { await Fail("NAVIGATION_REJECTED"); }
            };
            core.WebMessageReceived += async (_, e) =>
            {
                if (terminal) return;
                if (document.Expired) { await Fail("READINESS_TIMEOUT"); return; }
                try
                {
                    document.Accept(e.Source, core.Source, e.WebMessageAsJson);
                    await ipc.WaitAsync();
                    try { if (terminal || !document.IsReady) return; await wire.Send(new { v = 1, type = "READY" }); announced = true; lastPulse = Environment.TickCount64; }
                    finally { ipc.Release(); }
                    if (mode == "disconnect") { pipe.Dispose(); return; }
                    if (mode == "exit") { Close(); return; }
                    if (mode == "renderer-loss") { try { await core.CallDevToolsProtocolMethodAsync("Page.crash", "{}"); } catch { /* ProcessFailed is the required proof. */ } }
                }
                catch { await Fail("MESSAGE_REJECTED"); }
            };
            core.Navigate(DocumentReadiness.ApprovedUrl);
        }
        catch { await Fail("RUNTIME_UNAVAILABLE"); }
    }
    private async Task Fail(string code)
    {
        if (terminal) return;
        terminal = true; document.Invalidate(); timer.Stop();
        try
        {
            await ipc.WaitAsync();
            try
            {
                if (wire is not null)
                {
                    await wire.Send(new { v = 1, type = "FAILED", code });
                    Wire.Shape(await wire.Read(3000), "FAILURE_ACK");
                }
            }
            finally { ipc.Release(); }
        }
        catch { /* Terminal loss still closes the private boundary. */ }
        finally { pipe?.Dispose(); view.Dispose(); if (!IsDisposed) Close(); }
    }
}
