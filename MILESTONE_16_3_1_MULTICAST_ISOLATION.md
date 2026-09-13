Milestone 16.3.1: physical multicast receive and synthetic evidence isolation

Baseline: `0c544fdf9e75ef2535f5ff1147a21f6376444bb2` (frozen Milestone 16.3).
Branch: `codex/milestone-16-3-1-physical-multicast-receive`.
Commit subject: `Fix physical multicast receive and isolate synthetic evidence`.
The subject describes the requested milestone; it does not claim that the physical Hanwha receive loss has been fixed.

FIELD-DISC-02 remains CONFIRMED / UNRESOLVED. FIELD-DISC-03 is software-corrected and regression-validated, with clean-start physical confirmation pending. FIELD-UI-03 remains OPEN / DEFERRED; Actions styling and behavior were not changed.

The exact synthetic leak was in the 16.3 runtime test added during the previous implementation. `src/test/ws_discovery_trace.test.ts` created a Node dgram sender and sent the shared Hanwha fixture to `127.0.0.1:3702`. That is the real application discovery port, not an isolated test destination. The shared fixture deliberately defaults its XAddr to `192.168.1.100` and uses `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` when its synthetic UUID option is enabled. Both values came from test construction, not camera observation.

The sender was a separate Node CLI test process invoked through tsx, not an in-process backend test route. The historical sender PID was not retained. The 16.3 support endpoint did not emit this Hello; its optional outbound message is a Probe. The live regression test deliberately injected UDP into the shared port. A concurrently listening backend could receive the same test packet. The original wildcard receiver used reuseAddr, while its local-source exclusion compared against the selected physical adapter IPv4 list. Loopback was absent from that list. Hello validation used the advertised remote XAddr, so valid synthetic XML passed acceptance. Phase 3 upserted it and emitted normal discovery events. There was no evidence provenance field to preserve or reject.

Closing the test sender/receiver did not roll back another process's Quick Work inventory. The unintended row could survive for that backend session, and could be saved if the technician saved its inventory. This also provides a concrete explanation for the earlier 16.3 loopback test's intermittent delivery to the test receiver: it used a shared unicast destination with a competing receiver. We did not retain packet-level routing proof for those historical sends, so this explanation is consistent with the evidence, not a measured reconstruction of every timeout. The earlier report's software-loopback result must not be read as physical discovery or safe test isolation.

Other unmarked fixtures could have leaked through the same shared-port mechanism. The audit found only the 16.3 trace test transmitting a Hello to fixed discovery port 3702. The older Hanwha real UDP test already used its own ephemeral loopback receiver. Injected EventEmitter sockets do not transmit on the network. All live Hello regression sends now target only an owned ephemeral loopback port. The support endpoint has no Hello injection API and does not promote candidates or emit technician device notifications.

The fix uses explicit PHYSICAL_NETWORK, SYNTHETIC_TEST and SUPPORT_DIAGNOSTIC provenance. The shared wire fixture declares the synthetic namespace at creation. Parser results preserve it. Transport options carry provenance for arbitrary-source injected tests; injected socket factories default to SYNTHETIC_TEST. A received synthetic marker can downgrade provenance across process boundaries but cannot assert physical provenance. No fixture UUID, camera IP or camera MAC is blacklisted. An unmarked physical-network packet with the same unusual UUID remains accepted.

Transport candidate merging partitions provenance before identity comparison, preventing a synthetic conflict from mutating an existing physical candidate. Phase 3 rejects nonphysical evidence before upsert, callbacks or enrichment in technician inventories, and excludes it from technician scan result counts. Async enrichment preserves provenance. The database independently rejects synthetic/support upsert and project loading before mutation. Tests explicitly request an ISOLATED_TEST database when they need reconciliation simulation. The normal singleton remains TECHNICIAN. Legacy/manual records without this field remain compatible; absence of provenance on an old saved row is not retroactively proof that it is physical. No existing row is deleted by matching an IP or UUID.

A second defensive check recognizes all currently enumerated local IPv4 addresses and the IPv4 loopback range, including unselected Wi-Fi. Local traffic cannot become an unmarked physical camera merely because its XAddr advertises another subnet. The provenance guard remains independent of source address: tagged synthetic traffic from any arbitrary source stays isolated. PHYSICAL_NETWORK means eligible network-origin evidence, not authenticated camera identity; UDP sender identity is not cryptographic proof.

Read-only Windows observations on 2026-09-13:

| Observation | Result |
| --- | --- |
| UDP ownership | One snapshot showed PID 19508, process node, wildcard 0.0.0.0:3702. Other snapshots and the new ownership helper returned no listener. This is an instantaneous view, consistent with bounded windows. |
| Owner identity | Executable path and command line were unavailable for PID 19508. Another app instance cannot be confirmed or excluded from that snapshot. No process was terminated. |
| Ethernet mapping | InterfaceIndex 8, 192.168.0.124/24, Public network category. |
| Wi-Fi mapping | InterfaceIndex 10, 192.168.40.166/24, Public network category. |
| Firewall state | Domain, Private and Public enabled; default inbound action Block. |
| Node rules | Two enabled inbound Allow rules for C:\Program Files\nodejs\node.exe on Public: one TCP, one UDP. Both allow Any local/remote port and address. |
| Test runtime path | C:\Program Files\nodejs\node.exe. The existing owner's executable path remained unavailable. |
| Existing backend trace read | The localhost:3001 support-trace request was unavailable; no new physical receive evidence was obtained through it. |

These observations do not establish FIREWALL_BLOCKED. Default blocking is subject to applicable allow rules and other filtering. The UDP allow rule weakens a simple missing-rule hypothesis for that executable, but does not prove the unknown owner's effective policy or exclude other filters. POSSIBLE_OS_FILTERING is an investigation hypothesis only when a synchronized capture shows physical packets arriving during an active joined receive window while Node records only self traffic. No firewall, network profile, adapter address, camera setting, credential or Pair mutation was made.

The Windows socket audit answers A-T as follows:

| Question | Finding |
| --- | --- |
| A-B: exact bind | Production calls bind with port 3702, address 0.0.0.0, exclusive false. It is an explicit wildcard UDP bind. |
| C: actual address | The real 16.3 listener and current Windows endpoint observation report 0.0.0.0:3702. Each new trace still records socket.address independently of requested bind. |
| D: reuse | Default dgram factory explicitly creates UDP4 with reuseAddr true. Injected factories are labeled INJECTED_FACTORY rather than pretending their options are known. |
| E-F: competing processes | PID 19508 observed; application identity unavailable. There is no evidence that it is an additional instance rather than the expected backend. |
| G-H: external versus local | Technician evidence establishes local receive and absent physical-source receive in reported windows. Current software tests cannot prove external Ethernet delivery. |
| I: interface mapping | The read-only adapter query confirms Ethernet index 8 at 192.168.0.124. |
| J: join timing | Joins run synchronously in the bind callback; timestamps record each result. Compare to camera packet capture time to prove overlap. |
| K: replacement | Code adds each membership; it never drops Ethernet membership when adding Wi-Fi. Deterministic tests preserve both. |
| L: socket comparison | Sequential support modes now compare wildcard-all, wildcard-selected and one adapter-specific bind. Physical comparative results remain pending. |
| M-N: ingress ambiguity | dgram IPv4 message metadata does not identify destination or receiving interface. Multiple memberships do not make an ingress claim possible. |
| O: multicast loopback | Local multicast visibility does not establish external ingress. The app does not change IP_MULTICAST_LOOP settings. |
| P: outbound selection | setMulticastInterface selects outgoing multicast interface; it does not replace addMembership for receive. |
| Q-R: protocol family | The sockets are UDP4; the supplied Wireshark camera evidence is IPv4. No IPv6 mismatch is inferred. |
| S-T: firewall | Public profiles and existing Node UDP allow rule observed; actual physical filtering cause remains unproven. |

Node documents the [UDP membership, address, multicast interface and loopback APIs](https://nodejs.org/api/dgram.html). Microsoft documents [Windows reuse and multicast delivery semantics](https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse), including the distinction between ordinary shared-port delivery and joined multicast sockets. Node's bind exclusive option is not presented here as directly setting Winsock SO_EXCLUSIVEADDRUSE. No production bind strategy was switched based on unproven Windows behavior.

The trace retains its 20-session, 50-global-datagram, 50-global-parser-event and 128-lifecycle-events-per-session bounds. It adds session strategy, PID and provenance, packet/candidate provenance, explicit UDP_DATAGRAM_RECEIVED labels, and up to 16 external source IPv4 samples. Self means a local-machine IPv4 address; external means not in that set, not automatically a camera. The local address set is refreshed from os.networkInterfaces for each discovery call and includes selected interfaces. If OS enumeration fails, selected interfaces and loopback remain the fallback; that limitation must be considered when interpreting self/external classification. No raw XML or credentials are added to support evidence.

The existing support endpoint accepts three explicit strategies:

| Strategy | Selection and bind | Intended comparison |
| --- | --- | --- |
| WILDCARD_SELECTED (default) | One current selected adapter; wildcard:3702 | Ethernet-only first. This is the requested B isolation. A and B are identical if A already selects only Ethernet. |
| WILDCARD_ALL | All currently eligible adapter IPv4 memberships on one wildcard:3702 socket | Current multi-adapter behavior, including Ethernet and Wi-Fi. |
| ADAPTER_SPECIFIC | One selected adapter; its IPv4:3702 | Support-only alternative C. No claim that Windows external multicast is more reliable here. |

All modes reserve foreground ownership before yielding monitoring, last 15-20 seconds, default to passive receive, suppress inventory callbacks, and honor scoped Stop. Optional sendProbe sends one Probe per selected adapter. The new bounded, read-only port ownership helper runs after handoff. Another PID on UDP 3702 causes HTTP 409 with owner details; unavailable ownership inspection fails closed. It never terminates an owner. This is a snapshot, not a guarantee that another process cannot bind later. Do not deliberately start conflicting experiments concurrently.

Run on the final backend, with camera #1 disconnected and no Pair, Manual Add, camera writes or Ethernet changes:

```powershell
# Observe ownership and profile first; these commands make no changes.
Get-NetUDPEndpoint -LocalPort 3702 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-NetConnectionProfile | Select-Object InterfaceAlias,InterfaceIndex,NetworkCategory
Get-NetFirewallProfile -PolicyStore ActiveStore |
  Select-Object Name,Enabled,DefaultInboundAction

# Start Ethernet-only passive receive. Confirm the current index/address first.
$receiveBody = @{ interfaceIndex=8; localAddress='192.168.0.124'; durationMs=20000; sendProbe=$false; strategy='WILDCARD_SELECTED' } | ConvertTo-Json
$receiveStart = Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/receive-trace' -ContentType 'application/json' -Body $receiveBody
$receiveStart.foreground.session.sessionId

# Read active/recent evidence; export immediately after the window finishes.
Invoke-RestMethod 'http://localhost:3001/api/support/ws-discovery/receive-trace' | ConvertTo-Json -Depth 30
Invoke-WebRequest 'http://localhost:3001/api/system/support-bundle' -OutFile '.\CCTV_16_3_1_Ethernet.json'
```

Wait for the accepted session to finish before repeating with WILDCARD_ALL, then ADAPTER_SPECIFIC. A 202 means accepted, not physical reception. If an owner blocks the test, identify it and resolve it deliberately; do not kill unrelated processes. No synthetic Hello should be transmitted to the discovery port for this comparison. Local synthetic receive is validated only through owned ephemeral test sockets. Optional Probe evidence can be compared separately from physical camera-source evidence.

Physical sequence: A, restart final backend/frontend, confirm empty Quick Work and observe two background cycles without Scan; B, run the Ethernet-only 20-second support window; C, capture the exact same window in Wireshark; D, compare normal monitoring; E, run one manual Scan; F, if needed run Advanced Scan on Ethernet targeting 192.168.1.100 through itself, ONVIF/Neighbor/ICMP/TCP and Camera Common enabled, Any manufacturer, Only likely cameras off, Include unknown on, Normal performance. Export immediately after each. Do not silently discard unsaved technician work when preparing a clean start.

Physical source 192.168.1.100 in UDP_DATAGRAM_RECEIVED establishes the requested transport receive boundary independently of XML parsing, provided this is the controlled hardware test with synthetic injection excluded. Then examine Hello classification, XAddr extraction, candidate creation, reconciliation and inventory promotion. Physical-source receive without a row points downstream. Wireshark physical receive with only self Node receive points to OS/socket/filtering investigation. Ethernet-only success and multi-adapter failure implicate membership/socket architecture. Neither capture seeing a packet in that exact window means repeat timing observation; it does not undo the already confirmed camera transmission evidence. Any synthetic row in technician inventory keeps FIELD-DISC-03 failed.

Validation: 60 new synthetic-isolation and strategy assertions; the preserved 16.3 trace suite has 54 assertions including five real UDP checks now using an isolated ephemeral socket. Full regression: 48 files, 1,518 assertions. Existing browser checks: 102. TypeScript, build (1,598 modules), and diff whitespace check pass. The read-only ownership helper executed successfully and returned an empty snapshot on its validation call. Strategy A/B/C bind and membership behavior was tested with injected sockets; physical Ethernet strategies were not run against the other process's intermittent discovery listener. No physical Hanwha success is claimed.

One early regression failed because a legacy fake-socket test used an unlabelled technician database; it was migrated to an explicit ISOLATED_TEST database. Final regression has zero failed/skipped assertions. The prior test-port leak has been removed rather than retried on the production port. The temporary Node24 identity shim is outside the repository, removed after validation, and NODE_OPTIONS is unset. Remaining blockers are the clean-start technician retest, identification of any conflicting owner, and synchronized physical capture/Node receive comparison. The UI polish issue stays deferred.

MILESTONE 16.3.1 PHYSICAL MULTICAST RECEIVE + SYNTHETIC EVIDENCE ISOLATION — SOFTWARE VALIDATED / PHYSICAL ETHERNET RECEIVE RETEST PENDING
