# V1 Physical Field Validation Plan

Use one pinned build for the entire run. Follow `V1_FIELD_TEST_BUILD_PROCEDURE.md`, copy the results template and execute these cases in order. No physical results are asserted by this document. Each case's prerequisites include completed build preparation, authorized isolated lab use, and successful cleanup of the preceding case. Stop the affected sequence if recovery is uncertain.

Record Camera #1's manufacturer/model/serial/firmware/MAC/UUID/current IP from actual evidence; unknown values remain unknown. Historical Camera #2: **Hanwha Vision QND-7082R**, **E4:30:22:CD:68:85**, Last 6 **CD6885**, prior IP **192.168.1.100**, ONVIF UUID **5a524b4c-3656-344c-3330-303037395a00**. Reconfirm all values. Historical Ethernet baseline **192.168.0.124/24**, prior temporary Match address **192.168.1.130/24**, apply only if still correct and unused. These are field examples, never generic application assumptions.

The Hanwha emitted startup Hello; active Probe was unanswered from mismatched 192.168.0.x and answered after moving the PC to 192.168.1.x, confirmed in Wireshark. This is not a Normal Scan defect. Do not compensate with arbitrary private-network scanning. Its valid Stale neighbor entry, Pair verification, enrichment and badge behavior previously passed physically.

Sequence minimizes changes: each camera's isolated power-up once, Pair/read-only checks, Restore, both-camera discovery, standalone Match/recovery, projects, bounded Advanced Scan, reversible supported camera changes, report and final cleanup. Do not factory-reset cameras to force an initial-password scenario.

## Safety and evidence rules

Before every configuration: confirm selected Windows interface index; record DHCP/static, all IPv4/prefixes, gateways and DNS; ensure recovery is clear or finish its explicit Restore; confirm target camera MAC/UUID, unique unused intended IPs, explicitly selected credentials, saved project and expected isolated topology. Adapter changes require local console access and a documented manual recovery path; do not depend on a remote session that the test will disconnect.

After each mutation: restore or document intended camera settings; explicitly Restore the PC; independently verify original configuration and cleared recovery; leave no accidental duplicate IP. Save safe evidence for failures. Never delete a recovery snapshot merely to hide a warning. No automatic Pair after camera Re-IP.

Use application screenshots, Tasks, timestamps and Safe Support Bundle first. Folder: `<date>-<commit-short>/<TestID>/`; include source digest and timezone/UTC offset. Do not put actual passwords, login forms, cookies or authorization material in documents/captures. Record local secret-scan outcome without copying the secret. Keep network identifiers and captures private.

Independent read-only PowerShell (replace examples only after identifying the real adapter/camera):

```powershell
$FieldInterfaceIndex = 8
$FieldCameraAddress = '192.168.1.100'
Get-NetAdapter | Select-Object Name,InterfaceIndex,Status,MacAddress
Get-NetIPInterface -InterfaceIndex $FieldInterfaceIndex -AddressFamily IPv4 | Select-Object InterfaceIndex,ConnectionState,Dhcp
Get-NetIPAddress -InterfaceIndex $FieldInterfaceIndex -AddressFamily IPv4 | Select-Object IPAddress,PrefixLength,AddressState
Get-NetRoute -InterfaceIndex $FieldInterfaceIndex -AddressFamily IPv4 | Where-Object DestinationPrefix -eq '0.0.0.0/0'
Get-DnsClientServerAddress -InterfaceIndex $FieldInterfaceIndex -AddressFamily IPv4
Get-NetNeighbor -InterfaceIndex $FieldInterfaceIndex -IPAddress $FieldCameraAddress | Select-Object IPAddress,LinkLayerAddress,State,InterfaceIndex
Test-Connection -ComputerName $FieldCameraAddress -Count 2
Test-NetConnection -ComputerName $FieldCameraAddress -Port 554
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
```

Wireshark is conditional, not required for every case. Capture only the selected Ethernet interface and relevant interval. Use `udp.port == 3702` for Probe/Hello/ProbeMatch disputes, `arp` for actual duplicate ambiguity, or `ip.addr == <actual-IP> && tcp.port == 554` (or the relevant web port) for targeted diagnostics. Distinguish transmitted packet, received-at-host packet and application promotion. A local UDP socket check does not prove multicast membership/reception. Failed ping alone does not establish Offline. Valid Stale/Reachable/Delay/Probe/Permanent MAC evidence can enrich identity; zero/broadcast/invalid MACs cannot.

## Sequential procedures

Each heading is a Test ID and objective. Record expected versus observed separately for each camera where applicable. PASS requires every stated expectation plus verified cleanup; FAIL means supported behavior violates it. BLOCKED means a prerequisite is missing. NOT APPLICABLE means the scenario does not apply. NOT SUPPORTED means the provider/camera lacks the operation and the app excludes it truthfully; it is not FAIL.

### FV-01 — Cold start / readiness

- Starting condition: both cameras disconnected; recorded baseline adapter; no intentional recovery; previous app stopped normally.
- Steps: (1) Start pinned production build. (2) Run `npm run smoke:production`. (3) Open localhost:3001. (4) Inspect Quick Work, table, Scan, monitoring and Tasks. (5) Open Settings → Diagnostics & Support → Refresh Field Readiness, then About.
- Expected app/network: zero stale/synthetic rows; Scan idle; monitoring separate; real adapter or explicit unavailability; recovery warning only for authoritative saved state; no network changes. Non-elevation only warns about adapter mutation.
- Evidence: startup/readiness/About/build screenshots, smoke output, baseline PowerShell.
- PASS: accurate empty/readiness state and smoke passes. FAIL: fabricated row/state, false failure or unusable startup.
- Cleanup: resolve prerequisite failures before camera work; retain any recovery record. Related: DISC-03, SCAN-01.

### FV-02 — Camera #1 alone

- Starting condition: only Camera #1 on isolated PoE switch, label recorded; baseline PC; Camera #2 disconnected.
- Steps: (1) Power camera once. (2) Observe monitoring for two configured intervals without Scan. (3) Run Normal Scan to completion while observing Task/progressive rows. (4) Repeat Scan after startup settles.
- Expected app/network: one evidence-backed identity; Hello where emitted; active ONVIF where topology permits; same-subnet positive communication Online, off-subnet evidence Different Subnet; no address changes or duplicate rows.
- Evidence: label/IP/UUID and row details, Task timing, Support; packet capture only for disputed eligible response.
- PASS: stable credible row and truthful topology; absence of unsupported Hello is not failure. FAIL: duplicate identity, false promotion, or proven in-scope response ignored.
- Cleanup: record identity and disconnect Camera #1 without resetting. Related: DISC-02, DISC-03, SCAN-01.

### FV-03 — Camera #2 Hello / off-subnet discovery

- Starting condition: only Camera #2 connected, actual identity confirmed against historical Hanwha; PC at baseline and camera at existing IP.
- Steps: (1) Power once. (2) Observe startup monitoring/Hello. (3) Run settled Normal Scan. (4) Record topology and any unanswered active Probe; do not expand arbitrary ranges.
- Expected app/network: emitted Hello may create one Different Subnet row; known cross-subnet Probe silence is not a Normal Scan defect; camera/PC IP unchanged.
- Evidence: startup time, UUID/IP/status, Support; `udp.port == 3702` only if necessary.
- PASS: valid evidence reconciles once and status is truthful. FAIL: invented Online, duplicate or valid in-scope received evidence ignored.
- Cleanup: retain Camera #2 connected for Pair. Related: DISC-02, DISC-03.

### FV-04 — Pair / immediate verification / MAC enrichment

- Starting condition: Camera #2 Different Subnet row; recovery clear; local console and same-user elevation available; full original adapter snapshot recorded.
- Steps: (1) Actions → Pair; select verified interface index. (2) Prepare and compare original snapshot/candidate occupancy evidence. (3) Explicitly confirm only a safe candidate. (4) Observe VERIFYING, Tasks and badge. (5) Time settle/retry verification. (6) Compare Get-NetIPAddress/Get-NetNeighbor on the selected interface and Details identity.
- Expected app/network: snapshot before mutation; selected PC adapter only; camera IP unchanged; about 5–10 seconds bounded verification; any credible ping/HTTP/HTTPS/TCP success immediately makes row Online. Pair stays PAIRED if adapter succeeded but camera confirmation failed; no auto-Restore. Legitimate Stale MAC merges into existing UUID, Last 6 CD6885 for known Hanwha.
- Evidence: preview/before/after, Task, independent adapter/neighbor output, positive-response and Online timestamps, Support.
- PASS: correct adapter and snapshot, bounded truthful verification, one enriched identity. FAIL: wrong adapter, missing snapshot, auto camera change, false Pair failure from camera silence, duplicate or invalid MAC.
- Cleanup: leave temporary state active only through FV-08; no competing Pair/Match. Related: PAIR-01, PAIR-02, ENRICH-01, UI-04.

### FV-05 — Same-subnet diagnostics / active ONVIF

- Starting condition: FV-04 temporary network active; Camera #2 powered and reachable where services permit.
- Steps: (1) Run Normal Scan once. (2) Open Details and existing diagnostics. (3) Record ping, HTTP, HTTPS, TCP 554, timestamps/adapter/response time where present. (4) Briefly disconnect/reconnect camera cable and repeat a check.
- Expected app/network: active response reconciles existing identity; positive evidence supports Online; self-signed TLS is communication plus trust warning; failed ping alone is not Offline; unsupported/closed services recorded truthfully; bounded probes only.
- Evidence: diagnostics and timestamps; independent TCP/ping only when useful; Support on mismatch.
- PASS: results agree with controlled connectivity, TLS and adapter context. FAIL: trust failure called unreachable, stale saved Online or ping-only false Offline.
- Cleanup: reconnect and verify link before continuing. Related: PAIR-02, status semantics.

### FV-06 — External Open / TLS ownership

- Starting condition: verified HTTP/HTTPS endpoint; external browser default; no automatic credentials.
- Steps: (1) Actions → Open. (2) Compare endpoint/launch result with browser. (3) Observe self-signed warning without installing certificates or disabling TLS. (4) Repeat an available preferred browser choice. Technician may use normal browser controls only after independently trusting the isolated camera.
- Expected app/network: successful process launch is successful Open even with browser warning; actual launch failure remains actionable; no credential submission or camera change; embedded is optional.
- Evidence: safe app/Task and browser-warning screenshot, selected URL.
- PASS: accurate successful launch and browser-owned warning. FAIL: generic app failure despite launch, TLS bypass or silent credential use.
- Cleanup: close camera tabs; retain app. Related: FIELD-OPEN-01 physical retest.

### FV-07 — Credential assistance / redaction

- Starting condition: known manufacturer/model and initialized/initial-password state; authorized credential available privately if needed. Never reset to force initial setup.
- Steps: (1) Open credential assistance. (2) Inspect model precedence/fallback and setup guidance. (3) Explicitly choose a maintained hint if applicable. (4) Observe no automatic auth/save. (5) Save only an explicitly intended authorized reference. (6) Locally inspect Tasks/logs/project/report/Support for the real secret without recording its value.
- Expected app/network: no prefill/cycling/login/save from display or selection; initial setup is not fabricated; Credential Manager separate from project; no secret export.
- Evidence: redacted hint/context UI and request observation; secret review result only.
- PASS: explicit local selection and no leaked secret. FAIL: unsolicited auth/save or plaintext export. Initial-password portion NOT APPLICABLE if initialized; unsupported hint NOT SUPPORTED.
- Cleanup: clear unsaved fields; remove only test-created references intentionally, not existing credentials. Related: FIELD-CRED-01.

### FV-08 — Actual-display contrast / keyboard

- Starting condition: row present, actual field laptop/scaling/brightness; temporary Pair still active.
- Steps: (1) Choose Light appearance. (2) Open Actions by keyboard. (3) Inspect normal, hover, focus and disabled entries. (4) Tab through available actions; Escape. (5) Repeat Dark.
- Expected app/network: readable text and visible focus, menu closes without blocking recovery; no network mutation.
- Evidence: light/dark hover/focus screenshots plus scaling.
- PASS: all available actions readable/reachable. FAIL: unreadable action or inaccessible recovery due to overlay.
- Cleanup: restore preferred theme and close menu. Related: FIELD-UI-03.

### FV-09 — Pair Restore / badge

- Starting condition: FV-04 original snapshot authoritative; temporary Pair active; camera settings unchanged.
- Steps: (1) Open corresponding Tasks recovery/Pair dialog. (2) Compare preserved settings. (3) Explicitly Restore. (4) Reread DHCP, all IPv4/prefix, gateway/DNS. (5) Compare immediate badge and Task/recovery state.
- Expected app/network: original adapter exactly restored; warning clears only after verification; identity retained and topology recalculated; camera IP unchanged.
- Evidence: independent before/after, badge, Task and Support if mismatch.
- PASS: exact restoration and prompt badge. FAIL: lost snapshot, false cleared warning or wrong settings.
- Cleanup: remain at baseline; stop mutations on failed restoration. Related: PAIR-01, UI-04.

### FV-10 — Both cameras / identity and table

- Starting condition: both recorded unique camera addresses; PC baseline; Camera #1 reconnectable.
- Steps: (1) Connect both without resets. (2) Normal Scan and two monitoring intervals. (3) Inspect IP/MAC/Last 6/UUID/vendor/model/serial/firmware where available. (4) Search and sort IP/Last 6; repeat Scan.
- Expected app/network: stable distinct physical identities; late MAC/UUID/serial enrich existing rows; unknown stays unknown; generic neighbors remain Support-only; no address change.
- Evidence: both Details, table count/sort/search and Support.
- PASS: no duplication/conflation and evidence-backed values. FAIL: invented identity, non-camera promotion or duplicate after enrichment.
- Cleanup: retain both; select safe shared subnet for later work. Related: DISC-02, ENRICH-01.

### FV-11 — Standalone Match Network

- Starting condition: recovery clear, original PC snapshot recorded, approved unused temporary IPv4/prefix. Historical 192.168.1.130/24 is only an example.
- Steps: (1) Tools → **Network Adapter** (implemented Match Network entry). (2) Select actual Ethernet and enter values. (3) Preview/compare and cancel once. (4) Prepare again and explicitly Apply. (5) Reread address, badge, Tasks. (6) Explicitly run Normal Scan.
- Expected app/network: preview non-mutating, authoritative apply/recovery state; immediate badge; no automatic Normal/Advanced Scan or camera change; selected PC adapter only.
- Evidence: preview/cancel and applied state, independent adapter output, Tasks and manual Scan time.
- PASS: exact reviewed adapter/value and truthful recovery. FAIL: wrong adapter/value, auto-scan or camera mutation.
- Cleanup: keep Match active only for FV-12. Related: FIELD-NET-01.

### FV-12 — Safe restart recovery / Match Restore

- Starting condition: FV-11 PAIRED and fully settled; original settings recorded; local console; no firmware/camera writes. Do not interrupt APPLYING/VERIFYING.
- Steps: (1) Capture recovery/Task. (2) Stop normally with Ctrl+C. (3) Restart same build/same Windows user. (4) Inspect Tasks and Network Adapter recovery. (5) Explicitly Restore and independently compare full original settings.
- Expected app/network: authoritative recovery survives, Quick Work is fresh, no auto-Restore; original settings restored and warning clears only after verification.
- Evidence: pre-stop/restart/final states and PowerShell.
- PASS: one recoverable session and exact restoration. FAIL: lost snapshot, false clear state or automatic change.
- Cleanup: if failed, stop all further mutations and use recorded original settings with qualified technician assistance; retain evidence/snapshot. Related: FIELD-NET-01, Pair recovery.

### FV-13 — Project metadata / save / reopen

- Starting condition: both cameras identified; use explicit Pair only if required for communication; no existing file to overwrite.
- Steps: (1) Create Project from Results. (2) Edit technician names/notes/configured override. (3) Save new .cctvproj. (4) Restart/open it. (5) Inspect status before Reverify and inspect file locally for secrets/recovery configuration.
- Expected app/network: metadata persists; saved Online is not live verification; no camera naming/IP or PC change from project edits; no credentials/temporary adapter state in project.
- Evidence: immutable saved copy, metadata and pre-Reverify screenshots, secret-review outcome.
- PASS: metadata intact and status not falsely live. FAIL: lost metadata, secret/recovery serialization or stale Online claim.
- Cleanup: preserve baseline copy for merge comparisons. Related: Projects/status.

### FV-14 — Reverify / Project History

- Starting condition: FV-13 project, known physical connectivity for both cameras.
- Steps: (1) Reverify both; inspect Task/results. (2) Safely disconnect Camera #1, repeat. (3) Inspect Project History. (4) Reconnect and Reverify.
- Expected app/network: current evidence matches saved identities; absence is explicit; no invented Online/duplicate; parent Task/history meaningful, no micro-operation flood; no configuration changes.
- Evidence: per-camera outcomes, cable times, Task/history.
- PASS: controlled absence/reconnect reflected with stable identity. FAIL: false match or stale snapshot used as evidence.
- Cleanup: reconnect both and save new result copy. Related: Reverify/Tasks.

### FV-15 — Add to existing / replacement boundary

- Starting condition: immutable project copy and current Quick Work results for known cameras.
- Steps: (1) Select intended device(s). (2) Add Selected to Existing Project using a copy. (3) Inspect merge preview, confirm intended addition, save returned file. (4) Reopen and compare existing notes/names. (5) If a legitimate distinct replacement is practical, cancel its preview once before any explicit approval; otherwise record NOT APPLICABLE.
- Expected app/network: no silent overwrite/replacement/unselected additions; project operations do not alter cameras/adapter.
- Evidence: original/result files, preview and metadata comparison.
- PASS: correct merge and explicit replacement boundary. FAIL: silent replacement/overwrite or wrong selection.
- Cleanup: retain both file versions; do not force physical replacement. Related: Add-to-existing.

### FV-16 — Advanced Scan / zero-result / safe cancellation

- Starting condition: no conflicting owner; approved small range containing known cameras and one confirmed unused address.
- Steps: (1) Select actual adapter and bounded target/methods. (2) Validate/start once. (3) Observe immediate Preparing and Task; cancel safely. (4) Run to completion. (5) Repeat on only the verified unused address.
- Expected app/network: preparation may take about 10 seconds but feedback is immediate; progress/Stop belongs to current foreground session; no silent target promotion; monitoring separate; only selected bounded probes.
- Evidence: target form, preparation duration, Task/stop/completion and empty result Support.
- PASS: truthful lifecycle, no unused-target row. FAIL: stale ownership, deadlock or fabricated device.
- Cleanup: stop remaining foreground work. Related: FIELD-ADV-04 known timing, SCAN-01.

### FV-17 — Bulk Re-IP safety / execution

- Starting condition: both isolated cameras support network configuration; authorized selected credentials; recorded original settings and independent recovery path; otherwise BLOCKED/NOT SUPPORTED.
- Steps: (1) Select exactly both. (2) Configure Network, two unique unused approved targets, preferably same safe subnet. (3) Validate readiness/credential references/order. (4) Edit one target: Apply must disable and confirmation clear; revalidate. (5) Cancel once. (6) Reprepare, explicitly confirm and observe per-device results and parent Task.
- Expected app/network: Ready selected rows only; revalidated targets; no duplicate target; truthful partial failure; PC never auto-Pairs.
- Evidence: plan, confirmation, targets and results/Task without secrets.
- PASS: exact reviewed writes and truthful results. FAIL: unconfirmed/wrong-device/duplicate write or false all-success.
- Cleanup: immediately execute FV-18. Related: Bulk network/Tasks.

### FV-18 — IP-change identity / topology / camera restoration

- Starting condition: FV-17 outcome recorded; original camera addresses available; both isolated.
- Steps: (1) Compare new IP with UUID/MAC and row count. (2) Explicitly Pair/Match only if needed. (3) Reverify and inspect history. (4) Restore intended camera addresses one at a time through supported explicit operations; preserve uniqueness. (5) Restore temporary PC adapter.
- Expected app/network: same identities after IP change; truthful topology and per-device history; no automatic PC change or duplicate row.
- Evidence: old/new/final address table, UUID/MAC, project history and independent probes.
- PASS: one row per identity, intended final addressing verified. FAIL: duplicated/lost identity or false reachability.
- Cleanup: verify both cameras and PC before proceeding. Related: ENRICH-01, Bulk Re-IP.

### FV-19 — Provider-aware name / NTP / timezone

- Starting condition: both selected, original physical names/NTP/timezones recorded, provider capabilities inspected and operation authorized.
- Steps: (1) Configure Settings. (2) For each supported name/NTP/timezone operation inspect preview and apply a harmless approved test value. (3) Read back actual values/per-device result and Task/history. (4) Restore each original value before next operation. Unsupported cases: record NOT SUPPORTED and verify no write.
- Expected app/network: capability-filtered Ready rows only; physical camera name distinct from technician name; no bulk passwords/ONVIF enable.
- Evidence: capabilities, before/after/restored readback, Task/history.
- PASS: supported values verified/restored; unsupported safely excluded. FAIL: false supported success or wrong device/value.
- Cleanup: restore all original settings. Related: Bulk Configure.

### FV-20 — Reboot / safe task cancellation

- Starting condition: isolated noncritical cameras, reboot supported/authorized, no firmware/configuration work pending.
- Steps: (1) Prepare supported reboot, explicitly confirm. (2) Observe command result versus verified disappearance/reappearance. (3) Cancel only where advertised safe; distinguish completed work from pending work, not rollback.
- Expected app/network: one parent Task, truthful per-device progress/failure/cancellation, bounded history/no micro-task flood; no repeated uncontrolled reboot; stable identity on return.
- Evidence: Task timings and identity before/after.
- PASS: supported behavior/recovery accurate; unsupported is NOT SUPPORTED. FAIL: false verified success or uncontrolled repetition.
- Cleanup: wait for both cameras and confirm intended settings. Related: Bulk Configure/Tasks.

### FV-21 — Reports / recorded history / redaction

- Starting condition: project has current evidence and recorded history; both identities present.
- Steps: (1) Select one, then both. (2) Choose columns, portrait PDF, history inclusion. (3) Generate and inspect pagination, row count, identity/status timestamp and Task. (4) Inspect supported exports locally for secrets.
- Expected app/network: accurate selection/snapshot, recorded device/project history, no secret; no network mutation. Report History is existing history reporting, not a generated-file archive.
- Evidence: options/PDF/export/Task and secret-review outcome.
- PASS: accurate readable report without secrets. FAIL: wrong selection/status or secret leak.
- Cleanup: secure evidence; redact any leaked material under a defect without copying it into results. Related: Reports/Tasks.

### FV-22 — Conditional Duplicate Assistant

- Starting condition: only a safely reproducible isolated collision with independent access and approved recovery for each device. Never create risky collision solely for testing.
- Steps: (1) If unsafe/unavailable, record BLOCKED/NOT APPLICABLE and stop this case. (2) Otherwise inspect actual collision evidence and distinct identities. (3) Review assistant preview and explicitly resolve only supported safe actions, one device at a time.
- Expected app/network: evidence-backed collision, no guessed identity, explicit confirmation, unique final IPs.
- Evidence: assistant/identities, ARP/packet evidence only if needed.
- PASS: safe truthful resolution; conditional omission is not PASS. FAIL: false collision, wrong-device write or residual duplicate.
- Cleanup: restore recorded unique IPs and verify independently. Related: Duplicate Assistant.

### FV-23 — Two-camera end-to-end

- Starting condition: both cameras at intended unique settings, PC baseline, recovery clear, same pinned build.
- Steps: (1) Cold start/discover. (2) Identify/diagnose. (3) Explicitly match topology if needed. (4) Open each. (5) Create project. (6) Perform only already-approved supported benign configuration if needed. (7) Reverify/save/report with history. (8) Observe Tasks throughout. (9) Explicitly Restore PC.
- Expected app/network: coherent transitions, stable identities, evidence-based statuses, one Task per technician operation and no background flood, no hidden credentials; intended final camera state/baseline PC.
- Evidence: chronological build/topology/screens/Tasks/project/report/Support.
- PASS: both cameras accounted for and all final states verified. FAIL: unsafe/inconsistent transition or unexplained residual recovery.
- Cleanup: FV-24 required. Related: all pending and preserved FIELD items.

### FV-24 — Final cleanup / sign-off

- Starting condition: no active camera write; all executed or conditional cases recorded.
- Steps: (1) Stop scans/support capture. (2) Resolve Task/recovery attention safely. (3) Verify full original PC configuration and intended camera state/unique IPs. (4) Save final Support. (5) Ctrl+C normal shutdown; verify owned port closes. (6) Fill results summary/defect links.
- Expected app/network: no accidental temporary configuration, stale Quick Work persistence or orphan owned listener.
- Evidence: final adapter/camera table, recovery/Tasks, shutdown/port, result summary.
- PASS: verified cleanup and every case explicitly classified. FAIL: unverified accidental state or missing failure evidence.
- Cleanup: retain secured evidence and original settings for any blocked recovery; escalate before leaving lab. Related: Gate A/B distinction.

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

No pending item is promoted by this preparation milestone. The supplied normal-Windows HTTP/API/WebSocket pass resolves the previous runtime host limitation, not camera validation.
