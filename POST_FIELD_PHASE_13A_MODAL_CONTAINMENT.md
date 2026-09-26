# Phase 13A — FIELD-UI-05 modal scroll containment

Branch: `codex/post-field-corrections-1`

Starting HEAD: `e26450770af5b6e01254da9984390952933c30f8`

Commit message: `Constrain modal content to the application viewport`

## Cause and shared correction

Dialogs previously used individual containers. Some constrained a body's height without including its header, while others scrolled the whole panel. Several flex children lacked a shrinkable scrolling boundary. There was no common containment contract.

`ModalViewport` now supplies the shared viewport boundary and page-scroll ownership. Its overlay uses `100dvh` with border-box sizing so existing outer padding is included. The panel is a column with a maximum height of the available content box. Explicit `modal-body` slots have `min-height: 0`, internal automatic vertical overflow and contained overscroll. Other panel children do not shrink. Existing headers and footers stay outside the scroll region; dialogs without a footer keep their existing controls in the reachable body. The manual-entry form retains its submit semantics while its existing footer sits outside the scrolling fields.

The shared scroll lock is reference-counted and restores the original inline overflow value only after all owners release it. The existing focus hook uses the same lock, preserving its focus/inert behavior without competing overflow restoration. Backdrop/non-scrollable wheel gestures are contained; internal horizontal scrolling and browser zoom gestures remain available. Existing close/cancel handlers are unchanged.

The component was adopted through small wrapper/body-slot changes in the existing application dialogs; no workflow logic, button action or wording was changed. Camera Access inherits generic containment for its application-owned credential controls. Its iframe, sandbox and access architecture remain unchanged; FIELD-UI-07 is not addressed.

## Focused validation

- New modal containment browser suite: **63 passed, 0 failed, 0 skipped**.
- Representative actual dialogs: Device Configuration, Pair, Camera Access credentials, manual device entry, Network Adapter, Add to Existing Project.
- Viewports: 800×480 and dynamic shrink to 640×360. Verified panel bounds, internal wheel scrolling, fixed headers, existing footer reachability, keyboard close, Cancel, short-content/no-scroll behavior, light surfaces, horizontal scrolling, nested lock ownership and original-overflow restoration.
- Selected existing browser workflows: **271 passed** (Advanced Scan 76, Duplicate Assistant 33, field workflow 25, report architecture 35, V1 integration 28, Tasks 25, Phase 12A 22, Phase 12B 27).
- Selected existing non-browser suites: **277 passed** (Advanced Scan interaction 20, Advanced Scan UI intent 18, UI 37, retained network 46, identity-safe access 39, Duplicate Assistant 46, Add to Existing Project 32, V1 integration 39).
- TypeScript and production build: passed.
- Diff whitespace check: passed.

The initial new fixture returned an invalid Pair adapter payload; it was corrected to an empty array without production behavior changes. The temporary Windows Node identity shim remained outside the repository and was removed after validation. No full regression suite or full browser suite was run.

## Files

Shared implementation: `src/ui/components/ModalViewport.tsx`, `src/ui/modal_scroll_lock.ts`, `src/ui/use_modal_focus.ts`, `src/ui/index.css`.

Wrapper/body-slot adoption: AddToExistingProjectModal, AdvancedScanModal, AttentionActions, BrowserModal, BulkDeviceConfigurationModal, BulkReIpModal, DeviceRemovalDialog, DuplicateDrawer, LegacyOnboardModal, NetworkAdapterModal, NetworkConfigModal, PairNetworkModal, ProjectHistory, ProjectReverifyModal, ReportSetPanel and SiteSurveyReportModal, plus Tasks (all under `src/ui/components`).

Focused fixture and test: `src/test/browser/modal_containment.html`, `modal_containment.tsx`, `modal_containment.cjs`. This closeout document records the result.

## Boundaries and remaining limits

No discovery, identity, collision, Pair, network, credential, Project, Report Set, suppression or inline-editing behavior was changed. No physical camera, Windows adapter or recovery operation was performed. The three original untracked trace files remain untouched.

Existing keyboard/focus behavior is preserved; this is not a dialog accessibility redesign. Embedded camera compatibility remains deferred. Physical technician acceptance and a later full integration-validation phase remain pending. No other correction was started.
