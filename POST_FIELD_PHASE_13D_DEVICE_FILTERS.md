# Phase 13D — Additional Device Filters

Branch: `codex/post-field-corrections-1`
Starting HEAD: `3b840a185d57181a3e36b4741b86b70210f31ea7`

## Behavior

Only the existing Filters panel is expanded. Primary organization remains Scan | Search | Ethernet | Diagnostics | Filters.

- Manufacturer choices come from current device vendor evidence, with blank evidence represented as Unknown. A selected vendor that disappears remains selected with a “no current devices” label and zero matches; enrichment updates choices/results.
- Configured State uses the same effective state as the table: manualOverride ?? inferred ?? null. True, false and null match Configured, Not Configured and Unknown respectively. No inference or override behavior changes.
- Report Set matches actual currentDeviceId membership from the existing snapshot. Filtering never adds or removes members.
- Project Membership uses a runtime-only projection of the database's existing Project member IDs, excluding live-only discoveries. Quick Work exposes no Project members. No persisted Device property or project schema changes.
- All six filter categories combine with AND semantics and unchanged text search. Non-default categories count toward the indicator; Search remains excluded as in Phase 13C.
- Clear filters resets all six categories without clearing Search or unrelated state. Closing the panel preserves selections.
- Existing state updates refresh results without restart. Same-IP identities remain independent. Controls retain keyboard access, focus styling and light surfaces.

## Focused validation

New browser checks: 47 passed. New database membership checks: 6 passed.

Browser suites: device_filters 47; filter_toolbar 38; inline_names 22; inline_notes 27; bulk_actions 33. Total: 167 passed.

Non-browser suites: filter_membership 6; ui 37; report_set 39; project_persistence 28; project_reverification_workflow 24; camera_configuration 40. Total: 174 passed.

Combined final result: 341 passed, 0 failed, 0 skipped. An initial browser assertion counted startup requests as filter mutations; its capture now begins before filter interactions. No application behavior was changed to accommodate that fixture correction.

TypeScript (`npx tsc --noEmit`): passed. Production build (`npm run build`, including tsc): passed. Diff check: passed. Review confirms existing Search/Status/Type predicates, primary toolbar, identity and network behavior remain unchanged. Existing Project membership mutation routes publish fresh session snapshots.

Tests used mocked browser APIs and simulated configuration providers; no physical camera/network operations. A temporary Windows user-info compatibility shim was used only by tests and removed afterward.

## Files and limits

Changed: src/ui/App.tsx, src/types/index.ts, src/core/storage/project_db.ts, src/test/filter_membership.test.ts, src/test/browser/device_filters.cjs, and this record.

Full regression, complete browser suite, and full integration validation were intentionally not run. Physical validation remains outside this phase. Three original untracked CCTV trace files remain untouched. Phase 13D only; no later correction started.
