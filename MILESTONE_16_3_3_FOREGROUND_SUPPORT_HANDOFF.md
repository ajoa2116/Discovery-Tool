# Milestone 16.3.3 — Foreground scan state / support handoff

Branch: `codex/milestone-16-3-3-foreground-scan-state-fix`
Starting HEAD: `8eabfdc87bae2e90c23ae742914e78fdada760cd`
Commit message: `Separate support trace ownership from foreground scan state`
Master Blueprint v1.1 remains authoritative. This milestone changes lifecycle ownership and UI truthfulness only.

## Root cause and audited chain

The legacy POST `/api/support/ws-discovery/receive-trace` called `foreground.begin('MANUAL')` before yielding monitoring. Its adapter, port-owner, and execution failures called `foreground.finish(..., 'FAILED')`. That published the normal FOREGROUND_SCAN_STATE snapshot and also appeared in GET `/api/discovery/status`. The React receiver stored the literal foreground failure message in persistent `scanActionError`; later active, completed, cancelled, or empty snapshots did not clear it. Origin MANUAL was insufficient to distinguish support from an actual Scan action.

The reducer rejected old revisions within one epoch but accepted any different epoch, allowing late socket events from an earlier backend to replace current state. These code paths explain how support failure could produce Scan/Ready with a stale banner while Diagnostics and device inventory continued independently. The field bundle does not establish which particular support failure occurred.

## Resulting contract

- Visible foreground snapshots require USER_SCAN/QUICK_SCAN or ADVANCED_SCAN/ADVANCED_SCAN, matching MANUAL or ADVANCED origin, TECHNICIAN visibility, session ID, state, epoch, and revision. Failure evidence includes the safe reason DISCOVERY_OPERATION_FAILED.
- Support traces use INTERNAL origin, SUPPORT_DIAGNOSTIC class, RECEIVE_TRACE_ONLY purpose, SUPPORT visibility, and a separate SupportTraceLease. Monitoring retains its explicit MONITORING origin and independent state.
- Support trace POST returns 202 with `support`, not `foreground`. GET returns bounded receive evidence plus the support result. POST `/api/support/ws-discovery/receive-trace/stop` accepts the exact support session ID. Normal foreground Stop cannot cancel it.
- Foreground, support matrix, support trace, and reverification gates exclude overlapping ownership. Support is rejected while a visible foreground scan is active. Support reservation precedes monitor yield; the scheduler stays enabled and regains eligibility after release.
- Support transport waits for actual socket close. If closure is not confirmed, FAILED/cleanupPending remains support-scoped and retains the lease until observed closure. Evidence records acquiredAt, monitoringPausedAt, releasedAt, monitoringEligibleAt, windowId, result, and safe error. Eligibility is not falsely described as an actual resumed receive cycle; the separate monitor timestamps show that cycle.
- Safe Support Bundle includes supportTrace separately from foreground and matrix. Matrix snapshots also declare support class and visibility.
- The standard failure banner is derived from the currently accepted classified foreground snapshot. New sessions, success, cancellation, and READY/null clear it automatically; genuine current failures persist. Action errors clear on accepted lifecycle changes.
- WebSocket snapshots require the current epoch. HTTP can adopt a new epoch; retired epochs are remembered and rejected even for late HTTP. Older/equal revisions cannot overwrite newer state. HTTP polling and action cancellation continue using their existing request guards.

## Validation

Final results: **0 failed, 0 skipped**.

| Check | Result |
| --- | --- |
| New support/foreground lifecycle suite | 42 assertions passed |
| Scan/monitoring separation including injected Hello handoff | 54 assertions passed |
| WS-Discovery trace | 54 assertions passed |
| Receive matrix | 60 assertions passed |
| Synthetic isolation | 60 assertions passed |
| Hanwha Hello | 74 assertions passed |
| Full regression | 50 files, 1,624 assertions passed |
| Advanced Scan browser | 76 checks passed |
| Scan/monitoring/support browser | 41 checks passed |
| Browser total | 117 checks passed, no runtime errors |
| TypeScript | `npx tsc --noEmit` passed |
| Production build | `npm run build` passed; 1,598 modules |
| Diff review | `git diff --check` passed |

The focused six-suite total is 344 assertions, included in the full total. New milestone coverage adds 46 software assertions and 9 browser checks. Browser tests use headless Edge against a UI-only Vite server with mocked backend requests. The physical-like Hello test injects an unmarked field-derived fixture through an in-memory socket, explicitly sets PHYSICAL_NETWORK within an isolated database, and exercises parser, candidate, reconciliation, DIFFERENT_SUBNET/NOT_VERIFIED promotion, and inventory continuity across support handoff. The existing marked synthetic fixture remains unchanged. These tests are software regression evidence, not new physical-camera proof.

The first test launch encountered the known `uv_os_get_passwd` ENOMEM error. A narrowly scoped temporary identity shim was then used outside the repository via `--require`. It was removed after validation; NODE_OPTIONS was unset. The owned Vite test server was stopped. The three unrelated untracked physical trace files were not edited or committed.

## Authoritative field status and physical retest

- FIELD-DISC-02: **PHYSICAL PASS**, not reopened. Technician evidence confirms Hanwha QND-7082R, label MAC E4:30:22:CD:68:85, camera 192.168.1.100, laptop Ethernet 192.168.0.124/24, interface 8. Inventory first entry: 2026-09-13T16:51:09.732Z; PHYSICAL_NETWORK, DIFFERENT_SUBNET, NOT_VERIFIED, Hello evidence.
- The physical .NET comparison received 4 datagrams / 5,932 bytes. Production wildcard monitoring received physical Hello. The separate ADAPTER_SPECIFIC support window received zero datagrams. Production binding and parsing are unchanged.
- FIELD-DISC-03: **PHYSICAL CLEAN-START PASS**.
- FIELD-SCAN-01: **SOFTWARE FIXED / VALIDATED — PHYSICAL UI RETEST PENDING**.
- FIELD-UI-03: **OPEN / DEFERRED**. Actions styling, Pair, project schema, camera configuration, and reporting are unchanged.

Physical UI retest: launch the updated backend/UI; confirm Scan/Ready with Diagnostics Active; run a bounded support receive trace; inspect its separate completion/failure result and monitoring eligibility; confirm no foreground failure banner or Stop button and the existing Hanwha row remains visible. Then perform an explicit user scan and verify its own lifecycle. No further hardware discovery investigation is required by this milestone.

MILESTONE 16.3.3 FOREGROUND SCAN STATE / SUPPORT-HANDOFF FIX — SOFTWARE VALIDATED / PHYSICAL UI RETEST PENDING
