# Milestone 16.2.1 - Advanced Scan interaction and validation hotfix

Baseline: `cbacdb0f6bc378843cde585418adca02a6393f9a` (`Fix Hanwha WS-Discovery Hello discovery path`).
Branch: `codex/milestone-16-2-1-advanced-scan-interaction-hotfix`.
The frozen 16.2 commit is preserved. Software-only validation; no physical scan, Pair, Manual Add, adapter configuration, or camera writes were performed.

## Audit and root causes

### FIELD-ADV-05A - confirmed layout defect (audit A-T)

The modal used a centered fixed overlay (z-50, 12px padding), a flex column with `max-height:94vh` and `overflow:hidden`, then a **fieldset as the flexing grid/overflow container**. Header/footer lacked shrink protection. The fieldset lacked `min-height:0` and had browser-specific fieldset content layout. No sticky, absolute, or fixed footer was present: the apparent overlay was overflowing form content intersecting a normally positioned footer. No pointer-events:none rule caused the blockage.

A reproduction using the original frozen component, actual Tailwind CSS, and mocked APIs in Edge at 700x720, with two added target rows, measured fieldset clientHeight=535 and scrollHeight=988. Assigning scrollTop=1000 still returned **0**; the second section's top remained 547.59px and its bottom was 1067.59px. The footer began at 630.39px. Thus the browser's fieldset was not functioning as the intended scroll owner. Parent overflow clipping hid lower content. At the md breakpoint (768px), two columns became one, amplifying the defect when DevTools narrowed the viewport. Reduced effective width/height also represents zoom pressure; no actual browser zoom setting is claimed.

The replacement structure is portal > viewport-sized overlay > dialog > nonshrinking header / `min-h-0` scrolling div / nonshrinking footer. The disabled fieldset and a separate grid now sit **inside** that div. Body padding includes bottom spacing and feedback. Messages cannot expand the shell outside the viewport; feedback scrolls into view on failure/preparation. The dialog uses `100dvh - 24px`, min-width constraints, and the same colors/controls. Only the body scrolls, including under the pointer. There are no speculative z-index increases. A body portal avoids ancestor clipping/stacking contexts. Background siblings become inert, body scrolling is locked, Tab/Shift-Tab are trapped, Escape closes when not preparing, and closing restores prior focus and inert/overflow values. X and Cancel intentionally cannot claim cancellation of backend preflight; they become available when the bounded wait ends.

### FIELD-ADV-05B - confirmed symptom, audited failure paths (audit U-AS)

Validation was inferred from the **absence** of a matching result rather than explicitly owned as a state. The 300ms debounce, AbortController and active/key stale guards were present and correct, but neither fetch nor JSON-body consumption had a deadline. A stalled transport/body could therefore display Validating forever. Start likewise awaited unbounded fetch/json with a busy fieldset and disabled exits, and lacked unmount/close cancellation guards. Ordinary caught HTTP errors were not the endless-spinner cause. There is no evidence that a stale response directly reset user-selected methods or ranges, nor enough captured timing to prove which request stalled in the historical screenshot.

Adapter reload/reopen unnecessarily cleared the adapter array. Its derived-prefix effect could transiently clear a suggested CIDR prefix. Reload now retains the last snapshot and all draft fields while disabling Start until fresh adapters and fresh validation are ready; suggested-prefix updates wait for READY. Missing or ineligible selections remain visible and fail local validation rather than being silently deselected.

Validation now explicitly distinguishes IDLE, VALIDATING, VALID, INVALID and FAILED; local INCOMPLETE/INVALID assessment still suppresses requests. Preparing remains owned by busy plus a synchronous submission latch; accepted starts hand off to App's scan-running state. Close/cancellation reconciles state to IDLE/loading. All semantic request inputs (targets, methods, ports, adapter selection, filters, performance), reload and explicit retry contribute to the key. New edits abort/supersede old work, and both active and current-key checks prevent stale rendering. Validation/adapters have a 15-second deadline, including response.json; start has 30 seconds. Cancellation/deadline settles even if an injected transport ignores AbortSignal, and finally removes listeners/timers. Start cleanup updates state only for its own non-aborted controller. Errors are safe and actionable, including invalid responses with empty error arrays. No backend diagnostic secrets are rendered.

Selections, target text, edited/suggested prefix, methods, filters and performance survive close/reopen and reload within the mounted application. No new cross-page-reload persistence was introduced. Start remains Advanced when advanced intent is present and Quick only for an intentionally empty configuration. It is enabled only for a current valid plan, ready adapters and complete draft. Accepted clicks immediately display Preparing and reject duplicate submission. A timed-out/uncertain start **does not claim backend cancellation or automatically resubmit**; it unlocks the form and tells the technician to close and check scan status before retrying. A late response cannot report success or close the dialog.

### FIELD-WS-01 - independent observation (audit AT-BC)

The old App effect constructed a socket immediately and unconditionally closed it on cleanup. React StrictMode's development setup/cleanup/setup can close that first socket while CONNECTING, explaining the reported warning. The old implementation had no reconnect, onerror/onclose state, or HTTP scan-status fallback. Validation/adapters/start use HTTP and do not depend on WS readiness: no causal link to the modal defects was found. Progress did depend on terminal WS messages to release isScanning, so a genuine connection loss could leave progress stale.

A small connection owner preserves all existing event handling. It defers initial construction one task so StrictMode's discarded setup creates no socket, owns one socket, detaches old handlers, bounds handshake at 10 seconds, and retries at 1/2/4/8/10 seconds (10-second cap, reset after open). Cleanup cancels timers and closes only the owned socket. Construction errors and repeated callbacks are contained. Malformed events do not create unbounded application console errors. Real browser networking failures may still produce native console warnings; they are not hidden or claimed eliminated.

A read-only `/api/discovery/status` check runs sequentially at 3-second intervals after completion with a 5-second deadline, restores running state and clears it after a missed terminal event. Polls are aborted on cleanup and obsolete pre-start responses cannot override a new scan; Quick Scan's pending POST is guarded. Reconnect refreshes project data. The UI distinguishes reconnecting/delayed live updates from unavailable scan status. HTTP failure does not falsely declare completion, failure or cancellation. A false running status also does not fabricate a successful scan notification.

No browser-extension messaging API or the quoted asynchronous-listener error was traced to application code. Extension behavior was not investigated further.

## Software validation

- Focused new lifecycle/connection tests: **20 passed** (`advanced_scan_interaction.test.ts`). Includes transport/body deadline, parent/pre-abort, synchronous throw, malformed JSON, StrictMode, retries/backoff, duplicate callbacks, current socket delivery, stalled handshake, construction failure and cleanup.
- Full custom regression: **45 files, 1,352 assertions passed**, including the focused 20. This covers Hello/transport, Advanced Scan, monitoring, Pair, projects/reverification/history, reports, bulk, settings, manual-add, sorting, support, and credentials. The Hello suite retains 74 assertions; only its obsolete source-text assertion was updated for the guarded finally path. Browser boundary checks rose from 103 to 110 with the new browser-safe modules.
- Browser component/full-App suite uses real CSS and React StrictMode with mocked HTTP and application WS. Viewports: 1280x720, 700x720, 700x760, and 560x576. It checks geometry, every lower section, wheel, Tab, background inertness, pointer interactions, X/Cancel, stale/incomplete/complete/error/deadline validation, draft preservation/reload, preparing success/failure/timeout/duplicate/unmount, WS failure/reconnect and HTTP terminal-event recovery.
- Browser final run: **76 passed, 0 failed, 0 skipped**. Final full regression: **1,352 passed across 45 files**, 0 failures/skips. Total across both suites: **1,428 assertions**. TypeScript passed; production build passed with **1,597 modules**; git diff --check passed. Earlier test-harness-only failures (Vite socket counted as an application socket, and a premature asynchronous adapter assertion) were corrected before these final runs.
- The temporary identity shim was removed after tests; NODE_OPTIONS was unset. No software blockers remain. Physical Advanced Scan/Hanwha retest remains pending. Commit/tree metrics are provided in the delivery report.

Reproduce on Windows with dependencies installed:

```powershell
npx vite --host 127.0.0.1 --port 5179 --strictPort
# In another shell; use an installed Playwright module and Edge (or BROWSER_CHANNEL).
$env:PLAYWRIGHT_MODULE = '<absolute path to playwright>'
node src/test/browser/advanced_scan.cjs
node --import tsx src/test/advanced_scan_interaction.test.ts
npx tsc --noEmit
npm run build
git diff --check
```

Browser assets are test-only and are not imported by the production entry point. No real backend is started for browser validation. If the known Windows Node userInfo/ENOMEM host issue occurs, the previously authorized temporary identity shim may wrap the node test command outside the repository; remove it and unset NODE_OPTIONS afterward.

## Physical validation remains pending

The software work does not establish a physical Hanwha discovery pass. Technician retest remains 16.2.1-A modal usability, B configuration, C one accepted Start, followed by FIELD-DISC-02.

Keep camera #1 disconnected; camera #2 at 192.168.1.100 / E4:30:22:CD:68:85; laptop Ethernet 192.168.0.124/24. Select Ethernet, exact range 192.168.1.100 -> 192.168.1.100, ONVIF/Neighbor/Ping/TCP, Camera Common, any manufacturer, likely-only OFF, unknown devices ON, Normal performance. No Pair, Manual Add, camera writes or network writes. Namespace-aware Hello parsing, XAddr/sender handling, deduplication/MAC enrichment, off-subnet semantics, receive windows, tracing, payload handling and inventory policy are unchanged.

MILESTONE 16.2.1 ADVANCED SCAN INTERACTION & LAYOUT HOTFIX - SOFTWARE VALIDATED / PHYSICAL ADVANCED SCAN RETEST PENDING
