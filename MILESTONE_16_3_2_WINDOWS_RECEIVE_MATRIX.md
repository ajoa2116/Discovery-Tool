Milestone 16.3.2: Windows physical multicast receive investigation

Baseline: f8b635c28307590603ae3ab2489ef4ae80331428.
Branch: codex/milestone-16-3-2-windows-physical-multicast-receive.
The baseline commit remains unchanged. No production bind architecture was switched: the prerequisite physical comparative receive evidence is not yet available.

FIELD-DISC-02: CONFIRMED / UNRESOLVED, loss before application-level parsing in the supplied controlled test.
FIELD-DISC-03: PHYSICAL CLEAN-START PASS, as confirmed by the technician's new milestone request.
FIELD-UI-03: OPEN / DEFERRED. Actions hover styling was not changed.

The pre-existing CCTV_Receive_Trace.txt was read and preserved, not staged, rewritten or deleted. SHA256: 365098ED0F599FFF10676E829DAF89A7DFBD9E6BEF64A1CAE636AB327E91749C. Its support session 2973c391-faf5-4a25-84ff-20de31cdba36 ran from 2026-09-13T15:06:11.554Z to 15:06:31.556Z, WILDCARD_SELECTED, Ethernet index 8 at 192.168.0.124. All receive, candidate, rejection and socket-error counters were zero. This confirms the provided receive boundary; no parser change is justified. The camera's previous Wireshark transmission evidence is accepted, not questioned. A synchronized capture is still needed to compare each new matrix window.

Production socket audit before modifications:

| Area | Existing behavior |
| --- | --- |
| Creation/family/reuse | dgram.createSocket({type: udp4, reuseAddr: true}); matches the captured IPv4 camera family. |
| Announcement bind | Explicit {port:3702,address:0.0.0.0,exclusive:false}; actual address obtained from socket.address after bind. |
| Membership order | Handlers attach before bind; addMembership(group, adapterIPv4) runs in its callback, once per selected eligible IPv4. Interface index is metadata/selection, never substituted for the IPv4 argument. |
| Probe sockets | Per-adapter IPv4:0 bind, exclusive true; setMulticastInterface selects outgoing interface; one Probe sent per selected adapter when enabled. |
| Loopback/TTL | No explicit setMulticastLoopback or setMulticastTTL call; local traffic visibility does not prove external delivery. |
| Cleanup | Session-owned sockets close on timeout/error/cancellation. Existing scan completion requested close without waiting for its actual event. |
| Ownership | The old support route checked UDP ownership after foreground handoff, but occupied a MANUAL foreground reservation. Matrix now has independent support ownership. |
| Multi-adapter | One wildcard announcement socket joins selected adapter memberships without dropping previous joins. Node IPv4 receive metadata cannot prove destination or ingress interface. |
| Enumeration | Selected adapter validated against current Windows snapshot; all OS local IPv4 addresses contribute to self classification, with selected/loopback fallback if enumeration fails. |
| Vite/other processes | Vite serves the frontend and does not create production discovery sockets. Separate backend instances can conflict; PID observation is required. |

Node's [dgram documentation](https://nodejs.org/api/dgram.html) distinguishes outbound interface selection, inbound membership, actual socket address and close events. Microsoft's [Winsock reuse guidance](https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse) distinguishes shared unicast from joined multicast delivery. The matrix exclusive variant compares Node's bind option; it does not claim to set Winsock SO_EXCLUSIVEADDRUSE or disable reuseAddr. Production receive strategy remains unchanged until physical evidence supports a correction.

The new ReceiveMatrix service runs up to four distinct strategies sequentially on exactly one current eligible Ethernet IPv4:

| Strategy | Bind | reuseAddr / Node exclusive | Software result | Physical result |
| --- | --- | --- | --- | --- |
| WILDCARD_SELECTED | 0.0.0.0:3702 | true / false | configuration and receive-chain assertions pass | supplied 16.3.1 window had zero receives; new matrix retest pending |
| ADAPTER_SPECIFIC | selectedIPv4:3702 | true / false | configuration and receive-chain assertions pass | pending |
| WILDCARD_EXCLUSIVE | 0.0.0.0:3702 | true / true | configuration and receive-chain assertions pass | pending; Node option comparison only |
| SINGLE_MEMBERSHIP | 0.0.0.0:3702 | true / false | equivalent Ethernet-only control passes | pending |

Default HTTP matrix includes the first two strategies, passive receive, 20 seconds per strategy. Each configurable window must be 15-20 seconds; Wi-Fi is excluded. Each result has its own window ID, requested/actual socket settings, memberships, safe error codes, counters, bounded external sources, and exact windowOpenedAt/windowClosedAt taken from socket lifecycle evidence. Results reference bounded trace sessions rather than duplicating raw datagrams. The latest matrix result remains in wsDiscoveryTransport.matrix after normal trace rotation; only bounded counters/socket summaries are retained there. Existing 20 sessions / 50 global datagrams / 50 parser events / 128 lifecycle events per session remain intact. Request fields are projected onto an allowlist; arbitrary credentials or extra fields are not retained.

Support ownership is separate from foreground Scan. The lease is acquired synchronously before yielding any active monitoring cycle. Manual/Advanced/legacy support starts cannot steal it; monitoring ticks defer while it is held. The footer shows discovery deferred while Scan remains Scan and Ready remains Ready. Pausing records pauseRequestedAt and monitoringPausedAt (after the active cycle drains). Each strategy records listenerAcquiredAt/listenerReleasedAt. monitoringResumedAt means that support released its deferral, allowing the existing scheduler to run; it does not claim a new background cycle already began or turn monitoring on if the technician disabled it.

Before every strategy, the read-only bounded owner check records address, port, PID, process name, executable path when available, and expectedBackend. Command-line availability is reported with arguments redacted rather than exporting possible secrets. A foreign owner yields CONFLICTING_PORT_OWNER and stops the experiment. Expected backend handles get a bounded opportunity to drain; persistent ownership yields LISTENER_HANDOFF_INCOMPLETE. No owner is killed. An ownership snapshot cannot prevent an unrelated process from binding later.

The support transport waits for actual close before proceeding. If confirmation exceeds one second, the strategy fails with SOCKET_CLOSE_NOT_CONFIRMED and the support lease remains held with cleanupPending until closure is observed. This prevents an uncertain old listener from racing the next strategy or background monitoring. The normal receive window is already stopped; this exceptional state can require backend investigation/restart if closure never arrives. Tests cover delayed close and eventual release. Ordinary socket failures, success and cancellation all release the lease after safe cleanup. No candidate callback or inventory mutation is supplied to support experiments, and the 16.3.1 provenance guards remain active.

Read-only runtime observations at 2026-09-13T15:20:20Z:

- Ethernet index 8: Intel(R) Ethernet Connection (13) I219-LM, Up, 1 Gbps, IPv4 192.168.0.124/24, MTU 1500, interface metric 25.
- WeakHostSend, WeakHostReceive and forwarding: Disabled.
- Ethernet has an on-link 224.0.0.0/4 multicast route, route metric 256, alongside its local subnet/broadcast routes.
- Public Ethernet profile. Firewall Domain/Private/Public profiles enabled with default inbound Block.
- Exact running observation process path: C:\Program Files\nodejs\node.exe. Current runtime: v24.19.0.
- Matching Node inbound Allow rules: enabled, Public, TCP and UDP, Any local port, Any remote/local address, service Any, edge traversal DeferToUser. These observations are not a complete effective WFP/policy evaluation and do not prove FIREWALL_BLOCKED.
- Enabled Ethernet bindings include standard Microsoft networking components and existing Npcap Packet Driver. No Npcap dependency was added, removed or used by the application. The listed binding alone does not prove packet loss. No obvious VPN/Hyper-V binding appeared in this selected enabled-binding list; this is not proof that every filter layer is absent.
- PID 16256 was observed owning the backend's TCP 3001 listener and wildcard UDP 3702 in a Windows snapshot. The new standalone Node runner then refused to open UDP because TCP 3001 was active, reporting CONFLICTING_PORT_OWNER. Its UDP owner snapshot was empty at that later instant, consistent with bounded discovery windows. The existing backend was not stopped or replaced.

The environment endpoint reports the backend process's own executable path and matching rule details, avoiding an assumption that all Node installations share the same firewall rule. Interface/network/profile/rule commands are observational only. The full interpretation remains POSSIBLE_OS_OR_FILTER_DRIVER_DELIVERY_ISSUE when synchronized Wireshark sees a physical packet in a joined window but user-mode UDP does not. WFP, firewall, security/VPN filters, NIC filters and promiscuous capture versus host-stack delivery are candidates, not proven causes.

Run these commands after restarting the final backend/frontend and preserving any unsaved technician work:

```powershell
# Read-only exact backend/rule and Ethernet observation.
Invoke-RestMethod 'http://localhost:3001/api/support/ws-discovery/matrix/environment?interfaceIndex=8' | ConvertTo-Json -Depth 12

# Sequential Ethernet-only A/B matrix: no Probe, no camera writes.
$matrixBody=@{interfaceIndex=8;localAddress='192.168.0.124';durationMs=20000;sendProbe=$false;strategies=@('WILDCARD_SELECTED','ADAPTER_SPECIFIC')}|ConvertTo-Json
$matrixStart=Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/matrix' -ContentType 'application/json' -Body $matrixBody
$matrixStart.sessionId

# Poll exact active window timestamps/counters and inspect final state.
Invoke-RestMethod 'http://localhost:3001/api/support/ws-discovery/matrix' | ConvertTo-Json -Depth 20
Invoke-WebRequest 'http://localhost:3001/api/system/support-bundle' -OutFile '.\CCTV_16_3_2_Matrix.json'

# If needed, cancel only this support session.
$matrixStop=@{sessionId=$matrixStart.sessionId}|ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/matrix/stop' -ContentType 'application/json' -Body $matrixStop
```

A 202 response means accepted, never physical PASS. The matrix endpoints do not use /api/discovery/stop. Add WILDCARD_EXCLUSIVE and SINGLE_MEMBERSHIP to the strategies array for the full four-strategy comparison. Wait until the previous matrix is inactive before another run. Optional sendProbe=true sends one Probe on this single Ethernet adapter; compare self traffic and physical-source traffic independently.

For synchronized Wireshark capture, use `ip.src == 192.168.1.100 && udp.dstport == 3702` and compare packet times to each result's windowOpenedAt/windowClosedAt. For fragmented IPv4, ensure the capture includes all fragments and reassembly; the display filter is an analysis convenience, not a capture filter for excluding fragments. Transport PASS requires UDP_DATAGRAM_RECEIVED with sourceIp 192.168.1.100 in the controlled physical experiment with synthetic injection excluded. Only afterward evaluate Hello/XAddr/candidate/reconciliation. Synthetic fixtures never establish this PASS.

Optional standalone controls are saved but no comparative physical receive run was performed:

```powershell
# Backend must be stopped; the helper refuses an active backend or UDP owner.
node --import tsx scripts/run-receive-matrix.ts 8 192.168.0.124
# Native control; run sequentially, also with backend stopped.
powershell -NoProfile -File scripts/receive-dotnet-control.ps1 -InterfaceIPv4 192.168.0.124 -Seconds 20
```

The Node helper reuses the support matrix with a private evidence store and never emits synthetic XML. The optional .NET UDPClient receiver joins Ethernet, reports timestamps/counts and up to 16 source counters, and disposes its owned socket. Its PowerShell syntax was validated without launching its receiver. It adds no production dependency. No Node22 comparison was performed or runtime migration made. A future Node22 comparison must use a separately available runtime, the same stopped-backend/ownership conditions and synchronized physical capture; Node24 is not declared causal.

The following firewall A/B procedure is documentation only. It was NOT executed. It requires explicit technician approval and an elevated technician-controlled PowerShell session. Confirm the backend executable/profile and camera source still match before using it. This rule is additionally restricted to Ethernet and the observed camera source; no global firewall disable is involved.

```powershell
# DO NOT RUN until the technician explicitly approves this temporary diagnostic change.
$temporaryRule='CCTV-Receive-AB-'+[guid]::NewGuid().ToString()
try {
 New-NetFirewallRule -Name $temporaryRule -DisplayName $temporaryRule -Direction Inbound -Action Allow -Program 'C:\Program Files\nodejs\node.exe' -Protocol UDP -LocalPort 3702 -RemoteAddress 192.168.1.100 -InterfaceAlias Ethernet -Profile Public | Out-Null
 # Start synchronized Wireshark capture before entering this block.
 $abBody=@{interfaceIndex=8;localAddress='192.168.0.124';durationMs=20000;sendProbe=$false;strategies=@('WILDCARD_SELECTED')}|ConvertTo-Json
 $abStart=Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/matrix' -ContentType 'application/json' -Body $abBody
 $abDeadline=[DateTime]::UtcNow.AddSeconds(60)
 do {
  Start-Sleep -Milliseconds 500
  $abState=(Invoke-RestMethod 'http://localhost:3001/api/support/ws-discovery/matrix').matrix
  if([DateTime]::UtcNow -gt $abDeadline){
   $abStop=@{sessionId=$abStart.sessionId}|ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/support/ws-discovery/matrix/stop' -ContentType 'application/json' -Body $abStop | Out-Null
   throw 'A/B window exceeded deadline; inspect support cleanup state.'
  }
 } while($abState.sessionId -eq $abStart.sessionId -and ($abState.state -in @('PREPARING','LISTENING') -or $abState.cleanupPending))
 Invoke-WebRequest 'http://localhost:3001/api/system/support-bundle' -OutFile '.\CCTV_16_3_2_Firewall_AB.json'
} finally {
 Remove-NetFirewallRule -Name $temporaryRule -ErrorAction SilentlyContinue
 if(Get-NetFirewallRule -Name $temporaryRule -ErrorAction SilentlyContinue){Write-Warning "Remove the remaining diagnostic rule named $temporaryRule before ending the test."}
}
```

If an interactive session is interrupted, record the generated rule name and remove that exact named rule afterward. A no-change result does not rule out higher-priority block rules or other filters. Only a controlled change that reproducibly changes physical delivery supports a firewall-causal conclusion. No automatic firewall configuration or persistent rule is part of the product.

Decision tree: wildcard physical receive means examine timing/ownership rather than assume a bind defect; adapter-specific-only receive implicates bind/membership and requires multi-adapter regressions before production adoption; .NET-only receive implicates Node-specific behavior; neither user-mode receiver with synchronized Wireshark receive points toward OS/filter delivery; Wi-Fi exclusion-only success implicates multi-interface behavior; fully paused monitoring-only success implicates ownership. No speculative parser or production bind correction was made.

Validation: 60 focused matrix assertions, including expected/foreign owner handling, actual close sequencing and delayed close, failure/cancellation release, Ethernet-only configuration, counters/timestamps, multi-adapter independent receive/failure/deduplication, privacy and HTTP results. Full regression: 49 files / 1,578 assertions. Browser: 108 checks (76 Advanced Scan, 32 monitoring including six new support-state checks). TypeScript, production build (1,598 modules) and diff check pass. Initial validation found a missing UI status type and missing MONITORING origin on matrix status events; both were corrected. Final required checks have zero failed/skipped assertions. Physical/Node22/.NET comparative runs remain pending, not counted as software passes.

The temporary Node24 identity shim is removed after validation, NODE_OPTIONS unset, and only the owned UI test server is stopped. The pre-existing raw receive-trace file remains untracked and unchanged; milestone changes are committed separately. Remaining blockers: restart final backend, run synchronized physical Ethernet socket matrix, resolve any competing owner, and if needed obtain technician approval for the narrowly scoped temporary firewall A/B test. No camera, Pair, credentials, Ethernet IPv4, profile or firewall mutation was performed.

MILESTONE 16.3.2 WINDOWS PHYSICAL MULTICAST RECEIVE INVESTIGATION — SOFTWARE VALIDATED / PHYSICAL SOCKET MATRIX RETEST PENDING
