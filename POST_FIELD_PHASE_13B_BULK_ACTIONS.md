# Phase 13B — Selected-device action bar

Branch: `codex/post-field-corrections-1`

Starting HEAD: `f63f6d35978c4f2ae643e167fc57a13d652a56ed`

Commit message: `Simplify selected-device bulk actions`

The primary selected-device actions are now **Diagnose**, **Configure**, **Create Report**, and **Remove**. Existing explicit Report Set add/remove, Add to Existing Project and Deselect All controls remain as secondary utilities.

Configure exposes Network Configuration and Device Configuration in a light-theme menu with visible keyboard focus, Enter activation, arrow/Home/End navigation, Escape focus return and outside-click dismissal. Both choices call the existing bulk modal openers. The existing minimum of two selected devices remains; with one device the choices are disabled and explained. Credential, capability, provider, stable-ID, execution, Tasks and history logic is unchanged.

Diagnose invokes the existing Phase 8 handler, retaining single-device Inspector and multi-device Tasks routing. Create Report invokes the existing SELECTED report scope and passes the current stable-ID selection. It does not add to, clear or replace Report Set membership.

There was no existing bulk Remove control in this checkpoint. The new button captures the selected current-list stable IDs, asks for explicit confirmation explaining session hiding and unchanged physical devices/Project/Report Set, and sequentially invokes the existing current-list removal handler. It never invokes Project removal. Existing Phase 11 identity suppression and weak-identity limits remain authoritative. A repeated click is guarded; failures stop the batch, retain unconfirmed selection and show the confirmed removal count without claiming complete success.

## Focused validation

- New bulk-action browser checks: **33 passed, 0 failed, 0 skipped**. Includes labels, one/multiple selections, same-IP identities, selection across IP/reorder updates, both existing configuration endpoints, unavailable-operation feedback, selected report scope, preserved Report Set, cancel/failure/removal behavior, Project membership, suppression and keyboard/light-menu behavior.
- Existing non-browser checks: **351 passed** across 12 relevant suites (bulk scope 31, bulk network 38, local-host protection 1, camera configuration 40, Phase 8 attention 29, Report Set 39 + routes 18, report architecture 53 + routes 24, suppression 40 + paths 17, device removal 21).
- Selected browser regressions: **218 passed** (Phase 8 routing 34, report architecture 35, suppression 18, Phase 12A 22, Phase 12B 27, row Actions 19, modal containment 63).
- TypeScript: passed.
- Production build: passed.
- Diff whitespace check: passed.

Existing browser tests were updated only for the requested Diagnose and Create Report labels; their behavioral assertions remain intact. Tests used isolated fixtures, including real Project/Report Set services and blocked configuration responses. No physical camera, adapter or credential operation was executed. The temporary external Node identity shim was removed after validation.

## Files and limits

- `src/ui/components/SelectedDeviceActions.tsx`: focused bar/menu component.
- `src/ui/App.tsx`: existing workflow routing and confirmed current-list batch removal.
- `src/test/browser/bulk_actions.cjs`: focused coverage.
- `src/test/browser/technician_attention.cjs`, `report_architecture.cjs`: updated label selectors.
- This closeout document.

Configuration engines/APIs, row Actions, inline editors, shared modal infrastructure, discovery, identity, collision, Project/Report semantics and suppression implementation were not changed. The three original trace files remain untouched and untracked.

Remaining limits are existing behavior: bulk configuration requires at least two devices and still enforces all backend blockers; weak-identity rows may reappear after removal. Physical acceptance and later full integration validation remain pending. No further correction was started.
