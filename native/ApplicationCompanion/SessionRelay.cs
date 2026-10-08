using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ApplicationCompanion;

// Broker independently binds every reply, on the retained verified child channel.
internal sealed class SessionRelay(int generation)
{
    private string id = "", nonce = "", digest = "";
    private long expiresAt, lastNow, elapsedDeadline;
    private bool offered, delivered, activated, loggedOut;
    private object Command(string type) => new { v = 1, type, id, nonce, expiresAt, generation };
    private void Bound(JsonElement value, string type, bool response)
    {
        lastNow = Math.Max(lastNow, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        Wire.Shape(value, type, response ? ["id", "nonce", "digest", "expiresAt", "generation"] : ["id", "nonce", "expiresAt", "generation"]);
        if (Wire.Text(value, "id") != id || Wire.Text(value, "nonce") != nonce || value.GetProperty("expiresAt").GetInt64() != expiresAt || value.GetProperty("generation").GetInt32() != generation || lastNow >= expiresAt || Environment.TickCount64 >= elapsedDeadline || (response && Wire.Text(value, "digest") != digest)) throw new IOException();
    }
    internal async Task Handle(JsonElement request, Wire channel, Wire parent, Func<Task<JsonElement>> read)
    {
        string type = Wire.Text(request, "type");
        if (type == "SESSION_OFFER")
        {
            Wire.Shape(request, type, "token", "id", "nonce", "expiresAt", "generation");
            if (offered) throw new IOException(); offered = true;
            id = Wire.Text(request, "id"); nonce = Wire.Text(request, "nonce"); expiresAt = request.GetProperty("expiresAt").GetInt64();
            lastNow = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); long remaining = expiresAt - lastNow;
            if (remaining <= 0 || remaining > 900000 || request.GetProperty("generation").GetInt32() != generation || !Regex.IsMatch(id, "^[a-f0-9-]{36}$") || !Regex.IsMatch(nonce, "^[a-f0-9]{64}$") || !Regex.IsMatch(Wire.Text(request, "token"), "^session_[A-Za-z0-9_-]{43}$")) throw new IOException();
            elapsedDeadline = Environment.TickCount64 + remaining;
            digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Wire.Text(request, "token")))).ToLowerInvariant();
            await channel.Send(request); Bound(await read(), "SESSION_ACK", true);
            await channel.Send(Command("SESSION_COMMIT")); Bound(await read(), "SESSION_DONE", true); delivered = true;
            await parent.Send(new { v = 1, type = "SESSION_DELIVERED", id, nonce, digest, expiresAt, generation });
            return;
        }
        Bound(request, type, false);
        if (!delivered || loggedOut || (type == "SESSION_ACTIVATE" ? activated : type != "SESSION_LOGOUT" || !activated)) throw new IOException();
        await channel.Send(request); var result = await read();
        Bound(result, type == "SESSION_ACTIVATE" ? "SESSION_ACTIVATED" : "SESSION_LOGGED_OUT", true);
        if (type == "SESSION_ACTIVATE") activated = true; else loggedOut = true;
        await parent.Send(result);
    }
}
