using System.Text.Json;
using System.Text.Json.Nodes;

namespace ApplicationCompanion;

internal static class DocumentTests
{
    internal static int Run()
    {
        int count = 0;
        void Check(bool condition) { if (!condition) throw new IOException(); count++; }
        void Deny(Action action) { bool denied = false; try { action(); } catch { denied = true; } Check(denied); }
        string Response(DocumentReadiness gate) => gate.Complete(DocumentReadiness.ApprovedUrl, 42, true).Replace("CHALLENGE", "READY");
        foreach (string url in new[] { "http://companion-fixture.invalid/ready.html", "https://companion-fixture.invalid/other.html",
            DocumentReadiness.ApprovedUrl + "?q=1", DocumentReadiness.ApprovedUrl + "#fragment", "about:blank", "file:///fixture.html",
            "https://user@companion-fixture.invalid/ready.html", "https://rejected.invalid/ready.html" })
        { var gate = new DocumentReadiness(); Check(!gate.Start(url, 42, false)); Check(!gate.IsReady); }
        {
            var gate = new DocumentReadiness(); Check(!gate.Start(DocumentReadiness.ApprovedUrl, 42, true));
        }
        {
            var gate = new DocumentReadiness(); Check(gate.Start(DocumentReadiness.ApprovedUrl, 42, false));
            string response = Response(gate); gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response); Check(gate.IsReady);
            Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response)); Check(!gate.IsReady);
        }
        foreach (string change in new[] { "nonce", "generation", "navigationId", "extra", "v", "type", "duplicate", "oversized", "malformed", "array", "wrong-type" })
        {
            var gate = new DocumentReadiness(); gate.Start(DocumentReadiness.ApprovedUrl, 42, false);
            string response = Response(gate); var data = JsonNode.Parse(response)!.AsObject();
            switch (change)
            {
                case "nonce": data["nonce"] = "wrong"; break;
                case "generation": data["generation"] = 0; break;
                case "navigationId": data["navigationId"] = "41"; break;
                case "extra": data["extra"] = true; break;
                case "v": data["v"] = 2; break;
                case "type": data["type"] = "CHALLENGE"; break;
                case "wrong-type": data["generation"] = "1"; break;
            }
            string bad = change switch { "duplicate" => response.Replace("\"v\":1", "\"v\":1,\"v\":1"), "oversized" => new string('x', 1025), "malformed" => "{", "array" => "[]", _ => data.ToJsonString() };
            Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, bad)); Check(!gate.IsReady);
            Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response));
        }
        foreach (bool messageSource in new[] { true, false })
        {
            var gate = new DocumentReadiness(); gate.Start(DocumentReadiness.ApprovedUrl, 42, false); string response = Response(gate);
            Deny(() => gate.Accept(messageSource ? "https://rejected.invalid/" : DocumentReadiness.ApprovedUrl,
                messageSource ? DocumentReadiness.ApprovedUrl : "https://rejected.invalid/", response));
        }
        {
            long now = 100; var gate = new DocumentReadiness(() => now); gate.Start(DocumentReadiness.ApprovedUrl, 42, false); string response = Response(gate);
            now += DocumentReadiness.ChallengeMilliseconds; Check(gate.Expired);
            Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response)); Check(!gate.IsReady);
        }
        {
            var gate = new DocumentReadiness(); Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, "{}"));
            Check(!gate.Start(DocumentReadiness.ApprovedUrl, 42, false));
        }
        foreach (bool afterReady in new[] { false, true })
        {
            var gate = new DocumentReadiness(); gate.Start(DocumentReadiness.ApprovedUrl, 42, false); string response = Response(gate);
            if (afterReady) gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response);
            Check(!gate.Start(DocumentReadiness.ApprovedUrl, 43, false)); Check(!gate.IsReady); Check(gate.Generation == 2);
            Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response));
        }
        foreach (var completion in new[] { ("https://rejected.invalid/", 42UL, true), (DocumentReadiness.ApprovedUrl, 43UL, true), (DocumentReadiness.ApprovedUrl, 42UL, false) })
        {
            var gate = new DocumentReadiness(); gate.Start(DocumentReadiness.ApprovedUrl, 42, false);
            Deny(() => gate.Complete(completion.Item1, completion.Item2, completion.Item3)); Check(!gate.IsReady);
        }
        {
            var gate = new DocumentReadiness(); gate.Start(DocumentReadiness.ApprovedUrl, 42, false); string response = Response(gate);
            gate.Invalidate(); Deny(() => gate.Accept(DocumentReadiness.ApprovedUrl, DocumentReadiness.ApprovedUrl, response));
        }
        Console.WriteLine(JsonSerializer.Serialize(new { v = 1, type = "DOCUMENT_TEST_OK", count })); return 0;
    }
}
