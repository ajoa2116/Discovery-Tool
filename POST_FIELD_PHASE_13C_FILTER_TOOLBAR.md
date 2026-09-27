# Phase 13C — Compact Search / Filter Toolbar

Starting branch: `codex/post-field-corrections-1`
Starting HEAD: `2386567469b35e0f7987b7fc6d2c359f2e7ab5c5`

## Result

The primary toolbar is Scan | Search | Ethernet | Diagnostics | Filters. Search is capped at 240px. Ethernet and Diagnostics retain their existing content and behavior and remain visible whether Filters is open or closed. Previously they were children of the conditional filter section.

Filters opens an initially closed, compact inline panel containing only the existing Status and Type controls. Existing options and filtering/search predicates are unchanged. Selections persist while the panel is closed. The button displays the number of active Status/Type filters; selecting All clears each existing filter normally. Keyboard opening focuses Status, Escape returns focus to Filters, and controls have accessible names and visible focus. Controls wrap at narrower widths while retaining the light theme.

## Validation

- New toolbar browser checks: 38 passed.
- Selected existing browser checks: Phase 8 Diagnostics navigation 34; post-Pair adapter indicator 15; inline Name 22; inline Notes 27; Phase 13B bulk actions 33.
- Total browser checks: 169 passed, 0 failed, 0 skipped.
- Related non-browser checks: UI 37; settings completeness 41; technician attention 29; post-Pair enrichment 57; V1 integration test file 39.
- Total related non-browser checks: 203 passed, 0 failed, 0 skipped.
- Combined focused total: 372 passed, 0 failed, 0 skipped.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- `git diff --check` passed.
- Diff review: search/filter predicates, adapter and Diagnostics behavior are unchanged. No backend or network changes.

Browser checks used the actual App with mocked APIs/WebSocket events in headless Edge at representative widths 900, 640 and 440px. The temporary test-only Windows user-info fallback handles unavailable `uv_os_get_passwd` in this execution environment; it is not application code. No hardware/network mutation or recovery action was performed.

## Files

- `src/ui/App.tsx`: toolbar organization, compact panel, filter indicator and focus handling.
- `src/test/ui.test.ts`: update Filters structural assertion to its accessible control relationship.
- `src/test/browser/filter_toolbar.cjs`: focused toolbar regression checks.
- `POST_FIELD_PHASE_13C_FILTER_TOOLBAR.md`: this validation record.

## Boundaries and limitations

The full regression suite and complete browser suite were intentionally not run. This is focused Phase 13C validation, not an integration-validation milestone or physical field retest. No new filter categories were added. The three existing untracked CCTV trace files were left untouched. Phase 13C is complete; later phases have not been started.
