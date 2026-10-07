using System.Security.Cryptography;
using System.Text.Json;

namespace ApplicationCompanion;

// One document per companion lifetime. Navigation never silently renews readiness.
internal sealed class DocumentReadiness
{
    internal const string ApprovedUrl = "https://companion-fixture.invalid/ready.html";
    internal const int ChallengeMilliseconds = 2500;
    private enum Phase { Created, Navigating, Challenged, Ready, Terminal }
    private Phase phase;
    private readonly Func<long> clock;
    private ulong navigationId;
    private string nonce = "";
    private long deadline;
    internal int Generation { get; private set; }
    internal bool IsReady => phase == Phase.Ready;
    internal bool Expired => phase == Phase.Challenged && clock() >= deadline;
    internal DocumentReadiness(Func<long>? clock = null) { this.clock = clock ?? (() => Environment.TickCount64); }
    internal bool Start(string url, ulong id, bool redirected)
    {
        if (phase != Phase.Created || url != ApprovedUrl || redirected) { Invalidate(); return false; }
        Generation++; navigationId = id; phase = Phase.Navigating; return true;
    }
    internal string Complete(string source, ulong id, bool success)
    {
        if (phase != Phase.Navigating || source != ApprovedUrl || navigationId != id || !success) { Invalidate(); throw new IOException(); }
        nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        deadline = clock() + ChallengeMilliseconds; phase = Phase.Challenged;
        return JsonSerializer.Serialize(new { v = 1, type = "CHALLENGE", generation = Generation, navigationId = navigationId.ToString(System.Globalization.CultureInfo.InvariantCulture), nonce });
    }
    internal void Accept(string source, string currentSource, string message)
    {
        try
        {
            if (phase != Phase.Challenged || clock() >= deadline || source != ApprovedUrl || currentSource != ApprovedUrl || message.Length > 1024) throw new IOException();
            using var document = JsonDocument.Parse(message, new JsonDocumentOptions { MaxDepth = 2 });
            var value = document.RootElement;
            Wire.Shape(value, "READY", "generation", "navigationId", "nonce");
            if (value.GetProperty("v").GetInt32() != 1 || value.GetProperty("generation").GetInt32() != Generation ||
                value.GetProperty("navigationId").GetString() != navigationId.ToString(System.Globalization.CultureInfo.InvariantCulture) || value.GetProperty("nonce").GetString() != nonce) throw new IOException();
            nonce = ""; phase = Phase.Ready;
        }
        catch { Invalidate(); throw; }
    }
    internal void Invalidate() { if (phase == Phase.Terminal) return; Generation++; nonce = ""; phase = Phase.Terminal; }
}
