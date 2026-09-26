# Phase 12A — Inline camera name editing

Branch: `codex/post-field-corrections-1`

Starting HEAD: `39cffabfcb9bce88eb61fd55b15e01e9e2ce8f75`

Commit message: `Add inline camera name editing`

The existing Name editor now saves on Enter or blur/click-away. Escape discards the draft and leaves the confirmed value unchanged. Opening another Name editor submits the previous valid edit and opens only one editor. A synchronous edit reference prevents duplicate submission from Enter followed by blur. Pending writes prevent overlapping edits to the same camera.

The existing technician name field and local metadata endpoint are retained. Every write uses the captured stable Device.id, so IP changes, same-IP peers and table sorting cannot redirect a name change. The table does not optimistically display an unconfirmed name. Failed/rejected/unconfirmed requests show visible feedback; requests are bounded to five seconds. Saving no longer depends on the tiny checkmark. No persistent character counter is displayed.

The input limits names to 100 characters, with defensive validation at the storage update boundary. Entering, cancelling or submitting an unchanged name does not dirty a Project, including an untouched legacy name containing whitespace. Changed names retain the existing whitespace-trimming behavior. Clearing a name clears the technician name and returns to the existing model/vendor display fallback. Quick Work remains session-only; saved Project member changes use the existing dirty/history path. Report Set membership is independent and unchanged.

## Focused validation

- New focused browser checks against the real isolated metadata storage and actual App/table: **22 passed, 0 failed, 0 skipped**.
- Existing truthful configuration boundary: **20 passed**.
- Existing V1 integration, including table sorting: **39 passed**.
- Existing Project history: **39 passed**.
- Existing Project persistence: **28 passed**.
- Existing focused total: **126 passed**.
- TypeScript (`npx tsc --noEmit`): passed.
- Diff whitespace validation: passed.

The first focused fixture incorrectly expected Quick Work's internal dirty flag to remain false; it was corrected to verify the actual existing session-only/no-Project-history semantics. Production Quick Work behavior was preserved. The Windows Node `uv_os_get_passwd` host issue required a temporary identity shim outside the repository; it was removed after validation.

The full regression suite, full browser suite and production build were intentionally not run for this small phase. No production backend or physical camera/network operations were used.

## Files and scope

- `src/ui/components/MasterDeviceTable.tsx`: Name editor lifecycle, length limit, keyboard/blur behavior and visible errors.
- `src/ui/App.tsx`: bounded, acknowledged stable-ID name update.
- `src/core/storage/project_db.ts`: name length validation and unchanged-name no-op.
- `src/test/browser/inline_names.cjs`: focused end-to-end coverage.
- This closeout document.

Notes editing, Rename Device in Actions, menus, reports, discovery, suppression, collision logic, camera configuration, Windows networking and credentials were not changed. The three original untracked field traces were left untouched.

No known blocking issue remains in the tested scope. Physical technician acceptance testing remains pending. Phase 12B was not started.
