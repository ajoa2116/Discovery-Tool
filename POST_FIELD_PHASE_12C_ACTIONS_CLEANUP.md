# Phase 12C — Device Actions menu cleanup

Branch: `codex/post-field-corrections-1`

Starting HEAD: `4ba852d9a042c0a3e4c634e857e25b6ab0431d5f`

Commit message: `Clean up device actions after inline editing`

Removed only Rename Device and Edit Notes from the row Actions menu, their menu-only callback props/wiring and icon imports, and the redundant separator left by those entries. The inline Name/Notes editors and technician persistence paths remain unchanged.

Remaining actions retain their prior labels, routing and conditional availability: Open, Duplicate Assistant for collisions, Details, Diagnose, Add to Report / Remove from Report, eligible Pair PC to Camera Network, Device Configuration, Remove from Current List (the existing Quick Work label remains Remove Device), and Project-only Remove from Project.

## Focused validation

- Phase 12C browser checks: **19 passed, 0 failed, 0 skipped**. Covers removed entries, retained context-sensitive entries, Actions versus inline-edit independence and checkbox selection independence.
- Phase 12A unchanged focused browser tests: **22 passed**.
- Phase 12B unchanged focused browser tests: **27 passed**.
- Actions overlay tests: **14 passed**, retaining placement, captured-device, closing and cleanup protections while asserting the requested removal.
- Relevant existing V1/device-table integration tests: **39 passed**.
- TypeScript: passed (`npx tsc --noEmit`).
- Diff whitespace check: passed.

An initial new fixture used the wrong Report Set removal argument; the fixture was corrected to the existing API. No Report Set implementation was changed. The Windows Node identity error required a temporary external shim, removed after validation.

## Files

- `src/ui/components/FloatingDeviceActionsMenu.tsx`
- `src/ui/components/MasterDeviceTable.tsx` (menu props only)
- `src/test/actions_overlay.test.ts`
- `src/test/browser/inline_actions.cjs`
- This closeout document.

No camera, adapter, credential, discovery, identity, collision, Project or Report Set behavior was modified. The three existing untracked trace files remain untouched. No full regression suite, full browser suite or Phase 12 integration validation was run.

No known blocking issue remains in this focused scope. Stopped after Phase 12C; integration validation remains a separate future step.
