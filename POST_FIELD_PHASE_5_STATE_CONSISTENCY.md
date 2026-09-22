# Phase 5 — Final scan state and clean Project Reverify

Starting branch: `codex/post-field-corrections-1`

Starting HEAD: `6582c225af950f15cdbbc2f9d50e7eeb58d2ad16`

The expected checkpoint matched and tracked files were clean. Master Blueprint
v1.1 and the supplied Phase 5 specification remain authoritative. Only
FIELD-STATUS-01 and FIELD-PROJ-02 are addressed. No physical pass is claimed.

## Root causes and corrections

The discovery pipeline already awaited enrichment before reconciliation and
completion. However, final reconciliation recomputed only former collision rows.
Ordinary rows retained intermediate status values even when their merged final
evidence said LOCAL. Discovery upserts can replace an enrichment status with a
later intermediate status. Enrichment also prefers a stored relationship adapter,
which may be stale after topology changes.

The shared final reconciliation now receives the current scan's enumerated eligible
interfaces. After identity ingestion and current-IP collision reconciliation, it
recomputes subnet and visible status for all rows before PHASE_COMPLETE and
SCAN_COMPLETE. Foreground Scan, background discovery, and Reverify staging use
this same pipeline. Progressive updates remain available. Active collision status
retains precedence; historical collision lifecycle and identity matching are unchanged.

Adapter selection prefers a local address on the discovery interface, then a local
address on the previous relationship interface, then a unique eligible local
interface. Interface index is used when supplied; name is the fallback when no
index was recorded. Each address is evaluated, so an unrelated link-local address
cannot override a matching Ethernet address. Existing discovery eligibility rules
exclude virtual/VPN/internal interfaces. If several local interfaces match without
unique provenance, classification is LOCAL but no relationship adapter is guessed.
If none match, the originating/relationship interface or sole eligible interface
provides the comparison; insufficient context yields UNKNOWN.

The existing diagnostic status rules consume current-IP diagnostic evidence,
recent WS-Discovery response evidence, and recent TCP enrichment results. Discovery
and TCP evidence must not be future-dated and use the existing 90-second freshness
window. Same-subnet membership alone never implies Online. Final projection does
not increment diagnostic failure counters. No probe, adapter mutation, camera
configuration, credential operation, or additional Task is introduced by this pass.
The pre-existing explicit Scan Tasks projection is unchanged.

Reverify already distinguished persistent identity/IP changes from runtime
observations. Its subsequent verification, missing-device, candidate, and summary
history events nevertheless called appendHistory, which always marked the project
dirty. These operational events now explicitly use a runtime history path.
History remains visible, bounded, and included in the next explicit Save under the
existing project schema, as with monitoring snapshots; recording observations
does not independently trigger an unsaved-document indication. Existing saved
history is preserved. There is no project format change or automatic save.

Actual persistent IP/anchor updates, explicit additions/removals/replacement
confirmation, technician name/location/Notes edits, and existing persistent history
or configuration actions still dirty the project. Existing unsaved edits remain
dirty across Reverify. Save/open continue establishing the clean baseline.

## Tests and validation

Tests were added before production changes. Initial baseline: 17 passed, 15 failed
(seven final-status checks and eight observational dirty-state checks). The
no-communication fixture was subsequently corrected to avoid retaining a recent
successful WS-Discovery response from its seeded saved device. Two additional
tests reproduced multi-interface fallback and future-timestamp failures before
their fixes. No assertion was weakened to obtain green results.

One previous Reverify growth assertion explicitly required dirty state for mere
discovery. It was updated to the new locked clean-state requirement and strengthened
with a verification-history assertion; existing membership/export checks remain.
The browser harness waits for result content rather than the initial Done button,
which can appear before the Reverify effect starts. It emits the actual supported
project-session event for persistent edit/save snapshots.

- Phase 5 focused: **43 passed**; T01–T28/T30 plus evidence and preservation cases.
- Phase 5 browser: **13 passed**, including T29 and foreground intermediate/Ready state.
- Phase 1: **50 passed**; Phase 2: **46 passed**; Phase 3: **46 passed**; Phase 4: **42 passed**.
- Full suite: **2,205 assertions across 60 test files; 0 failed, 0 skipped**.
- Browser total: **81 passed, 0 failed, 0 skipped**: Phase 5 (13), background collisions (13), Scan/monitoring separation (41), retained network (14).
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed (TypeScript, Vite, build identity).
- `git diff --check` passed; final diff reviewed for scope.

Tests used injected transports, in-memory projects, and mocked browser backend
requests. No real Windows network configuration, camera configuration, credentials,
or recovery data was changed. The known Node identity lookup failure was worked
around with a temporary userInfo fallback outside the repository. The shim was
removed and NODE_OPTIONS unset after validation. Vite/build required execution
outside the filesystem sandbox because esbuild could not read parent directories.

## Files

- `src/core/engine/collision_reconciliation.ts`
- `src/core/engine/phase4_reconcile.ts`
- `src/core/engine/pipeline.ts`
- `src/core/engine/reverification.ts`
- `src/core/storage/project_db.ts`
- `src/test/final_state_consistency.test.ts`
- `src/test/project_reverification_workflow.test.ts`
- `src/test/browser/final_state_consistency.cjs`
- This closeout document.

## Field status and remaining risks

FIELD-STATUS-01 and FIELD-PROJ-02: **software validated; physical retest pending**.
Phase 1/2 identity/enrichment, Phase 3 retained-network/recovery, and Phase 4
collision protections remain covered. FIELD-HIST-01 recording is preserved.
All other deferred items remain deferred; Phase 6 was not started.

Physical retest: keep Ethernet `192.168.1.205/24` unchanged and scan the camera at
`192.168.1.100` with Wi-Fi/link-local interfaces also present. Verify LOCAL and
evidence-supported status immediately at Ready, before background monitoring.
Check a genuinely different subnet, absent responses, active collisions, and a
resolved collision. Open a clean two-camera project, run unchanged Reverify, and
verify 2 verified/0 missing/0 new/0 replacements/0 collisions with no Unsaved changes.
Verify History, explicit edits, Save, and a subsequent unchanged Reverify.

Software tests cannot establish physical receipt or adapter routing on hardware.
Topology is the scan's captured evidence, not an atomic guarantee against external
network changes mid-scan. Ambiguous neighbor ownership remains governed by Phase 2.
Operational history since the last Save is not independently forced to disk.
The existing legacy recovery record requires separate resolution and was untouched.
The three pre-existing untracked field trace files were not read, modified, deleted,
or staged. The intended physical Ethernet configuration remains untouched.
