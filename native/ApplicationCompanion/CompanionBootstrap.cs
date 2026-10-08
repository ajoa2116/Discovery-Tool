using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ApplicationCompanion;

// Native memory only. Readiness messages/scripts never contain this credential.
internal sealed class CompanionBootstrap
{
    private enum Phase { Empty, Offered, Committed, Delivered, Active, Consumed, Terminal }
    private Phase phase;
    private string token = "", id = "", nonce = "", digest = "";
    private int generation;
    private long expiresAt, lastNow;
    private readonly DocumentReadiness document;
    private readonly Func<long> clock;
    internal CompanionBootstrap(DocumentReadiness document, Func<long>? clock = null) { this.document = document; this.clock = clock ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); }
    private void Live()
    {
        lastNow = Math.Max(lastNow, clock());
        if (!document.IsReady || document.Generation != generation || lastNow >= expiresAt || phase == Phase.Terminal) throw new IOException();
    }
    private T Guard<T>(Func<T> work) { try { return work(); } catch { Invalidate(); throw; } }
    internal object Offer(JsonElement value) => Guard(() => OfferCore(value));
    private object OfferCore(JsonElement value)
    {
        Wire.Shape(value, "OFFER", "token", "id", "nonce", "expiresAt", "generation");
        if (phase != Phase.Empty) throw new IOException();
        generation = value.GetProperty("generation").GetInt32(); expiresAt = value.GetProperty("expiresAt").GetInt64();
        Live(); if (expiresAt > lastNow + 30000) throw new IOException();
        token = Wire.Text(value, "token"); id = Wire.Text(value, "id"); nonce = Wire.Text(value, "nonce");
        if (!Regex.IsMatch(token, "^bootstrap_[A-Za-z0-9_-]{43}$") || !Regex.IsMatch(id, "^[a-f0-9-]{36}$") || !Regex.IsMatch(nonce, "^[a-f0-9]{64}$")) throw new IOException();
        digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant(); phase = Phase.Offered;
        return new { v = 1, type = "ACK", id, nonce, digest, generation };
    }
    internal object Commit(JsonElement value) => Guard(() => CommitCore(value));
    private object CommitCore(JsonElement value)
    {
        Live(); Wire.Shape(value, "COMMIT", "nonce", "generation");
        if (phase != Phase.Offered || Wire.Text(value, "nonce") != nonce || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
        phase = Phase.Committed;
        return new { v = 1, type = "DONE", nonce, generation };
    }
    internal void Delivered() { Guard(() => { Live(); if (phase != Phase.Committed) throw new IOException(); phase = Phase.Delivered; return true; }); }
    internal object Activate(JsonElement value) => Guard(() => ActivateCore(value));
    private object ActivateCore(JsonElement value)
    {
        Live(); Wire.Shape(value, "ACTIVATE", "id", "generation");
        if (phase != Phase.Delivered || Wire.Text(value, "id") != id || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
        phase = Phase.Active; return new { v = 1, type = "ACTIVATED", id, generation };
    }
    internal object Redeem(JsonElement value) => Guard(() => RedeemCore(value));
    private object RedeemCore(JsonElement value)
    {
        Live(); Wire.Shape(value, "REDEEM", "id", "generation");
        if (phase != Phase.Active || Wire.Text(value, "id") != id || value.GetProperty("generation").GetInt32() != generation) throw new IOException();
        phase = Phase.Consumed; var result = new { v = 1, type = "REDEEMED", id, generation, token }; token = ""; return result;
    }
    internal void Invalidate() { phase = Phase.Terminal; token = ""; nonce = ""; digest = ""; }
}
