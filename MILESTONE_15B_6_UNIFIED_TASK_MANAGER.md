# Milestone 15B.6 — Unified Technician-Visible Task Manager

Branch: `codex/milestone-15b6-unified-task-manager`

Starting HEAD: `2a755c5a5e1c139a4363661bbfdc0f49012d73df`

Final HEAD / commit hash: the commit containing this closeout; resolve with `git log -1 --format=%H -- MILESTONE_15B_6_UNIFIED_TASK_MANAGER.md`. Its exact hash is reported in the delivery message rather than embedded in its own commit.

Commit message: `Add unified technician task visibility and safe operation cancellation`

## Architecture findings

Existing operation models already own execution and safety. ForegroundDiscovery owns session IDs, revisions, reservation and cancellation. AdvancedScanService exposes measured target progress. PairService owns one adapter session, its purpose, state machine and persistent recovery snapshot. Bulk services own batch IDs, device results, worker concurrency and safe cancellation. Project Reverify exposes an awaited workflow but no incremental device counter. Report routes return only after rendering. Manual diagnostics return HTTP 202 before asynchronous checks finish. Monitoring is infrastructure and already has an aggregate status.

The implementation adds an in-memory operational projection, not another execution queue. Source state machines, confirmations, concurrency limits, device inventories, Project History and Report History remain authoritative. CameraConfigurationService adds only a read-only cloned batch getter for observation. Diagnostic controller cleanup now checks ownership so an older completion cannot remove a newer request's cancellation controller.

## Task model and UI

Task identity is stable for an operation. Existing foreground and Pair session IDs are reused. Bulk planning starts one task, associates the returned authoritative batch ID, then resumes that same task after confirmation. Work without an existing operation ID receives a generated correlation ID. Metadata includes type/title, QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED/NEEDS_ATTENTION, timestamps, a controlled phase, measured progress where available, safe support reference, cancellation capability and supported navigation. Adapter tasks include numeric interface and valid IP context.

The main-shell Tasks button shows authoritative active and attention counts. Its compact side panel shows recent tasks, selected details, timestamps, progress, safe references and real cancellation. Background monitoring appears separately in a quiet footer. Light/dark styles, small viewport bounds, focus containment, inert background and Escape/focus restoration are verified. Bounded HTTP polling refreshes state every 1.5 seconds after the previous request settles, with a five-second deadline and teardown cancellation. Unavailable status retains a visibly stale snapshot and hides Cancel.

No fabricated percentages are used. Quick Scan, bulk planning, Project Reverify and report rendering are indeterminate when the backend exposes no reliable work counter. Advanced Scan counts only its actual target-check stage; diagnostics count settled checks at device level; bulk counts executed device results, not skipped devices. A request to cancel remains RUNNING until its owner supplies a terminal result.

## Integrated operations

| Operation | Authoritative source and behavior |
| --- | --- |
| Quick Scan | One foreground session task; preparing, scanning, stopping and terminal state follow ForegroundDiscovery. |
| Advanced Scan | Same foreground ownership with exact-session progress from AdvancedScanService; stale revisions and previous sessions cannot alter newer work. |
| Project Reverify | Awaited production route; indeterminate work; completed, failed, cancelled or replacement-review attention. Existing Project History remains available. |
| Pair | Existing state machine, camera-response detail and explicit-confirmation attention. Verified temporary configuration retains Restore attention. |
| Restore | Separate attempt task; original Pair/Match attention resolves only after authoritative RESTORED. Failed Restore retains recovery. |
| Match Network | Existing NETWORK_MATCH Pair purpose, adapter target and original recovery source. |
| Bulk Re-IP / Bulk Configure | One parent from plan/confirmation through execution; authoritative batch progress/results. Existing preview cancellation resolves attention. Retry plans receive their new batch correlation. Per-device substeps do not create tasks. |
| Reports | PDF/CSV/JSON export completes after backend rendering. Open Reports navigates to the existing report surface, not a duplicate history or retained report binary. |
| Project operations | Existing create/open/save/create-from-current/add-existing confirmation routes. Open Project History navigates to the existing current-project surface. |
| Diagnostics | One task per explicit diagnostic request, not per ping or device check; completion follows all owned asynchronous checks. |
| Single-camera configuration | Existing network/configuration Apply routes; unverified results require review. Tasks does not initiate new camera writes. |

Monitoring ticks, enrichment/neighbor/ping substeps, credential suggestions and credential selection, ordinary reads, report previews, individual capability checks and support trace micro-events intentionally do not become top-level tasks. Their established operation-specific UI/evidence remains available. This avoids duplicate progress and continuous task noise. No new discovery methods or physical-camera behavior was added.

## Cancellation, retention and recovery

Tasks delegates cancellation to the exact foreground session, active Reverify workflow, batch cancellation or diagnostic request's owned controllers. Bulk cancellation stops scheduling according to existing safe semantics and waits for active workers. Duplicate Apply requests cannot mutate a running task. Pair, Restore, Match Network and single-camera mutation tasks expose no new cancellation. Existing safety and confirmation controls are unchanged.

Recent terminal history is capped at 100 entries, ordered by latest terminal transition. Live tasks and the current adapter confirmation/recovery condition are retained outside this recent-history cap. Repeated polls do not rewrite completion timestamps or resurrect evicted terminal sessions. Superseded Pair preparation resolves as cancelled. Ordinary tasks disappear on server restart. Existing persisted Pair/Match recovery recreates NEEDS_ATTENTION; no second recovery store, persistent task database, project schema migration or offline device store was introduced.

## Security and support

Titles and phases come from controlled phrases. Raw request bodies, device names, adapter aliases, error stacks, credential values and factory hints are not copied into task text. IDs and OP references are constrained; adapter target text accepts only a numeric interface and valid IPv4. The Tasks API exposes only compact monitoring status, not raw monitoring errors. Support bundles include the bounded task snapshot through the existing recursive sanitizer. Lifecycle transitions add compact correlation evidence to the existing application audit; individual progress ticks do not generate audit noise. Project/report credential boundaries remain unchanged.

## Validation

- Focused Task Manager assertions: **91 passed**.
- Full regression: **1,865 assertions passed across 53 files**, including the focused suite.
- Browser checks: **182 passed**: Tasks 25, field workflow 25, post-Pair 15, Advanced Scan 76, scan/monitoring separation 41.
- Failed: **0**. Skipped: **0**.
- TypeScript: `npx tsc --noEmit` **PASS**; production build also runs TypeScript.
- Production: `npm run build` **PASS**, 1,604 modules transformed.
- Final diff whitespace/source/status review: **PASS**.
- Regression counts include the consolidated engine suite's 19 emoji-prefixed PASS assertions, which required correcting the count parser; that suite passed both runs. The focused suite tests real Express route observation with controlled backend results and held requests, alongside state-model and recovery projections.
- The Windows uv_os_get_passwd/ENOMEM problem actually occurred. The authorized narrowly scoped identity shim was used outside the repository, then removed. NODE_OPTIONS is unset; no shim is committed.
- No physical adapter mutation, camera credential attempts or physical validation were performed. UI checks use a mocked backend, and operation tests use controlled providers.

## Files and Git

1. `src/shared/tasks.ts` — browser-safe task contract.
2. `src/core/tasks/task_manager.ts` — bounded projection, safe text, lifecycle, correlation and cancellation delegation.
3. `src/core/tasks/operation_tasks.ts` — foreground, adapter and bulk state projections.
4. `src/server/task_routes.ts` — task endpoints and observation of awaited production routes.
5. `src/server/index.ts` — lifecycle wiring, explicit diagnostic completion and support integration.
6. `src/core/network/camera_configuration_service.ts` — read-only batch snapshot getter.
7. `src/core/readiness/support_bundle.ts` — optional sanitized task evidence.
8. `src/ui/components/Tasks.tsx` — shell indicator, side panel, details and safe controls.
9. `src/ui/App.tsx` — Tasks entry and existing-surface navigation.
10. `src/test/task_manager.test.ts` — focused architecture and HTTP regression coverage.
11. `src/test/browser/tasks.cjs` — browser/UI checks.
12. This closeout.

Line changes: 12 files; 593 additions and 6 deletions.

After commit, tracked state is clean. Pre-existing untracked `CCTV_Adapter_Specific.txt`, `CCTV_Receive_Trace.txt` and `CCTV_Wildcard_Selected.txt` remain untouched and excluded.

## Preserved field status and limits

FIELD-DISC-02, FIELD-SCAN-01, FIELD-PAIR-01, FIELD-PAIR-02, FIELD-ENRICH-01 and FIELD-UI-04 remain **PHYSICAL PASS**. FIELD-DISC-03 remains **PHYSICAL CLEAN-START PASS**.

FIELD-NET-01, FIELD-CRED-01, FIELD-OPEN-01 and FIELD-UI-03 remain **SOFTWARE VALIDATED / PHYSICAL RETEST PENDING**. Cameras are unavailable; these statuses have not been upgraded.

Tasks is session visibility, not scheduling or remote management. It does not retain report binaries, reopen historical project files, or expose a universal Retry button; those actions stay in their authoritative workflows. Reverify remains indeterminate until its existing workflow returns a result. New future operation types will need explicit lifecycle adapters rather than generic promise interception. Physical-camera testing is not required to close this UI/operation-observation milestone.

**MILESTONE 15B.6 UNIFIED TECHNICIAN-VISIBLE TASK MANAGER — SOFTWARE VALIDATED**
