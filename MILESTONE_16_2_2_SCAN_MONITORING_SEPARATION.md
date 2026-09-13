# Milestone 16.2.2 - Foreground scan and background monitoring separation

Baseline: `bd70b9a0fcca3e6f1756294f7823ad88a9513e9b` (`Fix Advanced Scan interaction and validation lock`).
Branch: `codex/milestone-16-2-2-scan-monitoring-state-separation`.
The frozen 16.2.1 commit is preserved. This is software validation only; no live camera scan, Pair, Manual Add, Ethernet change, credential change, or camera configuration write was performed.

## FIELD-MON-01 root cause and state audit (A-Z)

**Confirmed causal chain:** IncrementalDiscoveryMonitor invokes the shared BatchExecutionPipeline every configured interval (default 30,000ms). That sets the same pipeline `isRunning` used by Quick Scan, Advanced Scan's ONVIF/neighbor stage, and Project reverification. The previous `/api/discovery/status` returned `pipelineEngine.getIsRunning() || advancedScanService.getStatus().running`. Milestone 16.2.1's new HTTP fallback assigned that generic `running` directly to App's `isScanning`. App derived both the red Stop button and Scanning footer from that boolean and hid Scan choices while true. Thus an ordinary monitoring tick became foreground UI activity despite no technician action.

Previously, neither the pipeline nor its emitted phase/device events identified a scan origin/session. Monitoring suppressed SCAN_COMPLETE/SCAN_CANCELLED but still emitted ordinary phase/device events. The frontend treated generic terminal scan events as authoritative. There were no frontend/backend foreground IDs, no monitoring IDs, and no generation-aware foreground snapshot. The frontend's request epoch protected local start/poll races but could not distinguish monitoring from foreground work.

Diagnostics already had an independent DiagnosticRefreshMonitor, its own scheduler/controller, and a combined monitoring status containing diagnosticRefresh and incrementalDiscovery. That indicator was the appropriate background presentation. Inventory reconciliation and notifications already used stable identity and isNew evidence, rather than the foreground boolean.

### Cancellation and listener ownership

The old REST Stop unconditionally called **both** pipeline.stopDiscovery() and advancedScanService.stop(). The pipeline method cancelled whichever invocation owned its single abort controller, including monitoring or reverification. Consequently clicking the misleading Stop during a monitor cycle could truncate that monitor's receive window. This did not stop the monitoring interval permanently, but cancellation scope was not truthful.

The shared pipeline is exclusive: runDiscoveryScan returns BUSY if already running. Monitoring already skipped active technician operations, and manual/Advanced starts explicitly cancelled and awaited the active monitor cycle through yieldToTechnician. There is no evidence that two simultaneous production invocations were sharing one live UDP socket. The transport object is reusable, but discover() creates its own announcement socket, per-adapter probe sockets, multicast memberships, timeout and abort listeners each invocation. Phase3 awaits its receive operation and enrichment tasks before the pipeline releases its slot. Current adapter lists and phase progress belong to that exclusive invocation; Advanced target lists belong to its prepared plan.

**Possible interference, without a Hanwha conclusion:** the old unscoped Stop could end a background or unrelated discovery operation, including its receive/enrichment work. Intentional monitor handoff also ends its receive window before starting foreground work. This can affect which packets arrive within a particular window. No evidence establishes that FIELD-MON-01 caused FIELD-DISC-02. Received valid Hello evidence survives cancellation/handoff in software tests; future packets outside an active window are not claimed received. No speculative Hanwha-specific or continuous-listener change was made.

## Implemented ownership and state model

- ForegroundDiscovery reserves one technician operation synchronously before monitor handoff. A reservation spans preflight, ONVIF/neighbor discovery, and targeted Ping/TCP execution. It owns a unique sessionId, MANUAL or ADVANCED origin, an AbortController, a backend epoch, and a monotonically increasing snapshot revision.
- Foreground states are PREPARING, SCANNING, STOPPING, COMPLETED, CANCELLED and FAILED; a null session is idle. Only the matching active session can transition/finish. A stopped operation cannot subsequently report completion, and old work cannot finish a newer session.
- IncrementalDiscoveryMonitor retains its enabled/running/interval/last-run/error/deferred semantics, with a distinct ID for each cycle and start/end state events. Its interval remains 30 seconds by default; configured cadence behavior is unchanged. It remains enabled while deferring to a foreground reservation. Diagnostic refresh retains its separate controller and schedule.
- Quick and Advanced starts share a small testable REST router. Advanced's Quick fallback still invokes the standard pipeline, tagged ADVANCED because it originated from that technician workflow. Actual discovery phases, targets, adapter scoping and inventory policies are unchanged.
- `/api/discovery/stop` requires the displayed foreground sessionId. Missing, completed or mismatched IDs return 409 and the current foreground snapshot. It does not call global pipeline/Advanced cancellation. The foreground signal reaches only that operation's pipeline and targeted stage; between stages it prevents further execution. Monitor cancellation uses its own cycle ID; reverification cancellation uses its own REVERIFY ID.
- The shared engine remains serialized. Monitor handoff closes its sockets and settles its work before foreground receives new sockets/memberships. The scheduler remains alive and resumes on a subsequent configured tick. There is no second discovery engine, ref-counted listener layer, permanent listener, or duplicated inventory.
- Global cancellation remains appropriate only for full application shutdown, which stops schedules and aborts the active foreground reservation as well as remaining application work. Invocation listeners, frontend requests, polling and reconnect timers are cleaned up.

## Event, HTTP and UI contract

Pipeline phase/device/terminal events now carry `context: { origin, sessionId }` for MANUAL, MONITORING, ADVANCED or REVERIFY. Unsupported direct/internal phase calls are labelled INTERNAL, never inferred as a technician scan. Diagnostic updates are labelled DIAGNOSTICS. Foreground lifecycle is published through FOREGROUND_SCAN_STATE with its explicit snapshot; monitor start/end uses MONITORING_STATE. Device events still reconcile into the single existing inventory and only evidence-backed new identities notify.

`/api/discovery/status` now returns separate foreground and monitoring objects. Its compatibility `running` field means **foreground active**, not any engine activity. App validates and consumes the foreground snapshot, never the generic boolean. Matching WS context and increasing snapshot revisions reject stale/unclassified/monitor events. A new backend epoch allows HTTP recovery after restart. HTTP polling and the 16.2.1 bounded WS reconnect owner are preserved. Failed/unavailable status does not invent completion; a classified failed foreground session offers Diagnostics/Support recovery.

Quick/Advanced start responses include their foreground snapshot. Stop submits its exact session ID, so an old manual request cannot cancel a newer Advanced operation. A currently displayed Advanced foreground operation can be stopped intentionally. Pending Quick start/Stop HTTP actions are bounded and aborted on UI unmount, with late responses ignored.

When monitoring alone is checking, the main button stays Scan, Scan choices remain available, and the footer is Ready. Diagnostics may show Active / 30s / checking. During explicit manual or Advanced foreground work the button is Stop and the foreground footer shows Scanning; completion/cancellation returns Scan. The Advanced modal remains scrollable, focus-trapped and usable through monitor cycles; selection, targets and validation are preserved. Its Preparing text explains monitor handoff, and the existing Monitor footer subtly shows discovery deferred while the backend foreground reservation is active. Diagnostics is not disabled. No unrelated visual redesign was made.

Support evidence now includes the foreground snapshot separately from engineRunning and monitoring. Successful Advanced preflight retains adapter/planning/monitor-yield/total timing evidence.

**Compatibility:** restart both backend and frontend from this commit before physical retest. An old client issuing an ID-less global Stop is intentionally rejected; an old backend without foreground snapshots is not guessed to be foreground-active by the new client. There is no Project file or inventory migration.

## Software verification

- New focused suite: **50 assertions passed** in scan_monitoring_separation.test.ts. Tests exercise real Express routes, session transitions, stale snapshots, exact Stop IDs, monitor scheduler retention, foreground reservation across preflight, handoff with the actual WS-Discovery transport and fake UDP sockets, real Hanwha-style Hello parsing/reconciliation, duplicate row/notification suppression, off-subnet evidence, retained 10-second configured receive window, shutdown, and parent-scoped targeted Advanced cancellation. Tests inject adapters/providers/sockets; they do not contact physical cameras.
- New browser suite: **26 checks passed**, using accelerated timers for repeated 30-second cycles. It covers launch, Diagnostics checking, idle foreground during monitoring, usable Advanced configuration, manual start/Stop/completion, subsequent monitor cycles, stale events, Advanced ownership, visible deferral, WS loss/HTTP recovery, and shutdown while an HTTP start is pending.
- Preserved 16.2.1 browser suite: **76 checks passed**, including 720/760px and narrowed viewports, scroll/footer/focus/inert controls, validation failures/deadlines/stale results, preparing/duplicate handling, and connection cleanup.
- Browser total: **102 passed**, zero failures/skips in final runs. Test fixture responses were updated for the explicit foreground snapshot contract; the old generic-running fallback test now represents a genuinely foreground session.
- Full regression: **1,404 assertions passed across 46 files**, including the 50 focused assertions; final failures/skips: **0 / 0**. Combined with browser checks: **1,506 assertions**. `npx tsc --noEmit` passed, `npm run build` passed with **1,598 modules**, and `git diff --check` passed. Earlier regression failures were two source-text assertions expecting routes to remain inline in index.ts; they were updated to verify the mounted router and its corresponding paths. Behavioral route coverage is provided by the new focused suite.

Reproduce with installed dependencies and a local Playwright module:

```powershell
npx vite --host 127.0.0.1 --port 5179 --strictPort
# Another shell, UI-only harness; all backend/app WS traffic is mocked.
$env:PLAYWRIGHT_MODULE = '<absolute path to playwright>'
node src/test/browser/scan_monitoring.cjs
node src/test/browser/advanced_scan.cjs
node --import tsx src/test/scan_monitoring_separation.test.ts
npx tsc --noEmit
npm run build
git diff --check
```

The permitted temporary Windows Node identity shim, if required, stays outside the repository and is removed afterward with NODE_OPTIONS unset. No test shim is committed.

## Physical retest and remaining limitations

FIELD-DISC-02 remains unresolved physically. Software parsing, ownership and inventory tests do not establish that the physical Hanwha will appear. There are no known remaining software blockers after final checks; technician validation is still required.

Keep camera #1 disconnected; camera #2 Hanwha at 192.168.1.100 / E4:30:22:CD:68:85; laptop Ethernet at 192.168.0.124/24. No Pair, Manual Add, Ethernet changes, credentials changes or camera writes.

1. Start the updated backend/UI, do not click Scan, and observe at least two monitoring cycles. Scan must remain Scan; the foreground footer must stay idle. Record Diagnostics checking and whether Hanwha appears.
2. Start a manual Scan, confirm Stop/Scanning, then complete or Stop it. Confirm Scan returns and monitoring continues.
3. Open Advanced Scan during monitoring. Select Ethernet; exact range 192.168.1.100 -> 192.168.1.100; ONVIF/Neighbor/Ping/TCP; Camera Common; any manufacturer; likely-only OFF; unknown devices ON; Normal. Confirm stable configuration, one accepted Start, explicit foreground progress, and record the physical Hanwha result.

MILESTONE 16.2.2 FOREGROUND SCAN VS BACKGROUND MONITORING STATE SEPARATION - SOFTWARE VALIDATED / PHYSICAL MONITORING AND HANWHA RETEST PENDING
