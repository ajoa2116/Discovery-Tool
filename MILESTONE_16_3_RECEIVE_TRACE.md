Milestone 16.3: physical WS-Discovery receive trace and support evidence

Baseline: `33322401ebb1186c3243552f0940bceedeb23fa8` on `codex/milestone-16-2-2-scan-monitoring-state-separation`.
Implementation branch: `codex/milestone-16-3-physical-ws-discovery-receive-trace`.
Commit subject: `Trace physical WS-Discovery receive path and support evidence`.

FIELD-DISC-02 remains CONFIRMED / UNRESOLVED. The technician reported that monitoring, manual Scan and exact-target Advanced Scan all failed to surface the Hanwha camera, despite Wireshark observing its Ethernet Hello. The manual UNKNOWN / NOT_VERIFIED record and subsequent Phase 4 reconciliation do not establish discovery. No physical camera receive or configuration success is claimed here.

FIELD-SUPPORT-01 was confirmed: transport evidence was not a dedicated support-bundle section. The existing transport trace lived inside a Phase 3 audit record written after the receive window and enrichment completed. It competed with capped general audit history and the bundle's 250-event global timeline. It lacked actual bound ports, total receives, self/external classification and several socket failure details. This architecture explains the diagnostic defect; without the original complete bundle and running-process history, it does not prove which retention or timing condition removed the technician's particular record.

The implementation adds an in-memory, versioned `wsDiscoveryTransport` section to the existing schema-2 Safe Support Bundle. It is captured independently of audit history, including active windows. Legacy audit receiveTrace payloads become references to this section during bundle construction, preventing duplicate packet samples outside its bounds. Existing inventory evidence remains separate.

The audited transport remains unchanged in its bind and acceptance behavior:

| Path | Actual strategy | Evidence and limits |
| --- | --- | --- |
| Announcement listener | One UDP4 socket, reuseAddr true, wildcard `0.0.0.0:3702`, Node bind exclusive false | Port is read from socket.address after bind; no assumption that outbound traffic proves this listener receives. |
| Multicast membership | After bind, join `239.255.255.250` explicitly for each eligible adapter IPv4 address | Interface index identifies the configured adapter in diagnostics; it is not passed instead of the IPv4 membership argument. Each attempt and result is recorded. |
| Probe replies | One UDP4 socket per eligible adapter, bind adapter IPv4 with requested port zero, Node exclusive true | Actual OS-assigned ephemeral port is recorded separately from requested zero. setMulticastInterface chooses outgoing interface; it is not an inbound membership operation. |
| Handler ownership | Message/error observers and acceptance handlers attach before bind | Cancellation removes owned receive handlers and closes that session's sockets. No shared mutable socket is reassigned between sessions. |
| Lifetime | Existing default discovery window is 10 seconds; support listener is 15-20 seconds | Session opening/ending, socket opening, close request, actual close event and reasons are separate timestamps. |

Node documents per-interface membership and actual bound address reporting in its [UDP socket API](https://nodejs.org/api/dgram.html). Its IPv4 message callback provides sender address, port and size, not destination address or ingress interface. The trace explicitly reports those unavailable fields instead of claiming the wildcard listener identifies Ethernet reception.

Windows multicast reuse has different semantics from ordinary unicast port sharing; Microsoft describes a multicast exception for sockets joined to the same group on the same interface and port. That does not prove delivery through a particular firewall or adapter. See [Microsoft's socket reuse guidance](https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse). Node's bind `exclusive` flag is recorded as a Node option; this report does not equate it with directly setting Winsock SO_EXCLUSIVEADDRUSE.

Alternative bindings were audited conceptually, not substituted experimentally on the technician's network. Per-adapter IPv4:3702 listeners could offer separate ownership but must be tested for Windows multicast delivery. Multiple wildcard:3702 listeners with different memberships introduce reuse/duplication concerns and do not expose actual ingress through dgram. An ephemeral-only probe design would not replace the unsolicited port 3702 listener. There is insufficient physical evidence to claim any alternative is more reliable, so this milestone makes no speculative binding change.

Foreground ownership still reserves before monitoring handoff, preflight and scan execution. Transport evidence now receives that MANUAL, ADVANCED or MONITORING session context. The audit found a measurement distinction: discovery promises settle after requesting socket close; the actual close event can occur later. `gapSincePreviousSessionMs` is a gap between session end and the next session start, not a claim of OS handle release. Compare individual socket close/open timestamps for handoff overlap. Tests establish owned cancellation and actual close notification; they do not establish a physical handoff packet-loss rate. Monitoring's bounded windows are not continuous capture.

Each retained session contains the selected adapters, purpose, timeout, origin, owner session ID, unique receive window ID, multicast group, socket details, counters, first self-Probe/external/Hello timestamps, last stage and last successful stage. Packet summaries contain source, length, XML classification, known Action URI, safe XAddr hosts and optional child-presence flags. Unknown Action values become UNRECOGNIZED_ACTION. Message IDs are used only internally for self-Probe correlation. Raw XML, scope values, full XAddr URLs, arbitrary exceptions and credentials are not retained by this trace.

The chain records UDP receive, SOAP parse/classification, Hello or ProbeMatch parse, XAddr extraction, candidate creation/rejection, reconciliation and an inventory-presence observation following promotion callback. INVENTORY_PROMOTION establishes backend inventory presence and callback completion, not proof that a particular browser rendered a row. Manual inventory insertion cannot create receive counters. Support-only candidates carry INVENTORY_NOT_REQUESTED and never run an inventory callback.

Retention is bounded to the newest 20 sessions, 50 datagram samples globally and 50 parser/rejection events globally; lifecycle events are limited to 128 per session with a dropped count. Socket details, adapter summaries and memberships per socket are each capped at 32. Counters continue beyond sample limits. Evidence is process-local and resets on backend restart; export promptly after each field test. A zero receive count with successful membership is meaningful and must not be rewritten as parser failure. A last successful stage is the latest successful event, not a claim that every earlier packet passed all later stages.

The UDP readiness text now explicitly states that creating and closing a local socket does not prove port 3702 membership or inbound reception.

For the support-only field assist, use the running local backend:

```powershell
$traceRequest = @{ interfaceIndex = 8; localAddress = '192.168.0.124'; durationMs = 20000; sendProbe = $false } | ConvertTo-Json
$traceStart = Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/receive-trace' -ContentType 'application/json' -Body $traceRequest
$traceStart.foreground.session.sessionId
```

Verify the current adapter index/address first; the example is the technician's previously observed Ethernet, not a product default. The route validates one current eligible IPv4 address and reserves a MANUAL foreground session. A 202 response reports acceptance, not receipt. It listens for 20 seconds without sending a Probe by default. Set sendProbe to true to send one Probe on the selected adapter. No inventory insertion or camera configuration is performed by this assist. It uses no permanent UI feature. Read its active or recent evidence with:

```powershell
Invoke-RestMethod 'http://localhost:3001/api/support/ws-discovery/receive-trace' | ConvertTo-Json -Depth 30
Invoke-WebRequest 'http://localhost:3001/api/system/support-bundle' -OutFile '.\CCTV_16_3_Support.json'
```

If cancellation is needed, POST `/api/discovery/stop` with `{ "sessionId": "the accepted foreground session ID" }`. Stale IDs cannot stop newer work. Concurrent technician operations are rejected. Normal monitoring resumes through its existing scheduler after the support session finishes. No firewall rule, administrator write, Pair, IP change, credential change, camera reboot or camera write was performed.

Validation: 54 focused assertions (including five real local UDP checks), 47 regression files / 1,458 assertions, 102 existing headless Edge browser assertions, TypeScript and production build (1,598 modules), and git diff whitespace check. The focused suite covers bind/membership errors, synchronous send errors, handler ordering, actual versus requested port, self/external receive counters, large Hello, malformed input, ProbeMatches, origin/handoff, privacy/caps, manual-record exclusion, receive-to-inventory evidence and the support route's ownership/cancellation contract. Existing Hanwha tests preserve provisional identity, later MAC reconciliation, off-subnet unverified state, large payloads and failed-unicast survival. Browser tests cover the prior Advanced Scan interaction/layout and foreground/monitoring separation behavior.

The real Node listener received a synthetic 2,671-byte Hello and 712-byte Probe sent by local software to loopback port 3702: two self receives, one Hello, zero external receives, zero inventory promotions and zero socket errors; actual close notification was observed. These are software-generated packets, not Hanwha hardware and not proof of Ethernet fragmentation/reassembly. Two initial live attempts timed out despite successful bind, including one outside the sandbox. Subsequent focused and full-suite runs passed without changing the bind strategy. Their initial delivery loss remains unexplained; no reliability or physical receive fix is inferred from later passes. The final verification has zero failed/skipped assertions. The temporary Node24 identity workaround is outside the repository and removed after validation.

Physical retest sequence:

1. 16.3-A: isolate camera #2 with camera #1 disconnected. Confirm Ethernet and Wi-Fi addresses. Run the support listener for 20 seconds, optionally with one Probe, while capturing Ethernet in Wireshark. Export immediately. Compare time, sender, bytes, membership and actual receives. No Pair or writes.
2. 16.3-B: allow normal background monitoring; capture a camera Hello during an actual receive window and export. Inspect MONITORING origin and exact window/socket timestamps.
3. 16.3-C: run manual foreground Scan and export immediately. Inspect MANUAL origin, membership, self/external counts and receive-to-inventory stages.
4. 16.3-D: run Advanced Scan targeting 192.168.1.100 through 192.168.1.100 on Ethernet 192.168.0.124/24. Enable ONVIF / WS-Discovery, Neighbor / ARP, ICMP and TCP; Camera Common ON, Include unknown ON, Only likely cameras OFF, manufacturer Any, Normal performance. Export immediately and inspect ADVANCED origin.

Interpret the resulting evidence in order: failed membership points to socket setup; successful membership with zero datagrams points to Windows delivery/bind/firewall/interface investigation; self Probe without external camera traffic narrows the inbound path; external camera datagrams without classified Hello point to classification/parser investigation; Hello with rejection points to candidate acceptance; candidates without inventory observations point to reconciliation/promotion; backend promotion without a displayed row points to UI propagation. Only actual physical discovery permits FIELD-DISC-02 to pass. The original complete physical receive trace and technician retest remain the blockers.

MILESTONE 16.3 PHYSICAL WS-DISCOVERY RECEIVE TRACE & SUPPORT EVIDENCE FIX — SOFTWARE VALIDATED / PHYSICAL RECEIVE TRACE RETEST PENDING
