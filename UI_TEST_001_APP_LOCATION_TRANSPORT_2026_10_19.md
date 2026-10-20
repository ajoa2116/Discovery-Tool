# UI-TEST-001 — inert App Camera Location transport, 2026-10-19

Latest bounded validation: **17 passed, 0 failed, 0 skipped**, in one invocation
after the acknowledged-save/reconciliation correction. The initial 10/4,
intermediate 12/2 and subsequent 14/0 results remain recorded below. The owner
explicitly authorized updating only obsolete family-7 characterization
expectations; the other 13 cases and all transport/ownership checks are intact.

## Initial fixture result and scope

Laptop 2, `C:\Users\Omar\Documents\Discovery-Tool`, branch
`codex/post-field-corrections-1`, starting HEAD
`e02f9f9894a7beb31ed2ee1f065b9e3d3ef43e5d`; initial working tree clean.
Master Blueprint v1.1 and existing security contracts remain authoritative.

**Initial focused invocation: 14 cases completed, 10 passed, 4 failed, 0 skipped,
0 blocked; exit 1. No retry.** The failures are App state/identity assertions,
not harness timeouts, unexpected dependencies or missing fixture responses.
No assertion was weakened and no production code was modified after failure.
The earlier committed 23-case component baseline was not rerun or changed.

Actual React 18 StrictMode mounts the production App, table and inspector. App's
selection, `handleUpdateDeviceLocation`, `updateTechnicianField`, `requestJson`
and `fetchData` are intact. Two initial devices share `192.0.2.50`, with distinct
IDs `camera/A` and `camera/B`, names Camera A/B and locations Lobby/Garage.
Project Two has either camera/C or the reused camera/A ID.

## New test-only files

- `src/test/browser/app_location_transport.html`: isolated fixture entry/CSS.
- `src/test/browser/app_location_transport.tsx`: StrictMode mount/unmount of App.
- `src/test/browser/app_location_progress.ts`: inert, controllable progress
  subscription. No real socket, connection or discovery operation.
- `src/test/browser/app_location_transport_fixture.cjs`: deterministic preferences,
  exact HTTP contract, unique request IDs, independent response holds/releases,
  abort accounting and fixture violation ledger.
- `src/test/browser/app_location_transport.cjs`: Edge runner, isolated Vite
  profile, actual DOM interactions, all eight scenario families and cleanup.
- This report.

No dependencies changed: existing exact test-only `playwright-core@1.56.1` and
installed Edge 155.0.4283.45 were used. No browser download or new framework.

## Completed interaction results

| Family | Case | Pass | Fail | Request records |
| --- | --- | ---: | ---: | ---: |
| 1 | Stable ID, exact body, pending/duplicate prevention, held post-ack refetch | 1 | 0 | 25 |
| 2 | Non-2xx acknowledgment and retry | 1 | 0 | 26 |
| 2 | Wrong acknowledgment status and retry | 1 | 0 | 26 |
| 2 | Wrong acknowledgment device ID and retry | 1 | 0 | 26 |
| 2 | Transport rejection and retry | 1 | 0 | 26 |
| 3 | A completion while inspecting B | 1 | 0 | 25 |
| 4 | A→B→A, newer confirmed value and new editor draft | 1 | 0 | 26 |
| 5 | Close/reopen retains new editor generation | 1 | 0 | 25 |
| 6 | Older session response after newer response | 0 | 1 | 31 |
| 7 | Valid acknowledgment, failed refetch — behavior characterization | 1 | 0 | 23 |
| 8 | Replacement during pending save, different ID | 1 | 0 | 26 |
| 8 | Replacement during pending save, same ID | 0 | 1 | 26 |
| 8 | Replacement during pending refetch, different ID | 0 | 1 | 26 |
| 8 | Replacement during pending refetch, same ID | 0 | 1 | 26 |
| Total | All cases executed in one invocation | 10 | 4 | 363 |

Families 1–5 pass; family 6 fails; family 7 passes only its explicit observation
contract; family 8 has one pass and three failures. Every case has zero skipped
or blocked checks. Unrelated suites, backend persistence, real progress transport
and physical tests were not run.

Family 1 verifies exact POST `/api/device/camera%2FA/config`,
`{"technician":{"location":"  North Door  "}}`, only one submission and disabled
pending controls. Acknowledgment alone does not finish the callback while the
successful refetch is held. Family 2 requires a fresh independently numbered
retry after each invalid acknowledgment. Family 3 verifies B remains Garage,
then opens A to verify its updated value, with only one config request.

## Reproduced App defects — no fix applied

### Older reads regress current state

1. Open A in Project One with confirmed Lobby.
2. Through the inert progress subscription, request two independent App
   reconciliations; hold their `/api/project/session` responses separately.
3. Release the newer request with project name Newer read and location
   Newest refetch. Confirm the rendered inspector shows Newest refetch.
4. Release the older request with the original Project One/Lobby snapshot.
5. Actual confirmed display becomes **Lobby**; expected **Newest refetch**.

Exact assertion: `An older session read regressed the current device`.
Both reads are legitimate fixture requests; pair state remains null so no
unrelated pair-reference change masks the race. App's `fetchData` has a
pair-reference check but no general read revision preventing this regression.

### Same ID does not establish a new editor/project generation

1. Open A in Project One; submit Old project save and hold its acknowledgment.
2. Inject `PROJECT_SESSION_CHANGED` with Project Two, the same camera/A ID and
   confirmed New project location. Observe New project location first.
3. Release the old valid acknowledgment, then its refetch with the **new**
   Project Two snapshot; do not supply an old snapshot in this case.
4. Actual inspector becomes **Old project save**; expected **New project location**.

Exact assertion: `Old work overwrote or acknowledged the new project context`.
This case separates stale local acknowledgment from an old session response:
even a new-context refetch does not invalidate the old same-ID editor token.
`CameraLocationEdit` binds its generation to open/device ID, not project identity.
This observation concerns client UI state, not an assertion of a server-side
cross-project write.

### Old refetch can replace an active project

1. Submit A's save, accept its valid acknowledgment and hold the ensuing session
   response with the original project snapshot.
2. Inject Project Two; inspect its different-ID Camera C, or retain same-ID A.
   Observe New project location.
3. Release the held Project One response, with A's Old project save value.
4. Different-ID case: the active project label reverts; the exact Project Two
   label count is **0**, expected **1**. The table shows old A/B records while
   the drawer can retain C via App's stored-device fallback.
5. Same-ID case: confirmed display becomes **Old project save**, expected
   **New project location**.

Exact different-ID assertion: `Old refetch replaced the active project`.
No general project/session epoch invalidates these pending reads. The suite
continues independent cases in fresh contexts after application assertions;
transport/React safety failures would stop the invocation.

## Failed refresh after a valid acknowledgment

Family 7 intentionally rejects the held session refetch with
`Injected refetch failure` after a valid acknowledgment. Before rejection the
editor remains pending with Lobby. After rejection App logs exactly one declared
console error beginning `Failed to fetch backend data:`; the callback resolves
and the inspector shows Acknowledged only with no drawer alert. Closing/reopening
shows **Lobby** from the unchanged App project record.

This is a passing characterization of an inconsistency, **not successful refresh
or persistence evidence**. No success occurs before acknowledgment, but a valid
acknowledgment plus swallowed refresh failure can produce a local confirmed value
that disagrees with the displayed project snapshot. It is reported rather than
hidden by a permissive console-error filter.

## Transport and isolation contract

The fixture's Vite resolver replaces only `./progress_connection.ts` imported
by the exact production App file with the inert test module. The original
progress module path is excluded from served-source admission. App's real
subscription callback receives controlled project/session events; real WebSocket
creation remains forbidden. StrictMode creates two subscription objects per
context; every object must be unsubscribed exactly once after unmount.

Every intercepted fetch records its individual ID, method, route, body, terminal
state and response. Only these synthetic contracts are permitted:

| Method | Exact route | Response behavior |
| --- | --- | --- |
| GET | `/api/project/session` | Explicit project snapshot; individually held/released for races |
| GET | `/api/diagnostics/refresh` | Monitoring disabled, not running |
| GET | `/api/pair/status` | null, no pair/recovery state |
| GET | `/api/system/preflight` | UNAVAILABLE inert fixture, empty checks |
| GET | `/api/report-set` | Empty members |
| GET | `/api/pair/adapters` | Empty collection, no real adapters |
| GET | `/api/discovery/status` | Valid foreground envelope with null session, monitoring off |
| GET | `/api/tasks` | Empty tasks, zero active/attention |
| POST | `/api/monitoring/preferences` | Exact `{enabled:false,cadenceMs:30000}` body; monitoring remains off |
| POST | `/api/device/{encoded expected ID}/config` | Requires a one-use issued expected ID/value, exact technician.location body and JSON Content-Type; response manually controlled |

No native fetch is invoked; API requests never reach localhost:3001. GET bodies,
queries, other origins/routes/methods, unissued/duplicate writes and incorrect
bodies fail into an independent violation ledger. The listener and browser admit
only reviewed frontend static sources and the exact owned cache. Real WebSockets,
EventSource, window.open, prompts and alerts fail closed. Service workers are
blocked. Vite uses no production configuration/environment, proxy, HMR or socket.
No generic HTTP-success fallback exists.

Each context starts with deterministic, monitoring-disabled browser preferences;
the previous storage snapshot is restored and checked before context closure.
Polling responses are explicit per route. Held responses are resolved by request
identity; no mock automatically discards older responses to hide App behavior.

## Commands and cleanup

Pre-run checks, all exit 0:

```powershell
node --check src/test/browser/app_location_transport.cjs
node --check src/test/browser/app_location_transport_fixture.cjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
git diff --check
```

Exactly one interaction invocation, exit 1 due to the four preserved assertions:

```powershell
$previousDebug = $env:DEBUG
$env:DEBUG = 'pw:browser'
try {
  node src/test/browser/app_location_transport.cjs
  $suiteExit = $LASTEXITCODE
} finally {
  if ($null -eq $previousDebug) { Remove-Item Env:DEBUG -ErrorAction SilentlyContinue } else { $env:DEBUG = $previousDebug }
}
exit $suiteExit
```

Owned root: `C:\Users\Omar\AppData\Local\Temp\discovery-app-location-EtlOhJ`.
Owned listener: `http://127.0.0.1:62332`. The root was newly allocated and checked
for real-path/ancestor redirection ambiguity. All 14 contexts closed; all 28 inert
subscriptions unsubscribed exactly once; all 363 request records terminal, zero
pending; preferences restored in every context. Each context unmounted App and
passed its scroll ownership check. `boundary:[]`, no unexpected HTTP/WebSocket
attempt or React/page exception. The only page-console error was family 7's
declared injected refresh failure. Edge separately emitted one native task-manager
fallback diagnostic on stderr; it was not a React/application error.

Owned Edge PID 20440 exited with code 0, signal null; Playwright logged completed
temporary-directory cleanup. Vite and the HTTP listener closed, with
`listening:false` and `address:null`. The owned root's 19 remaining files were
removed; `cleanupConfirmed:true`, `listenerClosed:true`,
`browserDisconnected:true`, `remainingFixtureRoot:false`. No global process
enumeration, historical-root access or blanket cleanup occurred. Browser cleanup
does not establish native birth-specific ownership or independently enumerate
every renderer descendant.

## Limits and one next task

These are mounted App findings under explicit inert responses, not production
API, backend persistence, real progress transport, camera or field validation.
No backend, provider, camera, native launcher or Phase 18C.7T generated artifact
was run. No production source, schema, security/admission profile or authoritative
staging changed. Production API/WebSocket remains default-deny; native TLS/auth/
ownership, camera gates, 825-file baseline and 64-file ceiling are unchanged.
Phase 18C.7T remains incomplete. No dependency changes, commit or remote operation.

**Initial next-task recommendation (addressed by the addendum below):** separately authorize a bounded fix for App's stale
`fetchData` session-read application, using the preserved out-of-order and
project-replacement failures as regression tests; keep same-ID editor generation
and failed-refresh presentation findings explicitly open if outside that fix.

## Bounded production session-read freshness fix — 2026-10-19

The preceding initial run and its four failures remain historical evidence.
Starting committed HEAD is still `e02f9f9894a7beb31ed2ee1f065b9e3d3ef43e5d`.
The five test implementation files and every assertion were preserved byte-for-byte
(SHA-256 checked before/after); only this report and production `src/ui/App.tsx`
changed during this fix. No commit or remote operation.

### Mechanism and scope

App owns a session-read revision plus an active subscription-lifetime flag.
Each `fetchData()` captures a newly incremented revision before requesting data.
After the session JSON is received, session/project setters run only if that
revision is still current, the subscription lifetime is active and the original
pair-reference check also succeeds. A newer read supersedes an older read even
if the newer read later fails; there is no fallback to obsolete data.

Existing explicitly accepted project/session events invalidate pending reads
before applying their state. This includes session changed/saved, project-bearing
discovery/diagnostic/pair updates, diagnostic evidence and suppression updates.
A project action invalidates old reads before sending its POST, and its existing
post-action `fetchData` establishes a new read. Effect cleanup invalidates reads
and marks ownership inactive before disconnecting. StrictMode's replacement
setup starts a fresh revision; work from the cleaned-up lifetime cannot apply.

No project identity is inferred from device IDs. This is local request/event
ordering, not a new server revision or trust authority. Existing ancillary
monitoring/pair/preflight behavior, request deadlines, acknowledgment validation,
editor generation, callback resolution and failure handling remain unchanged.
In particular, a stale session response being ignored does not automatically
cancel an old same-ID editor acknowledgment.

### One post-fix invocation — complete before/after accounting

The exact syntax/type commands and DEBUG-scoped runner invocation are the same
as documented above. Syntax, TypeScript `--noEmit` and whitespace checks passed.
The single post-fix invocation exited **1: 12 passed, 2 failed, 0 skipped,
0 blocked**. No rerun or remediation of the remaining failures was performed.

| Case | Initial | Post-fix |
| --- | --- | --- |
| Stable ID / pending / refetch | PASS | PASS |
| Non-2xx acknowledgment / retry | PASS | PASS |
| Wrong acknowledgment status / retry | PASS | PASS |
| Wrong acknowledgment ID / retry | PASS | PASS |
| Transport rejection / retry | PASS | PASS |
| A completion while B selected | PASS | PASS |
| A→B→A newer editor | PASS | PASS |
| Close/reopen editor | PASS | PASS |
| Out-of-order session responses | FAIL | PASS |
| Failed-refresh characterization | PASS (inconsistency observed) | PASS (same inconsistency) |
| Project replacement during save, different ID | PASS | PASS |
| Project replacement during save, same ID | FAIL | FAIL — editor acknowledgment |
| Project replacement during refetch, different ID | FAIL | PASS |
| Project replacement during refetch, same ID | FAIL | FAIL — editor acknowledgment |

The two remaining failures both occur at unchanged runner line 205:
`Old work overwrote or acknowledged the new project context`;
actual **Old project save**, expected **New project location**.
Both retain the new project's single Camera A table row. In the held-refetch
case, old response request 21 contains Project One's A/B snapshot, but those
old A/B rows are no longer installed. In the pending-save case, request 22
contains Project Two's new location, but the old editor token still overwrites
its local confirmed display after the callback resolves. The final project-label
assertion is not reached in either failing case; neither complete case is claimed
fixed. This distinguishes session-read suppression from the still-open editor
generation bug.

Family 7 still logs the one explicitly injected refetch failure, displays the
acknowledged local value and returns to Lobby after close/reopen. That behavior
was not repaired or reclassified as successful refresh.

### Post-fix isolation and cleanup

Root: `C:\Users\Omar\AppData\Local\Temp\discovery-app-location-u53N6t`.
Listener: `http://127.0.0.1:61737`. Installed Edge 155.0.4283.45, unchanged pinned
test-only driver. Owned Edge PID **15824** exited normally (`exitCode=0`,
`signal=null`), with completed Playwright temporary-directory cleanup.

All **14 contexts** closed, **28 subscriptions** unsubscribed exactly once,
**360 request records** terminal, **0 pending**, preferences restored per context,
and React unmount/scroll checks passed. `boundary:[]`, no unexpected HTTP/fetch,
WebSocket, React/page exception or console error. The declared family-7 console
error remains; Edge also emitted three native task-manager fallback diagnostics.
Vite/listener closed with `listening:false`, `address:null`; the owned root's
19 remaining files were removed. `cleanupConfirmed:true`,
`listenerClosed:true`, `browserDisconnected:true`, `remainingFixtureRoot:false`.
No global process scan or protected evidence access.

The passing race and different-ID transition cases are fresh mounted-App
evidence. Other project-action, discovery and diagnostic invalidation branches
were inspected/typechecked, not separately runtime exercised. This does not prove
server snapshot ordering, real WebSocket transport, backend persistence, physical
cameras or stress conditions. No schema, backend API, authentication/TLS/native
ownership, camera configuration, production default-deny, 825-file baseline or
64-file ceiling change. Phase 18C.7T remains incomplete.

**Next-task recommendation at the 12/2 checkpoint (addressed below):** separately authorize binding Camera Location editor
and save completion to an explicit App project/session generation, using the two
remaining unchanged same-ID regressions. Keep failed-refresh presentation outside
that task unless separately scoped.

## Project-owned location completion fix — 2026-10-19

Starting branch/HEAD remained `codex/post-field-corrections-1` /
`e02f9f9894a7beb31ed2ee1f065b9e3d3ef43e5d`. The preceding session-read fix and all
five fixture implementation files were preserved. No fixture assertion changed;
their SHA-256 values were checked against the original failing implementation.

### Exact production change

Only `src/ui/App.tsx` changed. `DeviceInspectorDrawer.tsx`, backend APIs, schemas,
acknowledgment fields and requestJson remain unchanged.

- An App-owned object token records project ID, work mode and a local generation.
  Accepted project/session state rotates the token when its context changes.
  Ordinary same-project JSON refreshes and technician metadata updates retain it.
- The identity boundary uses the existing `mode + project.id` context already
  used by backend camera-browser session composition. It does not use device ID,
  pair-object identity, names, mutable metadata or JSON-object identity.
- Explicit App new/open/from-current/quick-work actions force a fresh generation,
  even for reopening an identical saved project ID. New location submissions are
  rejected while such replacement actions are pending; a finally block releases
  the pending count on success or failure.
- The inspector is keyed by that generation. A project replacement unmounts the
  previous inspector, closing its existing exact pending token through the
  drawer's established cleanup, and mounts a new editor even when device ID is
  unchanged. Same-project A→B→A and ordinary refetches retain their prior rules.
- A location callback captures the exact owning object from its rendered App
  context. It checks that object, active lifetime and transition state before
  sending, and again after reconciliation. An obsolete callback cannot resolve
  successfully for the new owner. Name/notes callbacks retain their existing path.
- Session reads additionally capture the current owner object alongside their
  existing revision/pair guards. A read crossing an owner change cannot apply.

Valid old acknowledgments still follow the existing read-only current-session
reconciliation path; they do not send another config POST or adopt the new
project's device by ID. That independent read is revision/owner checked, and its
completion grants no success authority to the old location operation. The old
callback rejects; its unmounted editor treats completion as stale. The previously
sent backend write is not claimed cancelled or rolled back.

### One complete unchanged-fixture run

**14 passed, 0 failed, 0 skipped/blocked; exit 0.** Exactly one post-change
interaction invocation used the same DEBUG-scoped command recorded above. No
retry, compiler/backend run, component-suite rerun or new dependency occurred.

| Case | After refetch fix | After owner fix |
| --- | --- | --- |
| Stable ID / pending / exact body / refetch | PASS | PASS |
| Non-2xx acknowledgment / retry | PASS | PASS |
| Wrong status / retry | PASS | PASS |
| Wrong device ID / retry | PASS | PASS |
| Transport rejection / retry | PASS | PASS |
| A completion while B selected | PASS | PASS |
| A→B→A newer editor | PASS | PASS |
| Close/reopen editor | PASS | PASS |
| Out-of-order session reads | PASS | PASS |
| Failed-refresh characterization | PASS, inconsistency remains | PASS, inconsistency remains |
| Project change during save, different ID | PASS | PASS |
| Project change during save, SAME ID | FAIL | PASS |
| Project change during refetch, different ID | PASS | PASS |
| Project change during refetch, SAME ID | FAIL | PASS |

Both formerly failing same-ID cases now retain **New project location** after
the old completion and reach/pass the final Project Two label assertion. This is
mounted App evidence for the two original failures, not a removed/relaxed check.
The exact stable-ID POST and whitespace-preserving request body, one pending
submission, failure/retry behavior, device switching and previous stale-read
regressions also pass in this invocation.

TypeScript `--noEmit`, both CJS syntax checks and whitespace checks passed.
TypeScript was repeated after the final transition guard adjustment; all checks
were non-emitting. No production build or unrelated suite was run.

### Isolation and cleanup

Fresh owned root:
`C:\Users\Omar\AppData\Local\Temp\discovery-app-location-iGAcg5`.
Listener: `http://127.0.0.1:54463`. Existing `playwright-core@1.56.1` and installed
Edge 155.0.4283.45; real progress transport remains replaced only in the test
profile, and HTTP replies remain inert with strict per-request/body allowlists.

All **14 contexts** closed, **28 subscriptions** unsubscribed exactly once,
**360 request records** terminal and **0 pending**. Preferences restored in each
context; App unmount and scroll-ownership checks passed. No unexpected HTTP,
fetch, WebSocket, page/React exception or console error; `boundary:[]`. Family 7
still emits its one explicitly expected injected-refresh console error. Edge
separately emitted three internal task-manager fallback diagnostics.

Owned Edge PID **20028** exited normally (code 0, signal null), with completed
Playwright temporary-directory cleanup. Vite and the listener closed; listener
`listening:false`, `address:null`. Nineteen remaining owned files were removed;
`cleanupConfirmed:true`, `listenerClosed:true`, `browserDisconnected:true`,
`remainingFixtureRoot:false`. No global process enumeration or protected-session
access occurred. No native birth-specific ownership or renderer-descendant
enumeration claim follows from Playwright cleanup.

### Unchanged exclusions and remaining issue

Family 7 still displays Acknowledged only after a valid acknowledgment and failed
refetch, then Lobby after close/reopen; it remains an inconsistency explicitly
outside this correction. Backend persistence, server-side write/session binding,
real progress transport, cameras and field/stress conditions remain unverified.

The ownership token is App-local, not the backend's private process-local session
generation. Exact context changes and App-initiated reopen boundaries are covered
by the design; an otherwise indistinguishable same-mode/same-project-ID reopen
initiated elsewhere cannot be authenticated from the current session payload.
No broader backend-incarnation guarantee is claimed. Local replacement-command
guard branches were inspected/typechecked; this fixture injects session events
and does not execute those project commands.

No backend, project schema, production authentication/TLS/native ownership,
camera configuration, admission or release policy changed. Production API/WS
remains default-deny, Phase 18C.7T incomplete, authoritative baseline 825 and
manifest ceiling 64. No commit, staging or remote operation.

**Next-task recommendation at the 14/0 checkpoint (addressed below):** separately scope the acknowledged-save/failed-refetch
UI inconsistency, defining how acknowledged local metadata and unavailable
project refresh should be presented without falsely claiming fresh project data.

## Acknowledgment versus project reconciliation — 2026-10-19

### Minimal callback/error contract extension

Changes in this task are limited to:

- `src/ui/App.tsx`: `fetchData(true)` returns an internal session-refresh result
  (`applied`, `failed` or `stale`). Existing no-argument polling/action callers
  retain `Promise<void>`, the same requests, state application guards and logging.
  Location callbacks require an applied result in the current owning generation
  and read revision, with a refreshed device whose location exactly matches the
  submitted string. No trimming, automatic replay or backend API change.
- `src/ui/components/DeviceInspectorDrawer.tsx`: a specific
  `CameraLocationRefreshError` carries a bounded acknowledged-but-unreverified
  message. The existing Promise<void> callback contract remains: only reconciled
  success resolves. The editor preserves the confirmed Project value and draft
  on that error; unrelated failures retain their existing error behavior.
- `src/test/browser/app_location_transport.cjs`: only family 7 and the expected
  case count changed. Following explicit owner clarification, old expectations
  requiring the bug (submitted value shown with no alert) were replaced by
  retained confirmed value plus an actionable acknowledgment/refresh warning.
  Three additional cases cover non-2xx reads, supersession and value mismatch.
- This existing evidence report, updated additively.

The earlier read-revision, effect-lifetime and exact project-generation ownership
fixes remain. Successful HTTP acknowledgment alone does not resolve a location
save. A refresh may be non-2xx, rejected, stale, superseded after application or
return a snapshot not confirming this value; those states cannot grant callback
success. A project-generation change still invalidates the old editor rather
than delivering its error/success to a new owner.

The error distinguishes knowledge precisely: "The server acknowledged this
Camera Location update"; refresh failed/was superseded/did not confirm the value;
"persistence has not been reverified." It retains the draft and offers "Try
again to resend the update and refresh." It does not say the server rejected,
lost or rolled back a validly acknowledged save. Retry is user initiated and
explicitly resends; no automatic write was introduced.

A session applied before an unrelated ancillary readiness failure is still an
applied session result; other polling failures keep their existing logging. This
change is about actual Project reconciliation, not requiring every ancillary
status endpoint to succeed or introducing new polling semantics.

### Fresh single-run results

**17 passed, 0 failed, 0 skipped/blocked; exit 0.** One focused invocation, no
retry. All original 14 scenario slots ran, with the explicitly corrected family-7
expectations, plus three added controls. Families 1–6 have passing counts
1/4/1/1/1/1; family 7 has four passes; family 8 has four passes.

| Family-7 control | Fresh result and concrete observation |
| --- | --- |
| Valid acknowledgment, rejected refresh, user retry | PASS: confirmed Lobby remains; draft Acknowledged only retained; alert states server acknowledgment, failed refresh and unverified persistence, without claiming "was not saved". Save is enabled. Close/reopen remains Lobby. An independently numbered user retry with valid acknowledgment and matching current snapshot succeeds; alert clears and reopening shows the reconciled value. |
| Valid acknowledgment, session HTTP 503 | PASS: confirmed Lobby remains; exact draft retained; acknowledged/refresh-failed alert. |
| Valid acknowledgment, older refresh superseded by a newer read | PASS: late response containing the submitted value cannot confirm it; current Lobby retained with superseded warning and draft preserved. |
| Valid acknowledgment, applied current snapshot still contains Lobby | PASS: submitted Unverified value is not promoted; alert says the refreshed Project did not confirm it and persistence was not reverified. |

All 13 other existing cases passed unchanged, including exact stable-ID/body and
whitespace semantics, pending duplicate prevention, four invalid-ack/retry cases,
device switching, A→B→A, close/reopen, out-of-order reads, and all four different/
same-ID project replacement combinations.

Static verification reconstructed the original runner **in memory**, restoring
only its original family-7 block and count 14. Its SHA-256 matched the original
`EDA5ACCA43DD53999410635454AC0D0272E7BC999B263B5C9B26FCB8AD2E5DA1`, proving
the rest of the runner and assertions were unchanged. No historical fixture
root was accessed for this comparison. The other four fixture implementation
files remain byte-for-byte unchanged.

Commands: both CJS `node --check` commands, TypeScript
`node node_modules/typescript/bin/tsc --noEmit --pretty false`, and
`git diff --check` passed. The interaction invocation was the same
DEBUG-scoped `node src/test/browser/app_location_transport.cjs` command recorded
earlier, now expecting 17 cases. No broad suites, production build, compiler or
backend run occurred. The older 23-case component suite was not freshly rerun.

### Isolation and cleanup

Exact new root:
`C:\Users\Omar\AppData\Local\Temp\discovery-app-location-GId4Iy`.
Listener: `http://127.0.0.1:49455`. Same pinned `playwright-core@1.56.1`, installed
Edge 155.0.4283.45, strict inert fetch and WebSocket-denial boundaries.

All **17 contexts** closed, **34 subscriptions** unsubscribed exactly once,
**446 request records** terminal, **zero pending**. Preferences restored per
context and all React unmount/scroll checks passed. No unexpected HTTP/fetch,
WebSocket, page/React exception or console error; `boundary:[]`. The rejected-read
control produces its one declared `Failed to fetch backend data: ... Injected
refetch failure` console diagnostic. Edge emitted two separate internal
task-manager fallback diagnostics, not application exceptions.

Owned Edge PID **20116** exited with code 0, signal null; Playwright logged
completed temporary-directory cleanup. Vite/listener closed (`listening:false`,
`address:null`); 19 remaining owned files removed and the exact root absent.
`cleanupConfirmed:true`, `listenerClosed:true`, `browserDisconnected:true`,
`remainingFixtureRoot:false`. No global process enumeration or protected-session
access. These are fixture lifecycle results, not native file/image identity or
independent renderer-descendant ownership proof.

### Remaining limits and next task

The formerly observed failed-refresh UI inconsistency is corrected in these
mounted App controls. Real backend persistence, disk durability, actual progress
transport, remote same-context session incarnation, physical cameras and stress
remain unverified. The warning describes this uncertainty rather than claiming
that fixture snapshots prove persistence. No new read timeout or automatic
refresh-only retry mechanism was introduced; the explicit retry resends the save.
Closing an editor still discards its local draft/error by the existing lifecycle.

No backend/schema, camera configuration, authentication/TLS/native ownership,
admission/release policy, default-deny, 825-file baseline or 64-file ceiling
change. Phase 18C.7T remains incomplete; no staging, commit or remote operation.

**Exactly one next task:** perform a read-only commit-readiness review of the
accumulated App corrections and regression evidence for a local checkpoint.
