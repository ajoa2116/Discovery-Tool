# Phase 18C.7I — Isolated HTTP/WS authentication proof

Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `25a3015eba70617d942ec9b3580605bbab24b391`. Branch/HEAD matched and Git status was clean before implementation. Master Blueprint v1.1 remains authoritative; no standalone blueprint exists in this checkout, consistent with the earlier milestone reports. Existing baseline contracts and production gates are preserved.

## Architecture and trust

`startIsolatedHttpWsFixture(owner)` is an explicitly composed test fixture, never imported by the production server. It binds a fresh ephemeral loopback TLS port and exposes exactly two synthetic routes: read-only `GET /proof`, returning fixed nonsecret JSON, and receive-only `/events`, sending a fixed nonsecret event only when trusted fixture code invokes `emit()`. No application services, storage, cameras or adapters are imported.

A fixed-path native helper creates a fresh RSA certificate/key pair for each fixture. Its output is captured through a private redirected child-process stream with a five-second timeout, 16 KiB limit, restricted environment and generic failure. No certificate is installed into a trust store; no key file is written. Key material remains in trusted server/native memory, with no secure-erasure guarantee. The helper refuses interactive stdout and elevated/noninteractive execution. Its output is private transport data, never console logging.

The server computes a SHA-256 pin over the exact certificate DER. Trusted owner composition delivers the port and pin through the existing verified, generation/session-bound companion IPC. Native code fixes the destination to `127.0.0.1`, fixes the paths and operations, and locks the first port/pin for the companion lifetime. Requests cannot select a URL, proxy, redirect destination, cookie or authentication header. Native TLS certificate validation checks the exact pin and current native session liveness before HTTP/WS request headers can reach the network. Pin validation is the trust decision for this self-signed proof, rather than system CA/name trust. Both native HTTP and WS transports disable redirects, proxies and cookies. A mismatched certificate receives no HTTP request or WS upgrade.

The application session credential comes from the existing native `CompanionSession`; it is not returned by `probeHttpFixture`, posted to the document, placed in URLs, or logged. Probe replies contain only bound metadata and acknowledgment. A fresh probe nonce binds the supervisor reply to the current outstanding command. Errors contain no wire data, credentials or remote response text. The low-level probe is not exposed on the public `owner.companion` facade.

## Authentication, authorization and revocation

The fixture accepts one exact Host, `127.0.0.1:<allocated-port>`, and one exact native fixture Origin, `https://companion-fixture.invalid`. Explicit trusted development composition additionally permits `http://localhost:5173` and `http://127.0.0.1:5173`. Missing, duplicate, hostile and `null` Origins are denied. Duplicate authority headers, cookies, request bodies, query-string credentials, alternate paths, non-GET methods, WS subprotocols and extensions are rejected. Forwarded headers never grant authority. There is no permissive CORS middleware or ambient-cookie authentication.

Every request/upgrade authenticates through `CompanionBootstrapAuthority.validateSession`, never through bare redemption or native `IsActive`. The hardened owner must have completed verified native activation. The returned receipt is retained as a server-private object; subsequent authorization requires exact object identity with the owner's current active receipt, plus elapsed/absolute deadlines and companion liveness. Forged receipt metadata, foreign-owner tokens, provisional authority and expired/revoked authority cannot authorize work.

The owner exposes a terminal AbortSignal for trusted resource ownership. Direct or owner logout revokes authority and aborts resources synchronously before waiting for native acknowledgment. Disposal, expiry and companion loss also abort the boundary. The fixture destroys sockets, aborts pending work and closes its listener on this signal. HTTP work and upgrade hooks receive cancellation signals; work is revalidated after awaits. Outbound events recheck owner authority and socket lifetime synchronously, including when timer callbacks have been delayed. Already transmitted bytes cannot be recalled.

## Resource limits

- Eight accepted TCP connections, listen backlog eight, 4 KiB headers, 1.5-second TLS/header deadlines, two-second request deadline, three-second connection idle timeout and 0.5-second keep-alive timeout.
- Two pending HTTP/upgrade work items, each with a one-second timer and elapsed deadline checked before completion.
- Two WS clients, 256-byte inbound payload limit, no compression/extensions or client commands, and a 2.5-second socket lifetime checked before event dispatch and by a 50 ms sweep. Incoming data or ping terminates the receive-only socket.
- One outstanding fixed event per socket. Additional events are dropped while its send is pending; transport backlog above 256 bytes terminates the socket.
- Native HTTP response and WS receive buffers are 256 bytes. Native network operations have a 1.8-second cancellation deadline, inside the existing bounded private-command deadline. The broker permits four seconds for the private network proof response; existing session commands retain their two-second child-response limit.

These are cooperative event-loop/OS scheduling bounds. Synchronous checks prevent delayed timers from authorizing late work; the proof does not claim cleanup code can execute while its process or Windows is suspended. Read-only bearer sessions remain reusable while active. This phase adds no mutation/replay policy for real application operations.

## Files and scope

- New: `src/server/isolated_http_ws_fixture.ts`, `native/ApplicationCompanion/HttpFixtureProof.cs`, `src/test/isolated_http_ws_fixture.test.ts`, this report.
- Extended trusted owner/supervisor: `src/server/companion_bootstrap_authority.ts`, `src/server/application_companion_supervisor.ts`.
- Extended isolated private native protocol: `CompanionSession.cs`, `SessionRelay.cs`, `FixtureWindow.cs`, `Program.cs` under `native/ApplicationCompanion`.

Production server routing/authentication, React, real API routers, Vite configuration, launchers, camera IPC, adapter operations and production gates have no source changes. No application restart or network-setting change was performed. The native test windows are isolated compiled fixtures.

## Validation

New tests cover exact Host/Origin and duplicate-header rejection, missing/malformed/foreign/provisional authority, activation races, synthetic read/events/reconnect, receipt forgery, logout during upgrade and pending work, expiry without intervening timer callbacks, blocked-event-loop socket expiry, cancellation on loss, queue/payload/work/socket bounds, native pinned HTTP/WS, zero requests on wrong pin, endpoint rebinding, HTTP/WS redirect rejection, native pending socket cancellation on logout/broker death, and actual heartbeat/IPC loss. Deterministic tests use the existing trusted private-channel test seam around the hardened owner; actual Windows tests separately exercise the native credential and verified IPC path.

Final validation:

- Complete focused regression: **178 passed, zero failed, cancelled or skipped**, including **22 isolated HTTP/WS tests**, existing Windows companion lifecycle/readiness/session cases and owned-process cleanup assertions, owner timing/authority tests, async/restricted bootstrap transport, HTTP/WS Host tests and the actual Vite proxy Origin-preservation test. Command: `node --import tsx --test --test-concurrency=1` with `application_companion_lifecycle`, `companion_boundary_timing`, `application_session_authority`, `bootstrap_async_components`, `private_bootstrap_transport`, `isolated_http_ws_fixture`, `http_host_validation`, `websocket_host_validation`, and `vite_websocket_proxy` test files. Duration approximately 409 seconds.
- Independent `npx tsc --noEmit`: passed.
- `npm run build`: passed TypeScript, Vite production compilation (1,621 modules) and deterministic build identity generation.
- ApplicationCompanion, BootstrapTransport and CameraBrowserHost Release builds with `--no-restore`: all passed, zero warnings/errors.
- Working and staged `git diff --check`: passed. Explicit diff checks of excluded production/UI/core/launcher/camera/adapter/Vite paths found no changes.
- The sandbox process helper was unavailable in this session. Authorized shell validation ran successfully through approved execution outside that sandbox. No test required restarting the application or changing network settings.

## Remaining limits

This is an isolated transport proof, not production HTTP/WS authentication or a production launcher. The existing real HTTP/WS security gaps remain deferred. Native WS probes read one event and close; server tests separately cover persistent fixture socket revocation and bounded reconnects. The Vite regression verifies its existing Host rewrite and Origin preservation, not an approved native credential path through Vite. Elevated-parent/de-elevation, signed deployment integrity, same-user injection, secure memory erasure and secure temporary-profile deletion remain outside this proof. No physical operation or production integration is approved by these results.

Commit message: **Add isolated HTTP WS authentication proof**.

STOP after Phase 18C.7I. Do not begin Phase 18C.7J.
