using System.Text.Json;
namespace ApplicationCompanion;

// Fixture completion evidence only; never an authority receipt or release verifier.
internal static class FixtureCompletion
{
    internal static JsonDocument Read(string file)
    {
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        if (stream.Length is <= 0 or > 1048576) throw new IOException("fixture-completion-size");
        byte[] bytes = new byte[checked((int)stream.Length)]; stream.ReadExactly(bytes);
        return JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 });
    }
    internal static void Require(int exitCode, JsonElement report, bool expectedPassed, bool bridge)
    {
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
            Console.WriteLine(JsonSerializer.Serialize(new{passed=true,denials,productionAuthority=false}));return 0;
        }catch(Exception e){Console.Error.WriteLine(e.GetType().Name);return 1;}
    }
}
