using System.Text;
using System.Text.Json;

namespace ApplicationCompanion;

internal sealed class Wire(Stream input, Stream output)
{
    internal const int Maximum = 16384;
    public async Task<JsonElement> Read(int timeoutMs = 5000)
    {
        using var timeout = new CancellationTokenSource(timeoutMs);
        using var bytes = new MemoryStream(); var one = new byte[1];
        while (true)
        {
            if (await input.ReadAsync(one, timeout.Token).AsTask().WaitAsync(timeout.Token) == 0) throw new IOException("CHANNEL_CLOSED");
            if (one[0] == 10) break;
            if (bytes.Length >= Maximum) throw new InvalidDataException("FRAME_TOO_LARGE");
            bytes.WriteByte(one[0]);
        }
        using var document = JsonDocument.Parse(new UTF8Encoding(false, true).GetString(bytes.ToArray()), new JsonDocumentOptions { MaxDepth = 12 });
        var value = document.RootElement.Clone();
        if (value.ValueKind != JsonValueKind.Object || value.GetProperty("v").GetInt32() != 1) throw new InvalidDataException("PROTOCOL_REJECTED");
        return value;
    }
    public async Task Send(object value)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
        if (bytes.Length > Maximum) throw new InvalidDataException("FRAME_TOO_LARGE");
        using var timeout = new CancellationTokenSource(5000);
        await output.WriteAsync(bytes, timeout.Token).AsTask().WaitAsync(timeout.Token);
        await output.WriteAsync(new byte[] { 10 }, timeout.Token).AsTask().WaitAsync(timeout.Token);
        await output.FlushAsync(timeout.Token).WaitAsync(timeout.Token);
    }
    public static void Shape(JsonElement value, string type, params string[] extra)
    {
        if (value.GetProperty("type").GetString() != type) throw new InvalidDataException("PROTOCOL_REJECTED");
        var keys = new HashSet<string>(["v", "type", .. extra]);
        foreach (var p in value.EnumerateObject()) if (!keys.Remove(p.Name)) throw new InvalidDataException("PROTOCOL_REJECTED");
        if (keys.Count != 0) throw new InvalidDataException("PROTOCOL_REJECTED");
    }
    public static string Text(JsonElement value, string key, int limit = 256)
    {
        var text = value.GetProperty(key).GetString();
        if (string.IsNullOrEmpty(text) || text.Length > limit) throw new InvalidDataException("PROTOCOL_REJECTED");
        return text;
    }
}
