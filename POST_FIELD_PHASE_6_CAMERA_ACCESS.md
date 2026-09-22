# Phase 6 — Identity-aware camera access safety

Branch: `codex/post-field-corrections-1`

Starting HEAD: `f7929d30ae84796eb4b7608522646582976f4fd3`

The expected branch/commit matched and tracked files were clean. Master Blueprint
v1.1 and the supplied Phase 6 specification remain authoritative. Scope is
FIELD-DUP-05 and the core access-routing portion of FIELD-OPEN-02 only.

## Finding and authoritative decision

ConnectService resolved an endpoint and described duplicate-IP ambiguity, but
returned canOpenManually=true and launched regardless. BrowserModal navigated its
iframe directly to the resolved endpoint. Neither warning established browser
ownership of the selected physical camera.

The browser-safe shared `decideCameraAccess` policy now accepts stable Device.id,
current inventory, and collision records. It returns an allowed flag, decision
code, current address, and technician explanation:

- SAFE_TO_OPEN: unique current address, established typed identity, no unresolved conflict.
- AMBIGUOUS_COLLISION: active collision record or another row sharing the address;
  a collision status without resolved historical evidence also blocks conservatively.
- STALE_ADDRESS: missing/ambiguous selected record, unusable address, or saved
  identity marked NOT_FOUND/NOT_VERIFIED pending current verification.
- INSUFFICIENT_IDENTITY_EVIDENCE: no physical anchor or unresolved identity conflict.

Phase 1 canonical MAC/UUID/typed serial identity rules and Phase 4 active collision
semantics are reused. No identity is rewritten to enable access. Historical
resolved collisions do not block a uniquely addressed current device. Reopening
blocks again. Recent diagnostic success, ARP/neighbor observations, known MAC, UUID,
or a collision participant's diagnostic targetability do not create MAC-bound HTTP.
There is no verified device-specific browser routing mechanism in this architecture,
so an active collision always blocks ordinary HTTP/HTTPS access.

Unique devices retain existing endpoint selection and System Default/Edge/Chrome/
Embedded preferences, including unavailable-browser fallback. Existing unreachable
or different-subnet advisories remain; access approval permits an attempt, not a
claim of reachability. Saved projects must be discovered/Reverified before their
unverified saved addresses can be opened. Diagnostics from another IP no longer
verify a newly selected endpoint or port.

## All audited access paths

| Entry point | Enforcement |
| --- | --- |
| Master Device Table IP button | Existing stable-ID App callback → ConnectService.open |
| Actions/context menu → Open | Same callback and service |
| Current results / Project rows | Same table and stable-ID service; no separate raw-IP path |
| Details/Inspector → Open Camera | Existing BrowserModal → backend decision plus shared current-inventory decision |
| Embedded preference | Same BrowserModal gate before iframe exists |
| BrowserModal → Open External | Disabled while blocked; backend revalidates every open request |
| GET /api/connect/:deviceId | Returns explicit access decision and blocked readiness; endpoint alone is not approval |
| POST /api/connect/:deviceId/open | Checks before launcher; blocked decision returns HTTP 409 with explanation |
| WindowsBrowserLauncher | Required authorization callback immediately after async browser detection, before dispatch |
| launchExternalProcess | Low-level dispatcher called by approved WindowsBrowserLauncher; no direct UI/API URL launch route |

The dispatch callback checks current identity and IP again, so an intervening
collision, move, or replacement cannot launch the formerly approved URL. Tests
inject the dispatcher rather than starting real browser processes. BrowserModal
also checks response ownership against the selected ID/address/anchor context and
current inventory. A changed selection or newly observed collision invalidates
approval and removes the iframe. An external-open failure clears embedded approval.
App supplies the current row and collision collection rather than an old selection
snapshot. No additional confirmation is introduced for a normal unique device.

Blocked attempts return before connection-history writes, database upsert, or
browser dispatch. They do not dirty projects or alter identity/network/credentials.
The existing Close, Details and Recheck actions remain available. There is no
Open Anyway, fake MAC-routing option, placeholder button, or new Duplicate Assistant.

Launch history/messages explicitly say launch was requested; they do not assert
page rendering, authentication, or physical response ownership. The modal's
diagnostic endpoint label says Web response observed rather than broadly Verified.
TLS validation, iframe sandbox, credential policy, and browser fallback are unchanged.

## Validation

Focused tests were added before production implementation: baseline **7 passed,
26 failed**. Failures included launches from both collision rows, missing safety
decisions, stale/unidentified access, wrong-IP diagnostic endpoint verification,
and absent embedded gating. Additional regressions exercise the actual Windows
launcher with injected dispatch and identity/address/collision changes during
browser detection.

The previous Connect test opened while its duplicate fixture was still present.
It now first proves that opening is blocked, then explicitly removes the duplicate
before exercising normal browser preference/fallback. Existing assertions remain.
The V1 browser stale-response fixture now supplies a UUID, so it continues testing
response ownership with an established identity rather than triggering the newly
required insufficient-identity block. No assertions were weakened or skipped.

- Phase 6 focused: **39 passed**, covering T01–T26 across service/policy and browser checks.
- Phase 6 browser: **14 passed** with actual in-memory ConnectService decisions.
- Phase 1: **50**; Phase 2: **46**; Phase 3: **46**; Phase 4: **42**; Phase 5: **43**, all passed.
- Full regression: **2,250 assertions across 61 files; 0 failed, 0 skipped**.
- Browser total: **93 passed, 0 failed, 0 skipped**: Phase 6 (14), Phase 5 (13), background collisions (13), field workflow (25), V1 integration (28).
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed (TypeScript, Vite, deterministic build identity).
- `git diff --check`: passed; final diff reviewed for scope.

Browser camera navigation was intercepted and fulfilled locally; backend calls and
process dispatch were injected. No hardware network or camera configuration was
changed. The known Windows Node identity workaround was used only from TEMP and
removed afterward; NODE_OPTIONS was unset. The UI-only Vite process was stopped.

## Files changed

- `src/shared/camera_access.ts`
- `src/core/connect/connect_service.ts`
- `src/server/index.ts`
- `src/ui/App.tsx`
- `src/ui/components/BrowserModal.tsx`
- `src/test/identity_safe_access.test.ts`
- `src/test/connect.test.ts`
- `src/test/browser/identity_safe_access.cjs`
- `src/test/browser/v1_integration.tsx`
- This closeout document.

## Field status, limits, and physical retest

FIELD-DUP-05 and core FIELD-OPEN-02 access routing: **software validated; physical
retest pending**. Phase 1–5 protections remain covered. No full Duplicate Assistant,
WebView2, dedicated Camera Browser workspace, recovery retirement, or Phase 7 work
was implemented. The three original untracked trace files were untouched and not
staged. Recovery data, retained Windows Ethernet configuration, and credentials
were not altered.

Retest the two established cameras at `192.168.1.100`: both IP links, Actions Open,
Inspector, Embedded preference and Open External must block without navigation.
Externally separate the addresses, Scan/Reverify, then confirm the selected camera's
unique current address can open with System Default/Edge/Chrome/Embedded preferences.
Re-collide and verify access blocks again, including an already-open embedded modal.
Open a saved project before Reverify and verify stale-address blocking; verify
clean dirty-state and unchanged identities after blocked attempts.

Ordinary IP navigation cannot guarantee ownership if hardware changes after the
last observation or after dispatch. Already launched external browsers cannot be
revoked by this application. Existing iframe/CSP/X-Frame-Options/certificate and
camera authentication limitations remain; no physical page-rendering pass is claimed.
Unresolved identity conflicts intentionally require reconciliation rather than a
browser bypass. Existing legacy recovery attention remains a separate deferred issue.
