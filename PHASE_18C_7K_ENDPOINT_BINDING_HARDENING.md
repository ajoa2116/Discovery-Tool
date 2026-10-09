# Phase 18C.7K — Endpoint Binding Hardening

Checkpoint verified before edits: branch `codex/post-field-corrections-1`, HEAD `b9c10f12f142bc0368fac8e724d8da6acfa029f5`, clean Git status. Master Blueprint v1.1 remains authoritative. No standalone blueprint is present in this checkout, as recorded in earlier phase reports; existing baseline contracts and production safety gates are preserved.

## Architecture and resolved findings

The owner now constructs and retains one fixture binding in private fields. Construction is reserved synchronously before any await, so concurrent construction cannot replace it. A failed or closed fixture cannot be rebound within that owner lifetime. The public entry point delegates to this owner-controlled construction; the internal builder creates resources but cannot register an endpoint with an owner.

`owner.probeHttpFixture(fixture, operation, signal)` accepts only the exact original fixture handle by object identity. It never reads caller endpoint fields. A separate frozen port/pin snapshot stays inside the owner's binding. Public endpoint diagnostics, copies, fabricated objects, foreign-owner handles and stale handles confer no credential-use authority. Rejection precedes the private native transport call, including the first call. Native code additionally retains its existing immutable first port/pin lock as defense in depth; its initial descriptor now comes exclusively from the owner's private binding.

Fixture closure has a terminal lifetime signal. The owner checks it before transport dispatch and after the await, combines it with owner revocation and caller cancellation, and removes all forwarding listeners in `finally`. Closing an endpoint cancels an in-flight native probe; closure before the first probe rejects locally without terminating an otherwise live owner. Endpoint replacement requires a new owner/session lifetime.

Every native probe now has an independent 1.8-second elapsed deadline using `Stopwatch`, alongside the existing cancellation timer. Checks cover session liveness and cancellation, credential attachment, both sides of certificate pin validation, HTTP send/body completion, WS connect/receive completion, and final success. A delayed cancellation callback cannot authorize late completion. Invalid or regressing injected test clocks fail closed. Production clock and timer behavior cannot be selected through IPC.

Pending WS upgrade work now observes socket end, close and error immediately. Disconnect aborts the work signal and releases the pending slot without waiting for the hook or the one-second timeout. Aborted upgrades destroy the connection; late hook completion cannot admit a socket. Handler-owned socket and abort listeners are removed on every exit. HTTP work also removes its response-close and abort listeners. Fixture shutdown removes its owner-lifetime listener.

## Preserved boundaries

Hardened owner/session activation and receipt identity, exact Host/Origin rules, revocation, native TLS pinning, redirect/proxy/cookie refusal, fixed loopback destinations, generic errors and existing connection/payload/queue/time limits remain in place. Credentials remain in native/trusted server memory and verified private IPC; they do not enter browser JavaScript, URLs, logs or error text. No real API routes, React, camera IPC, adapters, launchers, production authentication or safety gates were changed. No app/service restart or network-setting change was performed. Tests launch only isolated native fixtures and ephemeral loopback listeners.

## Files

- `src/server/companion_bootstrap_authority.ts`: private immutable owner binding, opaque handle checks and combined cancellation.
- `src/server/isolated_http_ws_fixture.ts`: owner-controlled construction, terminal endpoint lifetime and HTTP/upgrade listener cleanup.
- `native/ApplicationCompanion/HttpFixtureProof.cs`: independent native deadline checks during TLS and asynchronous probes.
- `native/ApplicationCompanion/HttpFixtureDeadline.cs`: monotonic elapsed deadline.
- `native/ApplicationCompanion/HttpFixtureDeadlineTests.cs`: deterministic native deadline, certificate and real TLS late-response tests.
- `native/ApplicationCompanion/Program.cs`: isolated deadline self-test dispatch behind existing unelevated execution checks.
- `src/test/isolated_http_ws_fixture.test.ts`: substitution, stale/closed/foreign handle, wrong-pin HTTP/WS, native reconnect, endpoint-close cancellation, client-disconnect and owned-process/listener cleanup regressions.
- This report.

## Validation

Validation commands and results:

- `npx tsc --noEmit`: passed on the final sources.
- `npm run build`: passed TypeScript, Vite production compilation (1,621 modules), and deterministic build identity generation. The browser bundle hash is unchanged.
- `dotnet build native/ApplicationCompanion/ApplicationCompanion.csproj -c Release --no-restore`: passed, zero warnings/errors. The equivalent BootstrapTransport and CameraBrowserHost Release builds also passed with zero warnings/errors.
- Complete focused regression: **185 passed, zero failed/cancelled/skipped**, including **29 isolated HTTP/WS tests** and owned-process/listener cleanup checks. The clean rerun took approximately 401 seconds. Command: `node --import tsx --test --test-concurrency=1` with `application_companion_lifecycle`, `companion_boundary_timing`, `application_session_authority`, `bootstrap_async_components`, `private_bootstrap_transport`, `isolated_http_ws_fixture`, `http_host_validation`, `websocket_host_validation`, and `vite_websocket_proxy` test files.
- The first complete run finished with 184/185 passing. Its sole failure was an existing companion startup deadline in `second issuance fails closed`, spanning an approximately 110-minute execution interruption (6,636 seconds reported for that test). Its targeted rerun passed in 3.3 seconds, with cleanup checks. All 29 endpoint tests passed in the complete run. An earlier fault-injection test wrapper was corrected to avoid violating frozen-object Proxy invariants; its stalled test runner was stopped, and subsequent native wrong-pin tests passed.
- Working and staged diff whitespace checks and explicit excluded-path checks passed. The production server, UI/core, camera/bootstrap hosts, launchers/scripts, Vite/package files, session authority and private bootstrap/supervisor sources remain unchanged.
- The sandbox process helper was unavailable. Authorized shell validation used approved execution outside that sandbox. No application/service restart or network-setting change was performed.

The new native self-test makes 22 assertions. It checks expired and invalid elapsed clocks independently of timer delivery, expiry before/after certificate verification, correct/wrong pins, and actual pinned HTTP/WS TLS responses arriving after elapsed expiry with the cancellation scheduler deliberately suppressed. Native faults use private test seams, never a destination override on the owner API. Wrong-pin and redirect tests inject faults below the private owner binding to continue testing native transport defenses.

## Limitations

This remains an isolated synthetic proof. It does not approve production integration or native credential forwarding through Vite. The Vite test verifies the existing proxy Host rewrite and Origin preservation only. Low-level private IPC still carries port/pin metadata; trusted server/native code and the verified companion channel remain part of the trust boundary. Arbitrary execution inside those trusted processes is outside this proof.

Cancellation is cooperative: an uncooperative test hook may continue its own computation after abort, but loses the pending upgrade and cannot authorize a later socket or event. Already transmitted bytes cannot be recalled. Monotonic checks prevent late authorization when execution resumes; they cannot run cleanup while the process/OS is suspended. Native probes still read one fixed WS event and close; server tests separately cover persistent socket revocation.

Signing/deployment integrity, elevated-parent/de-elevation, same-user injection, secure memory erasure and secure temporary-profile deletion remain deferred. The native TLS self-test imports its test-only certificate into a disposable Windows key context; no trust-store installation or persistent certificate export is performed. Production certificate generation is unchanged.

Commit message: **Harden isolated endpoint binding and cancellation**.

STOP after Phase 18C.7K. Do not begin Phase 18C.7L.
