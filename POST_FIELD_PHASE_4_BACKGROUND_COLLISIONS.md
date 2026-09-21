# Phase 4 — Background monitoring and collision reconciliation

Starting branch: `codex/post-field-corrections-1`

Starting HEAD: `3c735b7e0c089e6d5e575f7b0d9d9057ac5d2a07`

The checkpoint matched and tracked files were clean. Master Blueprint v1.1 and the supplied Phase 4 specification remain authoritative. The three untracked field trace files were not read, modified, deleted, or staged. No Phase 5 work is included.

## Findings and implementation

The existing background cycle already used the read-only discovery phases and Phase 1 identity matching. Its server gate suppressed every `PAIRED` session indefinitely. Collision reconciliation detected and updated shared-IP groups but never resolved historical records; current reports searched those records by device ID. Discovery and diagnostic upserts marked projects dirty even when only live evidence changed.

`pairBlocksMonitoring` now uses Phase 3 `adapterMutationActive` and `recoveryDisposition`. Healthy retained configurations and historical `PAIRED` state do not block. Incomplete startup recovery inspection, actual adapter mutation, recovery attention/rollback, and apply/verify/restore states remain blocked. Existing foreground discovery, Advanced Scan, Reverify, support capture, and camera-write exclusions remain. Explicit Pair/Restore yield background discovery and cancel current diagnostic refresh before adapter mutation. No monitoring path invokes Pair, Restore, camera writes, credential submission, or provisioning phases.

Background ONVIF discovery and enrichment still use the existing shared identity policy and database merge. Stable IDs, established MAC/UUID anchors, technician metadata, and IP history remain intact. Passive matching now uses the unambiguous Phase 1 selector. Unknown neighbor evidence cannot update an existing identity solely by row ID, and neighbor-only observations cannot move an active collision participant. An IP-only unknown row cannot establish a second physical identity. New unknown-device inventory explicitly requested by Advanced Scan remains supported.

One shared collision reconciliation function serves foreground/background discovery and applied Reverify results. Each shared address has one logical record, retaining its ID and first detection timestamp across repeated cycles and reopening. Current participants are marked `COLLISION`. When their accepted current addresses separate, the record becomes `resolved: true`, `state: RESOLVED`, with updated time and retained historical participant snapshots. Reopening reuses that record and resets obsolete remediation readiness. Multiple groups resolve independently. Audit messages are emitted for lifecycle transitions rather than each unchanged cycle. No schema migration or new collision state is introduced.

Active collision truth is `!resolved && state !== RESOLVED`, shared by footer and current report lookup. The API continues returning the same collision records, including resolved history; consumers can distinguish active/history through existing fields. Current inventory reports no longer find a resolved record as an unresolved device collision. Historical records remain in project serialization and the existing report duplicate-results history. The footer is still noninteractive.

When a row loses collision status, existing diagnostic status rules recompute it from current-IP diagnostic evidence and subnet classification, with recent ONVIF response evidence when newer than diagnostic checks. No cached pre-collision status is restored; an old last-success timestamp alone cannot force Online. Reconciliation does not increment diagnostic failure counters. Loaded resolved history cannot reopen just from saved shared addresses without current verification. A no-response cycle does not infer that a known collision is resolved.

Monitoring upserts have an explicit runtime flag: they update live evidence/history but do not mark a clean project dirty or append persistent membership/change events on every cycle. Explicit saves still capture current state. Foreground edits and the existing Reverify dirty-state policy remain unchanged. Diagnostic results are also runtime-only, retain current identity/metadata, preserve an active collision status, and are discarded if their target IP is no longer current. Normal monitor cycles still create no technician Tasks.

## Validation

Focused tests were added before production changes. The initial baseline run reproduced 17 failing checks with 18 passing checks, including missing gate policy, unresolved historical collisions, dirty state, report/footer inconsistency, restart history, and stale-status derivation. Additional regression cases exercise actual passive inputs, Reverify application, no-response cycles, late diagnostics, and IP-only unknown rows.

- Phase 4 focused: 42 passing checks, covering T01–T28 and additional edge cases.
- Phase 1: 50 passed; Phase 2: 46 passed; Phase 3: 46 passed.
- Full regression: 2,162 assertions across 59 test files; 0 failed, 0 skipped.
- Browser: 68 passed, 0 failed/skipped: background collision lifecycle 13, scan/monitoring separation 41, retained-network workflow 14. The new browser test uses snapshots from the actual reconciliation and report services, with browser backend requests mocked.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- `git diff --check` passed; final scope reviewed.

Existing assertions were not weakened. One overbroad passive guard detected by the local-host exclusion suite was narrowed to existing identities, preserving explicit unknown discovery. A browser selector was scoped to table rows to exclude the identically named status-filter option. Tests used fake transports/adapters; no real Windows adapter or camera configuration was changed. No TEMP identity shim or NODE_OPTIONS override was needed.

## Files changed

- `src/core/engine/incremental_discovery_monitor.ts`
- `src/core/engine/phase3_probing.ts`
- `src/core/engine/phase4_reconcile.ts`
- `src/core/engine/collision_reconciliation.ts` (new)
- `src/core/engine/pipeline.ts`
- `src/core/storage/project_db.ts`
- `src/core/reporting/report_service.ts`
- `src/shared/collision_state.ts` (new)
- `src/server/index.ts`
- `src/ui/App.tsx`
- `src/test/background_collisions.test.ts` (new)
- `src/test/browser/background_collisions.cjs` (new)
- This closeout document.

## Field status and remaining risks

FIELD-DUP-02 and FIELD-DUP-04: software validated; physical retest pending. FIELD-DUP-03 foreground reconciliation protections remain covered. FIELD-STATUS-01 remains pending outside collision-specific status reconciliation. FIELD-PROJ-02 no-change Reverify dirty state and every other deferred Phase 4 exclusion remain unchanged.

Physical retest: retain a verified Pair configuration across restart; put the two established cameras at `.100`; confirm two identities/one active collision; externally return Camera A (`00:50:F9:63:FB:0F`) to `.168` while Camera B (`E4:30:22:CD:68:85`) stays at `.100`; allow normal monitoring without Scan. Verify addresses, identity/history, statuses, zero active collision count, and current report output. Re-collide and verify reopening without record growth; test two simultaneous groups; verify explicit apply/Restore still defer monitoring and Keep Current does not. Compare Reverify and foreground Scan with the same state.

Read-only discovery still depends on receiving trustworthy current identity evidence from hardware. Missing multicast responses or ambiguous ARP alone cannot establish a move. Resolved records preserve history; absence of fresh evidence is not proof of resolution. No physical pass is claimed by these automated tests.
