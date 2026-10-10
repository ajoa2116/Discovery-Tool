using System.Diagnostics;

namespace ApplicationCompanion;

// Kept inside the native boundary; callers receive the existing generic failure.
internal sealed class HttpFixtureDeadlineException : IOException { }

// Independent of cancellation timer delivery and wall-clock adjustments.
internal sealed class HttpFixtureDeadline
{
    private readonly Func<double> elapsed;
    private double previous;
    internal HttpFixtureDeadline(Func<double>? elapsed = null)
    {
        long started = Stopwatch.GetTimestamp();
        this.elapsed = elapsed ?? (() => Stopwatch.GetElapsedTime(started).TotalMilliseconds);
    }
    internal void Check()
    {
        double current = elapsed();
        if (!double.IsFinite(current) || current < previous || current >= 1800) throw new HttpFixtureDeadlineException();
        previous = current;
    }
}
