# CCTV Network Assistant — Controlled Field Validation

Master Blueprint v1.1 defines the expected behavior. Complete this checklist with real CCTV equipment; automated mocks do not count as hardware validation.

## Safety and test record

Start camera re-IP, bulk re-IP, Pair, duplicate remediation, reboot, and credential-change tests with test cameras, a disposable lab network, and preferably a secondary Ethernet adapter. Record the application version, commit, Windows version, laptop, adapters, camera models/firmware, topology, date, and technician.

| Area | Result | Notes / evidence |
|---|---|---|
| Discovery | PASS / FAIL | |
| Identity | PASS / FAIL | |
| Diagnostics | PASS / FAIL | |
| Pair and Restore | PASS / FAIL | |
| Connect | PASS / FAIL | |
| Credentials | PASS / FAIL | |
| Single-camera configuration | PASS / FAIL | |
| Bulk configuration | PASS / FAIL | |
| Duplicate remediation | PASS / FAIL | |
| Projects | PASS / FAIL | |
| Reports | PASS / FAIL | |
| UI/resolutions | PASS / FAIL | |

## A. Discovery

- Test one ONVIF camera, multiple cameras, and at least two brands. Repeat with multiple legitimate active adapters.
- Stop during a scan, then run at least five Scan → Stop → Scan-again cycles.
- Expected: one stable row per identity; enrichment and IP changes do not create new-device alerts; one adapter failure does not discard results from another.
- With zero responses, expect: “No ONVIF responses received. Verify the camera is connected to a reachable network and that ONVIF/WS-Discovery is enabled.” Do not infer that Windows Firewall is the cause without separate evidence.

## B. Identity

- Record MAC, ONVIF UUID, serial, model, and firmware where the device actually supplies them.
- Change one camera IP and scan again.
- Expected: stable identity and technician fields remain; IP history contains old and new addresses; unknown evidence stays Unknown.

## C. Diagnostics

- Observe Online, unplug/reachability loss, Unreachable, reconnect, and recovery.
- Expected: current checks and timestamps are truthful; an open TCP 554 result is not called an active RTSP stream; no fabricated packet loss appears.

## D. Pair and Restore

- Use a disposable/secondary Ethernet adapter, once from static configuration and once from DHCP.
- Record address, prefix, gateway, DNS mode/servers, and adapter identity before Pair. Prepare, confirm, verify target reachability, then Restore.
- Expected: administrator requirement appears before mutation; candidate is rechecked; original DHCP/static address, gateway, and DNS state are restored and verified. Crash recovery requires explicit Restore and is never automatic.

## E. Connect

- Test HTTP, HTTPS with a self-signed certificate, and a non-default web port.
- Expected: the resolved camera origin is shown; system/selected browser opens only after technician action; no arbitrary URL is accepted.

## F. Credentials

- Test session-only entry, Remember, restart, Use Existing, and delete.
- Expected: remembered secrets are stored by Windows credential storage; UI/project/report/audit/support bundle contain no password or authorization material.

## G. Single-camera network configuration

- On a controlled camera, read current state, choose an available candidate, review preview, confirm, apply, and reverify.
- Expected: provider is selected before confirmation; duplicate ambiguity blocks writes; response is not treated as verification; identity survives and IP history updates. Different Subnet never auto-Pairs.

## H. Bulk configuration

- Begin with 2–3 controlled cameras. Preview and apply; introduce one controlled failure and retry only that device.
- Expected: server owns the plan; targets are unique and freshly checked; concurrency is bounded; cancellation schedules no new work; success is not retried; partial failure remains visible; no auto-Pair occurs.

## I. Duplicate IP

- Create a controlled duplicate condition. Observe ambiguity, isolate one device, preview, confirm, remediate, rescan, and reconcile.
- Expected: ambiguous ONVIF writes are blocked; one device changes at a time; shared IP is rechecked; partial resolution remains PARTIALLY_RESOLVED; RESOLVED requires real reconciliation.

## J. Projects

- Save, close, reopen, and reverify projects containing 1, 10–20, and if practical 50 devices. Move one camera to a new IP.
- Expected: no duplicate identities or lost notes/location/history; reopened devices are Not Verified until live evidence arrives; no automatic project load at first run.

## K. Reports

- Export real inventory to portrait PDF and CSV, including selected columns, notes, unknown values, and a collision state.
- Expected: pagination is legible; facts match evidence; saved-only state says Not Verified; no fabricated telemetry, switch/VLAN/PoE/compliance claim, or secret appears.

## L. UI

- Review at 1366×768, 1600×900, and 1920×1080 with approximately 10–20 real cameras when available.
- Expected: Light mode first-run default, Quick Work, empty list, truthful adapter, obvious Scan/Stop, usable filters/selection/actions, no fake activity or devices, and Advanced Scan remains disabled.

## Completion statement

- Automated validation: PASS / FAIL, commit: __________
- Real-hardware validation: PASS / FAIL / PARTIAL, date: __________
- Open defects and retest requirements: __________________________________________

