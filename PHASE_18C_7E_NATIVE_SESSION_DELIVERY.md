# Phase 18C.7E — Native session credential delivery

Branch: `codex/post-field-corrections-1`. Starting HEAD: `7d48f5ab9e6c564cdea2a2b8fa10ff6a5c276a68`.

## Scope and authority

The isolated companion now receives one native-memory session grant after trusted document READY and verified bootstrap redemption. `deliverSession()` returns receipt metadata only. The existing trusted server proof API `redeemBootstrap()` also performs the complete native grant before returning its redacted server-side proof wrapper; neither path can validate a provisional companion session. No session secret enters HTML, JavaScript, web messages, cookies, storage, URLs, arguments, environment, diagnostics or application logs. Issuance necessarily handles the secret in trusted Node memory; authority storage retains only its digest and receipt. Native state retains the secret for this companion lifetime. There is no public session endpoint or browser/network authentication integration.

`ApplicationSessionAuthority` adds explicit provisional redemption and one-time activation. Its existing standalone redemption behavior remains compatible with the earlier isolated authority/transport tests. The companion composition exclusively uses provisional redemption, then activates server authority only after verified native final delivery and activation acknowledgment. Every failure disposes this dedicated authority and ends the owned companion lifetime.

## Private protocol

Session messages use a separate `SESSION_` namespace; bootstrap commands and camera IPC remain separate. A fresh 256-bit nonce, session receipt, absolute expiry, credential digest and document generation bind the grant. The broker requires completed bootstrap redemption on its existing retained, verified child channel before permitting a session offer. Every child response passes existing original-process-handle/PID/session/image verification.

`SESSION_OFFER → SESSION_ACK → SESSION_COMMIT → SESSION_DONE` leaves the credential delivered but unusable by server validation. A separate bound `SESSION_ACTIVATE → SESSION_ACTIVATED` precedes server activation. ACK, DONE and ACTIVATED each carry receipt, nonce, digest, expiry and generation; COMMIT and ACTIVATE carry the same binding without the digest. Strict schema, duplicate-key rejection, one outstanding operation, irreversible stage transitions, single grant per lifetime and bounded reads prevent replay, stale replies and partial-delivery authorization. Native activation without server confirmation provides no application operation: this phase exposes no network or operation bridge.

The trusted document receives only `{v,type:SESSION_STATUS,state,generation}` for active/logout status. Its fixed fixture script validates this nonsecret shape and updates its label. Existing source validation, fixed compiled document, redirect/navigation/frame/popup rejection, runtime loss handling and native Job ownership are retained.

## Lifetime, cancellation, logout and expiration

Navigation, renderer loss, UI/broker death, IPC failure, cancellation and protocol failure clear native credential references and dispose companion server authority. Server activation rechecks live lifetime, cancellation and session expiration after all asynchronous exchanges. Cancellation during redemption also ends ownership, unblocking the pending operation. Pre-cancellation cannot preserve bootstrap authority for a later session attempt.

Logout revokes server authority before awaiting a bounded native logout acknowledgment, clears native state, and terminates the companion. Session expiry uses server cleanup plus native wall-clock and monotonic elapsed deadlines; the native 100 ms timer invalidates state even while another IPC operation is pending. Logout and expiry do not silently renew a document or session. Existing bounded graceful shutdown/Job fallback remains unchanged. Cross-process revocation notification is bounded, not instantaneous.

## Validation and limits

Focused validation covers provisional validation denial, activation/revocation/expiry, wrong and duplicate acknowledgments, lost ACK/DONE/activation acknowledgment, late ACK, expiry binding, stale generation, navigation and process/channel/renderer loss, cancellation during delivery and after DONE, grant/activation replay, native expiry and logout. Existing document, bootstrap, transport, identity/ownership and cleanup regression tests are retained. Final results follow below.

This remains a fixed fixture. React, Vite configuration, production launcher, HTTP/WS authentication, camera IPC and production safety gates are unchanged; the running application was not restarted. Actual elevated-parent execution remains untested, and unelevated rejection remains enforced. Same-user injection, binary replacement and administrator compromise remain outside the private IPC proof. Managed credential strings are not securely erased; InPrivate profile/crash metadata directories may remain. No credentials are intentionally persisted to them.

STOP after Phase 18C.7E. Do not begin Phase 18C.7F.

Final validation: the complete **127-test regression run passed**, followed by a **36-case focused session/security run against the final native build**, also passing. Both runs had zero failures, cancellations or skips and checked for newly owned companion/fixture WebView2 processes remaining after cleanup. The final focused run includes the added late ACK, altered expiry, lost activation acknowledgment, cancellation after DONE, pre-cancellation and replay cases. TypeScript `--noEmit` and the final production TypeScript/Vite/build-identity build passed. ApplicationCompanion, BootstrapTransport and CameraBrowserHost Release builds passed with zero warnings/errors. Working and staged diff checks passed. Sandboxed tsx startup initially failed at the Windows user-identity lookup before tests began; actual requested Windows lifecycle validation ran successfully outside that sandbox.

Files: native `CompanionSession.cs`, `SessionRelay.cs`, `SessionTests.cs`, `Program.cs`, `FixtureWindow.cs`, `FixtureDocument.cs`; server `application_session_authority.ts`, `application_companion_supervisor.ts`, `companion_bootstrap_authority.ts`; the two focused authority/companion test files; this report. Existing private bootstrap transport, readiness policy, Windows identity/Job primitives, React, launcher, HTTP/WS and camera sources have no diff.

Commit message: **Add native companion session credential delivery**.
