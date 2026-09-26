# Phase 9 — Independent Report Set workflow

Master Blueprint v1.1 remains authoritative. Phase 10 is not included.

## Checkpoint

Branch: `codex/post-field-corrections-1`.
Starting HEAD: `76464ff8fa23e5cf8a8de89bd2ecb45474bfde2b`
(`Foreground technician attention and diagnostic results`). Tracked files were
clean before implementation. The three original untracked physical trace files
were not read, changed, staged, or deleted.

## Behavior and boundaries

Report Set is backend-process session state. Each member has an independent
membership ID, an allowlisted Device snapshot, capture/update timestamps, and
current-list presence information. Original stable Device IDs remain unchanged
in stored snapshots. Report input uses membership IDs to keep conflicting
replacement records separate even when their original database ID was reused.

Membership uses the existing shared identity policy: canonical established MAC,
ONVIF UUID, and typed serial fallback. It never matches by IP/name/model.
Ambiguous matches do not pick the first record. Conflicting replacement evidence
does not rewrite an earlier member. Two distinct cameras at one IP can both be
members. Missing MAC evidence does not erase an established report anchor.

Compatible current evidence updates the snapshot, including IP changes, without
creating another member. Reconciliation checks matches in both directions.
Snapshots are captured on runtime/project broadcasts and before list/project
routes, so retention does not depend on the panel being open. Missing or removed
rows retain their last snapshot and are explicitly labelled in Report Set.

Row Actions and selected-device actions provide Add to Report / Remove from
Report. Adds are idempotent, including bulk requests. Removal affects membership
only. An In Report badge marks included current rows. Tools opens a compact,
internally scrollable Report Set panel, including retained members, identities,
individual removal, Create Report, and confirmed Clear Report Set.

Quick Work requires no Project. Adding/removing/clearing members does not change
Project membership, dirty state, history, current-list visibility, camera settings,
adapter settings, or credentials. Scans, monitoring, Project Reverify, collision
resolution, Tasks completion, and Project transitions do not clear the set.

Lifetime: the set survives UI reloads and Project changes while the backend process
remains running. Explicit removal/clear or backend restart ends membership. It is
not serialized into Project files and introduces no durable database schema.

General Reports defaults to the Report Set when nonempty. The panel's Create
Report uses that scope explicitly. Explicit Create Report from Selected uses
selection without changing accumulated membership. An empty explicit Report Set
request is rejected rather than falling back to all current cameras. With an empty
set, general Reports retains existing scope behavior. If membership cannot be read,
general Reports explains the failure instead of guessing the scope.

The existing preview and PDF/CSV/JSON renderer handle snapshot input. Existing
export Task/history behavior remains; membership and preview do not create report
Tasks. Report Set uses generic Report Set context and excludes Project history
because members can span projects and retained/replaced identities. Existing
Project report/history scopes remain available and unchanged. Snapshot/live
metadata distinguishes reports containing retained evidence.

Security uses an explicit report-field allowlist, canonical anchors, and sensitive
text filtering. Raw provider payloads, credential references, passwords, tokens,
and authentication material are not copied. Existing report sanitization remains.
No membership operation submits credentials or invokes camera/adapter operations.

## Validation

- New Phase 9 core tests: 39 passed.
- New Phase 9 actual HTTP/report route tests: 18 passed, including retained PDF,
  CSV, JSON, selection independence, empty scope rejection, and export Tasks.
- Phase 9 focused total: 57 passed.
- Phase 1–8 focused tests: 341 passed (50 / 46 / 46 / 42 / 43 / 39 / 46 / 29).
- Full automated regression: 2,411 assertions passed across 65 test files.
- New Phase 9 browser checks: 24 passed.
- Existing browser checks: 241 passed (Phase 8: 34; Phase 7: 33; Phase 6: 15;
  Phase 5: 13; background collisions: 13; Tasks: 25; field workflow: 25;
  V1 integration: 28; scan/monitoring: 41; retained network: 14).
- Browser total: 265 passed. Final failed/skipped: 0 / 0.
- TypeScript and production build: passed. `git diff --check`: passed.

The initial test-first baseline failed because Report Set was absent. During
validation, an exact label selector was corrected, optional test metadata access
was typed safely, and the new menu entry was moved after Diagnose to preserve
the existing Open-to-Details keyboard order. No existing assertions were weakened.
The preview context was corrected to use generated report metadata.

The known Windows Node `uv_os_get_passwd` / ENOMEM issue required the permitted
TEMP-only identity shim. It is removed after validation; NODE_OPTIONS is not
persisted. UI checks use an isolated fixture backend and UI-only Vite, not the
production hardware backend. No physical network/recovery operations were run.

## Files

- `src/shared/report_set.ts`: report membership types.
- `src/core/reporting/report_set.ts`: independent state, snapshot and reconciliation.
- `src/core/reporting/report_service.ts`: Report Set scope support.
- `src/server/report_set_routes.ts`: read/add/remove/confirmed-clear endpoints.
- `src/server/report_routes.ts`: shared retained preview/export input.
- `src/server/index.ts`: backend lifetime and capture hooks.
- `src/ui/App.tsx`: membership state, row/bulk/panel/report integration.
- `src/ui/components/ReportSetPanel.tsx`: compact membership inspection/actions.
- `src/ui/components/FloatingDeviceActionsMenu.tsx`: row membership action.
- `src/ui/components/MasterDeviceTable.tsx`: membership badge and callback.
- `src/ui/components/SiteSurveyReportModal.tsx`: explicit/default report scope.
- `src/test/report_set.test.ts`: identity/state/independence regressions.
- `src/test/report_set_routes.test.ts`: real HTTP and export regression coverage.
- `src/test/browser/report_set.cjs`: technician workflow browser coverage.
- `src/test/browser/advanced_scan.cjs`: empty Report Set fixture endpoint.
- This closeout document.

## Remaining risks and physical retest

Software validated; physical retest pending. Backend restart intentionally clears
the session set. Retained status/IP are last-known evidence, not proof of current
reachability. IP-only unidentified devices cannot be added until identity is
established. Ambiguous/replacement identities require technician review and
explicit membership decisions. Free text matching sensitive-material patterns is
omitted from snapshots. General report layout/date/columns are deferred.

Physically repeat the sequential 10+ camera workflow: add, disconnect/remove,
connect the next camera, then export the complete set. Retest compatible IP moves,
duplicate-IP identities, Quick Work and clean Project operation, clear confirmation,
page reload and documented backend restart lifetime. Confirm shared-IP access
remains blocked and retained Ethernet 192.168.1.205 remains unchanged.

Commit message: `Add independent Report Set workflow`.
