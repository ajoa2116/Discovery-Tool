# V1 Windows Deployment Readiness

## Current state and evidence

React/Vite builds `dist`; Express/Node serves it and `/api` on loopback port 3001, with `/ws` on the same server. `npm run start:production` invokes the source backend through the deliberately packaged tsx runtime dependency. It does not use Vite/concurrently. Camera Open defaults to an external browser; the optional embedded camera iframe retains browser security restrictions. Node/npm and a console are currently required; this is a source distribution, not a normal installed Windows application.

Omar's supplied normal-Windows validation of 15B.7 confirms production startup, port bind, GET `/` HTTP 200, real `/api/discovery/status`, no-camera discovery with filtered neighbors retained only as Support evidence, and ClientWebSocket `/ws` Open. This resolves the historical Codex-host bind limitation on that host. It does not establish physical camera behavior or clean install/uninstall. Any renewed Codex restriction is reported separately, not substituted for this evidence.

## Required runtime components and storage audit

| Component | Current requirement / write location / limit |
|---|---|
| Frontend | `dist/index.html`, hashed JS/CSS, `dist/build-info.json`; assets resolved relative to app, not working directory |
| Backend | `src`, `scripts`, package.json/lock and production `node_modules`; tsx/esbuild intentionally runtime dependencies |
| Node | Validation host v24.19.0; readiness currently recognizes Node 20/22 and warns on Node 24's observed tsx host failures; this is existing policy, not certification of every patch. Pin and test the distribution runtime separately |
| Native dependencies | esbuild platform binary, sql.js/WASM assets if used, Node runtime and dependency resources must be retained; no clean production-only install claimed by source tests |
| Windows commands | PowerShell and NetTCPIP/adapter/neighbor cmdlets; `scripts/observe-windows-receive.ps1` remains application-relative; command failures must not produce fake discovery |
| Recovery | `%LOCALAPPDATA%/CCTVDiscoveryTool/pair-recovery.json`; OS temp fallback if LOCALAPPDATA absent; write/rename snapshot before mutation; not inside projects; fallback is less durable and must be checked before field use |
| Credentials | Windows PasswordVault, current Windows user's context; explicit saved references separate from projects. No plaintext credential file; alternate-user elevation changes the vault context |
| Projects | UI imports/exports `.cctvproj` through file input/browser downloads; database supports atomic explicit-path save; no repository-specific storage requirement |
| Reports / support | Browser downloads chosen by user/browser; preflight cannot certify that folder's permissions. Download one artifact before field work |
| Settings | Browser origin/profile localStorage; localhost and 127.0.0.1 are different origins. Use canonical `http://localhost:3001` consistently; uninstall policy must address retained profile preferences |
| Quick Work / Tasks / logs | In-memory session inventory/tasks/audit plus console diagnostics; no intended persistent offline Quick Work storage; no persistent rolling log directory today |
| Temporary files | Unique app-data readiness markers created/removed; project atomic temporary files; recovery temporary rename; no developer-specific profile path in production code |
| User identity/privacy | Readiness no longer exposes full user app-data path. Safe Support includes build/runtime/readiness/Tasks/operation references, adapter/scan/Pair evidence; existing redaction remains |

## Preflight and privilege findings

The existing WindowsPreflightService is retained. It now filters fallback enumeration to non-loopback IPv4, uses actual eligible adapter enumeration in the server, isolates thrown/timed-out capabilities, warns for absent adapters/optional UDP/credential or recovery-storage capability, and exposes current recovery/operation ownership. Production missing frontend is critical only in production mode. A successful app-data write does not prove browser Downloads is writable. UDP bind proves only local socket creation, not firewall permission, port 3702 membership, or physical multicast reception. WebSocket is validated by the independent repeatable smoke, not fabricated as a preflight socket claim.

Normal-user launch, discovery where OS permits, diagnostics, projects, reports, Tasks and Open remain available without global elevation. Pair/Match apply checks administrative rights; Windows adapter Restore may need the same rights. There is no selective elevation broker today: for field adapter tests close normally and relaunch the same user's console elevated, or use an already-authorized elevated lab session. Do not silently elevate all routine operation or switch Windows users. Persisted recovery must survive shutdown/restart. This limitation is a packaging design requirement, not permission to bypass UAC.

## Port, startup, shutdown and security

Port is fixed at 3001. No automatic fallback changes frontend/API/WebSocket assumptions. Occupied/denied bind exits nonzero with actionable text; no unrelated process is terminated. Production static/API paths are application-relative. Ctrl+C/SIGTERM requests existing idempotent shutdown of discovery/monitors/controllers and WS/HTTP; closing a browser tab does not stop the backend. Force-ending a Windows process/window is not guaranteed to deliver graceful signals; explicit saved adapter recovery is retained for restart. A distributable launcher needs owned-process supervision and a Stop/Exit action, single-instance/conflict handling, and verified crash cleanup.

TCP backend binds 127.0.0.1, not the LAN. UDP discovery still needs OS/firewall policy on the actual Ethernet interface. Do not add broad firewall exemptions or disable security products automatically. A readiness socket success is not a firewall test. Outbound camera HTTP/HTTPS/TCP and inbound discovery must be verified on the target Windows image.

**Public-distribution gate:** Express currently uses permissive CORS and local APIs have no separate launcher/session trust boundary. Loopback binding is not a complete defense against a malicious local/browser client, especially if the whole backend runs elevated. Review and validate origin/CSRF/local-session protections and least-privilege elevation before public distribution. This milestone does not add application accounts or a new security architecture. Isolated trusted field-lab use is the current boundary; broader distribution is not approved by Gate A.

No installer, owned EXE/icon, code-signing pipeline, uninstall policy or updater exists in the current project. Development icons are UI assets, not a signed Windows application identity. Dependency/runtime licensing, pinned runtime support, integrity checks and vulnerability review remain release work.

## Realistic distribution options

The comparisons below are engineering estimates, not measured package sizes or implementation commitments.

| Dimension | A: bundled Node + small Windows launcher + external browser | B: Electron desktop shell | C: Tauri + Node sidecar |
|---|---|---|---|
| React/Vite/Express fit | Reuses current HTTP/WS app and backend almost unchanged | React fits; retain backend as owned process or integrate carefully | React fits; existing backend remains separately packaged sidecar |
| Windows integration | Add shortcut, icon, single-instance and owned Stop/Exit | Established desktop lifecycle APIs; new main/preload boundary | Rust/native shell and WebView2; extra toolchain and capability configuration |
| Elevation | Explicit same-user adapter workflow initially; future narrow broker | Do not elevate remote-content renderer; isolate privileged adapter work | Broker/sidecar privilege and same-user vault context need design |
| Size | Node + current dependencies/assets; no bundled Chromium | Larger: ships Chromium/Node/framework | Smaller shell possible, but Node sidecar and WebView2 requirements remain |
| Complexity | Lowest migration; launcher/installer still real work | Medium/high; window/IPC/security/lifecycle integration | High for current Node-heavy app; sidecar distribution and Rust integration |
| Updates | Initially signed versioned installer/manual update; preserve recovery/user data | Framework-compatible updater possible, signing/channel policy still required | Updater/signing design plus sidecar version consistency |
| Signing / AV | Sign owned launcher and installer; retain runtime provenance; test SmartScreen/AV | Sign application/installer and verify shipped runtime/resources | Sign shell/installer/sidecars; validate each executable on target policy |
| HTTP / WS process | Existing fixed localhost API/WS; launcher must own lifecycle and detect port conflicts | Keep same loopback server or deliberately migrate; no silent dual server | Sidecar supervises Express; same HTTP/WS possible |
| PowerShell / network | Existing Node child-process commands preserved | Node APIs available only in trusted process | Sidecar preserves current commands; shell permissions scoped |
| Credential store | Same-user PasswordVault unchanged | Must preserve user context; do not expose secrets through renderer IPC | Same-user sidecar must retain PasswordVault semantics |
| Recovery | Existing app-data snapshot unchanged, block update during mutation | Snapshot compatible; lifecycle changes require retesting | Snapshot compatible; crash/sidecar stop requires retesting |
| Advantage | Smallest application-code churn, normal shortcut launch possible | Integrated window/lifecycle, unified desktop presentation | Native shell footprint and constrained shell permissions |
| Disadvantage | Browser tab and backend lifetime differ; launcher must explain Stop | Larger runtime and expanded privileged-web security surface | Additional runtime/toolchain without removing Node requirements |
| Migration risk | Low/moderate | Moderate/high before field tests | High before field tests |

Recommendation: **Option A, a versioned bundled Node source/assets distribution with a small signed Windows launcher and conventional installer, AFTER FINAL CAMERA VALIDATION.** Pin a tested Node runtime and production dependencies so technicians do not need npm or Internet on the field laptop. The launcher should check fixed port ownership, start exactly one owned backend, wait for readiness, open canonical localhost in the default browser, and provide explicit safe Exit. Choose the installer technology in a separate packaging milestone after proof-of-concept and signing decision; do not adopt a framework merely because it exists.

For Gate A, keep the known source workflow with installed dependencies and the smoke script. Do not move to Electron/Tauri or Node single-executable bundling before cameras return. Node single-executable packaging has module/assets constraints that would require validation of tsx, dynamic imports and Windows helper assets; it is not a free replacement for this source distribution. [Node official SEA documentation](https://nodejs.org/api/single-executable-applications.html)

Electron would require explicit isolation of untrusted camera content from Node-capable processes, renderer sandboxing and maintained runtime updates; external browser Open should remain the default. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

Tauri supports separately packaged external binaries, but its sidecar configuration and permissions add work for this Node backend; a shell alone does not remove the runtime. [Tauri sidecar documentation](https://v2.tauri.app/develop/sidecar/)

Signing/provenance and target-machine testing are required; a signature is not a promise that every SmartScreen/Smart App Control/antivirus policy will allow execution. Do not tell technicians to disable these protections. [Microsoft Smart App Control guidance](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)

## Separate release gates

**Gate A — ready for final physical validation:** known commit/source digest, passing automated suite/build, normal-host smoke, reviewed readiness, downloaded support sanity check, safe topology/original-state records and executable field procedures. Installer/signing are not prerequisites for authorized isolated lab tests. No camera physical status is upgraded until actual results exist.

**Gate B — not yet ready for distributable V1:** requires final camera results, bundled-runtime/launcher/installer implementation, least-privilege and local API trust review, signing decision, dependency/license review, clean offline install/launch/restart/update/uninstall verification, recovery/credential retention policy and representative Windows/AV/firewall testing. No gate here grants a public-release claim.
