# Milestone 16.2 - Hanwha WS-Discovery Hello

**MILESTONE 16.2 HANWHA WS-DISCOVERY HELLO PHYSICAL FIX - SOFTWARE VALIDATED / PHYSICAL HANWHA RETEST PENDING**

Branch: `codex/milestone-16-2-hanwha-ws-discovery-hello-fix`

Starting HEAD: `a215d3ff43e2d6a2f74baed16e92ef02b67b113e` (`Fix Advanced Scan field-test regressions`). The initial working tree was clean. The frozen Milestone 16.1 commit is unchanged. This work is committed separately as `Fix Hanwha WS-Discovery Hello discovery path`; the delivery response records its final hash.

## Physical finding and limits

**FIELD-DISC-02 remains CONFIRMED / PHYSICALLY UNRESOLVED.** The supplied evidence establishes that Wireshark decoded a camera Hello from `192.168.1.100` / `E4:30:22:CD:68:85`, addressed to `239.255.255.250:3702`, with XAddr `http://192.168.1.100/onvif/device_service`. Ethernet is `192.168.0.124/24`. Wireshark reported two fragments and 1,483 bytes of decoded XML.

The **exact historical physical loss point is not established**. No matching Node callback trace or complete physical Hello XML was supplied. EndpointReference, Types, Scopes and MetadataVersion contents were not included. The full decoded XML was requested during the audit; no reply was available for validation. The test fixture explicitly identifies itself as reconstructed, with synthetic optional fields. A read-only comparison against the frozen 16.1 validHello function rejected both the excerpt-only reconstruction and the UUID-without-Scopes variant; the new parser accepted both. The UUID-plus-ONVIF-Scopes control passed both versions. A software reproduction of an old parser rejection is not proof that the physical packet contained that exact variant.

Before modifying discovery code, a 45-second passive-only Node observation joined Ethernet and Wi-Fi and received four locally originated 712-byte application discovery probes, but **zero camera Hellos**. No probes were sent by the observer. This establishes that multicast datagrams reached that Node socket during the window; it does not establish camera arrival, firewall behavior, camera retransmission timing, fragmentation loss, or failure of another process's socket.

After implementation, a 10-second passive-only observation using the new transport recorded socket creation, wildcard bind, both memberships, two locally originated 712-byte probes, their rejection as unsupported announcement messages, and normal closure. Window ID: `bcb552a7-bb90-4913-bc12-07d3b746b431`; UTC `2026-09-12T19:44:21.452Z` through `19:44:31.466Z`. No interface errors; zero accepted Hellos; zero camera candidates. No hardware discovery success is claimed.

## Trace audit before code changes (A-AG)

| Item | Baseline finding |
| --- | --- |
| A | `NodeOnvifWsDiscoveryTransport.listenAnnouncements` owned the Hello receive socket. |
| B | One shared announcement socket plus one Probe socket per eligible IPv4 adapter. |
| C | Announcement socket bound `0.0.0.0:3702`; Probe sockets bound each local adapter IPv4 with ephemeral port 0. |
| D | Shared receiver called `addMembership(239.255.255.250, nic.ipAddress)` for each selected/eligible adapter. |
| E | UDP4 sockets used `reuseAddr:true`; multicast bind used `exclusive:false`, probes `exclusive:true`. No reusePort change was justified. Coexistence with locally emitted application probes was observed, but no general Windows port-sharing guarantee or camera-specific failure was inferred. |
| F | Hello and active Probe sockets were separate; either Probe receive callback could also parse a Hello. |
| G | Quick Scan, incremental monitoring and Advanced ONVIF discovery reused the pipeline; each cycle created and closed sockets. Another application process is not coordinated by this pipeline. |
| H | Listening was bounded, normally 3,500 ms, not continuous. |
| I | A camera Hello outside that window was necessarily missed. Neither its actual arrival time relative to the failed scan window nor its repeat interval is known. |
| J | The application operated at UDP Buffer level, with no fragment-level parser. The physical reassembled packet was not received in our observation. Local UDP tests verify whole large payload delivery, not physical Ethernet fragment reassembly. |
| K | Historical callback receipt of the physical 1,483-byte XML is unproven; bounded live observations saw no camera Hello. |
| L | Sender IP was retained; source port and payload length were discarded. Probe/single-adapter metadata was retained; shared multi-adapter ingress could not be identified by dgram. |
| M | `validHello` already checked supported namespace URIs, but later field extraction used regexes. |
| N | Action validation allowed a missing Action. Transport first classified Hello with a tag regex rather than its namespaced Action. |
| O | Body Hello was checked structurally, then fields were extracted from the whole XML using local-name regexes. |
| P | First XAddr was used without validating scheme/host. `network.ipAddress` came from UDP sender instead of XAddr. An IPv6 or malformed first XAddr could hide a later usable IPv4 endpoint. |
| Q | Types were not used as ONVIF evidence. |
| R | ONVIF Scopes were mandatory for Hello acceptance. Optional malformed percent-encoding could make the whole old parser fail. |
| S | A strictly formatted EndpointReference UUID was mandatory, even when other safe evidence could create a provisional candidate. Missing MAC itself was not the gate. |
| T | MetadataVersion was not inspected. |
| U | Namespace-validation code handled aliases, but `\w+` extraction/classification regexes rejected legal hyphen/dot-containing XML prefixes. |
| V | Hello had its own parser and did not require ProbeMatch. |
| W | No same-subnet XAddr gate existed; however XAddr host was not the classified network location. |
| X | A different source subnet was not a parser rejection. |
| Y | Off-subnet XAddr was not explicitly rejected. |
| Z | Mandatory ONVIF Scopes and strict UUID were gates before candidate creation. Explicit Advanced filters ran later. |
| AA | Missing MAC could be accepted with UUID and Scopes; missing UUID was always rejected in Hello. |
| AB | No response to an active Probe was required after valid Hello parsing. |
| AC | Existing reconciliation supported UUID/MAC/serial, but transport merging did not deduplicate identical provisional observations without stable anchors. |
| AD | Enrichment used the current device IP and optional discovery NIC to look up a neighbor; later MAC enrichment was supported. Sender and XAddr were stored, but sender supplied the device IP. |
| AE | Single-adapter reception produced Different Network and NOT_VERIFIED. Multi-adapter reception produced UNKNOWN because ingress was unavailable, even when the endpoint was outside every known subnet. Enrichment could overwrite that relationship with UNKNOWN. |
| AF | Parser rejection returned null with no reason. Some parse exceptions logged raw errors; neighbor lookup exceptions returned null indistinguishably from no match. Callback exceptions were not contained in the transport. |
| AG | Support recorded aggregate accepted/rejected counts and interface warnings, not receive bytes, stages, per-message rejection reasons, window correlation or reconciliation outcomes. |

## Small, evidence-supported changes

### Hello parser and identity

`ws_discovery_hello.ts` uses the existing fast-xml-parser package and namespace URI/local-name traversal for Envelope, Header, Action, Body, Hello, EndpointReference, Address, XAddrs, Types, Scopes and MetadataVersion. Supported SOAP and Addressing/Discovery namespaces include the observed 2003/05, 2004/08 and 2005/04 URIs. Default namespaces and arbitrary valid prefixes are tested. Action must identify Hello and match the Hello body's discovery namespace. Malformed XML, duplicate roots, DTD/entities, invalid UTF-8, unsupported actions and non-ONVIF content do not create candidates.

Scopes/Types are optional. ONVIF scope/type evidence qualifies; if both are absent, the advertised standard ONVIF device-service path qualifies as discovery evidence. This is not a successful HTTP connection. No Hanwha-specific packet formatting, fixed camera IP behavior or vendor-only acceptance rule was added. Invalid provided UUIDs are rejected; absent UUID/MAC is not by itself a rejection.

XAddrs are validated HTTP(S) URLs with canonical nonlocal/unicast IPv4 hosts and valid nonzero ports. Userinfo, fragments, unsafe malformed URLs, multicast/loopback targets and unsupported schemes are excluded. IPv6/unsupported entries do not hide a later usable IPv4 entry. The first valid IPv4 entry is deterministic; valid full XAddrs and sender IP remain separately retained. Local-host exclusion occurs before transport delivery.

MAC is preferred when actually advertised, then UUID/serial evidence. With no stable anchor, the existing `session:` identity class contains a hashed provisional observation key; IP/URL data is not declared a permanent physical anchor and credentials/query strings do not leak through that key. Identical provisional observations can merge, but distinct UUID/MAC identities sharing an IP remain separate. Later MAC enrichment uses existing reconciliation and preserves stable UI record identity.

### Receive path, relationship and monitoring

The same shared UDP4 announcement socket and per-adapter Probe architecture remain. No reusePort workaround, raw packet driver, application fragment reassembler, continuous listener or new discovery engine was introduced. Default receive timeout is now explicitly **10,000 ms**, capped at 30,000 ms for caller-specified diagnostic windows; tests can use shorter windows. Bind/send failures, timeout and cancellation clean up sockets. Probe bind timeout now covers initialization, avoiding an unbounded wait for a bind callback.

A bounded window can still miss a one-time Hello outside its lifetime. Monitoring retains its 30-second cadence and existing busy-operation deferral; topology, neighbor work and enrichment also occupy time, so this is not a guarantee of continuous reception or capture within two cycles. Support records creation/open/close times to correlate against Wireshark. Listen-only diagnostics can use `announcementOnly:true` and perform no active probes or enrichment.

The advertised XAddr IPv4 supplies network relationship. Single selected Ethernet correctly yields Different Network. With ambiguous shared ingress, an endpoint outside every eligible adapter subnet is also truthfully Different Network without inventing the receiving adapter. That classification survives enrichment when no ingress NIC is known. Hello alone stays NOT_VERIFIED, never establishes Ping/HTTP reachability, and does not become Offline/Unreachable. Pair remains a separate explicit preview/apply operation.

### FIELD-ADV-04

The old Start route waited for monitoring to yield, enumerated adapters during validation, enumerated again, then returned 202. Phase 1 topology performed another enumeration after acceptance; route analysis and socket initialization came later. The old modal set busy but retained the unchanged button label and no Preparing explanation. Those are established code-path causes of an apparently idle click; the exact historical 10-second breakdown was not captured.

Preflight now produces its plan and adapter snapshot from **one read**, with adapter-inspection/planning timing and server monitor-yield/total-preflight timing recorded in Support. Topology timing is recorded separately. A safe preflight-only measurement of the physical target configuration took **4,300 ms adapter inspection and 1 ms planning**, produced a valid one-address plan and executed no scan. This measurement is not a latency guarantee or a measurement of the historical run.

The UI immediately disables Start and shows Preparing, using a synchronous latch against duplicate submissions. Form changes, Close and Cancel are disabled while the noncancellable preflight request is outstanding. Failed preflight restores controls and gives actionable safe text; accepted 202 transitions to existing scan progress. Server preparation is also guarded against duplicate Starts and coordinated with monitoring/Quick Scan. No Advanced Scan redesign was made.

### Bounded Support evidence

Each receive result carries a window ID, timestamps, configured timeout, up to 128 stage events and a dropped-event count. Events identify socket kind, known adapter/bind address, membership outcome, UDP source IP/port, byte count, parser stage, safe rejection reason and candidate relationship. Source metadata is also retained with device evidence. Phase 3 records up to 32 reconciliation/enrichment outcomes in the same audit event, including neighbor lookup unavailable versus no match. Existing Support bundle limits and sanitization remain in use. No raw XML, credentials, authorization headers, vault material or full advertised URL is logged in the receive trace. Socket/parser/enrichment exceptions use fixed safe reasons.

Node's documented API exposes the datagram Buffer plus sender address/port/size and explicit multicast membership per interface; it does not provide an IPv4 receiving-interface index in rinfo. See [Node UDP documentation](https://nodejs.org/api/dgram.html#event-message) and [multicast membership](https://nodejs.org/api/dgram.html#socketaddmembershipmulticastaddress-multicastinterface). No fragmentation diagnosis was inferred from Wireshark's frame display alone.

## Validation

- New deterministic Hello/receive/pipeline/preflight tests: **74 passed**.
- Mocked-API headless Edge Preparing checks: **15 passed**.
- New focused total: **89 passed**, zero failures/skips.
- Full regression: **44/44 files, 1,325 assertions passed**, zero failed/skipped. After final parser/enrichment checks were added, affected suites were rerun and the final totals updated below.
- Existing ProbeMatch, 16.1 adapter/modal/draft/stale-response/boundary, generic-neighbor exclusion, Advanced silent-target, monitoring, Pair/status/restore mocks, manual-add, numeric sorting, projects/reverification, history, bulk, settings and credential/support boundaries pass.
- Actual local UDP round trip received the full large XML Buffer; a reconstructed exactly 1,483-byte packet and a packet larger than an Ethernet MTU passed parsing/transport tests. This does not test physical camera fragmentation or establish physical reception.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; **1,594 modules transformed**.
- `git diff --check`: passed.
- Temporary UI-only harness and test server were removed/stopped. The temporary external Node identity shim is removed before delivery and NODE_OPTIONS unset. It is never part of application code or this commit.

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
| `hanwha_hello.test.ts` | 74 | PASS |
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

## Technician physical retest and remaining blockers

Keep Camera #1 disconnected, Camera #2 unchanged at `192.168.1.100`, MAC `E4:30:22:CD:68:85`, Ethernet `192.168.0.124/24`.

1. **16.2-A:** Start the corrected app, do not manually add or Pair, wait at least two monitoring cycles, and record any camera row's IP, identity, status, relationship, verification and evidence source. Correlate Hello timestamps with the recorded receive windows; bounded listening is not continuous.
2. **16.2-B if still missing:** Ethernet only; Start/End both `192.168.1.100`; ONVIF, Neighbor, ICMP and TCP enabled; Camera Common ports; Include Unknown ON. Verify immediate Preparing feedback. Capture result and Support bundle. The trace should establish whether zero camera datagrams arrived, a specific parsing rule rejected one, delivery failed, or inventory reconciliation succeeded. Include the complete decoded Hello and matching timestamps if still unresolved.
3. **16.2-C only after documenting discovery:** If visible, confirm Pair in Actions and open preview. Record the proposed temporary address. **Stop before Apply.** Actual Pair/Restore requires separate physical review.

No Ethernet configuration, camera IP/credentials, physical Pair/Restore or camera writes were performed by this task. Remaining blockers are the complete physical Hello/matching receive evidence and technician confirmation of discovery and Pair-preview behavior. Existing off-subnet unicast route limitations remain; a valid Hello can surface evidence without solving them.
