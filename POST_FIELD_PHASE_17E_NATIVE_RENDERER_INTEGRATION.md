# Phase 17E — Gated native Camera Browser integration

**SOFTWARE INTEGRATION COMPLETE — REAL-CAMERA NATIVE LAUNCH PRODUCTION-GATED.**

Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `015028be7c62ea4241ca43862583becbe4d93911`. The capability-probe work from the interrupted Phase 17E turn was preserved. The three existing CCTV trace files were not opened, edited, staged or committed. Master Blueprint v1.1 and the Phase 17B/17C/17D security contracts remain authoritative.

The user explicitly selected controlled-fixture integration and deferred broader localhost authentication/resource-isolation work. This phase does not enable unrestricted native camera browsing, implement installer/runtime bootstrap, solve elevated-parent launching, or begin Phase 17F.

## Selection and production gate

`CameraRendererService` is the shared application orchestration service. The normal workspace requests `POST /api/camera-browser/open` with **only a stable device ID**. It first obtains a Phase 6-approved, current-evidence-bound control lease, probes capability, revalidates after the asynchronous probe, then selects the renderer.

| Situation | Result |
| --- | --- |
| Invalid/ambiguous/stale identity | Authorization fails; no probe, native launch or automatic iframe bypass. |
| Compatible native host/runtime, normal production composition | `GATED`; no native launch. The existing iframe compatibility path remains subject to its existing TLS/mixed-content restrictions. |
| Missing host, unsupported OS, absent runtime | Truthful unavailable category; existing iframe compatibility path and separately authorized Open External remain available. |
| Incompatible/malformed capability protocol or elevated token | Fail closed with security/unelevated guidance; no iframe renderer selected. |
| Compatible host plus in-process controlled-fixture authority | Native renderer selected; real Phase 17C/17D handoff and native window. |
| Native pipe/authentication/TLS/navigation failure after selection | Native failure category stays native. It never silently changes to iframe. |

The production entry point constructs `new CameraRendererService(cameraBrowserSessions)` with **no fixture authority**. The service's explicit gate requires an in-process `ControlledFixtureAuthority` before any native launch. There is no HTTP field, IP selector, preference, environment variable or technician control that can supply this authority. Unknown fields such as `fixture`, `url`, `renderer` and `nativeEnabled` are rejected. This is a deliberate source-level gate, not an assertion that someone who can rewrite executable application code is constrained by it.

The technician message is: “Native Camera Browser is available but real-camera native access is not enabled in this build yet.” It is an intentional gate, not a renderer failure. Browser Preference = Embedded is preserved; SYSTEM/EDGE/CHROME and the independent Open External implementation are unchanged.

## Capability check

`native_camera_capability.ts` launches only the fixed Phase 17D executable with `--capability`, using a restricted inherited environment, no shell and no target/secret arguments. The native mode requires an interactive unelevated token and queries the WebView2 SDK for the installed Runtime version. It creates no browser, profile or camera session. The response requires the exact protocol shape/version, `elevated:false`, and a valid runtime version. Output framing is bounded; malformed/extra/incomplete output fails closed. The process is bounded to five seconds, and raw stderr is never forwarded.

There is no availability cache. Each new selection rechecks the installed host/runtime; reusing an already-live authorized window uses that live session. The probe is a capability check, not a guarantee that later controller initialization cannot fail. Actual initialization failure has its own state.

Current environment: actual host/runtime probe returned `AVAILABLE`. Existing SDK/build target remains .NET 10 (`net10.0-windows`, x64), WebView2 package remains pinned to `1.0.4191.47`. No SDK, Runtime, NuGet or npm dependency was added or reinstalled.

## Authorized launch and transport

The workspace uses a scoped `cbi_` control lease, retained only in the hook's effect closure. A fixture native launch separately creates the Phase 17C native handoff, owned host channel, one-time `cbh_` bootstrap and rotated `cbc_` renderer token. The workspace control ID/token cannot redeem the native handoff or dispatch host messages. Public workspace session metadata identifies its control receipt; native transport IDs remain internal.

The launch still uses the exact executable, redirected private process streams, protected Windows named pipes, current-logon DACL, first-instance/remote-client restrictions, kernel PID/session/image verification, one-time redemption, active-channel rotation, heartbeat deadlines and owned Job Object. No new native network listener or HTTP redemption endpoint was added. The workspace HTTP boundary retains exact Origin/Host/custom-header checks, small JSON input, no-store responses and generic errors. It does **not** claim authentication of arbitrary local processes; the production gate remains essential.

The only added active commands are `FOCUS`, `REFRESH`, `BACK`, `FORWARD`. They are delivered in authenticated acknowledgments after current Phase 17C authorization is checked. The queue has one pending slot, coalescing rapid pending commands to the latest; it cannot accumulate unbounded browser work. Commands have no URL, script or credential argument. The host verifies the acknowledgment shape/allowlist and its expiry before dispatch. Every resulting navigation still passes the existing origin policy.

State messages contain allowlisted loading/navigation/failure codes and history booleans. There is no arbitrary page content, title, URL query/fragment or DOM extraction API in normal operation. The existing fixed fixture DOM assertion/screenshot mode is extended to stay open for integration tests; it is not exposed by the technician UI or HTTP options.

## Workspace, identity and toolbar

`NativeCameraRenderer` implements the shared renderer interface. The workspace shows compact preparing, opening, active, closed, failed, unavailable, gated, certificate and navigation/security-blocked states. Native sessions show a dedicated-window explanation instead of an iframe. The original light iframe failure card and visible-page confirmation remain.

Native window titles contain sanitized authorized name/model, address and MAC Last 6 where available, otherwise stable device-ID context. Display text strips control/bidi-control characters and is bounded. Device objects, notes, credential references and passwords are not sent to the host.

Refresh sends the scoped native reload command; Back/Forward enabled state follows native `CanGoBack`/`CanGoForward` reporting. Host history events and completed navigation update the workspace via polling. Native loading is not subjected to the iframe's 12-second manual-confirmation timer. Native rendering success does not establish physical response ownership, camera authentication or login.

Open External continues through the existing independently reauthorized ConnectService path. Its acknowledgment only confirms a launch request. Recheck remains the existing read-only reachability/access operation, with no credential submission or Windows network operation. Credential Assistance, Inspector and Configuration retain their separate existing UI flows.

## Reuse, isolation, close and revocation

Concurrent ordinary opens for one stable device are coalesced. Repeated activation of an existing preparing/opening/active session revalidates the control lease and requests focus rather than starting another native process. Windows foreground rules may limit focus activation; the code does not claim it can override OS focus policy.

Different devices receive separate native handoffs, control leases, processes and browser environments. Closing one cannot close a different camera. Native OS-window close revokes its native renderer authorization and leaves only a bounded read-only control receipt so the workspace can observe `CLOSED`. Workspace cleanup revokes that receipt; expiry/reconciliation also collects it. Reopening creates new control and native secrets; bootstrap reuse is impossible.

Every control request and native acknowledgment revalidates existing Phase 6/17C policy. Server broadcasts and the one-second reconciliation timer terminate affected owned hosts after duplicate IP, conflict, stale/reassigned address, removal, anchor/context change or expiry. Invalid control credentials cannot close a still-authorized unrelated host. Native heartbeat/pipe loss remains a second fail-closed boundary. Polling/scheduling and already-in-flight traffic are not claimed to be instantaneous cancellation guarantees.

An active native window never retargets to a changed device IP. The old authorization is revoked. The native workspace holds a changed-evidence block until the technician closes and reopens it, obtaining a fresh decision and exact-origin lease. Resolving a conflict cannot revive old authorization. The five-minute Phase 17C lease limit remains; the workspace control lease can end a native session earlier than the native redemption-based expiry.

## Controlled integration proof

`src/test/native_camera_integration_smoke.ts` creates an owned HTTP fixture on an already-existing private address of this PC and an ephemeral fixture API. Its immutable fixture authority permits only that synthetic stable identity and the exact owned resource origin while the listener exists. It accepts no CLI URL/IP. It imports neither the production server nor adapter/recovery/vault services.

The actual React `CameraBrowserWorkspace` and `useCameraRenderer` run from a test-only page. Playwright proxies their normal API requests to the ephemeral fixture router, preserving the router's expected Host/Origin transport context. This proxy substitutes transport location only: it does not fabricate renderer/session responses. Selection, capability probing, authorization, redemption, pipes, native host and WebView2 are real. No production localhost-authentication completion claim is made by this fixture proxy.

The GUI proof passed **14 checks**: installed capability; React-to-native active state; no iframe; fixed native DOM assertions and screenshots of two controlled pages; owned resource requests; Back; Forward; Refresh; same-camera reuse; actual OS-window identity title; OS close reflected in the workspace; fresh reopen; identity revocation; no React errors. Captured native content was visually inspected. It displayed the controlled fixture and the explicit statement that no camera credentials or network configuration were involved.

Actual Phase 17D lifecycle checks additionally passed runtime-init failure, certificate rejection (zero HTTP hits through the untrusted HTTPS fixture), process argument inspection, multiple-window isolation and revocation. Existing Windows pipe self-tests still validate the real DACL and peer boundary. Actual elevated-parent execution was not attempted: native token checks remain fail closed, and protocol/selection tests cover refusal.

## Validation

| Scope | Passed |
| --- | ---: |
| Capability policy tests | 11 |
| Renderer orchestration/model tests | 34 |
| Actual HTTP gate, async evidence and shutdown-race tests | 3 |
| Phase 17D protocol/security tests | 29 |
| Actual native process rejection/deadline tests | 4 |
| Windows pipe/peer/navigation self-tests | 19 |
| Actual native runtime/TLS/isolation lifecycle | 10 |
| Actual React-to-native GUI fixture smoke | 14 |
| **Focused total** | **124** |
| Related Phase 17C session contract | 55 |
| Related Phase 6 access / Duplicate Assistant / remediation | 39 / 46 / 34 |
| Related Connect / Credential Assistance / support-redaction | 29 / 30 / 33 |
| **Related total** | **266** |
| **Complete runnable mocked browser suite: 29 suites** | **810** |
| **Total unique selected checks** | **1,200** |

Final in-scope results: **zero failed, zero skipped**. Node's top-level test-runner count is smaller than the individual-check total because several existing suites report their own internal assertions. The complete non-browser application suite was not run, consistent with scope.

TypeScript passed. Production build passed. Native Release build passed with zero warnings/errors. Diff checks passed. Existing dependency versions/lockfiles and the production discovery, Pair/Match, recovery, credential, project and reporting implementations are unchanged.

Validation history is explicit: the first GUI fixture proxy used Node fetch, which did not preserve the test Host override; the unchanged route correctly returned 403. The proxy now uses `node:http`. The real GUI then exposed a stale `/sessions/.../status` reference; it was corrected to the new scoped `/controls/.../status` endpoint, and mocked routes now reject that wrong path. A later screenshot assertion raced asynchronous capture; it now waits within a fixed bound for the actual render event. Final review also added a disposal latch and regression test preventing a late native launch when shutdown occurs during capability probing. No security assertion was removed. The V1 mocked browser suite had a monitoring-status timeout in the combined run and passed all 28 checks unchanged when rerun alone.

The initial browser enumerator also attempted `production_readiness.cjs`. That file explicitly requires an already-running live production server with cameras disconnected; it is **not mocked** and is excluded from the requested mocked-suite total. It failed to connect to port 3001. The production backend was not started to satisfy it. Its six live checks were not executed; no claim of a live production readiness pass is made.

## Exact deferred prerequisites and gate-removal criteria

1. **Trusted application bootstrap and privileged localhost API boundary:** `src/server/index.ts` still installs permissive CORS and exposes the broader application API. The new camera router has Origin/Host and scoped control-token checks, but those do not authenticate arbitrary local processes or establish an application-wide trusted session. Audit and protect privileged adapter, credential and state-changing routes against cross-origin/rebinding/CSRF and unauthorized local callers before native camera exposure. This finding is about those trust boundaries, not a blanket assertion that every localhost endpoint is insecure.
2. **WebSocket trust:** the same server creates `WebSocketServer({ server, path:'/ws' })` without a verified authenticated application bootstrap/origin policy. Define and validate which application clients may receive inventory/events or invoke any supported controls.
3. **Camera resource/session isolation:** the existing native `WebResourceRequested` filter is not proven to cover every worker, WebSocket and browser-internal network channel. Demonstrate that untrusted camera content cannot obtain application credentials or reach privileged localhost authority through uncovered channels. Preserve per-session InPrivate environments; define owned-profile cleanup/crash-retention behavior rather than claiming secure deletion.
4. **Privilege separation where applicable:** broker and host reject elevated tokens. A validated unelevated launcher or privileged-service split is still required for an elevated main application. Do not remove checks or inherit an administrator token to make launch work.
5. **Deployment integrity:** protect/sign the installed host and dependencies, define update ownership, and validate runtime/host compatibility in deployment. The current fixed path remains the development Release output; same-user executable replacement/admin compromise is outside the pipe proof. Installer/bootstrap work remains separate.

Removing the production gate requires explicit reviewed implementation and adversarial validation of these boundaries, then an explicit change to production composition and its tests. No preference, environment flag or automatic build-mode switch can remove it. Phase 17F certificate exceptions, detailed navigation/compatibility hardening, downloads/popups and legacy camera compatibility remain unimplemented. TLS validation stays enabled, with no auto-trust, credential injection or global exception.

## Files and closeout

Production integration: `camera_renderer_service.ts`, `native_camera_capability.ts`, session display metadata, private protocol state/commands, camera-browser routes/server lifetime, shared renderer types/model, workspace hook/component, native Program/CameraWindow. Test additions: capability, orchestration, HTTP boundary, native GUI smoke and native workspace fixtures/browser suite. Existing workspace mock/assertions were updated to the new actual endpoint while retaining their behavioral assertions. This document records the checkpoint.

No real camera was contacted by native validation or authenticated/configured. No Windows IPv4, DHCP, gateway, DNS, adapter Restore or Pair recovery data was changed. Build commands disabled SDK development-certificate generation. Native fixture processes and owned listeners were closed. Existing traces remain untouched.

Commit message: **Integrate gated native WebView2 camera renderer**.

Stop after Phase 17E. **Software integration is complete; real-camera native launch remains production-gated.**
