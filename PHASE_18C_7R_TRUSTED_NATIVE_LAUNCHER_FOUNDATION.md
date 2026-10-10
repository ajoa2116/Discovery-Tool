# Phase 18C.7R — Trusted Native Launcher Foundation

Continued `codex/post-field-corrections-1` from `d2a93adad5fba1fe97c6e6e35542c4f8ee186998`, using Master Blueprint v1.1 and the established contracts without repeating milestone reviews. The previously recorded absence of a standalone blueprint remains unchanged.

## Delivered scope

This milestone delivers an independently safe **native process/channel foundation**, not a production Node launcher or an authority attachment. It runs only an allowlisted, headless peer from the current native executable. It never starts the production application, opens a camera, creates an HTTP listener, or exposes a launcher route.

Existing `OwnedChild` creation was factored into a shared private helper. Its companion launch path and assignment-failure behavior are preserved. The new launcher-peer path reuses the same exact executable, suspended creation, atomic Job-list assignment, explicit membership verification, non-inherited handles, hidden execution, retained process handle and kill-on-job-close cleanup. The native application continues to require an unelevated interactive token and uses its existing `asInvoker` manifest.

`NativeLauncherLease` creates the owner's private named pipe before launching the peer. It reuses the existing protected logon-SID-only DACL, first-instance enforcement and remote-client rejection. The owner verifies the pipe's actual kernel client against the exact owned, still-live process; the peer verifies the actual kernel server, native image and interactive session. PID and pipe name in the command line are nonsecret routing information, never sufficient authentication. An independent same-image process in the same logon/session is rejected when it substitutes for the owned peer.

After peer verification, a fresh native-only 256-bit challenge binds exact instance GUID, receipt GUID and absolute expiry. All secret challenge material travels only over the private native pipe, never JavaScript, arguments, browser inputs, URLs, logs or error responses. Exact frame shapes reject duplicate/extra fields. Incorrect nonce or binding is rejected with generic external failure; allowlisted internal reasons are used only for test evidence. No session/bootstrap credential is consumed, copied or issued by this foundation.

Native reservations are one-use for each instance and receipt ID within the owner process, including failed attempts, with a hard cap of 32 lifetime reservations. There is no renewal/retry that recycles an identity. Startup is bounded to three seconds and the entire candidate lifetime to at most ten seconds, shortened by supplied absolute expiry. Monotonic lifetime starts before the handshake and is not reset after acknowledgment. Terminal state precedes cancellation callbacks and cleanup. Owner cancellation, abrupt owner exit, peer death, pipe loss, unexpected post-bind frames/replay, and expiry revoke the lease and collect its owned process. The existing 16 KiB frame/pipe bounds remain intact.

## Exact remaining blocker and 18C.7Q relationship

The current production startup script launches `process.execPath --import tsx src/server/index.ts`. It has no approved runtime/script measurement, verified native backend bridge, or native-owner creation provenance. The reused native peer verifier deliberately requires the peer to run the same executable as the native owner. Relaxing this to an arbitrary `node.exe`, caller-supplied PID, path or port would weaken the existing contract and was not done.

18C.7Q's `BackendIdentityHandoff` holds exact Node-local owner, active receipt, listener and opaque challenge references. Those references cannot safely be serialized into the native lease. The native lease's GUID fields provide a future correlation contract only: **they do not prove an active 18C.7Q receipt or listener, and the two foundations are not yet joined**. No claim is made that a native lease authenticates a Node backend or that matching GUIDs establish cross-process ownership.

Completing that join requires an approved, measured backend runtime and entry payload; native-owned atomic backend creation; a native bridge providing bilateral kernel peer verification and retained launch/lifetime evidence for the actual Node process; and a one-use, expiry-bound mapping to the exact local 18C.7Q receipt and listener. It must transfer any secret material only between native trusted components, without exposing it to JavaScript. Backend process IDs, ports, stdout JSON, GUID metadata, or command-line tokens cannot substitute for that bridge. The existing fixture-first companion architecture currently has Node start the native broker, rather than a trusted native owner launch the backend; changing that production ownership direction remains unimplemented.

Production HTTP/WS still constructs `ProductionAuthenticationBoundary()` without an owner. Both native failure and owner loss therefore leave it default-deny because there is no attachment path at all. Existing 18C.7Q candidates remain explicitly non-authorizing. Native production request/event transport, pinned backend transport identity and cooperative cancellation of future physical operations remain later prerequisites. Existing camera/field gates, TLS pinning, session credential isolation, React, camera IPC, adapters and startup scripts were not changed.

## Validation

- Focused security run: **86 Node tests passed**, zero failed/cancelled/skipped. This includes the existing 83 identity/authentication/deadline/Host/proxy tests and three launcher test entries. After adding the foreign-owner negative control, the three launcher entries were rerun and passed; the final native self-test reports **21 cases and 42 assertions**.
- Native tests execute actual headless owned processes and private pipes. Positive checks establish a live lease before lifecycle revocation. Negative checks require the classified nonce, binding, kernel peer, replay, owner-cancellation or expiry reason; arbitrary transport failure cannot satisfy those checks. Watchdog waits reject rather than count as successful revocation. Cleanup assertions observe actual child exit. The abrupt-owner-loss case deliberately exits a separately launched native owner without disposal and verifies kernel Job cleanup.
- Foreign-owner testing verifies the real connected kernel server positively, then rejects another live same-image native owner's claimed PID using the exact peer-rejection result. Substitution testing launches an actual independent peer while retaining the expected owned child. These prove the native same-image boundary, not Node attestation or a hostile-code-resistant installation.
- Focused existing companion lifecycle selection: **7 passed**, zero failures/cancellations/skips, covering ACL/first instance, readiness and shutdown, independent owners, actual companion/broker death, cancellation after readiness, and atomic assignment failure. Existing cleanup checks confirmed no owned fixture or WebView2 process remained. These isolated application fixtures are not production/camera launches.
- Native companion Release build passed with **0 warnings and 0 errors**. `npm run build` passed TypeScript, Vite (1,621 modules) and deterministic build identity generation. Browser asset names remain unchanged (`index-DBrmYWSu.js`, `index-DETTyMO_.css`). Diff whitespace checks passed.
- No full regression, other native Release builds, production application launch/restart, adapter changes, camera configuration changes or production operations occurred.

## Files and delivery

- `native/ApplicationCompanion/OwnedChild.cs`: reuse verified atomic ownership for the headless native peer.
- `native/ApplicationCompanion/Program.cs`: strict isolated launcher peer/self-test dispatch.
- `native/ApplicationCompanion/NativeLauncherLease.cs`: bounded private-channel native lease, revocation and one-use reservations.
- `native/ApplicationCompanion/NativeLauncherTests.cs`: real OS ownership, negative controls and cleanup tests.
- `src/test/native_launcher_foundation.test.ts`: native test runner, invocation rejection and absence of production attachment checks.
- This report.

Commit message: `Add isolated trusted native launcher foundation`. Stop after this milestone. No production authority was enabled.
