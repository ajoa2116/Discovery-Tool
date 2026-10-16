// Compilation-only guards for the unselected entrypoints of the linked,
// byte-for-byte production OwnedChild source. None can authenticate or launch.
// The external test project selects ONLY its private StartOwned implementation.
namespace ApplicationCompanion;
internal static class Program { internal static string[] Modes => []; }
internal static class NativeLauncherLease { internal static string[] Modes => []; }
internal static class VerifiedNodeFixture { internal static string RuntimePath => throw new IOException("Node excluded from process-lifetime fixture"); }
internal sealed class BackendArtifactException(string reason) : IOException(reason);
internal sealed class VerifiedBackendArtifacts
{
    internal void Check() => throw new IOException("Artifacts excluded");
    internal void ClaimNodeFixture() => throw new IOException("Node excluded");
    internal void MatchImageFile(string path) => throw new IOException("Runtime loading excluded");
    internal void MatchNodeFixtureImage(string path) => throw new IOException("Node excluded");
}
internal static class NodeBridgeFixture
{
    internal static string[] Modes => [];
    internal static void VerifyClient(System.IO.Pipes.PipeStream pipe, Microsoft.Win32.SafeHandles.SafeFileHandle birth, int pid)
        => throw new IOException("Native bridge excluded");
}
