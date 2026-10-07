namespace ApplicationCompanion;

// Fixed native UI fixture only: no URL, document bridge, authority or camera content.
internal sealed class FixtureWindow : Form
{
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 500 };
    private System.IO.Pipes.NamedPipeClientStream? pipe;
    private Wire? wire;
    private bool busy;
    internal FixtureWindow(string name, int parent, string mode)
    {
        Text = "CCTV Application Companion — isolated fixture"; Width = 480; Height = 200;
        Controls.Add(new Label { Dock = DockStyle.Fill, Padding = new Padding(24), Text = "Persistent application companion fixture.\nNo bootstrap authority or camera connection." });
        Shown += async (_, _) =>
        {
            try
            {
                pipe = await WindowsBoundary.Connect(name, parent); wire = new Wire(pipe, pipe);
                if (mode == "timeout") { await Task.Delay(10000); Close(); return; }
                await wire.Send(new { v = 1, type = "READY" });
                if (mode == "disconnect") { pipe.Dispose(); return; }
                if (mode == "exit") { Close(); return; }
                timer.Start();
            }
            catch { Close(); }
        };
        timer.Tick += async (_, _) =>
        {
            if (busy || wire is null) return; busy = true;
            try { await wire.Send(new { v = 1, type = "PULSE" }); Wire.Shape(await wire.Read(3000), "ACK"); }
            catch { Close(); }
            finally { busy = false; }
        };
        FormClosed += (_, _) => { timer.Stop(); timer.Dispose(); pipe?.Dispose(); };
    }
}
