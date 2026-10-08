using System.Text;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ApplicationCompanion;

internal sealed class FixtureWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 100 };
    private readonly DocumentReadiness document = new();
    private readonly CompanionBootstrap bootstrap;
    private readonly CompanionSession session;
    private readonly SemaphoreSlim ipc = new(1);
    private readonly Microsoft.Win32.SafeHandles.SafeFileHandle browserJob = WindowsBoundary.CreateOwnedJob();
    private readonly Dictionary<int, (Microsoft.Win32.SafeHandles.SafeFileHandle Job, System.Diagnostics.Process Process)> runtimeJobs = new();
    private System.IO.Pipes.NamedPipeClientStream? pipe;
    private Wire? wire;
    private bool busy, terminal, announced;
    private long started, lastPulse;
    private readonly string mode;
    internal FixtureWindow(string name, int parent, string mode)
    {
        this.mode = mode;
        bootstrap = new CompanionBootstrap(document); session = new CompanionSession(document);
        Text = "CCTV Application Companion — trusted fixture"; Width = 640; Height = 360;
        Controls.Add(view);
        Shown += async (_, _) => await Start(name, parent);
        timer.Tick += async (_, _) =>
        {
            if (terminal) return;
            if (session.Expired) { await Fail("SESSION_EXPIRED"); return; }
            if ((!announced && Environment.TickCount64 - started >= 12000) || document.Expired) { await Fail("READINESS_TIMEOUT"); return; }
            if (!document.IsReady || busy || Environment.TickCount64 - lastPulse < 500) return;
            busy = true;
            try
            {
                await ipc.WaitAsync();
                try
                {
                    if (terminal) return;
                    await wire!.Send(new { v = 1, type = "PULSE", generation = document.Generation });
                    await HandleCommand(await wire.Read(3000)); lastPulse = Environment.TickCount64;
                }
                finally { ipc.Release(); }
            }
            catch { await Fail("BOOTSTRAP_REJECTED"); }
            finally { busy = false; }
        };
        FormClosing += (_, _) => { terminal = true; document.Invalidate(); bootstrap.Invalidate(); session.Invalidate(); timer.Stop(); CloseRuntimeJobs(); view.Dispose(); pipe?.Dispose(); };
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
            OwnBrowserProcesses(environment);
            environment.ProcessInfosChanged += async (_, _) =>
            {
                if (terminal) return;
                try { OwnBrowserProcesses(environment); }
                catch { await Fail("RUNTIME_UNAVAILABLE"); }
            };
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
                    try { if (terminal || !document.IsReady) return; await wire.Send(new { v = 1, type = "READY", generation = document.Generation }); announced = true; lastPulse = Environment.TickCount64; }
                    finally { ipc.Release(); }
                    if (mode == "disconnect") { pipe.Dispose(); return; }
                    if (mode == "exit") { Close(); return; }
                    if (mode == "renderer-loss") { try { await core.CallDevToolsProtocolMethodAsync("Page.crash", "{}"); } catch { /* ProcessFailed is the required proof. */ } }
                }
                catch { await Fail("MESSAGE_REJECTED"); }
            };
            core.Navigate(DocumentReadiness.ApprovedUrl);
        }
        catch (Exception error) { await Fail(Program.FailureCodes.Contains(error.Message) ? error.Message : "RUNTIME_UNAVAILABLE"); }
    }
    private async Task Fail(string code)
    {
        if (terminal) return;
        terminal = true; document.Invalidate(); bootstrap.Invalidate(); session.Invalidate(); timer.Stop();
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
        finally { pipe?.Dispose(); CloseRuntimeJobs(); view.Dispose(); if (!IsDisposed) Close(); }
    }
    private async Task HandleCommand(System.Text.Json.JsonElement command)
    {
        if (terminal || !document.IsReady) throw new IOException();
        string type = Wire.Text(command, "type");
        if (type == "CLOSE") { Wire.Shape(command, "CLOSE"); Close(); return; }
        if (type == "ACK") { Wire.Shape(command, "ACK"); return; }
        if (type.StartsWith("SESSION_", StringComparison.Ordinal)) { await HandleSession(command); return; }
        if (type == "ACTIVATE")
        {
            if (mode == "activation-navigation") { view.CoreWebView2.Navigate("https://rejected.invalid/"); await Task.Delay(100); }
            await wire!.Send(bootstrap.Activate(command)); return;
        }
        if (type == "REDEEM")
        {
            await wire!.Send(bootstrap.Redeem(command));
            return;
        }
        if (type != "OFFER") throw new IOException();
        if (mode == "delivery-stale-generation")
        {
            var changed = System.Text.Json.Nodes.JsonNode.Parse(command.GetRawText())!;
            changed["generation"] = document.Generation + 1;
            command = System.Text.Json.JsonSerializer.SerializeToElement(changed);
        }
        var ack = bootstrap.Offer(command);
        if (mode == "delivery-timeout") { await Task.Delay(10000); throw new IOException(); }
        if (mode == "delivery-exit") { Close(); return; }
        if (mode == "delivery-navigation") { view.CoreWebView2.Navigate("https://rejected.invalid/"); await Task.Delay(100); throw new IOException(); }
        if (mode == "delivery-wrong-ack")
        {
            var changed = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(ack))!;
            changed["nonce"] = "wrong"; ack = changed;
        }
        await wire!.Send(ack);
        if (mode == "delivery-duplicate-ack") await wire.Send(ack);
        var done = bootstrap.Commit(await wire.Read(2000));
        if (terminal || !document.IsReady) throw new IOException();
        if (mode == "delivery-partial-done") { await wire.Send(new { v = 1, type = "DONE" }); throw new IOException(); }
        await wire.Send(done); bootstrap.Delivered();
        if (mode == "delivery-replay") await wire.Send(done);
    }
    private void SessionStatus(string state)
    {
        if (terminal || !document.IsReady || view.CoreWebView2.Source != DocumentReadiness.ApprovedUrl) throw new IOException();
        view.CoreWebView2.PostWebMessageAsJson(System.Text.Json.JsonSerializer.Serialize(new { v = 1, type = "SESSION_STATUS", state, generation = document.Generation }));
    }
    private async Task HandleSession(System.Text.Json.JsonElement command)
    {
        string type = Wire.Text(command, "type");
        if (type == "SESSION_ACTIVATE")
        {
            if (mode == "session-activation-loss") { Close(); return; }
            var activated = session.Activate(command);
            if (mode == "session-lost-activation") { await Task.Delay(10000); throw new IOException(); }
            await wire!.Send(activated); SessionStatus("active");
            if (mode is "session-active-navigation" or "redeemed-navigation") _ = Task.Delay(700).ContinueWith(_ => { if (!terminal && !IsDisposed) BeginInvoke(() => view.CoreWebView2.Navigate("https://rejected.invalid/")); });
            if (mode == "session-renderer-loss") _ = Task.Delay(700).ContinueWith(_ => { if (!terminal && !IsDisposed) BeginInvoke(async () => { try { await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Page.crash", "{}"); } catch { } }); });
            if (mode == "session-channel-loss") _ = Task.Delay(700).ContinueWith(_ => pipe?.Dispose());
            return;
        }
        if (type == "SESSION_LOGOUT") { await wire!.Send(session.Logout(command)); SessionStatus("logged-out"); return; }
        if (type != "SESSION_OFFER") throw new IOException();
        if (mode == "session-stale-generation")
        {
            var changed = System.Text.Json.Nodes.JsonNode.Parse(command.GetRawText())!; changed["generation"] = document.Generation + 1;
            command = System.Text.Json.JsonSerializer.SerializeToElement(changed);
        }
        var ack = session.Offer(command);
        if (mode == "session-timeout") { await Task.Delay(10000); throw new IOException(); }
        if (mode == "session-exit") { Close(); return; }
        if (mode == "session-navigation") { view.CoreWebView2.Navigate("https://rejected.invalid/"); await Task.Delay(100); throw new IOException(); }
        if (mode == "session-wrong-ack") { var changed = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(ack))!; changed["digest"] = new string('0', 64); ack = changed; }
        if (mode == "session-wrong-expiry") { var changed = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(ack))!; changed["expiresAt"] = command.GetProperty("expiresAt").GetInt64() + 1; ack = changed; }
        if (mode == "session-late-ack") await Task.Delay(2500);
        await wire!.Send(ack);
        if (mode == "session-duplicate-ack") await wire.Send(ack);
        var done = session.Commit(await wire.Read(2000));
        if (terminal || !document.IsReady) throw new IOException();
        if (mode == "session-lost-done") { await Task.Delay(10000); throw new IOException(); }
        if (mode == "session-partial-done") { await wire.Send(new { v = 1, type = "SESSION_DONE" }); throw new IOException(); }
        await wire.Send(done); session.Delivered();
        if (mode == "session-replay") await wire.Send(done);
    }
    private void OwnBrowserProcesses(CoreWebView2Environment environment)
    {
        // WebView2 may launch runtime processes outside the UI's inherited Job.
        // Adopt the fresh environment's process set before navigation/credential
        // delivery, then retain kill-on-close ownership for the whole lifetime.
        var processes = environment.GetProcessInfos();
        if (processes.Count == 0) throw new IOException();
        bool browserOwned = false;
        foreach (var info in processes)
        {
            int pid = (int)info.ProcessId;
            if (runtimeJobs.TryGetValue(pid, out var retained))
            {
                if (!retained.Process.HasExited) { if (info.Kind == CoreWebView2ProcessKind.Browser) browserOwned = true; continue; }
                retained.Job.Dispose(); retained.Process.Dispose(); runtimeJobs.Remove(pid);
            }
            if (runtimeJobs.Count >= 128) throw new IOException("RUNTIME_UNAVAILABLE");
            var process = System.Diagnostics.Process.GetProcessById(pid);
            if (process.HasExited) { process.Dispose(); continue; }
            var job = info.Kind == CoreWebView2ProcessKind.Browser ? browserJob : WindowsBoundary.CreateOwnedJob();
            try { WindowsBoundary.AttachOwnedProcess(job, process); runtimeJobs.Add(pid, (job, process)); }
            catch { job.Dispose(); process.Dispose(); throw; }
            if (info.Kind == CoreWebView2ProcessKind.Browser) browserOwned = true;
        }
        if (!browserOwned) throw new IOException("JOB_BROWSER_MISSING");
    }
    private void CloseRuntimeJobs() { foreach (var retained in runtimeJobs.Values) { retained.Job.Dispose(); retained.Process.Dispose(); } runtimeJobs.Clear(); browserJob.Dispose(); }
}
