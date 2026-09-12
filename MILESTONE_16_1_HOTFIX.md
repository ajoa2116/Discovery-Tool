# Milestone 16.1 - Physical Retest Stabilization Hotfix

Status: **MILESTONE 16.1 PHYSICAL RETEST STABILIZATION HOTFIX - SOFTWARE VALIDATED / PHYSICAL ADVANCED SCAN RETEST PENDING**

Branch: `codex/milestone-16-1-advanced-scan-crash-hotfix`
Starting HEAD: `500e027ba1f2469d0fb5f3053372ddc4be2a2bc2` (`Fix first-camera field discovery and Pair workflow`). The initial working tree was clean. The frozen Milestone 16 commit was not modified. This hotfix is committed separately as `Fix Advanced Scan field-test regressions`; its final hash is reported with delivery.

## Audit completed before implementation (A-U)

| Item | Baseline finding |
| --- | --- |
| A | GET `/api/discovery/advanced/adapters` returned the service result as JSON; exceptions went through `safeError` with HTTP 500. |
| B | `AdvancedScanService.listAdapters` called `PowerShellWindowsNetworkAdapterService.inspectAdapters`, which launched `powershell.exe`. |
| C | Read-only reproduction: one original inspection completed in 13,332 ms; three overlapping original inspections failed with `POWERSHELL_FAILED` in 15,111 / 15,097 / 15,102 ms, at the original 15-second process bound. Per-adapter cmdlet queries and a new process for every validation amplified contention. The original physical response body/error trace is unavailable, so attribution of every historical 500 to this reproduced timeout is not proven. |
| D | Milestone 16 did not change the adapter snapshot or topology return shape. Its type additions concerned discovery/relationship evidence and Pair state. |
| E | Modal adapter state began as `[]`, but later accepted arbitrary response JSON. |
| F | The fetch chain ignored `response.ok` and sent error objects or null directly to `setAdapters`. |
| G | Rendering used `adapters.map`; prefix assistance used `adapters.find` and nested `ipv4Addresses.map`. Error JSON violated those collection assumptions, causing the reported TypeError. No root React error boundary contained the failure. |
| H | POST `/validate` returned a plan with 200/400, but caught all thrown exceptions as 400, conflating adapter/server failures with invalid form input. |
| I | Frontend payload was `{adapterIndexes, targets, methods, portPresets, customPorts, filters, performance}`. Partial target rows were silently omitted; partially typed ports could become NaN and serialize to null. |
| J | Backend had a TypeScript interface, not runtime request validation. Semantic checks covered target ordering/bounds, ports and adapter eligibility. |
| K | Historical per-response 400 reasons cannot be recovered without their bodies. Proven code paths included invalid targets/ports/ineligible adapters and every thrown enumeration exception. This hotfix gives invalid input and enumeration failure separate contracts and audit classifications. |
| L | Validation ran after a 150 ms debounce on every payload change. In-flight requests were not cancelled or superseded safely. |
| M | Incomplete editing still triggered validation, and stale results could replace the current plan. Null plan did not reliably disable Start. |
| N | Quick Scan Phase 2 unconditionally promoted every nonlocal neighbor observation. |
| O | Incremental discovery reused that same pipeline across eligible interfaces, so it inherited generic LAN inventory promotion. |
| P | Advanced Scan used the pipeline plus targeted Ping/TCP checks. Targeted rows required positive evidence, but its filter helper was not wired into inventory promotion. |
| Q | Include Unknown was displayed and influenced intent, but the existing filter helper was only used by tests. |
| R | Milestone 16 added Windows-neighbor observations with IP/MAC, adapter provenance and NOT_VERIFIED status. A neighbor record is host evidence, not a camera identity or a captured handshake. |
| S | `192.168.40.1` qualified as a nonlocal neighbor on Wi-Fi, so the unconditional Phase 2 upsert and isNew event admitted it. There was no CCTV-evidence gate. No IP/vendor exception is needed or added. |
| T | Notification copy claimed an ARP handshake for every discovery method; it received only IP and vendor. |
| U | The main badge displayed `interfaces[0]`. It was an overview, not a selected monitoring adapter. Quick Scan and monitoring intentionally enumerated all eligible adapters. |

The sandbox also produced a read-only permission failure presented by the old service as `ADMIN_REQUIRED`, with misleading mutation-oriented wording. That is separate from the outside-sandbox timeout reproduction and is not evidence that normal enumeration requires elevation on the technician's machine.

## Implemented behavior

- Adapter enumeration queries each Windows source once per inspection, emits an explicit array, normalizes singleton output and absent DNS entries, and rejects malformed snapshots. Active physical Ethernet/Wi-Fi eligibility and truthful metadata remain intact. Concurrent callers share one in-flight inspection and receive independent copies; subsequent requests are fresh. Read-only inspection has a 30-second bound; mutation commands retain 15 seconds. Post-mutation snapshot reads bypass sharing.
- Enumeration failures retain safe reason codes (timeout, permission, command failure, cancellation, malformed output) and existing correlated Diagnostics/Support error presentation. No failure is disguised as successful empty data.
- The modal checks HTTP status, JSON shape and nested arrays before storing adapters. Loading, failure and empty/unavailable states keep Start disabled and offer Reload Adapters. The state always contains an array.
- A shared runtime contract validates incoming requests and outgoing collections/plans. Complete Advanced configurations require an eligible selected adapter; Ping/TCP-only configurations require targets. The no-options Quick Scan fallback remains available after eligible adapters load and the current fallback plan validates.
- Partial drafts remain local incomplete states; malformed IP/port input shows local invalid state. Ready drafts use a 300 ms debounce, cancellation, active-request guard and form key. Only the current valid plan enables Start. Structured invalid input remains HTTP 400; enumeration/server failure is HTTP 500. Retry is available. Start rechecks adapter availability before accepting the operation, preventing an unavailable selection from silently becoming an all-adapter scan.
- A minimal root React error boundary contains render failures and shows Reload Interface with a UI reference. The adapter contract fix prevents the known crash; the boundary is containment for unexpected render failures.
- Normal discovery promotes supported CCTV/security protocol or explicit hardware-class evidence. Vendor/OUI labels, neighbor mappings, Ping and open ports alone do not establish camera identity. Existing identity updates remain possible without erasing technician fields or stronger evidence; an observed IP change does not inherit verified communication at the new address.
- Advanced Include Unknown ON permits positive generic neighbor/Ping/TCP evidence. OFF (or Only Likely Cameras ON) excludes new generic candidates. MAC/manufacturer filters are applied to new candidates. Existing project/device records are preserved rather than destructively removed. Excluded neighbor and targeted observations remain in bounded Support summaries (32 samples plus counts), not a second inventory.
- Generic observations do not trigger camera notifications. ONVIF announcements, ONVIF responses and other discovery evidence receive truthful wording; observed source adapter is retained when available. The unsupported ARP-handshake claim is removed.
- Badge and modal text clarify scope: Quick Scan/monitoring use all eligible adapters; Advanced ONVIF/neighbor discovery uses selected adapters. Targeted Ping/TCP checks still follow Windows routing, as before. Adapter selection does not establish a route to an off-subnet target.

## Evidence and preserved behavior

A target IP alone never creates a row. Unreachable/timeout/TTL-expired Ping output is not positive evidence. A positive Ping or open TCP port identifies transport evidence only, with camera verification remaining NOT_VERIFIED. Neighbor mappings and Hello announcements do not prove authenticated communication. ONVIF response evidence, identity conflicts, local-host exclusions and stable identity reconciliation retain their existing rules.

Pair/manual-add, numeric IPv4 sorting, stable device selection/actions, Project/Reverify, Add to Existing Project, history, support bundles, diagnostics, cancellation, credentials and bulk-operation boundaries pass regression tests. Pair preview remains available for a truthful Different Network relationship without inventing device verification. Pair candidate exclusions, explicit Apply, snapshot/restore and recovery protections are unchanged. Test providers that explicitly simulate named cameras now declare their hardware class; production does not infer camera class merely from vendor names. Transport tests now select their mocked adapter under the aligned contract.

No physical Pair, Restore, camera configuration, Ethernet mutation or hardware scan was run for this hotfix. Read-only local adapter enumeration was the only host-network inspection. After the fix, three overlapping calls to one service completed successfully in 12,153 ms with truthful Ethernet/Wi-Fi/Bluetooth/VPN metadata. This is one software/host read-only verification, not a physical camera discovery result or a latency guarantee.

## Software validation

- New deterministic hotfix tests: **88 assertions** (61 adapter/API/modal/validation/boundary, 27 inventory/evidence/notification).
- Additional mocked-API headless Edge checks: **28 assertions**, including actual React render-failure containment and reload, failed/malformed/empty adapter responses, retry, no validation churn on incomplete drafts, structured 400 versus 500, and obsolete response rejection. The UI-only harness did not run the backend discovery server. Its temporary files/server were removed/stopped after verification.
- Total new focused checks: **116 passed**, zero failed/skipped.
- Full regression: **43/43 files, 1,251 assertions passed**, zero remaining failures and zero skipped. Counts include the 88 new deterministic assertions. The browser import-boundary test increased from 90 to 103 assertions because the browser-safe graph gained shared helpers and the boundary. Corrected fixture/source-expectation failures were rerun to passing; the table below records final results.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; **1,594 modules transformed**.
- `git diff --check`: passed.
- A temporary external identity shim was required only for the sandbox Node/tsx `uv_os_get_passwd` runner issue. It is not application code and is removed before delivery; NODE_OPTIONS is unset.

| Regression file | Assertions | Result |
| --- | ---: | --- |
| `actions_overlay.test.ts` | 13 | PASS |
| `add_existing_project.test.ts` | 32 | PASS |
| `advanced_scan_adapter_eligibility.test.ts` | 7 | PASS |
| `advanced_scan_cancellation.test.ts` | 4 | PASS |
| `advanced_scan_hotfix.test.ts` | 61 | PASS |
| `advanced_scan_ui_intent.test.ts` | 18 | PASS |
| `advanced_scan.test.ts` | 27 | PASS |
| `browser_boundary.test.ts` | 103 | PASS |
| `bulk_local_host.test.ts` | 1 | PASS |
| `bulk_network_configuration.test.ts` | 38 | PASS |
| `bulk_scope.test.ts` | 31 | PASS |
| `camera_configuration.test.ts` | 40 | PASS |
| `connect.test.ts` | 28 | PASS |
| `credentials.test.ts` | 19 | PASS |
| `device_removal.test.ts` | 19 | PASS |
| `diagnostics.test.ts` | 23 | PASS |
| `discovery_inventory_hotfix.test.ts` | 27 | PASS |
| `discovery.test.ts` | 12 | PASS |
| `duplicate_remediation.test.ts` | 34 | PASS |
| `engine.test.ts` | 19 | PASS |
| `enrichment.test.ts` | 17 | PASS |
| `error_support_evidence.test.ts` | 33 | PASS |
| `field_validation_cleanup.test.ts` | 19 | PASS |
| `field_validation_corrections.test.ts` | 14 | PASS |
| `first_camera_discovery.test.ts` | 26 | PASS |
| `first_camera_field.test.ts` | 80 | PASS |
| `incremental_monitoring.test.ts` | 25 | PASS |
| `ipv4_input.test.ts` | 18 | PASS |
| `local_host_exclusion.test.ts` | 8 | PASS |
| `network_configuration.test.ts` | 48 | PASS |
| `pair.test.ts` | 34 | PASS |
| `ping_discovery_evidence.test.ts` | 41 | PASS |
| `project_history.test.ts` | 39 | PASS |
| `project_persistence.test.ts` | 28 | PASS |
| `project_reverification_workflow.test.ts` | 24 | PASS |
| `report_history.test.ts` | 38 | PASS |
| `report_route_integration.test.ts` | 9 | PASS |
| `reporting.test.ts` | 34 | PASS |
| `settings_completeness.test.ts` | 41 | PASS |
| `stabilization.test.ts` | 29 | PASS |
| `truthful_configuration_boundary.test.ts` | 20 | PASS |
| `ui.test.ts` | 37 | PASS |
| `vendor_drivers.test.ts` | 33 | PASS |

## FIELD-DISC-02 and physical retest

**FIELD-DISC-02: PHYSICAL RETEST STILL REQUIRED / ROOT CAUSE NOT FULLY PROVEN.** Hanwha Vision `192.168.1.100`, MAC `E4:30:22:CD:68:85`, remains unresolved. Wireshark ARP and UDP 3702 observations do not prove that the current app received, parsed and correlated an applicable ONVIF message. The existing transport uses IPv4 per-NIC probes and a shared UDP 3702 multicast listener. Valid XML/ONVIF identity checks still apply; there is no new packet-capture driver or IPv6 discovery. The shared listener does not provide per-packet receiving-interface attribution. No firewall, camera, route or packet-parser cause is claimed without a matching field capture/support record.

Technician-controlled order:

1. **16.1-A - UI stability.** Camera #1 disconnected, Camera #2 connected. Open Advanced Scan, verify adapters load without blanking, select Ethernet and enter `192.168.1.100` through `192.168.1.100`. Verify normal options and valid Start without uncontrolled 400/500 failures. Stop and capture Diagnostics/Support evidence if any failure occurs, before scanning.
2. **16.1-B - Targeted scan.** Only after A passes: Ethernet selection, that single IP, ONVIF/WS-Discovery, Windows Neighbor/ARP, ICMP, TCP, Camera Common ports, Include Unknown ON. Record exactly whether Hanwha appears and what evidence/status is shown. Ping/TCP remain subject to Windows routing. Do not Pair yet.
3. **16.1-C - Pair access preview.** Only after scan behavior is documented: inspect Actions if discovered, otherwise manually add the verified IP/MAC/vendor. Confirm Different Network and truthful verification. Open Pair preview and record its proposed temporary Ethernet address. **Stop before Apply.** Actual Pair/Restore is separately controlled physical work.

Remaining blockers are technician execution/capture of A, then B, then C; unresolved Hanwha discovery/routing evidence; and separate authorization/testing for actual Pair/Restore. Software tests do not establish physical success.
