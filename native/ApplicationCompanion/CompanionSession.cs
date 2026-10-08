using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ApplicationCompanion;

// Native memory only. Readiness messages/scripts never contain this credential.
internal sealed class CompanionSession
{
    private enum Phase { Empty, Offered, Committed, Delivered, Active, Terminal }
    private Phase phase;
    private string token = "", id = "", nonce = "", digest = "";
    private int generation;
    private long expiresAt, lastNow, elapsedDeadline;
    internal bool HasGrant => phase != Phase.Empty && phase != Phase.Terminal;
    internal bool IsActive => phase == Phase.Active;
    internal bool Expired => HasGrant && (clock() >= expiresAt || Environment.TickCount64 >= elapsedDeadline);
    private readonly DocumentReadiness document;
    private readonly Func<long> clock;
    internal CompanionSession(DocumentReadiness document, Func<long>? clock = null) { this.document = document; this.clock = clock ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); }
    private void Live()
    {
        lastNow = Math.Max(lastNow, clock());
        if (!document.IsReady || document.Generation != generation || lastNow >= expiresAt || Environment.TickCount64 >= elapsedDeadline || phase == Phase.Terminal) throw new IOException();
    }
    private T Guard<T>(Func<T> work) { try { return work(); } catch { Invalidate(); throw; } }
    internal object Offer(JsonElement value) => Guard(() => OfferCore(value));
    private object OfferCore(JsonElement value)
    {
        Wire.Shape(value, "SESSION_OFFER", "token", "id", "nonce", "expiresAt", "generation");
        if (phase != Phase.Empty) throw new IOException();
        generation = value.GetProperty("generation").GetInt32(); expiresAt = value.GetProperty("expiresAt").GetInt64();
        lastNow = clock(); long remaining = expiresAt - lastNow;
        if (remaining <= 0 || remaining > 900000) throw new IOException();
        elapsedDeadline = Environment.TickCount64 + remaining; Live();
        token = Wire.Text(value, "token"); id = Wire.Text(value, "id"); nonce = Wire.Text(value, "nonce");
        if (!Regex.IsMatch(token, "^session_[A-Za-z0-9_-]{43}$") || !Regex.IsMatch(id, "^[a-f0-9-]{36}$") || !Regex.IsMatch(nonce, "^[a-f0-9]{64}$")) throw new IOException();
        digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant(); phase = Phase.Offered;
        return Frame("SESSION_ACK");
    }
    internal object Commit(JsonElement value) => Guard(() => CommitCore(value));
    private object CommitCore(JsonElement value)
    {
        Bound(value, "SESSION_COMMIT");
        if (phase != Phase.Offered || Wire.Text(value, "nonce") != nonce || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
        phase = Phase.Committed;
        return Frame("SESSION_DONE");
    }
    internal void Delivered() { Guard(() => { Live(); if (phase != Phase.Committed) throw new IOException(); phase = Phase.Delivered; return true; }); }
    internal object Activate(JsonElement value) => Guard(() => ActivateCore(value));
    private object ActivateCore(JsonElement value)
    {
        Bound(value, "SESSION_ACTIVATE");
        if (phase != Phase.Delivered || Wire.Text(value, "id") != id || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
        phase = Phase.Active; return Frame("SESSION_ACTIVATED");
    }
    private object Frame(string type) => new { v = 1, type, id, nonce, digest, expiresAt, generation };
    private void Bound(JsonElement value, string type)
    {
        Live(); Wire.Shape(value, type, "id", "nonce", "expiresAt", "generation");
        if (Wire.Text(value, "id") != id || Wire.Text(value, "nonce") != nonce || value.GetProperty("expiresAt").GetInt64() != expiresAt || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
    }
    internal object Logout(JsonElement value) => Guard(() =>
    {
        Bound(value, "SESSION_LOGOUT"); if (phase != Phase.Active) throw new IOException();
        var result = Frame("SESSION_LOGGED_OUT"); Invalidate(); return result;
    });
    internal void Invalidate() { phase = Phase.Terminal; token = ""; nonce = ""; digest = ""; }
}
