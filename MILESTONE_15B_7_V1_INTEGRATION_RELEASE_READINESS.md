# Milestone 15B.7 - V1 Integration + Release Readiness

Branch: `codex/milestone-15b7-v1-integration-release-readiness`

Starting HEAD: `328d2c4b8e08d37dabe54b03f7636292d073cd28`

Final HEAD / commit hash: the commit containing this closeout; resolve with `git log -1 --format=%H -- MILESTONE_15B_7_V1_INTEGRATION_RELEASE_READINESS.md`. The delivery message records its exact hash rather than embedding a commit's own hash in that commit.

Commit message: `Harden V1 workflow integration and production startup`

## Audit method and scope

Reviewed the current source, accepted milestone baselines, UI entry points, backend routes, operation ownership and test coverage against the supplied 15B.7 request. Traced startup through Quick Work, discovery, identity/status, diagnostics, adapter operations, camera access/configuration, projects, bulk work, reports/history, Tasks, Settings and recovery. Reused existing authoritative services and physically validated discovery architecture. Added integration tests around concrete defects and exercised the real React shell with controlled backend responses in headless Microsoft Edge. Test data stays in test harnesses and isolated in-memory databases.

Master Blueprint v1.1 remains authoritative; no blueprint file was present in this checkout. This milestone uses the supplied requirements and existing implemented contracts, without introducing new product scope. No physical cameras were available. No new physical pass is claimed.

## Findings and fixes

| ID | Severity | Root cause and implemented correction | Evidence |
|---|---|---|---|
| V1-01 | HIGH | Built frontend had no backend asset-serving route or ordinary production launcher; tsx was development-only. Added application-relative static assets, explicit unknown-API 404, missing-build 503, source-distribution launcher and runtime tsx packaging. Backend binds local loopback. | Real Express routing tests, TypeScript/build, launcher path check and actual startup attempt from another directory |
| V1-02 | HIGH | Network Adapter assumed valid adapter arrays and let a failed recovery-status fetch escape its mutation catch. Added bounded reads, structural validation, reload/empty/error feedback, guarded mutation submission and independently caught recovery reads. | Malformed enumeration and failed mutation/status browser checks; safe reference tests |
| V1-03 | HIGH | Bulk Re-IP target edits left the previous plan applicable and confirmed. Edits now clear confirmation and prevent Apply until a new validated plan incorporates the overrides. | Browser edits, revalidation and exact single Apply target |
| V1-04 | MEDIUM | An older Bulk progress read could replace a terminal result. Serial bounded polling now checks batch ownership and active state, cancels on cleanup and covers verification. Cancel errors are handled. | Delayed browser progress after completed Apply |
| V1-05 | MEDIUM | Camera Access retained previous device state and accepted late metadata reads. Device changes clear endpoint, credential selection and input fields; bounded reads abort and check owner before reconciliation. | Held old-device response released after switching devices |
| V1-06 | HIGH | Tasks recovery link only undismissed existing recovery; a Pair preview without a row did not open. Restore tasks lacked the source Pair correlation. Navigation now rereads the matching authoritative session and explicitly opens its existing modal; Restore retains correlation. | Pair preview navigation browser check; service/Tasks Restore integration |
| V1-07 | MEDIUM | Startup adapter badge depended on discovery data and could stay Detecting forever. Added validated startup enumeration with stale Pair protection and explicit Unavailable fallback. Monitoring failures now override stale enabled state. | Fresh badge without Scan; unavailable monitoring browser check; existing Pair/Restore badge tests |
| V1-08 | MEDIUM | Project History accepted late results after changing filters/device. Added bounded cancellable reads with stale-result protection. | Held old-filter browser response |
| V1-09 | HIGH | Malformed readiness data could crash Settings when rendering undefined status. Validate readiness before exposing it to UI; use an explicit unavailable snapshot. | All tested Settings sections open with malformed preflight fixture and no runtime errors |
| V1-10 | MEDIUM | Network Adapter modal lacked established focus/Escape lifecycle. Reused focus management and portal layering. | Focus containment on entry, Escape and overlay cleanup |
| V1-11 | MEDIUM | Local server bind failure propagated as an uncaught WebSocket/server error. Added controlled port-denied/port-in-use feedback and nonzero exit. | Three focused assertions and actual host-denied startup |

No remaining identified BLOCKER/HIGH software defect within the reviewed scope. Backend Pair confirmation, snapshot-before-mutation, administrative checks, explicit Restore, bounded camera verification, credential policy, task cancellation boundaries and schema remain intact. Production WS-Discovery wildcard strategy and Normal/Advanced scan architecture are unchanged.

## Validation

- Focused 15B.7: **39 assertions passed**.
- Full regression: **1,915 assertions passed across 54 test files**. Baseline 1,865 + 39 new focused assertions + 11 additional import-boundary assertions from the new modules/harness.
- Browser: **210 checks passed**: V1 integration 28; Tasks 25; field workflow 25; post-Pair 15; Advanced Scan 76; foreground/background monitoring 41.
- Final automated runs: **0 failed, 0 skipped**. Earlier development runs exposed incomplete fixtures and one test import omission; corrected before final validation. No existing test was removed or weakened.
- TypeScript: **PASS**, through `npm run build` (`tsc && vite build`).
- Production build: **PASS**, 1,605 modules; JS 356.28 kB (101.44 kB gzip), CSS 40.45 kB.
- Full suite includes startup/Quick Work, discovery, Advanced Scan, synthetic isolation, identity, diagnostics/TLS, Pair/enrichment, Match, credentials/Open, projects/reverify/add-existing/history, bulk/provider boundaries, reports/history, Tasks, Settings, errors/support/shutdown.
- Browser coverage includes accepted modal layouts at 1280x720, 700x720, 700x760 and 560x576; light/dark Actions contrast; focus/Escape; stale events; deadline recovery; double-start protection; no foreground ownership from monitoring; no synthetic row insertion.
- Final changed-file review and `git diff --check`: PASS. Intended code/test/document files only are committed. The three user-owned CCTV trace text files remain untracked and untouched.

The Windows Node `uv_os_get_passwd` / ENOMEM issue occurred. Tests used the previously validated temporary identity shim outside the repository. It is not a production dependency or committed file; it was removed after validation and NODE_OPTIONS cleared. Runtime tested: Node v24.19.0 on Windows; other Node versions were not exercised.

## Production runtime findings and limits

`npm run build` creates `dist`. `npm run start:production` launches the local backend and serves the built UI on `http://localhost:3001`; `/api` and `/ws` remain on that backend. Run the build with development dependencies installed. A source distribution must include `src`, `scripts`, `dist`, package.json and package-lock.json, plus installed production dependencies. tsx and its loader dependencies are intentionally runtime-packaged; Vite and concurrently are not used by ordinary production startup. Windows receive-observation script paths and static roots resolve from the application location, without hard-coded developer paths. Do not omit the runtime source/scripts when assembling a release.

**Live production HTTP/WebSocket smoke is HOST-BLOCKED, not passed.** The actual launcher started the backend from an unrelated working directory, then Windows rejected bind to 127.0.0.1:3001 with EACCES. An independent minimal Node listener was also rejected on 127.0.0.1, localhost and 0.0.0.0 at port 3001; no existing listener or reported TCP exclusion was found. No firewall, adapter or security policy was changed. The final launcher attempt exits 1 with actionable feedback and no uncaught stack. Exact host denial cause remains unresolved. Real Express asset/API routing was validated on an OS-assigned available port, but this does not substitute for a successful full production session on 3001.

Before distribution, resolve the host port restriction and repeat actual built-UI + API + WebSocket startup/restart smoke on a supported Windows installation. This is an outstanding environment/release verification gate. No successful physical hardware run, independent clean-machine production-only install, installer, signing or auto-update validation is claimed.

## V1 readiness matrix

Software status below describes the reviewed implementation and automated evidence. Physical statuses are inherited, never upgraded here. Release blocker means an unresolved software blocker; environment/distribution gates are listed explicitly.

| Subsystem | Software status | Automated coverage | Physical validation | Known limits | Software release blocker |
|---|---|---|---|---|---|
| Application startup | SOFTWARE VALIDATED; live runtime host-blocked | V1 startup/assets/error tests; shell browser | Not claimed | Port 3001 host denial; successful production session must be retested | No; environment gate pending |
| Quick Work | SOFTWARE VALIDATED | V1, project persistence, synthetic isolation, empty shell | No new claim | Ephemeral; no persistent offline inventory | No |
| Normal discovery | SOFTWARE VALIDATED | Discovery, Hanwha Hello, trace, cancellation, scan browser | DISC-02 PASS; DISC-03 CLEAN-START PASS; SCAN-01 PASS | No arbitrary subnet brute force | No |
| Advanced Scan | SOFTWARE VALIDATED | Advanced plan/cancel/evidence tests; 76 browser checks | Physical retest not performed here | FIELD-ADV-04 preparation delay remains; immediate Preparing feedback exists | No |
| Device identity/enrichment | SOFTWARE VALIDATED | Enrichment, post-Pair, collision, sort, isolation tests | ENRICH-01 PHYSICAL PASS | Unknown remains unknown; evidence required | No |
| Diagnostics | SOFTWARE VALIDATED | Diagnostics, ping/HTTP/TLS/status tests | No new claim | TLS trust separate from communication; failed ping alone insufficient | No |
| Pair | SOFTWARE VALIDATED | Pair, post-Pair and Tasks tests; 15 browser checks | PAIR-01 / PAIR-02 PHYSICAL PASS | Explicit confirmation and Restore; no automatic camera IP changes | No |
| Match Network | SOFTWARE VALIDATED | Field workflow, V1 recovery, browser | NET-01 PHYSICAL RETEST PENDING | Windows/admin and explicit temporary configuration | No |
| Credentials | SOFTWARE VALIDATED | Credentials, hints, serialization/redaction, browser | CRED-01 PHYSICAL RETEST PENDING | Explicit save/selection; no automatic authentication | No |
| Open Camera | SOFTWARE VALIDATED | Connect/browser launch tests; access stale-read browser | OPEN-01 PHYSICAL RETEST PENDING | External default; browser owns TLS trust; embedded optional | No |
| Projects | SOFTWARE VALIDATED | Persistence, add-existing, V1 round trip | Not hardware-specific | Saved status is not live evidence; secrets/recovery excluded | No |
| Project Reverify | SOFTWARE VALIDATED | Reverification workflow, identity, task tests | Physical run pending | No live matches remains intentional, no invented Online | No |
| Project History | SOFTWARE VALIDATED | History/persistence tests; stale-filter browser | Not hardware-specific | Project lifecycle evidence, not raw credentials | No |
| Bulk Re-IP | SOFTWARE VALIDATED | Bulk scope/configuration/local-host tests; revalidation browser | Physical run pending | Explicit confirmed plan, bounded provider operations; no PC auto-change | No |
| Bulk Configure | SOFTWARE VALIDATED | Camera/provider/bulk scope/truthful boundary tests | Physical run pending | Capability-filtered only; no bulk password or ONVIF enable | No |
| Reports | SOFTWARE VALIDATED | Reporting, routes, V1 empty portrait PDF; preview browser | Not hardware-specific | Invalid selection cannot export; saved/live evidence differentiated | No |
| Report History | SOFTWARE VALIDATED | Report history and route tests | Not hardware-specific | Existing recorded device/project history included in reports; no generated-file archive | No |
| Tasks | SOFTWARE VALIDATED | 91 task assertions; V1 correlation; 25 browser checks | No new claim | Bounded session history, monitoring separate; no new execution queue | No |
| Settings | SOFTWARE VALIDATED | 41 settings assertions; browser persistence/readiness | UI-03 PHYSICAL RETEST PENDING | Settings affect implemented controls only | No |
| Support evidence | SOFTWARE VALIDATED | Error/support, receive matrix, lease/isolation tests | Discovery physical statuses preserved | Synthetic support traffic excluded from inventory | No |
| Recovery | SOFTWARE VALIDATED | Pair snapshot/restart, V1 Tasks, stabilization | Pair existing PASS; Match pending | Explicit authoritative Restore, no automatic restore | No |
| UI/navigation | SOFTWARE VALIDATED | 210 browser checks plus UI/actions/boundary tests | UI-04 PHYSICAL PASS; UI-03 pending | Bounded consistency pass; legacy modal polish deferred | No |

## Preserved field status

FIELD-DISC-02 — PHYSICAL PASS

FIELD-DISC-03 — PHYSICAL CLEAN-START PASS

FIELD-SCAN-01 — PHYSICAL PASS

FIELD-PAIR-01 — PHYSICAL PASS

FIELD-PAIR-02 — PHYSICAL PASS

FIELD-ENRICH-01 — PHYSICAL PASS

FIELD-UI-04 — PHYSICAL PASS

FIELD-NET-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-CRED-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-OPEN-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-UI-03 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

## Intentionally deferred / next step

LOW: broader legacy-modal focus/theme polish, where fixing it would exceed this bounded pass. FIELD-ADV-04 startup duration remains; no discovery engine rewrite. Report History is existing recorded-history reporting, not a generated-document archive. Windows-only provider capabilities and physical camera configuration still need representative hardware testing. Installer/distribution/signing and a clean-machine production dependency install remain release steps. Wi-Fi tab, macOS, accounts/cloud/remote management, bulk password changes, ONVIF bulk enable, automatic credential cycling and persistent offline Quick Work remain out of scope.

Recommended next step: resolve the Windows port-3001 host denial, finish full production startup/restart smoke, assemble and validate the source distribution, then run the pending field retests on representative cameras. No pending physical result is promoted to PASS by this software milestone.

## Files and line changes

| File | Added | Removed |
|---|---:|---:|
| `package-lock.json` | 1 | 30 |
| `package.json` | 4 | 3 |
| `scripts/start-production.cjs` | 8 | 0 |
| `src/core/tasks/operation_tasks.ts` | 1 | 1 |
| `src/server/index.ts` | 7 | 1 |
| `src/server/production_assets.ts` | 23 | 0 |
| `src/test/browser/v1_integration.cjs` | 49 | 0 |
| `src/test/browser/v1_integration.html` | 1 | 0 |
| `src/test/browser/v1_integration.tsx` | 10 | 0 |
| `src/test/v1_integration.test.ts` | 82 | 0 |
| `src/ui/App.tsx` | 32 | 9 |
| `src/ui/components/BrowserModal.tsx` | 18 | 6 |
| `src/ui/components/BulkReIpModal.tsx` | 13 | 6 |
| `src/ui/components/NetworkAdapterModal.tsx` | 31 | 5 |
| `src/ui/components/PairNetworkModal.tsx` | 2 | 2 |
| `src/ui/components/ProjectHistory.tsx` | 9 | 1 |
| `src/ui/components/SettingsMenu.tsx` | 1 | 1 |
| `src/ui/components/Tasks.tsx` | 2 | 2 |
| `src/ui/operation_feedback.ts` | 8 | 0 |
| `MILESTONE_15B_7_V1_INTEGRATION_RELEASE_READINESS.md` | 145 | 0 |

Total: **20 files, 447 additions, 67 deletions**.

Final tracked working tree is expected clean after this commit; the delivery message records verified post-commit status. User trace files are excluded.

MILESTONE 15B.7 V1 INTEGRATION + RELEASE READINESS — SOFTWARE VALIDATED
