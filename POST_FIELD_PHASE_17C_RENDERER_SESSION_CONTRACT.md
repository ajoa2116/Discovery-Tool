# Phase 17C — Camera renderer abstraction and secure host contract

## Checkpoint and scope

Branch: `codex/post-field-corrections-1`. Starting HEAD: `d2b40ebb5ad491ebc8cd0af6e3699851c09af283`. The tracked tree was clean; the three existing CCTV trace files were neither opened nor changed. Master Blueprint v1.1 and the approved [Phase 17B architecture](POST_FIELD_PHASE_17B_WEBVIEW2_ARCHITECTURE.md) remain authoritative.

Implemented the application-side session policy, iframe integration and server-side native contract. **IFRAME remains the only active renderer.** No WebView2, WinForms, .NET installation, native launch, packaging change, camera authentication, recovery-file operation or Windows network mutation was performed. The full production backend was not started for validation; tests use in-memory stores, mocked providers, intercepted camera pages and a loopback route fixture.

## Renderer boundary

`src/shared/camera_renderer.ts` defines camera-specific renderer kind, availability, lifecycle state, public session, history capabilities, open/close, refresh and failure/block operations. `IframeCameraRenderer` implements that contract with truthful unsupported Back/Forward; refresh changes the iframe revision. Manual visible-page confirmation is not evidence of camera identity, reachability or login.

`src/ui/use_camera_renderer.ts` owns the current iframe lease, polling, expiry and close cleanup. `CameraBrowserWorkspace` consumes renderer capabilities/state while preserving its compact toolbar, content area, light fallback, Inspector/Configuration separation, explicit Credential Assistance and read-only Recheck. The renderer boundary is deliberately small; a future native implementation will need its transport adapter and workspace rendering branch, not a new identity policy.

Open External still uses the existing ConnectService route and current access checks. Renderer session creation, failure, expiry or native availability is not a prerequisite for it. A blocked *identity decision* still blocks external access, as before. Recheck does not silently renew an expired session; close/reopen obtains a new decision and lease.

## Authorization object and authority

`CameraBrowserSessions` receives only read-only context and endpoint providers plus a clock. It does not receive a vault, adapter, mutation service, logger or launcher. It creates a lease only after `decideCameraAccess` approves the stable Device.id. Endpoint resolution uses existing ConnectService behavior and is additionally restricted to the current camera IP, HTTP(S), an origin/root path, and no userinfo/query/fragment.

Public metadata contains protocol version 1, random session UUID, stable device ID, approved address and origin, display name/manufacturer/model, creation/expiry timestamps and renderer intent. It contains no handoff/control secret, password, vault reference, device object, diagnostics payload or broad application authority. Public metadata is cloned; caller edits cannot retarget server state.

Private runtime state also binds the project/current-list context and canonical physical anchors. The server uses the visible project session device list, so hidden/removed devices cannot gain new authority from an old row. This does not alter Phase 6 or turn an IP into physical identity proof.

## Token and redemption lifecycle

- Each handoff secret uses 32 random bytes (256 bits) from Node crypto, encoded as base64url with a recognizable `cbh_` redaction prefix. UUID session IDs are separate and not sufficient for access.
- **Unredeemed handoff lifetime: 30 seconds.** This gives a local companion time to initialize without creating a durable bearer credential.
- Native issuance requires a registered server-owned channel object. There is no HTTP native-issuance or redemption endpoint.
- Redemption checks channel association, token digest, session ID, device ID, expiry, phase and fresh Phase 6 access/evidence. Token digests are compared with `timingSafeEqual`.
- A successful redemption atomically replaces the handoff digest with a newly generated `cbc_` channel-token digest. Handoff replay then fails, including attempts to use it for active messages.
- The active token is bound to that session and the original server-owned channel. Possessing a token through a different channel does not authorize redemption or active control in this server-side model.
- **Active lifetime: five minutes from redemption** (or creation for an iframe). It is absolute: STATUS/READY/navigation do not renew it. A new lease requires fresh authorization. This is intentionally conservative for this preparatory phase; any later longer-lived interactive policy requires separate review.
- Iframe leases use separate `cbi_` control secrets. They cannot be redeemed as native handoffs and cannot control native sessions.

All records are private in-memory state, capped at 128 concurrent leases and collected when invalid/expired. Restart loses the complete store. Shutdown clears it. There is no persistence or restart recovery of browser authority.

## Narrow native contract and safe future handoff

The implemented `CameraHostChannel` supports only redemption and STATUS, READY, FAILED, NAVIGATION and CLOSE messages. NAVIGATION accepts history capability booleans; it does not authorize a supplied URL or alter inventory evidence. Extra fields and unknown operations are rejected. FAILED/CLOSE revoke that session. Disconnect revokes all leases on that channel and prevents new issuance through it.

There is no dispatch/delegation path to Pair, Match Network, adapter mutation, credentials, configuration, Project/report mutation or discovery control. The service is not a general API client. Native toolbar commands beyond these preparation primitives remain future explicit work.

**The OS-level handoff is not implemented.** Phase 17D must bind each server-owned channel to an actually owned, authenticated private transport. The intended Windows mechanism remains inherited anonymous stdin/stdout pipes to a fixed installed executable, with bounded framing and version negotiation. Deliver the handoff reference and secret through that private pipe, never command-line arguments, URLs, shell strings or ordinary logs. The secret wrapper requires explicit `.expose()` at the transport boundary; default stringification, JSON and Node inspection redact it.

An in-process channel association is not proof of an operating-system process identity. No claim is made here that an unrelated Windows process cannot steal a pipe or inherit handles: secure handle ownership, executable ACL/signature checks, launch races, disconnect handling and protocol enforcement must be established and tested with the real host.

The future host must run unelevated under the interactive technician account, with no adapter privileges. This phase does not change Windows privilege behavior. If the backend is elevated, directly inheriting that token is prohibited by the architecture; an unelevated launcher/broker or privilege split remains a release gate. No native launch is enabled to bypass that gate.

## Iframe HTTP boundary

The new `/api/camera-browser` router exposes only:

| Operation | Input / authority |
| --- | --- |
| `POST /sessions` | Stable `deviceId` only; creates an IFRAME lease after Phase 6 approval. Returns public metadata and its scoped control secret. Client-supplied renderer intent or target URLs are rejected. |
| `POST /sessions/:sessionId/status` | Matching device ID and `X-CCTV-Browser-Token`; revalidates and returns metadata only. |
| `POST /sessions/:sessionId/close` | Same scoped control authority; closes only that lease. |

Responses are `Cache-Control: no-store`. A 2 KB JSON parser and generic errors prevent malformed payloads from reaching the default raw error output. Tokens are headers, never camera URL parameters. No route exposes native redemption or channel creation; unsupported paths stop at this router.

The router requires `X-CCTV-Workspace: 1`, an exact allowed Origin and a loopback Host name/port. Production allows the application's localhost/127.0.0.1 origin on 3001; development additionally allows Vite origins on 5173. Arbitrary ports, null/missing Origin and camera origins fail closed. These checks constrain browser requests and CSRF/rebinding attempts against this new surface; **they are not authentication of local processes**, which can forge headers.

The existing broader application's permissive CORS and privileged API authentication are not globally redesigned here. Native-host integration must not expose this existing authority. Before real native camera browsing ships, trusted application bootstrap, authentication of privileged localhost routes, WebSocket origin policy and resource isolation still require implementation and adversarial testing. Deferring them is safe only because native issuance/transport remain unreachable over HTTP and no native host is launched in 17C.

## Revocation and multiple-session isolation

Every status/redemption/host operation re-runs current authorization. Server broadcasts also reconcile leases, and a one-second background timer catches other current-context changes. Expiry, duplicate IP, conflicts, changed address/origin/anchors, removal or project-context change permanently deletes the affected lease. Resolving a collision cannot revive it; a fresh request must pass the current Phase 6 decision. Even evidence strengthening conservatively requires fresh authorization rather than silently changing the bound anchors.

The iframe polls every two seconds with a two-second request bound and maintains an absolute expiry timer. Failed status checks unmount the iframe and display blocked/fallback guidance; local identity changes already remove it immediately through the workspace decision. Browser scheduling and suspended tabs can delay timers, so this is not a hard real-time security guarantee or cancellation of traffic already in flight. Future native revocation requires dedicated transport/process enforcement, not reuse of that browser timing assumption.

Sessions have independent IDs, secrets and lifecycle. Closing/revoking one does not close another, including two sessions for one physical camera. On workspace cleanup, a best-effort close releases the lease. If navigation/abort prevents the close from reaching the server, absolute expiry and collection remain the backstop. No expired/revoked session auto-renews.

## Credential, logging and persistence boundary

Opening/issuing/redeeming a session never consults the credential vault or attempts camera authentication. Explicit Phase 15 guidance stays in its separate dialog. No password is sent to the iframe, authorization DTO or native channel. The only intentional secret response is the scoped iframe control header credential, retained in a hook closure rather than renderer state, DOM or localStorage.

The session service logs nothing and cannot be serialized into Project state by its ordinary JSON representation. Secret wrappers redact default inspection. Support and technical-error sanitizers additionally remove bare `cbh_`, `cbc_` and `cbi_` values, even without a token-key label. Generic router/contract errors do not echo supplied tokens.

Tests exercise actual Project export, report generation, Report Set snapshots, support bundle generation, Task snapshots and user-facing errors while sessions exist. None contains authorization secrets. Session state is not attached to Device, Project, report, Report Set or Task schemas. This establishes separation for supported application flows, not a promise that arbitrary future code can safely call `.expose()` and then log or persist the resulting string.

## Validation

Focused service/route/renderer tests: **55 passed, 0 failed, 0 skipped**. These cover the requested issuance, binding, entropy, credential absence, log/redaction/export boundaries, one-time redemption, replay, wrong device/session/channel, restart, expiry, revocation, resolved collision, isolation, close, unsupported privileged operations, iframe capabilities and read-only creation/redemption. Additional coverage includes origin changes, capacity collection, malformed/oversized input and host failure.

Related non-browser suites: Connect **29**, identity-safe access **39**, Duplicate Assistant **46**, duplicate remediation **34**, credential guidance **30**, credentials **19**, error/support evidence **33**, Project persistence **28**, reporting **34**, Report Set **39**, report architecture **53**, report history **38**, Task Manager **91**, browser import boundary **226**. Total: **839 passed**.

Mocked browser suites: Camera Browser workspace **36** (including six new session integration checks), identity-safe access **15**, Duplicate Assistant **33**, Credential Assistance **23**, Tasks **25**, inline actions **19**, technician attention **34**. Total: **185 passed**. All camera URLs are intercepted and backend calls mocked. Existing assertions remain intact.

Final selected validation total: **1,079 passed, 0 failed, 0 skipped**. TypeScript and production build pass using existing dependencies. Diff checks pass. The entire application regression suite was not run; changes are confined to camera renderer/session infrastructure and narrow redaction, not shared navigation, modal or generic browser infrastructure. The relevant browser suites above were selected accordingly.

During development, tests exposed the missing bare-token redaction, a fixture HTTP Host override issue, and a workspace test attempting to click through its still-open Configuration modal. Those were corrected without weakening assertions. The technician-attention suite had one diagnostics-completion timeout and passed unchanged when rerun alone; this timing flake is recorded rather than attributed to a production fix. The sandbox initially prevented tsx's Windows user lookup; mocked tests ran successfully with the required execution permission.

## Changed files and remaining work

Production: `camera_browser_sessions.ts`, `camera_browser_routes.ts`, `camera_renderer.ts`, `use_camera_renderer.ts`, workspace/server wiring, and the shared browser-secret redactor with support/error integration. Tests: new focused service suite, new browser session fixture, expanded workspace browser checks and identity browser fixture wiring. Documentation: this report. No dependency, package-lock, Project schema or Windows packaging change.

Phase 17D still needs actual unelevated host creation, verified private pipes, handle/process isolation, framing/backpressure and message ordering, heartbeat/revocation enforcement, separate camera profile/environment, runtime detection and the real native renderer. Broader localhost authentication and the Phase 17B TLS/navigation security gates remain prerequisites before native camera exposure. No certificate exception, WebView2 integration or native toolbar implementation exists in this phase.

Stop after Phase 17C. Do not start Phase 17D.
