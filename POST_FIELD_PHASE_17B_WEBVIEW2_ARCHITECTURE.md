# Phase 17B — Windows WebView2 architecture feasibility

## Scope and checkpoint

Design only. Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `555c8c894c29e31fdbebf04af91717fa13ca0a53`. Tracked files were clean. The three existing untracked CCTV trace files are outside this investigation and remain untouched. Master Blueprint v1.1 remains authoritative; Phase 17A's workspace, Phase 6's access authority, and Phase 15's explicit credential boundary remain requirements.

This report proposes future work; it does not add a renderer, change application behavior, install dependencies, alter recovery data, or perform network operations. Repository findings below describe the inspected checkpoint. Vendor documentation establishes platform capabilities, not proof that this repository already implements them.

## 1. Current architecture findings

| Concern | Repository evidence and finding |
| --- | --- |
| Frontend | [package.json](package.json), [vite.config.ts](vite.config.ts): React 18, TypeScript and Vite 5; development server on 5173 proxies `/api` and `/ws` to 3001. The UI is currently a normal browser application. |
| Backend | [src/server/index.ts](src/server/index.ts): Node running TypeScript through `tsx`, Express HTTP API and a `ws` WebSocket server at `/ws`. Production server binds `127.0.0.1:3001`. |
| Launch | `npm start` runs backend and Vite concurrently. [scripts/start-production.cjs](scripts/start-production.cjs) spawns Node with `--import tsx` and `src/server/index.ts`, sets production mode and forwards termination signals. It does not create a desktop window or launch the UI browser. |
| Build/distribution | `npm run build` runs TypeScript, Vite, then [scripts/build-identity.cjs](scripts/build-identity.cjs), which records build provenance in `dist/build-info.json`. [src/server/production_assets.ts](src/server/production_assets.ts) serves `dist`; missing assets produce a build instruction. [V1_FIELD_TEST_BUILD_PROCEDURE.md](V1_FIELD_TEST_BUILD_PROCEDURE.md) describes a source-checkout runtime, not a bundled Windows installer. |
| Native infrastructure | Package dependencies and tracked-file inspection contain no Electron/Tauri shell, C# project/solution, or native installer project. Windows investigation scripts are not a desktop host. |
| UI communication | [src/ui/App.tsx](src/ui/App.tsx) uses HTTP requests to the local API and WebSocket inventory updates. Several API URLs explicitly use `localhost:3001`; a future shell cannot assume all URLs are already relative or origin-independent. |
| Preferences | [src/ui/preferences.ts](src/ui/preferences.ts) stores versioned preferences in `localStorage`, including SYSTEM, EDGE, CHROME and EMBEDDED. Default is SYSTEM. Explicit actions and saved preferences are resolved by the existing preference helper. |
| Workspace access | [src/ui/components/CameraBrowserWorkspace.tsx](src/ui/components/CameraBrowserWorkspace.tsx) combines shared local access checks with authoritative `GET /api/connect/:id` results, checks identity/address freshness, and accepts HTTP(S) endpoints for the current device IP without URL credentials. It currently renders a sandboxed iframe, offers explicit fallback and recheck, and disables unsupported history controls. |
| Identity authority | [src/shared/camera_access.ts](src/shared/camera_access.ts) and [src/core/connect/connect_service.ts](src/core/connect/connect_service.ts) enforce current device identity, collision/conflict and session-verification constraints. Endpoint resolution is distinct from proof of physical ownership. |
| Open External | `ConnectService` reauthorizes around asynchronous launch preparation. Its `BrowserLauncher`/Windows implementation uses `explorer.exe`, `msedge.exe` or `chrome.exe`; process spawn is launch evidence, not render or login evidence. There is no managed camera-window IPC/lifecycle abstraction. |
| Windows boundaries | Adapter services execute PowerShell; [src/core/storage/vault.ts](src/core/storage/vault.ts) uses Windows PasswordVault through PowerShell with secret input through stdin. Browser launching is another existing Windows boundary. These services remain backend-owned. |
| Local API security | The inspected server installs permissive `cors(...)` middleware. CORS and loopback binding are not authentication. A native-command bridge must not inherit an assumption that any caller reaching localhost is trusted. |

## 2. Why the iframe is insufficient

A React component inside an ordinary browser cannot instantiate an operating-system WebView2 control. A native host executable and window are required; adding an npm package or changing the iframe element cannot provide that host.

A camera loaded as a top-level WebView2 document is not an iframe child of the application, so camera anti-framing headers no longer prevent that particular embedding relationship. Other CSP restrictions, TLS, authentication and browser compatibility still apply. Cross-origin iframe history and reliable render inspection are also unavailable to the current toolbar. WebView2 exposes host-controlled navigation capabilities, but navigation completion alone still does not prove a usable camera page or successful login. See [Microsoft's WebView2 overview](https://learn.microsoft.com/microsoft-edge/webview2/) and [CoreWebView2 API](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2).

## 3. Architecture options

| Option | Fit, migration and deployment cost | Decision |
| --- | --- | --- |
| C# WinForms companion, one camera WebView2 and native toolbar | Small new executable; React/Express remain. Adds .NET/WebView2 publishing and a narrow authenticated process contract. Native toolbar needs a modest separate implementation and Windows UI tests. | Recommended minimum. |
| WPF companion | Same process boundary and runtime requirements; richer layout tooling but little immediate benefit over WinForms for one toolbar and view. | Acceptable alternative if team expertise favors WPF. |
| Win32/C++ companion | Supported native hosting with no .NET dependency, but more COM, lifetime and UI engineering. | Reconsider only if .NET deployment cost is decisive. |
| Full application in a WebView2 shell | React assets can be reused, but startup, trusted app bridge, Node lifetime, privilege separation and packaging all move into shell scope. Camera content still needs a separate trust boundary/control. Windows-only shell does not solve Mac hosting. | Too broad for the camera-renderer requirement. |
| Electron shell | Bundles Chromium and Node; existing web UI is reusable, but process migration, browser updates, package size, permissions and shell tests become application-wide. Electron is not a WebView2 host by default. | No material simplification for this requirement. |
| Tauri shell | Platform webviews and a Rust core offer a future cross-platform shell; introduces another toolchain, command permissions, Node sidecar supervision and packaging. Existing Windows adapter/vault services still need Mac replacements. | Plausible future product migration, not the smallest current change. |

Platform basis: [WinForms WebView2 control](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.winforms.webview2), [Electron documentation](https://www.electronjs.org/docs/latest), [Tauri process model](https://v2.tauri.app/concept/process-model/). The relative engineering costs and recommendation are judgments based on this repository.

## 4. Recommended architecture and workspace preservation

Add a small, standard-user Windows Camera Browser companion executable, implemented with WinForms and WebView2 using a supported .NET LTS selected during implementation. Keep the current browser-hosted React application and Express backend. Open the companion only for the native embedded-renderer preference.

Preserve Phase 17A's product contract: a dedicated camera workspace, compact trusted toolbar, dominant camera area, display identity, real capability-driven history, explicit recheck/tools and first-class Open External. This is a separate OS window, not a native control inside React's DOM. The main application should clearly show that the native camera window is active and retain fallback controls.

Use a native toolbar in the minimum design. If literal React toolbar reuse becomes mandatory, a second trusted WebView2 containing packaged application UI could sit beside a separately isolated camera control. That adds environments, layout and bridge security work; do not mix trusted toolbar HTML and camera HTML in a single navigable control. Agree on this UX tradeoff before implementation.

```text
Normal browser: React application / Phase 17A workspace
             | authenticated local API + scoped events
             v
Express: existing access decision + proposed renderer broker
             | private inherited pipes; versioned, bounded messages
             v
Standard-user Windows companion: trusted native toolbar
             | dedicated environment/profile; no app bridge
             v
WebView2 camera document ---> approved camera HTTP(S) origin

Express ---> existing reauthorized Open External launcher
```

## 5. Renderer interface, lifecycle and toolbar

Introduce a future `CameraBrowserRenderer` boundary with capability discovery, open/focus, history, refresh, revoke and close operations. Windows supplies WebView2; external launch stays a separate available capability. The renderer never supplies the access decision.

The frontend requests a device ID, not an arbitrary target URL. The backend resolves the approved endpoint and creates a short-lived authorization lease containing protocol version, window/session IDs, stable Device.id, evidence revision, approved address and exact origins, sanitized display identity, access status and expiry. The revision is an opaque reference to backend evidence, not a replacement identity algorithm. Never include passwords, URL userinfo, credential-bearing query strings or vault contents.

Launch a fixed, installed host path with shell execution disabled. Use inherited anonymous stdin/stdout pipes for framed, size-limited JSON; reserve stdout for protocol messages and sanitize stderr. Exchange a startup nonce through the private pipe, bind it to the owned child/session, validate versions and message sequence, reject stale/replayed commands, and close on protocol failure. No host TCP listener or camera-accessible IPC endpoint is needed. A nonce alone is not the process trust boundary: installation ACLs, exact executable selection and controlled inherited handles matter.

Initially support one camera window; reopening it requires fresh authorization before focus. Later multiple windows need independent leases, environments and lifecycle tracking keyed by window ID and stable device ID, never by IP alone. Closing a window releases its lease and browser resources, informs the app and clears its own session data. It does not Restore, alter Pair state or change an adapter. Parent shutdown/pipe loss revokes the session; renderer crash produces a recoverable status without an automatic navigation retry.

| Toolbar operation | Proposed behavior |
| --- | --- |
| Back/Forward | Bind enabled state to `CanGoBack`/`CanGoForward` and history events; invoke `GoBack`/`GoForward`. Every destination still passes navigation and lease policy. |
| Refresh | Invoke native reload only while the target lease remains valid. |
| Recheck | Send an intent to the backend's existing explicit diagnostic route; renderer load results do not replace diagnostics. |
| Inspector / Config / Credential Assistance | Route a device/window-scoped intent to the owning React session, which opens its existing tool after current checks. Show “Return to application” if OS/browser focus cannot be transferred reliably. |
| Open External | Call the existing backend authorization/launch path with the current device ID. Never pass a stale cached URL directly to the OS. |

## 6. Identity-safe access and revocation

Run the existing Phase 6 decision before issuing a lease and again immediately before navigation authorization. Subscribe to current inventory/access changes. Do not equate an HTTP response, certificate, page title, typed credential or successful navigation with physical identity evidence.

Active duplicate IP, identity conflict, target change, removal or stale authorization revokes the window. Stop and dispose the camera control and isolate/terminate its owned browser environment as necessary; merely stopping a load leaves an already-running page active. Replace content with a trusted blocked explanation. Expiring heartbeats and pipe EOF provide a bounded fail-closed response if updates stop. Define and test the maximum revocation interval before release; instantaneous prevention of all in-flight traffic is not promised.

Clear session trust/auth state on revocation. Address changes require explicit reopen and fresh approval, not silent retargeting. No renderer-owned MAC/UUID reconciliation, ID rewriting or ARP inference is introduced. Current permission means permission to attempt access, not certainty about the machine occupying an IP.

## 7. Credential and security boundary

Keep Phase 15 unchanged: opening a camera never fetches saved passwords. Credential Assistance remains explicit in the main application. Manual credentials typed into a camera page necessarily enter that page/browser process; this is distinct from transferring vault secrets. Do not add automatic injection or send passwords through ordinary IPC, command lines, URLs, logs or process listings.

Use a dedicated per-session browser environment/profile, not the technician's Edge profile. Disable password saving/autofill and unnecessary browser features. Treat cookies, HTTP authentication state and downloaded files as sensitive. InPrivate is a reduction in persistence, not a promise that no bytes reach disk. Clean owned temporary profile data only after browser processes exit; never touch recovery files. Microsoft documents browser-data storage and cleanup constraints in [user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder).

Camera content receives no host objects, privileged web-message bridge or app-session token. Deny unnecessary permissions and validate every trusted command. This follows the principle of minimizing exposed host functionality in [Microsoft's WebView2 security guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security).

Two release prerequisites remain unresolved engineering work:

- Authenticate the local application's privileged API/host commands, validate Origin/Host and WebSocket origins, and defend against CSRF/rebinding. Camera pages can attempt localhost requests; permissive CORS is not a boundary. Design a trusted session/bootstrap mechanism, with secrets inaccessible to camera content, before exposing a native broker. Audit existing privileged routes too; protecting only the new launch route is insufficient.
- Keep the host unelevated even when adapter operations require elevated backend privileges. Do not blindly spawn camera content with the parent's elevated token. Choose an unelevated launcher/broker or separate privileged adapter service; otherwise offer external fallback and refuse native launch.

Restrict camera resource destinations as well as top-level navigation. Do not claim a single `WebResourceRequested` handler is a complete firewall for all WebSocket, worker and browser traffic. Verify actual API coverage and isolate/deny unsupported paths; backend authentication remains essential defense in depth.

## 8. TLS and certificate policy

Default to normal certificate validation. On an error, cancel/pause navigation and show a trusted native explanation with selected device identity, approved IP/origin, certificate fingerprint/issuer and error category. A self-signed or unknown issuer is not automatically evidence of a safe camera. Do not globally disable verification, install roots, change OS trust, or change backend TLS behavior.

Where the API and organizational policy support it, an explicit technician approval may permit the specific certificate for the selected camera session. Reject unrelated destinations, certificate changes, expired authorization and errors outside an explicitly supported exception policy. Denial retains Open External, whose browser manages its own TLS warning.

`ServerCertificateErrorDetected` provides certificate-error handling. Its `AlwaysAllow` decision is cached for the request host and certificate during the session, so a per-event prompt alone is not sufficient isolation. Use a dedicated environment, an exact-origin policy and an application-side fingerprint/lease association; clear remembered decisions with `ClearServerCertificateErrorActionsAsync` and dispose the environment on close/revoke. Do not assume cache scoping is per port or Device.id. If isolation cannot be demonstrated, keep exceptions disabled and use external fallback. See [certificate-error API semantics](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.servercertificateerrordetected?view=webview2-dotnet-1.0.3800.47).

## 9. Navigation and compatibility

| Case | Proposed policy / realistic capability |
| --- | --- |
| Initial navigation | Backend-approved HTTP(S) origin and current IP only; reject userinfo and arbitrary technician URL entry. |
| Relative paths / same-origin redirects | Allow under a valid lease. History is subject to the same checks. |
| HTTP to HTTPS | Same IP is necessary but not sufficient: approve the new exact origin/port through the broker; apply normal TLS or explicit scoped policy. No arbitrary port expansion. |
| HTTPS downgrade / new IP / hostname | Block by default. A new IP needs fresh device authorization; DNS similarity is not identity evidence. A future downgrade policy would require explicit approval. |
| Unrelated external destination | Cancel; explain. Do not silently turn the window into an Internet browser. Any future external-link action must be explicit and policy-approved. |
| Popups | Cancel by default. An approved same-camera destination may be redirected into the current view or a separately brokered window; never allow uncontrolled new windows. |
| Downloads | Explicit technician save decision, controlled destination, no automatic execution. Track/cancel pending transfers on revocation where supported. |
| Other schemes / resources | Deny top-level file, script, data and custom protocol navigation. Restrict resources to approved origins; necessary CDN exceptions require deliberate policy, not an unrestricted allowlist. |
| HTML/JavaScript, HTTP/HTTPS and login forms | Modern Chromium-compatible camera pages are candidates; manual login stays possible. Rendering and authenticated operation require testing. |
| X-Frame-Options / CSP frame ancestors | Top-level camera hosting removes the application's iframe relationship. It does not disable other CSP or security rules. |
| ActiveX / NPAPI / IE-only pages | Not solved. WebView2 has no IE mode; obsolete plugin interfaces may need vendor-supported alternatives. External modern Edge/Chrome are not a guarantee either. |
| Video/audio | Codec, stream protocol, hardware and vendor implementation remain compatibility variables; a working login page does not prove working live video. |

Navigation, popup, permission, download and process-failure hooks are available through [CoreWebView2](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2). Browser feature differences, including lack of IE mode, are documented by [Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/browser-features). The restrictive rules above are proposed product policy, not platform defaults.

## 10. Runtime availability and fallback

Prefer Evergreen WebView2 Runtime. Windows 11 includes it and most Windows 10 installations have it, but availability must be checked, especially on managed/offline machines. Edge browser installation is not proof of the production Runtime. Detect a supported Runtime using the environment version API, handle exceptions and environment-creation failure, and feature-gate required APIs. Do not accidentally accept a developer preview browser as the production dependency.

A future installer can offer the online bootstrapper or offline Evergreen installer with the appropriate deployment policy. Do not silently install during camera opening. Fixed Version is an alternative only with explicit ownership of distribution size and security updates. Source: [WebView2 distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

Missing/old runtime, blocked initialization, host launch failure, renderer crash, unrenderable page, unsupported plugin and rejected TLS all produce a specific explanation and retain Open External in the main application. Keep preferred renderer selection intact; fallback is an explicit action rather than a hidden preference rewrite. If backend authorization is unavailable, explain that access must be revalidated rather than launching a cached address. External launch success remains launch evidence only.

## 11. Packaging and support impact

Future Windows distribution adds the companion executable, managed/native WebView2 loader assets for supported architectures, and either self-contained .NET publication or an explicitly managed .NET prerequisite. The current Node/tsx/source/dist runtime still needs packaging; the native host does not bundle it automatically. Decide x64/ARM64 and supported Windows versions before choosing SDK/runtime minimums.

Sign the host and installer, protect installed executable paths against replacement, and version the IPC contract independently from UI assets. Reject incompatible host/backend pairs cleanly. Test clean install, repair, offline installation, upgrade with an open window, interrupted upgrade and uninstall. Store writable browser data in a per-user application-owned location, not Program Files. Cleanup rules must exclude project, vault and recovery data.

Support evidence should record host/application/runtime versions, architecture, initialization stage, sanitized failure category and lease/window correlation IDs. Do not log page bodies, form fields, cookies, credential-bearing URLs or unsanitized crash dumps. Decide browser dump collection and retention policy before enabling it.

## 12. Testing strategy for later implementation

No large regression suite is appropriate for this report-only phase. Future acceptance should include:

- Contract tests with a fake host: version mismatch, malformed/oversized/replayed messages, stale leases, rejected targets, launch races and timeout handling.
- Existing identity protections: duplicate IP, conflicting anchors, changed address, device removal, evidence updates during launch and external fallback; preserve original Device.id and access authority.
- Lifecycle tests: pipe loss, backend exit, app tab disconnect, renderer crash, repeated open/close, no orphan processes and bounded revocation. Closing a camera must never Restore or mutate networking.
- Native fixture tests: HTTP/HTTPS, self-signed/expired/mismatched certificates, trust refusal, certificate replacement, trust isolation across cameras/ports/windows, X-Frame-Options/CSP framing fixtures, login forms and real history.
- Hostile-page tests: localhost API/WebSocket access, host-object/message attacks, redirects, popups, subresources, workers, downloads and unsupported schemes. Prove camera content cannot invoke privileged app actions.
- UX tests: toolbar parity, keyboard/focus, accessibility, DPI scaling, resizing, blocked/failed states, return-to-app tools and explicit fallback. Page load must not become an ONLINE/login claim.
- Deployment matrix: missing/old/runtime policy restrictions, supported Windows/architecture combinations, standard-user launch with elevated network services, clean install/offline upgrade, signatures and owned profile cleanup.
- After software gates pass, a separately authorized physical camera matrix covering modern UI, TLS, authentication and legacy limitations; no physical operations are implied by this design.

## 13. Future Mac implications

Keep platform-neutral renderer capabilities, device leases and action semantics in the contract. A future Mac implementation could use WKWebView or external browsing while Windows uses WebView2. Capability differences, especially certificate handling and profiles, need separate policy/tests. This preserves a path to Mac without selecting a cross-platform shell today; Windows adapter operations and PasswordVault still require independent replacements.

## 14. Risks and unresolved decisions

The principal gates are authenticated localhost bootstrap/privileged-route protection, unelevated host launch, and tested revocation/profile isolation. They are prerequisites to safe camera exposure, not optional polish. API event coverage may limit resource restrictions; certificate caching may require stricter behavior than the desired technician UX.

Confirm acceptance of a native toolbar versus literal React reuse; supported Windows/CPU matrix; .NET deployment mode; single-window session lifetime; app-tab reconnect/ownership rules; certificate exception categories; offline runtime servicing and signing; and sensitive diagnostics retention. Strict navigation restrictions can break camera CDNs or unusual authentication/streaming flows. Loosening them needs evidence and explicit policy. WebView2 cannot guarantee every legacy camera works.

## 15. Phase 17B validation and proposed next sequence

Repository source/build/package inspection supports the findings above. This phase changes only this report. No production source, lockfile, dependency, recovery record, Windows setting or trace file is changed. `git diff --check` and staged diff review are the required checks; TypeScript/build and regression suites are intentionally not run because no executable behavior changes.

Proposed sequence, subject to separate authorization:

1. **17C — Renderer contract and security design gates:** introduce/test the platform boundary and fake host; resolve authenticated bootstrap, privileged API protection, owning-session semantics and unelevated launch before real camera navigation.
2. **17D — Minimal Windows host:** private process transport, native toolbar, isolated WebView2 and failure cleanup against local fixtures only. Deny unsafe navigation by default.
3. **17E — Workspace integration:** capability-aware preference routing, current access leases, revocation, toolbar intents and reauthorized external fallback. Keep integration fixture-only until security gates pass.
4. **17F — TLS/navigation validation:** implement and adversarially validate the scoped certificate policy, popup/download/resource rules, process isolation and credential separation. Hardening starts in 17D; this is a release gate, not permission for earlier unsafe exposure.
5. **17G — Runtime and packaging:** detection, signed host distribution, supported architecture matrix, installer/offline strategy and upgrade/cleanup tests.
6. **17H — Integration acceptance:** full relevant software validation, clean-machine validation, then separately authorized physical testing and documented compatibility limitations.

Stop after Phase 17B. None of these later phases is implemented or authorized by this report.
