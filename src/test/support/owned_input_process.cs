using System.IO.Pipes;
using System.Reflection;
using System.Text;
using ApplicationCompanion;
using Microsoft.Win32.SafeHandles;

namespace ApplicationCompanion.TestFixtures;

// Test-only adapter over the UNCHANGED OwnedChild implementation. Its retained
// original SafeHandle reference prevents kernel-handle reuse even after Dispose.
internal sealed class OwnedInputProcess
{
    private static readonly BindingFlags Flags = BindingFlags.Static | BindingFlags.Instance | BindingFlags.NonPublic;
    private readonly object sync = new();
    private readonly MeasuredInputLifetime lease;
    private readonly NamedPipeServerStream pipe;
    private readonly SafePipeHandle channelHandle;
    private OwnedChild? child;
    private SafeFileHandle? birth, job, observation;
    private IntPtr birthValue;
    private bool retained, released, expectedEnd, shutdownRequested;
    private bool disposalRequested, disposalCompleted;
    private bool referenceReleaseAttempted, referenceReleased, closureConfirmed;
    private string? releaseFailure;
    private int diagnosticPid;
    private string fixtureMode = "";
    private bool delayReleased;
    private bool nativeExperimentIssued;
    private MeasuredInputLifetime.ConsumerLease? consumer;
    private Task monitor = Task.CompletedTask;
    private readonly List<string> events = [];
    private bool suppressShutdown = false, suppressWait = false, suppressEvidenceCleanup = false; // reflection-only fault injection
    internal MeasuredInputLifetime.ConsumerLease Consumer => consumer ?? throw new IOException("consumer-unregistered");
    internal bool ResourcesReleased { get { lock (sync) return released && disposalCompleted && referenceReleased && closureConfirmed &&
        !retained && birth is { IsClosed: true } &&
        observation is { IsClosed: true } && job is { IsClosed: true } && channelHandle.IsClosed; } }
    // A conservative pending-resource count, including an ambiguous decrement or
    // unconfirmed closure even when an additional reference is no longer owed.
    internal int OutstandingHandles { get { lock (sync) return (birth is not null && !closureConfirmed ? 1 : 0) +
        (job is { IsClosed: false } ? 1 : 0) + (channelHandle.IsClosed ? 0 : 1); } }
    internal object Evidence { get { lock (sync) return new { pid = diagnosticPid, retained, released,
        birthHandleClosed = birth?.IsClosed, observationClosed = observation?.IsClosed, jobClosed = job?.IsClosed, pipeClosed = channelHandle.IsClosed,
        shutdownRequested, disposalRequested, disposalCompleted, referenceReleaseAttempted, referenceReleased, closureConfirmed,
        additionalReferenceOutstanding = retained && !referenceReleaseAttempted,
        referenceReleaseUncertain = referenceReleaseAttempted && !referenceReleased,
        releaseFailure, events = events.ToArray(), productionAuthority = false }; } }
    private OwnedInputProcess(MeasuredInputLifetime owner, NamedPipeServerStream channel)
    { lease = owner; pipe = channel; channelHandle = channel.SafePipeHandle; }
    private static T Field<T>(OwnedChild child, string name) =>
        typeof(OwnedChild).GetField(name, Flags)?.GetValue(child) is T value ? value : throw new IOException("owned-child-layout");
    private uint Wait(uint milliseconds)
    {
        if (!retained || referenceReleaseAttempted || observation is null || observation.IsClosed || observation.IsInvalid ||
            observation.DangerousGetHandle() != birthValue || birth is null || birth.DangerousGetHandle() != birthValue)
            throw new IOException("process-identity-lost");
        if (suppressWait) return 0xffffffff; // deterministic unknown wait, never interpreted as exit
        return (uint)(typeof(OwnedChild).GetMethod("WaitForSingleObject", Flags)?.Invoke(null, [observation, milliseconds])
            ?? throw new IOException("owned-child-layout"));
    }
    internal static OwnedInputProcess Start(MeasuredInputLifetime owner, MeasuredInputLifetime.HandoffEvidence handoff,
        string mode, params string[] paths)
    {
        if (mode is not ("normal" or "delayed" or "crash" or "channel-loss" or "native-loader")) throw new IOException("process-fixture-mode");
        // The test runner invokes this project's apphost, never dotnet's shared host.
        string image = Environment.ProcessPath ?? throw new IOException("fixture-image");
        if (Path.GetFileName(image) != "fixture.exe" || !File.Exists(Path.Combine(AppContext.BaseDirectory, "fixture.dll")))
            throw new IOException("fixture-apphost-required");
        string name = WindowsBoundary.NewPipeName();
        var result = new OwnedInputProcess(owner, WindowsBoundary.CreatePipe(name));
        result.fixtureMode = mode;
        try
        {
            var start = typeof(OwnedChild).GetMethod("StartOwned", Flags) ?? throw new IOException("owned-child-layout");
            Action<OwnedChild> register = owned =>
            {
                result.child = owned;
                result.diagnosticPid = owned.Process.Id;
                result.birth = Field<SafeFileHandle>(owned, "processHandle");
                result.job = Field<SafeFileHandle>(owned, "job");
                result.birth.DangerousAddRef(ref result.retained);
                result.birthValue = result.birth.DangerousGetHandle();
                result.observation = new SafeFileHandle(result.birthValue, ownsHandle: false);
                // StartOwned has checked atomic Job membership and has NOT resumed.
                if (!owned.Alive || result.Wait(0) != 0x102 || result.job.IsClosed || result.job.IsInvalid)
                    throw new IOException("owned-registration");
                result.events.Add("registered-suspended-birth-handle-and-job");
                result.consumer = owner.BeginProcessConsumption(handoff, result, paths);
            };
            _ = start.Invoke(null, [image, new StringBuilder($"\"{image}\" --owned-input-child {name} {Environment.ProcessId} {mode}"),
                false, IntPtr.Zero, AppContext.BaseDirectory, register, false, null]);
            using var timeout = new CancellationTokenSource(3000);
            result.pipe.WaitForConnectionAsync(timeout.Token).GetAwaiter().GetResult();
            result.child!.Verify(result.pipe); // existing same-image/session channel check, not exit proof
            byte[] ready = new byte[1];
            result.pipe.ReadExactlyAsync(ready, timeout.Token).AsTask().GetAwaiter().GetResult();
            if (ready[0] != 1) throw new IOException("child-readiness");
            // The single native experiment has a bounded framed response before
            // EOF monitoring starts; no competing reader can consume its report.
            if (mode != "native-loader") result.monitor = result.Monitor();
            return result;
        }
        catch
        {
            if (result.consumer is not null) owner.FailConsumption(result.consumer);
            else
            {
                result.child?.Dispose(); result.pipe.Dispose(); result.observation?.Dispose();
                if (result.retained) { result.birth!.DangerousRelease(); result.retained = false; }
            }
            throw;
        }
    }
    internal void RequireBinding(MeasuredInputLifetime owner, MeasuredInputLifetime.ConsumerLease token)
    {
        lock (sync)
        {
            // During suspended registration only this owner may install its token.
            if (!ReferenceEquals(owner, lease) || released || !retained ||
                (consumer is not null && !ReferenceEquals(consumer, token))) throw new IOException("foreign-process-consumer");
            _ = Wait(0); // also checks the retained handle wrapper, never a PID lookup
        }
    }
    internal void RequireUnbound(MeasuredInputLifetime owner)
    {
        lock (sync)
        {
            if (!ReferenceEquals(owner, lease) || consumer is not null || released || !retained || child is null ||
                job is null || job.IsClosed || job.IsInvalid || Wait(0) != 0x102)
                throw new IOException("process-registration-unavailable");
        }
    }
    internal void RegisterConsumer(MeasuredInputLifetime owner, MeasuredInputLifetime.ConsumerLease token)
    {
        lock (sync)
        {
            // RequireUnbound ran before the owner's BeginConsumption. No fallible
            // native work between installing the owner's binding and this token.
            if (!ReferenceEquals(owner, lease) || consumer is not null) throw new IOException("foreign-process-consumer");
            consumer = token;
        }
    }
    internal bool ConfirmExit(MeasuredInputLifetime owner, MeasuredInputLifetime.ConsumerLease token, uint milliseconds = 0)
    {
        lock (sync)
        {
            RequireBinding(owner, token);
            uint status = Wait(milliseconds);
            if (status == 0) { events.Add("exact-birth-handle-signaled"); return true; }
            if (status == 0x102) { events.Add("exact-birth-wait-timeout"); return false; }
            events.Add("exact-birth-wait-unconfirmed:" + status);
            throw new IOException("process-wait-unconfirmed:" + status);
        }
    }
    internal void RequireActive(MeasuredInputLifetime owner, MeasuredInputLifetime.ConsumerLease token)
    {
        lock (sync)
        {
            RequireBinding(owner, token);
            if (expectedEnd || shutdownRequested || Wait(0) != 0x102) throw new MeasuredInputLifetime.Rejected("process-not-active");
        }
    }
    internal void FinishNormally()
    {
        lock (sync)
        {
            if (shutdownRequested || expectedEnd || released) throw new IOException("process-end-replay");
            expectedEnd = true; pipe.WriteByte(2); pipe.Flush();
        }
    }
    internal NativeDllExperiment.Report RunNativeExperiment(MeasuredInputLifetime.InertLoaderBoundary boundary,
        MeasuredInputLifetime.InertLoadRequest primary, MeasuredInputLifetime.InertLoadRequest probe, MeasuredInputLifetime.InertLoadRequest dependency,
        MeasuredInputLifetime.InertLoadRequest allowedProbe, MeasuredInputLifetime.InertLoadRequest allowedDependency)
    {
        lease.CheckConsumption(Consumer);
        var command = boundary.PrepareNativeExperiment(Consumer, this, primary, probe, dependency, allowedProbe, allowedDependency);
        lock (sync)
        {
            RequireActive(lease, Consumer);
            if (fixtureMode != "native-loader" || nativeExperimentIssued) throw new IOException("native-experiment-replay");
            nativeExperimentIssued = true;
            pipe.WriteByte(4); NativeDllExperiment.Write(pipe, command);
            var report = NativeDllExperiment.Read<NativeDllExperiment.Report>(pipe);
            monitor = Monitor();
            return report; // diagnostic child report, never process-exit authority
        }
    }
    internal void AllowDelayedExit()
    {
        lock (sync)
        {
            if (fixtureMode != "delayed" || !expectedEnd || delayReleased || shutdownRequested || released)
                throw new IOException("delayed-exit-state");
            delayReleased = true; pipe.WriteByte(3); pipe.Flush();
        }
    }
    private async Task Monitor()
    {
        try { byte[] unexpected = new byte[1]; _ = await pipe.ReadAsync(unexpected); }
        catch (IOException) { }
        catch (ObjectDisposedException) { }
        bool lost; lock (sync) lost = !expectedEnd && !shutdownRequested && !released;
        if (lost)
        {
            try { lease.ChannelLostConsumption(Consumer); }
            catch (MeasuredInputLifetime.Rejected) { lock (sync) events.Add("channel-loss-already-terminal"); }
        }
    }
    private void RequestOwnedDisposal()
    {
        if (disposalRequested)
        {
            if (!disposalCompleted) throw new IOException("owned-disposal-unconfirmed");
            return;
        }
        disposalRequested = true;
        try { child!.Dispose(); disposalCompleted = true; }
        catch (Exception error) { releaseFailure = error.ToString(); throw; }
        // Returning from disposal is distinct from closure of an add-referenced handle.
    }
    internal void RequestShutdown()
    {
        lock (sync)
        {
            if (released || shutdownRequested) return;
            events.Add("bounded-owned-shutdown-request");
            if (suppressShutdown) { events.Add("injected-shutdown-not-performed"); return; }
            shutdownRequested = true;
            // OwnedChild closes the Job and makes bounded waits. DangerousAddRef
            // keeps the ORIGINAL birth handle physically open across its disposal.
            RequestOwnedDisposal(); pipe.Dispose();
            events.Add("owned-dispose-returned-not-exit-proof");
        }
    }
    internal void ReleaseEvidence(MeasuredInputLifetime owner, MeasuredInputLifetime.ConsumerLease token)
    {
        lock (sync)
        {
            if (released) return;
            // Neither an ambiguous decrement nor an unconfirmed post-release
            // state permits another wait through the invalidated wrapper or retry.
            if (referenceReleaseAttempted) throw new IOException("process-reference-release-already-issued");
            if (!ConfirmExit(owner, token)) throw new IOException("exit-not-confirmed");
            if (suppressEvidenceCleanup) throw new IOException("Injected process evidence cleanup suppression");
            expectedEnd = true; RequestOwnedDisposal(); pipe.Dispose();
            if (job is not { IsClosed: true } || !channelHandle.IsClosed)
                throw new IOException("owned-cleanup-inconclusive");
            observation!.Dispose(); // non-owning wrapper: invalidate before the last reference can close
            if (!observation.IsClosed) throw new IOException("observation-close-unconfirmed");
            referenceReleaseAttempted = true; // irrevocable accounting BEFORE the dangerous decrement
            events.Add("additional-reference-release-issued");
            try
            {
                birth!.DangerousRelease();
                referenceReleased = true; retained = false;
            }
            catch (Exception error)
            {
                releaseFailure = error.ToString();
                events.Add("additional-reference-release-uncertain");
                throw; // do not infer whether a throwing call already decremented
            }
            closureConfirmed = birth.IsClosed && observation.IsClosed && job.IsClosed && channelHandle.IsClosed;
            if (!closureConfirmed)
            {
                releaseFailure = "process-closure-unconfirmed";
                throw new IOException(releaseFailure);
            }
            released = true;
            events.Add("process-evidence-released-after-input-cleanup");
        }
    }
    internal void AwaitMonitor() => monitor.GetAwaiter().GetResult();
    internal static int Child(string[] args)
    {
        if (args.Length != 4 || !WindowsBoundary.ValidPipeName(args[1]) || !int.TryParse(args[2], out int parent) ||
            args[3] is not ("normal" or "delayed" or "crash" or "channel-loss" or "native-loader")) return 2;
        using var channel = WindowsBoundary.Connect(args[1], parent).GetAwaiter().GetResult();
        channel.WriteByte(1); channel.Flush();
        if (args[3] == "native-loader")
        {
            if (channel.ReadByte() != 4) return 3;
            var command = NativeDllExperiment.Read<NativeDllExperiment.Command>(channel);
            NativeDllExperiment.Write(channel, NativeDllExperiment.Child(command));
        }
        if (args[3] == "channel-loss") { channel.Dispose(); Thread.Sleep(1500); return 0; }
        if (channel.ReadByte() != 2) return 3;
        if (args[3] == "delayed" && channel.ReadByte() != 3) return 3; // deterministic live gate, no scheduling assumption
        if (args[3] == "crash") Environment.Exit(7); // controlled abnormal exit, no crash dump/provider
        return 0;
    }
}
