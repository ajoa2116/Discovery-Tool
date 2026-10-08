using System.Text.Json;
using System.Text.Json.Nodes;

namespace ApplicationCompanion;

internal static class SessionTests
{
    internal static int Run()
    {
        int count = 0; long now = 1000;
        void Check(bool good) { if (!good) throw new IOException(); count++; }
        void Deny(Action action) { bool denied = false; try { action(); } catch { denied = true; } Check(denied); }
        DocumentReadiness Ready()
        {
            var document = new DocumentReadiness(); document.Start(DocumentReadiness.ApprovedUrl, 42, false);
            document.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, document.Complete(DocumentReadiness.ApprovedUrl, 42, true).Replace("CHALLENGE", "READY")); return document;
        }
        string token = "session_" + new string('a', 43), nonce = new string('b', 64), id = "11111111-1111-1111-1111-111111111111";
        JsonElement Offer() => JsonSerializer.SerializeToElement(new { v = 1, type = "SESSION_OFFER", token, id, nonce, generation = 1, expiresAt = now + 10000 });
        JsonElement Commit() => JsonSerializer.SerializeToElement(new { v = 1, type = "SESSION_COMMIT", id, nonce, expiresAt = 11000, generation = 1 });
        JsonElement Command(string type) => JsonSerializer.SerializeToElement(new { v = 1, type, id, nonce, expiresAt = 11000, generation = 1 });
        {
            var state = new CompanionSession(Ready(), () => now);
            var acknowledgment = state.Offer(Offer()); Check(!JsonSerializer.Serialize(acknowledgment).Contains(token));
            Check(JsonSerializer.SerializeToElement(acknowledgment).GetProperty("type").GetString() == "SESSION_ACK");
            Check(JsonSerializer.SerializeToElement(state.Commit(Commit())).GetProperty("type").GetString() == "SESSION_DONE");
            state.Delivered(); Check(JsonSerializer.SerializeToElement(state.Activate(Command("SESSION_ACTIVATE"))).GetProperty("type").GetString() == "SESSION_ACTIVATED");
            Check(state.IsActive);
            Check(JsonSerializer.SerializeToElement(state.Logout(Command("SESSION_LOGOUT"))).GetProperty("type").GetString() == "SESSION_LOGGED_OUT"); Check(!state.IsActive);
            Deny(() => state.Logout(Command("SESSION_LOGOUT"))); Deny(() => state.Offer(Offer()));
        }
        foreach (string field in new[] { "token", "nonce", "id", "generation", "expiresAt", "extra", "duplicate" })
        {
            var state = new CompanionSession(Ready(), () => now); var offer = JsonNode.Parse(Offer().GetRawText())!;
            if (field == "generation") offer[field] = 2;
            else if (field == "expiresAt") offer[field] = now;
            else if (field == "extra") offer[field] = true;
            else offer[field] = "wrong";
            var wrong = field == "duplicate" ? JsonDocument.Parse(Offer().GetRawText().Replace("\"v\":1", "\"v\":1,\"v\":1")).RootElement.Clone() : JsonSerializer.SerializeToElement(offer);
            Deny(() => state.Offer(wrong)); Deny(() => state.Offer(Offer())); Deny(() => state.Activate(Command("SESSION_ACTIVATE"))); Deny(() => state.Logout(Command("SESSION_LOGOUT")));
        }
        foreach (int stage in new[] { 0, 1, 2 })
        {
            var state = new CompanionSession(Ready(), () => now);
            if (stage >= 1) state.Offer(Offer()); if (stage >= 2) state.Commit(Commit());
            Deny(() => state.Activate(Command("SESSION_ACTIVATE"))); Deny(() => state.Logout(Command("SESSION_LOGOUT")));
        }
        foreach (bool expired in new[] { false, true })
        {
            var document = Ready(); var state = new CompanionSession(document, () => now); state.Offer(Offer());
            if (expired) now += 10000; else document.Invalidate();
            Deny(() => state.Commit(Commit())); Deny(() => state.Logout(Command("SESSION_LOGOUT"))); now = 1000;
        }
        foreach (bool activated in new[] { false, true })
        {
            var document = Ready(); var state = new CompanionSession(document, () => now); state.Offer(Offer()); state.Commit(Commit()); state.Delivered();
            if (activated) state.Activate(Command("SESSION_ACTIVATE")); document.Invalidate();
            Deny(() => state.Activate(Command("SESSION_ACTIVATE"))); Deny(() => state.Logout(Command("SESSION_LOGOUT")));
        }
        {
            var state = new CompanionSession(new DocumentReadiness(), () => now); Deny(() => state.Offer(Offer()));
        }
        {
            var state = new CompanionSession(Ready(), () => now); state.Offer(Offer());
            var wrong = JsonSerializer.SerializeToElement(new { v = 1, type = "SESSION_COMMIT", id, nonce, expiresAt = 11000, generation = 2 });
            Deny(() => state.Commit(wrong)); Deny(() => state.Commit(Commit()));
        }
        {
            var state = new CompanionSession(Ready(), () => now); state.Offer(Offer()); state.Commit(Commit()); state.Delivered();
            now += 10000; Deny(() => state.Activate(Command("SESSION_ACTIVATE"))); now = 1000; Deny(() => state.Activate(Command("SESSION_ACTIVATE")));
        }
        foreach (string field in new[] { "id", "nonce", "expiresAt", "generation", "extra" })
        {
            var state = new CompanionSession(Ready(), () => now); state.Offer(Offer());
            var wrong = JsonNode.Parse(Commit().GetRawText())!;
            if (field == "expiresAt") wrong[field] = 11001;
            else if (field == "generation") wrong[field] = 2;
            else wrong[field] = "wrong";
            Deny(() => state.Commit(JsonSerializer.SerializeToElement(wrong))); Deny(() => state.Activate(Command("SESSION_ACTIVATE")));
        }
        {
            var state = new CompanionSession(Ready(), () => now); state.Offer(Offer()); state.Commit(Commit()); state.Delivered(); state.Activate(Command("SESSION_ACTIVATE"));
            now = 11000; Check(state.Expired); Deny(() => state.Logout(Command("SESSION_LOGOUT"))); now = 1000; Check(!state.IsActive);
        }
        Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "SESSION_TEST_OK", count })); return 0;
    }
}
