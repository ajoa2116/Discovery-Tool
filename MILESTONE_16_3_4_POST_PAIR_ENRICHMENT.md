# Milestone 16.3.4 — Post-Pair verification and neighbor identity enrichment

Branch: `codex/milestone-16-3-4-post-pair-verification-enrichment`
Starting HEAD: `55d9fcba159e75a2e7dad4b063b7644b74dd132a`
Commit message: `Verify cameras after Pair and refresh neighbor identity and adapter state`
Master Blueprint v1.1 remains authoritative.

## Root causes and changes

Pair previously diagnosed only once immediately after applying the adapter address. It changed discoveryInterface but left relationshipAdapter stale; diagnostics prefer relationshipAdapter. It inspected the last six stored checks rather than a bounded set of fresh post-Pair attempts. It never reran neighbor enrichment after the topology changed.

VERIFYING now refreshes both adapter contexts from the Windows apply result, settles for 400 ms, and retries fresh existing ping/HTTP/HTTPS/TCP diagnostics within an eight-second deadline. Any unambiguous positive check for the target counts. Historical WS-Discovery evidence is excluded from this verification. Attempts run on isolated device copies, use cancellation, and cannot publish late mutations after the deadline. Successful evidence immediately produces ONLINE/VERIFIED; failed camera verification leaves PAIRED with Restore available. Adapter failure still follows recovery handling. Concurrent Restore during apply/verification is rejected.

After verification, credential-free neighbor lookup runs against interface 8 and its current applied IPv4. The valid MAC merges into the existing ONVIF UUID device via the existing identity reconciler. UUID, model, vendor, technician metadata, and IP history remain intact. No new identity scheme or project format was introduced.

The existing neighbor parser already accepted numeric/string Stale states; the field evidence does not prove that Stale itself was rejected. However, lookup selected the first row before validating its MAC/state, could hide a valid later row, did not revalidate returned IP/interface, and did not refresh through the Pair path. Lookup now validates all bounded returned rows, supports scalar/array JSON, requires exact IP and selected interface, rejects ambiguous cross-interface identities, and accepts Reachable/Stale/Delay/Probe/Permanent. Incomplete, Unreachable, unsupported family, malformed, zero, broadcast, and multicast MACs are rejected. An unresolved local-address-to-interface lookup fails instead of silently broadening scope. General enrichment now prefers the current relationship adapter.

Neighbor-state/reference semantics were checked against [Microsoft Get-NetNeighbor documentation](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-netneighbor). No live adapter or camera configuration was changed during development.

The UI previously populated its adapter badge only from scan phase 1. Pair events and HTTP results now update it from the authoritative applied/restored Windows snapshot. Selected Ethernet is displayed first without changing Wi-Fi configuration. Stale in-flight project/Pair fetches cannot overwrite a newer Pair update; repeated restored snapshots do not override later scan topology. Background diagnostics run on copies and do not publish cancelled results; the Pair target is excluded while topology is changing. Discovery yields before Pair confirmation and foreground/support ownership remains separate.

Safe Support Bundle now includes bounded verification attempts, check results, successful source, elapsed time, cameraResponded, and current adapter. Post-Pair neighbor audit records requested IP, interface, current local IPv4, returned MAC/state, normalized MAC, match result, and merged device ID. Credentials are neither requested nor recorded. Existing discovery/scopes manufacturer evidence is retained; no unverified OUI mapping is invented. Missing serial/firmware remains Unknown.

## FIELD-OPEN-01

**OPEN.** The current Windows launcher waits on external process completion; the field report alone does not establish a narrow, verified correction for its generic failure. No Open behavior or browser TLS settings were changed. The certificate warning and successful camera WebViewer access remain evidence for the next field milestone.

## Validation

| Check | Final result |
| --- | --- |
| New post-Pair/enrichment suite | 57 assertions passed |
| Existing Pair | 34 assertions passed |
| Existing enrichment | 17 assertions passed |
| Diagnostics | 23 assertions passed |
| Focused total above | 131 assertions passed, included in full total |
| Full regression | 51 files / 1,684 assertions passed |
| New Pair browser | 15 checks passed |
| Advanced Scan browser | 76 checks passed |
| Scan/monitoring/support browser | 41 checks passed |
| Browser total | 132 checks passed; no runtime errors |
| TypeScript | `npx tsc --noEmit` passed |
| Production | `npm run build` passed; 1,599 modules |
| Final failures / skips | 0 / 0 |
| Diff review | `git diff --check` passed |

Focused tests cover delayed success, ping-only and web-only responses, bounded failure and hung diagnostic, stale diagnostic cancellation, valid neighbor states, rejected MACs/families, interface/IP selection, same UUID/MAC row, CD6885, metadata preservation, selected Ethernet, Pair/Restore badges, restored Different Subnet, recovery preservation, confirmation, and no camera write. Existing tests preserve Hello discovery, provenance isolation, support/foreground separation, restore failure, and Pair safety.

Browser tests use headless Edge and mocked backend data against UI-only Vite. They verify preview and explicit confirmation, VERIFYING badge update, delayed Camera responded Yes, immediate Online/MAC row update, Restore, row stability, and foreground independence. An existing foreground assertion was synchronized with the authoritative HTTP response instead of checking the intermediate pending-start button. This is software validation, not physical retest evidence.

The known Windows `uv_os_get_passwd` ENOMEM error occurred before a test could launch. Only then was a temporary identity shim created outside the repository and passed via `--require`. The shim was removed after validation; NODE_OPTIONS is unset. The owned Vite process was stopped. Unrelated physical trace files were preserved and excluded from the commit.

## Files changed

- `src/core/network/post_pair_verification.ts`: bounded fresh verification.
- `src/core/network/pair_service.ts`: topology, targeted neighbor merge, recovery coordination.
- `src/core/engine/device_enrichment.ts`: neighbor parsing and lookup scope; current adapter preference.
- `src/core/engine/diagnostic_engine.ts`: isolate and suppress cancelled background updates.
- `src/shared/pair_adapter.ts`: authoritative adapter badge projection.
- `src/types/index.ts`: bounded Pair verification evidence type.
- `src/server/index.ts`: Pair progress, coordination, and support evidence.
- `src/ui/App.tsx`: immediate Pair/Restore adapter state and stale response guards.
- `src/test/post_pair_enrichment.test.ts`: focused implementation regressions.
- `src/test/browser/post_pair.cjs`: Pair/Restore browser regressions.
- `src/test/browser/scan_monitoring.cjs`: wait for authoritative failure recovery.
- This milestone closeout document.

## Field status

- FIELD-PAIR-02: SOFTWARE FIXED / VALIDATED — PHYSICAL RETEST PENDING.
- FIELD-ENRICH-01: SOFTWARE FIXED / VALIDATED — PHYSICAL RETEST PENDING.
- FIELD-UI-04: SOFTWARE FIXED / VALIDATED — PHYSICAL RETEST PENDING.
- FIELD-OPEN-01: OPEN.
- FIELD-DISC-02: PHYSICAL PASS, preserved.
- FIELD-DISC-03: PHYSICAL CLEAN-START PASS, preserved.
- FIELD-SCAN-01: PHYSICAL PASS, preserved.
- FIELD-PAIR-01: PHYSICAL PASS, preserved.
- FIELD-UI-03: OPEN / DEFERRED.

Physical retest: explicitly Pair Ethernet 8 from 192.168.0.124/24 to proposed 192.168.1.137/24; check the immediate badge, bounded verification, Online status, same UUID row and CD6885. Restore explicitly and confirm 192.168.0.124/24, Different Subnet, retained row, and cleared recovery after verified restore. Production wildcard discovery, camera IP, credentials, Wi-Fi configuration, and Actions design remain unchanged.

MILESTONE 16.3.4 POST-PAIR VERIFICATION + NEIGHBOR IDENTITY ENRICHMENT — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING
