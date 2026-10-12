using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace ApplicationCompanion;

// Self-test diagnostics only. Never emit exception messages, stacks, paths, keys or pipe identifiers.
internal sealed class NativeSelfTestTrace(string test, bool verbose)
{
    private readonly long started = Stopwatch.GetTimestamp();
    private readonly DateTimeOffset startedUtc = DateTimeOffset.UtcNow;
    private readonly List<object> events = [];
    internal int Checks { get; private set; }
    internal void Step(string operation, [CallerLineNumber] int line = 0) =>
        Record(operation, line, null, null);
    private void Record(string operation, int line, string? expected, string? actual)
    {
        if (events.Count < 512) events.Add(new { operation, line, elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds, expected, actual });
    }
    internal void Check(bool value, [CallerLineNumber] int line = 0)
    {
        Record("check", line, "true", value ? "true" : "false");
        if (!value) throw new IOException();
        Checks++;
    }
    internal void Denial(string expected, string actual, int line) => Record("denial", line, expected, actual);
    internal void Report(Exception? error = null)
    {
        if (!verbose && error is null) return;
        Console.Error.WriteLine(JsonSerializer.Serialize(new {
            v = 1, type = "NATIVE_SELF_TEST_DIAGNOSTIC", test, pid = Environment.ProcessId,
            startedUtc, elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds, checks = Checks,
            outcome = error is null ? "passed" : "failed", exception = error?.GetType().Name, hresult = error?.HResult,
            reason = error is NativeLauncherException launcher ? launcher.Reason : error is BackendArtifactException artifact ? artifact.Reason : null,
            events
        }));
    }
}
