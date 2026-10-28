# Local technician metadata: project-generation precondition

October 28, 2026, Laptop 1. Branch `codex/post-field-corrections-1`.
Starting HEAD `2e89999c2751dbca337f564807f30836f2973bb0`; starting tree clean.
Master Blueprint v1.1 and existing Phase 18C.7T restrictions remain the baseline.

## Internal contract and compatibility

The owner explicitly approved rejecting tokenless local metadata requests.
`SiteProjectDatabase.getSession()` now includes a runtime-only
`metadataWriteContext`: exact fields `version:1`, `projectId`, `mode` and opaque
UUID `generation`. The issuance cache is bound to the existing authoritative
`getSessionGeneration()` symbol; it is not an independent lifetime authority.
Returned contexts are detached copies. The symbol never crosses the transport.

Ordinary edits, polling, save-content and explicit disk saves retain the context.
Existing generation transitions (Quick Work, new/from-current project, import/open,
including same-ID reopen) invalidate it. New database instances issue independent
contexts, modeling backend restart; actual process restart was not executed.

All App Name, Location and Notes writes attach the context from their accepted
session. Requests retain their captured bytes while pending. Name/Notes drafts
retain their edit-origin callback rather than substituting the latest render's
callback. Accepted server-generation changes also invalidate Location editor
ownership, including same-ID replacement. Missing/current-context mismatch or
an active project transition prevents client submission.

`LegacyConfigurationBoundary.updateLocalMetadata` synchronously requires the
context before identity lookup, physical-field checks or metadata mutation.
There is no async gap. The existing HTTP callback returns **409 CONFLICT** with
`code: METADATA_PROJECT_CONFLICT` for missing, malformed or stale context.
Rejection precedes mutation, history/dirty changes, success audit, broadcast and
success acknowledgment. The UI asks the technician to refresh the current
Project and review the intended edit. It does not retry with another context.

This changes the write contract for older clients: tokenless writes now fail;
there is no compatibility bypass. Read-only historical session records remain
representable by the optional TypeScript projection field, but cannot authorize
a write. Physical configuration workflows and physical-field rejection remain
intact. The context is a stale-write precondition, not authentication.

## Changed files

Production/internal contract:

- `src/shared/metadata_write_context.ts`: exact-shape validation and shared conflict.
- `src/types/index.ts`: runtime session projection type only; no saved schema change.
- `src/core/storage/project_db.ts`: generation-bound issuance and validation.
- `src/core/network/legacy_configuration_boundary.ts`: mandatory first check.
- `src/server/backend_application.ts`: typed conflict response, existing success path.
- `src/ui/App.tsx`: capture/transport context and invalidate obsolete editor ownership.
- `src/ui/components/DeviceInspectorDrawer.tsx`: actionable conflict presentation.
- `src/ui/components/MasterDeviceTable.tsx`: capture draft callback and show conflict.

Tests/evidence:

- `src/test/metadata_write_context.test.ts`: in-memory stores and actual HTTP callback
  extracted with TypeScript AST, transpiled and invoked with inert request/response,
  audit and broadcast doubles. No backend composition or listener.
- `src/test/device_location_persistence.test.ts`: issue current context for existing
  writes; add explicit-save context stability/non-serialization checks.
- `src/test/device_location_editing.test.ts` and
  `src/test/truthful_configuration_boundary.test.ts`: valid controls supply context;
  existing behavioral/security assertions remain intact.
- `src/test/browser/app_location_transport_fixture.cjs`: explicit context fixtures,
  strict exact-body validation and visible Notes column for the added controls.
- `src/test/browser/app_location_transport.cjs`: retain all 17 prior cases; add five
  ownership/conflict cases and one exact-name-case selector for bounded validation.
- This report. Earlier reports remain historical evidence, including the formerly
  missing backend generation precondition; this report supersedes that limitation.

## Focused validation and failures

All TypeScript scripts used installed `tsx` with process-scoped
`TSX_DISABLE_CACHE=1`; no dependency changes or downloads.

| Command | Result |
| --- | --- |
| `node --import tsx src/test/metadata_write_context.test.ts` | Final 28 passed, 0 failed |
| `node --import tsx src/test/device_location_persistence.test.ts` | 3 scenarios, 36 grouped checks passed; 0 failed/unrun |
| `node --import tsx src/test/device_location_editing.test.ts` | 26 behavior/static-rendering + 2 source checks passed |
| `node --import tsx src/test/project_persistence.test.ts` | 28 passed, 0 failed |
| `node --import tsx src/test/truthful_configuration_boundary.test.ts` | 20 passed, 0 failed |
| `node src/test/browser/app_location_transport.cjs` | **21 passed, 1 failed**, 0 skipped |
| `node src/test/browser/app_location_transport.cjs --open-name-owner-only` | **1 passed**, 0 failed; other 21 not selected |
| `$env:UI_INTERACTION_GROUPS='ABCDEFL'; node src/test/browser/ui_component_interactions.cjs` | 12 passed, 0 failed; unrelated G–K not selected |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Final exit 0 |
| `node --check src/test/browser/app_location_transport.cjs` and fixture `.cjs` | Passed |
| `git diff --check` | Passed |

The first full App run's first case timed out at `page.goto`'s unchanged 30-second
page-load limit, before its assertions. All remaining cases, including all 17
historical regressions, passed. After confirmed cleanup, only that unexecuted
case was rerun under a new root and passed without weakening its assertion or
timeout. Those historical runs did not establish a clean single-run baseline.

### Subsequent complete validation, October 28

One fresh, unfiltered invocation of `node src/test/browser/app_location_transport.cjs`
completed with **22 passed, 0 failed, 0 skipped; exit 0**. This establishes the
clean full-suite baseline without replacing the earlier timeout evidence.
No production source, tests, assertions, dependencies or timeouts changed for
this validation. The expected 15-file inventory, branch and committed HEAD were
verified before execution; source/test content hashes were retained for comparison.

Family pass counts: ownership/request contract 6; invalid acknowledgments 4;
device switching 1; A–B–A editor generation 1; close/reopen 1; read freshness 1;
acknowledgment/refresh reconciliation 4; project replacement during save/refetch
with same/different device IDs 4. All passed in this invocation.

The strict fixture checked the originating accepted generation context on each
metadata request, including Name and Notes. Missing accepted context prevented
submission; stale draft/conflict controls required refresh/review without automatic
rebinding. Server-side tokenless rejection remains supported by the prior 28-check
handler/boundary evidence, not a live backend call in this run.

All 22 contexts reported zero pending requests, restored preferences and two
StrictMode subscriptions each inactive/unsubscribed exactly once. Boundary
violations were empty, with no unexpected HTTP/WebSocket requests or React/page
errors. One console error was the explicitly expected injected refetch failure.
Browser shutdown/disconnection, listener closure and runner exit were confirmed;
no independent OS-wide descendant-process scan was performed.

An initial TypeScript pass also caught an invalid report-type literal in the new
test; it was corrected to `DEVICE_INVENTORY`. The final 28-check script was rerun
after strengthening same-project/new-store and support-export checks; TypeScript
then passed. Counts are not summed across repeated preflight runs.

The new tests verify exact string values/clearing, same-IP separation, denial
before lookup/effects, malformed and stale contexts, same-ID reopen/A–B–A/Quick
Work/from-current transitions, independent same-project stores, stable ordinary
updates and saves, existing repeated-write semantics, and absence from saved
project bytes, history, JSON/CSV/PDF reports and support exports. Browser checks
verify actionable conflict/no automatic retry, missing context, captured pending
Name/Notes requests and an open Name draft across same-device-ID replacement.

## Isolation and cleanup

Installed `playwright-core@1.56.1` / Edge `155.0.4283.45`; no browser download.
Fresh canonical owned roots, HMR/WebSockets/proxies disabled, exact source/request
allowlists, inert fetch and progress substitution; no production API transport.

| Fresh root basename under the trusted Windows temp parent | Accounting |
| --- | --- |
| `discovery-location-disk-g1jNac` | 6 files removed; root absence confirmed; 12 saves, 9 fresh-store reopens; zero network attempts |
| `discovery-app-location-16rIJH` | 22 contexts; browser disconnected, listener closed; 19 owned files removed, root absent |
| `discovery-app-location-6dl1Iw` | 1 context; exact same cleanup confirmations, 19 files removed |
| `discovery-react-interaction-D7DCeX` | Browser/listener closed; 19 owned files removed, root absent |
| `discovery-app-location-se9spL` | Clean 22-case run: 22 contexts closed, browser disconnected, listener closed; 19 owned files removed, root absent |

Browser boundary violation arrays were empty. Completed App cases confirmed no
pending fixture requests, restored preferences and exactly-once subscription
cleanup. The timed-out first page lacked per-case telemetry; final browser-wide
cleanup closed its context. One console error was the existing explicitly expected
injected refresh failure; no unexpected React/page errors occurred in completed
cases. No protected historical root was accessed or cleaned. The existing generic
persistence test completed its own cleanup without emitting a root-absence record.

## Remaining limits and next step

This does not validate a production HTTP/authenticated transport, restart/power-loss
durability, real backend persistence acknowledgment or physical cameras. The
extracted callback test verifies the actual route body, not Express middleware
execution. New-store testing models generation invalidation; it is not a process
restart test. Same-generation replay and last-write conflicts remain existing
semantics; no exactly-once or per-field revision claim. Unrelated asynchronous
save/open ordering is unchanged.

No authentication/TLS/native ownership/camera gate, default-deny, release policy,
saved-project format, authoritative staging or dependency selection changed.
The 825-file baseline, unresolved records and 64-file ceiling remain unchanged;
Phase 18C.7T remains incomplete. No commit or remote operation.

The clean single-run validation now supports a local checkpoint of the bounded
15-file change set, subject to owner authorization. No automatic checkpoint.
