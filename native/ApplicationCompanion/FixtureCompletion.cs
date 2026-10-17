using System.Text.Json;
namespace ApplicationCompanion;

// Fixture completion evidence only; never an authority receipt or release verifier.
internal static class FixtureCompletion
{
    private static void RejectDuplicateMembers(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new IOException("fixture-completion-duplicate-member");
                RejectDuplicateMembers(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array)
            foreach (var item in value.EnumerateArray()) RejectDuplicateMembers(item);
    }
    internal static JsonDocument Read(string file)
    {
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        if (stream.Length is <= 0 or > 1048576) throw new IOException("fixture-completion-size");
        byte[] bytes = new byte[checked((int)stream.Length)]; stream.ReadExactly(bytes);
        var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 });
        try { RejectDuplicateMembers(document.RootElement); return document; }
        catch { document.Dispose(); throw; }
    }
    internal static void Require(int exitCode, JsonElement report, bool expectedPassed, bool bridge)
    {
        RejectDuplicateMembers(report);
        bool Is(JsonElement value, string name, bool expected) => value.TryGetProperty(name, out var field) &&
            field.ValueKind == (expected ? JsonValueKind.True : JsonValueKind.False);
        if (exitCode != 0 || !Is(report,"terminal",true) || !Is(report,"passed",expectedPassed) || !Is(report,"productionAuthority",false) ||
            report.TryGetProperty("cleanupFailureCode",out _)) throw new IOException("fixture-completion");
        if (!bridge) return;
        if (!report.TryGetProperty("native",out var native) || !Is(native,"ended",true) || !Is(native,"handlesClosed",true) ||
            !Is(native,"referencesReleased",true) || !Is(native,"activeWork",false)) throw new IOException("fixture-native-cleanup");
        if (expectedPassed && (!report.TryGetProperty("fixture",out var fixture) || !Is(fixture,"shutdownComplete",true) ||
            !Is(fixture,"listening",false) || fixture.GetProperty("connections").GetInt32()!=0 || fixture.GetProperty("pendingClients").GetInt32()!=0))
            throw new IOException("fixture-lifecycle-cleanup");
    }
    internal static void RequirePositiveBridge(int exitCode, JsonElement report) => Require(exitCode,report,true,true);
    internal static int SelfTest()
    {
        try {
            using var valid=JsonDocument.Parse("{\"terminal\":true,\"passed\":true,\"productionAuthority\":false}");
            Require(0,valid.RootElement,true,false);
            int denials=0;
            foreach(var json in new[]{"{}","{\"terminal\":false,\"passed\":true,\"productionAuthority\":false}",
                "{\"terminal\":true,\"passed\":false,\"productionAuthority\":false}",
                "{\"terminal\":true,\"passed\":true,\"productionAuthority\":true}",
                "{\"terminal\":true,\"passed\":true,\"productionAuthority\":false,\"cleanupFailureCode\":\"EIO\"}"}) {
                using var doc=JsonDocument.Parse(json);try{Require(0,doc.RootElement,true,false);throw new Exception("accepted-invalid-completion");}catch(IOException){denials++;}
            }
            try{Require(1,valid.RootElement,true,false);throw new Exception("accepted-failed-exit");}catch(IOException){denials++;}
            try{Require(0,valid.RootElement,true,true);throw new Exception("accepted-missing-cleanup");}catch(IOException){denials++;}
            // All new cases are inert JSON. Require must validate even without Read.
            const string bridgeJson = """{"terminal":true,"passed":true,"productionAuthority":false,"native":{"ended":true,"handlesClosed":true,"referencesReleased":true,"activeWork":false},"fixture":{"shutdownComplete":true,"listening":false,"connections":0,"pendingClients":0}}""";
            var duplicateReports = new List<string>();
            foreach (var (name, value, other) in new[] {
                ("terminal", "true", "false"), ("passed", "true", "false"), ("productionAuthority", "false", "true"),
                ("ended", "true", "false"), ("handlesClosed", "true", "false"), ("referencesReleased", "true", "false"), ("activeWork", "false", "true"),
                ("shutdownComplete", "true", "false"), ("listening", "false", "true"), ("connections", "0", "1"), ("pendingClients", "0", "1") })
            {
                string original = $"\"{name}\":{value}";
                duplicateReports.Add(bridgeJson.Replace(original, $"\"{name}\":{other},\"{name}\":{value}"));
                duplicateReports.Add(bridgeJson.Replace(original, $"\"{name}\":{value},\"{name}\":{other}"));
            }
            foreach (string pair in new[] { "\"marker\":0,\"marker\":1", "\"marker\":1,\"marker\":0" })
                duplicateReports.Add(bridgeJson[..^1] + ",\"diagnostics\":[{\"nested\":{\"marker\":0}},{\"nested\":{\"marker\":1}},{\"nested\":{" + pair + "}}]}");
            duplicateReports.Add(bridgeJson.Replace("\"native\":{", "\"native\":{},\"native\":{"));
            duplicateReports.Add(bridgeJson.Replace("\"terminal\":true", "\"term\\u0069nal\":false,\"terminal\":true"));
            int validReports = 1, directDuplicateDenials = 0, readDuplicateDenials = 0, readHandlesReleased = 0;
            void ExpectDuplicate(Action action)
            {
                try { action(); throw new Exception("accepted-duplicate-completion"); }
                catch (IOException error) when (error.Message == "fixture-completion-duplicate-member") { denials++; }
            }
            // Same names in different objects, case-distinct and non-normalized names remain valid.
            string distinctJson = bridgeJson[..^1] + ",\"diagnostics\":[{\"marker\":0},{\"marker\":1},{\"nested\":[{\"marker\":2},{\"marker\":3}]}],\"Marker\":0,\"marker\":1,\"e\\u0301\":0,\"\\u00e9\":1}";
            foreach (string json in new[] { bridgeJson, distinctJson })
            {
                using var doc = JsonDocument.Parse(json);
                Require(0, doc.RootElement, true, true); validReports++;
            }
            foreach (string json in duplicateReports)
            {
                using var doc = JsonDocument.Parse(json);
                ExpectDuplicate(() => Require(0, doc.RootElement, true, true)); directDuplicateDenials++;
            }
            // Exercise the actual bounded file reader in one fresh, non-executable test root.
            var root = Directory.CreateTempSubdirectory("discovery-completion-");
            string file = Path.Combine(root.FullName, "report.json");
            try
            {
                foreach (string json in new[] { bridgeJson, distinctJson })
                {
                    File.WriteAllText(file, json);
                    using var doc = Read(file);
                    Require(0, doc.RootElement, true, true); validReports++;
                }
                foreach (string json in duplicateReports)
                {
                    File.WriteAllText(file, json);
                    ExpectDuplicate(() => { using var unexpected = Read(file); }); readDuplicateDenials++;
                    using var exclusive = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None);
                    readHandlesReleased++; // Reader streams must be closed after rejection.
                }
            }
            finally { File.Delete(file); Directory.Delete(root.FullName); } // Only this owned file/root, never recursive.
            if (Directory.Exists(root.FullName)) throw new IOException("fixture-completion-cleanup");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, denials, validReports, directDuplicateDenials,
                readDuplicateDenials, readHandlesReleased, productionAuthority = false })); return 0;
        }catch(Exception e){Console.Error.WriteLine(e.GetType().Name);return 1;}
    }
}
