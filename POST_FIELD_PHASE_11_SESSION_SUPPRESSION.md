# Phase 11 — Manual Current-List Removal + Session Suppression

Starting branch: `codex/post-field-corrections-1`

Starting HEAD: `f2071b47e0eb56101c7c52a0c509c99704469d28`

Commit message: `Keep manually removed devices hidden for the session`

## Cause and implementation

Previously removal hid a row ID, but discovery and verified Project Reverify removed that flag. Project transitions also reset it. The next observation therefore immediately returned a manually removed camera.

`SessionSuppression` now holds identity-only records in the backend database instance. It uses the shared Phase 1/2 canonical MAC, UUID and typed serial policy, including conflicts and bidirectional ambiguity checks. It never matches by IP, manufacturer, model or name. Compatible evidence strengthens a record without rewriting Device.id. Conflicting or ambiguous evidence remains visible rather than hiding another camera. Weak identity receives explicitly limited row-only hiding and truthful feedback.

Filtering occurs at the authoritative Current List snapshot boundary. Full internal inventory remains available for discovery, monitoring, collision reconciliation and access safety. Foreground/Quick Scan, Advanced Scan, ONVIF/provider ingestion, enrichment and repeated monitoring cannot bypass the filter. A safely identified camera remains hidden after moving IP; another camera reusing its old IP remains visible.

Project membership, dirty state, history, Reverify and independent Report Set membership remain intact. A suppressed report member remains reportable. Project transitions preserve strong suppression. Collision evidence is retained; Duplicate Assistant labels hidden participants and does not declare a network collision resolved because a row is hidden.

The Scan menu exposes **Rediscover manually removed cameras** and the active count. It clears active suppression and requests the existing normal Scan. Retained rows wait for fresh discovery or successful Reverify evidence; clearing never fabricates online rows from stale snapshots. An unavailable scan does not restore stale rows. Repeated empty clearing is safe.

Frontend reload preserves backend intent. Backend restart clears both active suppression and the temporary fresh-observation waiting state. Neither registry enters Project export/storage, Report Set data, report history, credentials, Windows registry or a filesystem blacklist. Existing raw Project serialization is unchanged. Tests reload saved membership into a new database instance and prove the device is visible again.

Confirmation and feedback explain session hiding, unchanged Project/Report Set membership and Rediscover. Weak identity copy explicitly says discovery may show the row again. Safe support diagnostics include counts, timestamps, reason and anchor-presence booleans, without notes or credentials. Runtime hidden IDs let Duplicate Assistant distinguish presentation from retained network evidence. No per-cycle Tasks or history noise is added; existing manual-removal audit behavior is retained.

## Validation

- Test-first baseline: 1 passed / 4 failed, reproducing automatic return on discovery, repeated monitoring and IP move, plus missing explicit Rediscover support.
- New Phase 11 focused suites: **57 passed** (40 identity/lifetime/membership checks; 17 actual provider/monitor/Advanced Scan/HTTP/support checks).
- Phase 1–10 focused suites: **475 passed**, included in full regression (50, 46, 46, 42, 43, 39, 46, 29, 57, 77 respectively).
- Complete regression: **2,550 passed across 69 files; 0 failed, 0 skipped**.
- Browser checks: **318 passed; 0 failed, 0 skipped** (18 Phase 11 plus 300 prior-phase checks). Includes keyboard Rediscover, same-backend reload, same-IP separation, fresh evidence after clear, retained Report Set, hidden collision participant and no forbidden mutation requests.
- TypeScript: passed (`npx tsc --noEmit`).
- Production build: passed (`npm run build`).
- Diff whitespace validation: passed.

Existing tests whose automatic-unhide expectation was deliberately superseded now assert persistent suppression and explicit Rediscover. Reverify still asserts VERIFIED saved membership; the unrelated Report Set collision scenario now explicitly rediscovers its reused fixture. No protection assertion was removed to obtain a pass.

The authorized temporary Node identity shim was required for the Windows `uv_os_get_passwd` host issue. It was outside the repository and is removed after validation. One browser rerun invocation omitted the TypeScript loader; it failed before running tests and was rerun with `--import tsx`.

## Files

- `src/core/storage/session_suppression.ts` — runtime identity registry.
- `src/core/storage/project_db.ts` — presentation filtering, lifetime and fresh-observation release.
- `src/server/current_list_routes.ts` — diagnostics and explicit Rediscover route.
- `src/server/index.ts` — routing, feedback, runtime broadcasts and safe support input.
- `src/core/readiness/support_bundle.ts` — safe diagnostic field.
- `src/types/index.ts` — runtime session presentation metadata.
- `src/shared/duplicate_assistant.ts` and `src/core/edge_cases/duplicate_assistant_service.ts` — hidden-participant projection without changing network truth.
- `src/ui/App.tsx` — menu/count, feedback and runtime updates.
- `src/ui/components/DeviceRemovalDialog.tsx` — accurate confirmation.
- `src/ui/components/DuplicateDrawer.tsx` — hidden participant explanation.
- `src/test/current_list_suppression.test.ts`, `src/test/current_list_paths.test.ts`, `src/test/browser/current_list_suppression.cjs` — Phase 11 coverage.
- `src/test/device_removal.test.ts`, `src/test/incremental_monitoring.test.ts`, `src/test/project_reverification_workflow.test.ts`, `src/test/report_set.test.ts` — updated explicit-removal contract and fixture setup.
- This closeout document.

## Safety and remaining physical validation

Only isolated fixtures and the UI development server were used. No production backend, camera configuration writes, credential submission, Windows adapter mutation or recovery operation was run. The three existing field trace files remain untouched and untracked.

Physical retest is pending: remove the Hanwha camera, observe multiple monitoring cycles and Quick/Advanced scans; move its IP; verify a distinct camera at its old IP remains visible; exercise same-IP collision evidence; reload the frontend; use Rediscover; restart the backend. Verify Project/Reverify and Report Set remain independent throughout.

Residual limits are intentional: ambiguous identity fails visible; weak row hiding is not physical session suppression; a cleared camera needs fresh evidence before returning. Hardware/provider behavior still requires that physical cycle. No Phase 12 work is included.

**PHASE 11 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING**
