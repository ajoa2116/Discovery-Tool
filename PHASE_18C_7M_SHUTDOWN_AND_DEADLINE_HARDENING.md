# Phase 18C.7M — Shutdown and Deadline Hardening

Starting checkpoint verified before edits: branch `codex/post-field-corrections-1`, HEAD `7f1e3e12f3e15dad2c2c9b3cb1e66351dfe5f9ec`, clean Git status. Master Blueprint v1.1 remains authoritative. No standalone blueprint is present in this checkout; the established baseline contracts and prior phase reports were used, and production safety gates remain unchanged.

## Shutdown completion

The isolated fixture publishes one shared shutdown promise and terminal state before any synchronous abort callback can reenter `stop()`. All concurrent, repeated and reentrant calls return that exact promise. Authority is denied immediately; the promise resolves only after cleanup has completed.

Shutdown joins listen startup before deciding whether to close an HTTP listener. A listener that binds after shutdown was requested is closed and awaited before failed construction returns. Listen errors and synchronous startup failures settle the startup barrier. The startup error listener is removed after successful listen settlement. Trusted test hooks observe the pending-listen boundary and its allocated diagnostic port; they cannot choose/register a port, pin or credential destination.

Shutdown also waits for WebSocket-server closure, accepted raw TCP close callbacks, and the completion of owned HTTP/upgrade handlers. Pending work now records completion promises, resolved after handler cancellation listeners and timers are removed. The accepted connection registry records actual close completion rather than treating a destroy request as proof of exit. Authenticated sockets are terminated, outbound timers are cleared, and owner-lifetime listeners are removed. Snapshot diagnostics distinguish immediate revocation from confirmed shutdown and expose no secrets.

The new tests initially found that HTTPS/WebSocket closure could precede raw TCP close callbacks. Shutdown was extended to join those callbacks; immediate post-close resource assertions now pass without an extra event-loop delay.

## Deterministic native deadline proof

The weak delayed-WS fixture has been replaced with complete valid TLS/HTTP/WS exchanges. The native self-test runs four scenarios: delayed complete HTTP response, headers plus a partial HTTP body followed by delayed body completion, delayed valid WS upgrade, and delayed valid WS event after a successful upgrade.

Each scenario has a positive control at elapsed 1,799 ms and negative cases at 1,800 and 1,801 ms. The wire response/event is identical across those cases. A WS event is a complete valid text frame containing the expected fixed synthetic event. The server keeps TLS open until the probe finishes, preventing peer closure from masquerading as deadline rejection. The delayed-body case sends valid headers and a body prefix before releasing the remaining bytes.

Cancellation scheduling is suppressed through the existing internal native test seam. Negative cases require an internal elapsed-deadline exception, successful server writes, and evidence that the actual network await completed. Positive controls must complete successfully. A transport error or generic exception cannot satisfy elapsed-deadline assertions. Four additional scenarios revoke a probe while its response, body, upgrade or event is pending and verify cancellation separately.

Nonsecret internal checkpoint callbacks synchronize the test after connect and around completed awaits. They are absent from production construction and cannot be selected via IPC. The internal deadline exception never crosses the existing generic companion error boundary. Native TLS pin checks, fixed destinations, credential attachment and the 256-byte receive limits are unchanged.

The native self-test completes **16 network cases and 94 assertions**, including invalid/regressing elapsed clocks and expiry during certificate verification. It uses no sleep to trigger the tested deadline boundaries. A separate five-second test watchdog bounds failed test I/O.

## Files and preserved scope

- `src/server/isolated_http_ws_fixture.ts`: shared idempotent shutdown, startup/closure barriers, pending-handler and raw-socket completion, and trusted lifecycle test hooks.
- `src/test/isolated_http_ws_fixture.test.ts`: concurrent/reentrant stop, pending-listen shutdown, port reuse, complete WS/TCP/work cleanup, revocation and disconnect/completion races.
- `native/ApplicationCompanion/HttpFixtureProof.cs`: internal nonsecret test checkpoints, with existing authorization and deadline checks preserved.
- `native/ApplicationCompanion/HttpFixtureDeadline.cs`: internal deadline failure classification for precise test assertions.
- `native/ApplicationCompanion/HttpFixtureDeadlineTests.cs`: valid delayed-response/event matrix with positive controls and pending revocation cases.
- This report.

The hardened owner binding, companion/session protocol, exact Host/Origin policy and resource limits are preserved. Production server routes/authentication, React/UI/core, camera IPC, adapters, launchers/scripts, Vite/package configuration, native camera/bootstrap hosts and production gates have no source changes. No application/service restart or network-setting change was performed. Validation launches only isolated test fixtures and ephemeral loopback listeners.

## Validation

Targeted shutdown/deadline selection: **13 passed, zero failed/cancelled/skipped**. This includes 12 new lifecycle/race cases and the strengthened native deadline test. The native companion Release build and self-test passed; independent TypeScript checking passed.

The complete focused regression passed **197 tests, zero failed/cancelled/skipped**, in 579.3 seconds, including all **41 isolated HTTP/WS fixture tests**. It covers companion lifecycle, monotonic boundary timing, session authority, asynchronous bootstrap delivery, restricted private transport, HTTP/WS Host policy and actual Vite proxy Origin preservation. Owned-process cleanup checks passed.

Independent `npx tsc --noEmit` passed. Release builds for `ApplicationCompanion`, `BootstrapTransport` and `CameraBrowserHost` passed with zero warnings/errors. `npm run build` passed (TypeScript, Vite production bundle and deterministic build identity). `git diff --check` passed, and an explicit comparison against the starting checkpoint confirmed the excluded production routes, authorities, UI/core, adapters/scripts, camera/bootstrap hosts, companion protocol and Vite/package configuration are unchanged. Staged diff checks passed before commit.

## Limitations

This is an isolated synthetic proof and does not approve real HTTP/WS API integration or credential forwarding through Vite. The existing Vite regression verifies its Host rewrite and Origin preservation only. A native WS probe still receives one fixed event and exits; server tests cover persistent fixture socket revocation separately.

Cancellation remains cooperative. An uncooperative trusted hook may continue its own computation after abort, but the owned upgrade handler releases its slot and cannot admit late work. Shutdown joins owned handlers, not arbitrary promises created by a hook. Cleanup cannot execute while the process/OS is suspended, and already transmitted bytes cannot be recalled. Deployment integrity, same-user process compromise, elevated-parent/de-elevation, secure memory erasure and secure profile deletion remain outside this milestone.

Commit message: **Harden isolated fixture shutdown and deadlines**.

STOP after Phase 18C.7M. Do not begin Phase 18C.7N.
