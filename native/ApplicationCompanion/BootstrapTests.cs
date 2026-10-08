using System.Text.Json;
using System.Text.Json.Nodes;

namespace ApplicationCompanion;

internal static class BootstrapTests
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
        string token = "bootstrap_" + new string('a', 43), nonce = new string('b', 64), id = "11111111-1111-1111-1111-111111111111";
        JsonElement Offer() => JsonSerializer.SerializeToElement(new { v = 1, type = "OFFER", token, id, nonce, generation = 1, expiresAt = now + 10000 });
        JsonElement Commit() => JsonSerializer.SerializeToElement(new { v = 1, type = "COMMIT", nonce, generation = 1 });
        JsonElement Command(string type) => JsonSerializer.SerializeToElement(new { v = 1, type, id, generation = 1 });
        {
            var state = new CompanionBootstrap(Ready(), () => now);
            Check(JsonSerializer.SerializeToElement(state.Offer(Offer())).GetProperty("type").GetString() == "ACK");
            Check(JsonSerializer.SerializeToElement(state.Commit(Commit())).GetProperty("type").GetString() == "DONE");
            state.Delivered(); Check(JsonSerializer.SerializeToElement(state.Activate(Command("ACTIVATE"))).GetProperty("type").GetString() == "ACTIVATED");
            Check(JsonSerializer.SerializeToElement(state.Redeem(Command("REDEEM"))).GetProperty("token").GetString() == token);
            Deny(() => state.Redeem(Command("REDEEM"))); Deny(() => state.Offer(Offer()));
        }
        foreach (string field in new[] { "token", "nonce", "id", "generation", "expiresAt", "extra", "duplicate" })
        {
            var state = new CompanionBootstrap(Ready(), () => now); var offer = JsonNode.Parse(Offer().GetRawText())!;
            if (field == "generation") offer[field] = 2;
            else if (field == "expiresAt") offer[field] = now;
            else if (field == "extra") offer[field] = true;
            else offer[field] = "wrong";
            var wrong = field == "duplicate" ? JsonDocument.Parse(Offer().GetRawText().Replace("\"v\":1", "\"v\":1,\"v\":1")).RootElement.Clone() : JsonSerializer.SerializeToElement(offer);
            Deny(() => state.Offer(wrong)); Deny(() => state.Offer(Offer())); Deny(() => state.Activate(Command("ACTIVATE"))); Deny(() => state.Redeem(Command("REDEEM")));
        }
        foreach (int stage in new[] { 0, 1, 2 })
        {
            var state = new CompanionBootstrap(Ready(), () => now);
            if (stage >= 1) state.Offer(Offer()); if (stage >= 2) state.Commit(Commit());
            Deny(() => state.Activate(Command("ACTIVATE"))); Deny(() => state.Redeem(Command("REDEEM")));
        }
        foreach (bool expired in new[] { false, true })
        {
            var document = Ready(); var state = new CompanionBootstrap(document, () => now); state.Offer(Offer());
            if (expired) now += 10000; else document.Invalidate();
            Deny(() => state.Commit(Commit())); Deny(() => state.Redeem(Command("REDEEM"))); now = 1000;
        }
        foreach (bool activated in new[] { false, true })
        {
            var document = Ready(); var state = new CompanionBootstrap(document, () => now); state.Offer(Offer()); state.Commit(Commit()); state.Delivered();
            if (activated) state.Activate(Command("ACTIVATE")); document.Invalidate();
            Deny(() => state.Activate(Command("ACTIVATE"))); Deny(() => state.Redeem(Command("REDEEM")));
        }
        {
            var state = new CompanionBootstrap(new DocumentReadiness(), () => now); Deny(() => state.Offer(Offer()));
        }
        {
            var state = new CompanionBootstrap(Ready(), () => now); state.Offer(Offer());
            var wrong = JsonSerializer.SerializeToElement(new { v = 1, type = "COMMIT", nonce, generation = 2 });
            Deny(() => state.Commit(wrong)); Deny(() => state.Commit(Commit()));
        }
        {
            var state = new CompanionBootstrap(Ready(), () => now); state.Offer(Offer()); state.Commit(Commit()); state.Delivered();
            now += 10000; Deny(() => state.Activate(Command("ACTIVATE"))); now = 1000; Deny(() => state.Activate(Command("ACTIVATE")));
        }
        Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "BOOTSTRAP_TEST_OK", count })); return 0;
    }
}
