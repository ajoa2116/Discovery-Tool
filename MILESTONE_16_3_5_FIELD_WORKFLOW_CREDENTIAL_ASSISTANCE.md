# Milestone 16.3.5 — Field Workflow + Credential Assistance

Branch: `codex/milestone-16-3-5-field-workflow-credential-assistance`

Starting HEAD: `59d6fad72f0087ec9fa4055117e37a05abc248de`

Final HEAD / commit hash: the commit containing this closeout, resolved with `git log -1 --format=%H -- MILESTONE_16_3_5_FIELD_WORKFLOW_CREDENTIAL_ASSISTANCE.md`. The exact resulting hash is reported in the delivery message; it cannot be embedded in its own commit.

Commit message: `Add standalone network matching and explicit factory credential assistance`

## Field findings and implementation

- **FIELD-NET-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING.** Pair previously required an inventory camera row. Tools → Network Adapter now accepts a selected eligible Windows adapter, temporary IPv4/prefix and optional gateway. It displays authoritative current settings, validates usable host addresses and performs bounded conflict checks. Preview and explicit confirmation reuse Pair's original snapshot, mutation, verification and persistent recovery infrastructure. DNS remains unchanged. Restore verifies the captured static or DHCP configuration, gateway and DNS state. Apply and Restore refresh the badge immediately. Existing device relationships reconcile without creating camera rows. The tool starts no scans and writes no camera configuration.
- **FIELD-CRED-01 — SOFTWARE VALIDATED / FIELD RETEST PENDING.** The prior workflow lacked documented factory hints. A small structured registry now prefers reliable model matches, supports partial identity and provides manufacturer fallbacks with provenance and applicability notes. Explicit Use Username/Use Credentials changes local form state only, clears the save choice and never submits, authenticates, cycles or saves. Saved Credential Manager remains separate. Unknown identities receive no invented default. Hanwha QND-7082R shows initial password creation and no factory password.
- **FIELD-OPEN-01 — SOFTWARE FIX VALIDATED / PHYSICAL RETEST PENDING.** The launcher used execFile completion, coupling Open to browser process lifetime and exit code. It now acknowledges successful process creation, detaches the GUI process and preserves actual launch errors. A later browser exit or TLS warning does not invalidate that launch acknowledgment. No TLS validation bypass, certificate installation or browser warning suppression was added. This isolates a concrete lifecycle defect; the historical OP reference itself was not reproduced on physical hardware.
- **FIELD-UI-03 — SOFTWARE VALIDATED / PHYSICAL UI RETEST PENDING.** Dark-only menu surface, text and hover colors caused light-theme contrast problems. Theme-specific surface, hover, disabled and focus styles improve readability while preserving menu structure, disabled behavior and dark-theme behavior.

Network workflow history includes NETWORK_MATCH_PREVIEWED, NETWORK_MATCH_CONFIRMED, NETWORK_MATCH_VERIFIED, NETWORK_MATCH_RESTORE_STARTED, NETWORK_MATCH_RESTORED and NETWORK_MATCH_FAILED. Support state identifies the standalone purpose through the existing safe bundle projection. Hint passwords are not written to project serialization, reports, support, history or logs.

## Registry provenance

Reviewed 2026-09-13. Public hints are contextual guidance, never guaranteed working credentials.

- [Hanwha initial credentials guidance](https://support.hanwhavisionamerica.com/hc/en-us/articles/5778082095515-What-is-the-username-and-password-for-Hanwha-Vision-Wisenet-cameras), supplemented by the supplied QND-7082R physical initial-setup observation.
- [AXIS 2120 original user manual](https://www.axis.com/dam/public/c3/3a/f3/axis-2120-users-manual-en-US-30349.pdf), restricted to that exact legacy model and era.
- [Axis device initial setup](https://developer.axis.com/acap/3/get-started/set-up-the-device/), with firmware and administrator-name qualifications.

## Validation

- Focused milestone suite: **76 passed**.
- Full regression: **1,768 passed across 52 test files**, including Pair/recovery, post-Pair verification, neighbor enrichment, network state, credentials, serialization, discovery, diagnostics, project/report behavior and synthetic isolation. The focused suite is included in this total.
- Browser/UI: **157 passed**: field workflow 25, post-Pair 15, Advanced Scan 76, foreground/background monitoring 41. Includes explicit adapter confirmation/restore, immediate badge changes, no automatic scans, local-only hint selection, light/dark hover contrast and keyboard focus.
- Final failed: **0**. Skipped: **0**.
- TypeScript: `npx tsc --noEmit` **PASS**.
- Production: `npm run build` **PASS**, 1,603 modules transformed.
- Diff whitespace check and final source/status review: **PASS**.
- An initial regression assertion depended on the previous dark-only divider class; it was updated to check the same separator with both themes. Final runs above passed.
- The actual Windows ENOMEM/uv_os_get_passwd host issue occurred. Validation used the authorized narrowly scoped identity shim outside the repository. The shim was removed after validation; NODE_OPTIONS is unset. No shim is committed.
- Adapter mutation/recovery tests use controlled fakes. Browser checks use mocked API responses. No physical adapter change or camera authentication was performed during automated validation.

## Files changed

1. `src/core/connect/connect_service.ts` — browser process launch acknowledgment.
2. `src/core/network/pair_service.ts` — shared standalone preparation, safety, recovery and reconciliation.
3. `src/core/network/windows_adapter_service.ts` — optional temporary gateway.
4. `src/server/index.ts` — standalone preview route and safe purpose evidence.
5. `src/types/index.ts` — optional adapter operation purpose and gateway.
6. `src/shared/network_match.ts` — common IPv4 configuration validation.
7. `src/shared/factory_credentials.ts` — sourced hint registry and lookup.
8. `src/ui/App.tsx` — Tools entry, standalone recovery and badge integration.
9. `src/ui/components/NetworkAdapterModal.tsx` — preview/apply/restore workflow.
10. `src/ui/components/FactoryCredentialSuggestions.tsx` — explicit local selection UI.
11. `src/ui/components/BrowserModal.tsx` — hint integration and launch messaging.
12. `src/ui/components/FloatingDeviceActionsMenu.tsx` — theme contrast and focus styles.
13. `src/test/field_workflow.test.ts` — focused regression coverage.
14. `src/test/device_removal.test.ts` — preserved separator assertion for both themes.
15. `src/test/browser/field_workflow.cjs` — browser regression checks.
16. `src/test/browser/field_workflow.tsx` — isolated credential UI harness.
17. `src/test/browser/field_workflow.html` — harness entry.
18. This closeout.

Line changes: 18 files; 298 additions and 29 deletions.

Git status after commit: tracked milestone changes committed; the pre-existing untracked `CCTV_Adapter_Specific.txt`, `CCTV_Receive_Trace.txt` and `CCTV_Wildcard_Selected.txt` remain untouched and excluded.

## Preserved field results and physical retest

FIELD-DISC-02, FIELD-SCAN-01, FIELD-PAIR-01, FIELD-PAIR-02, FIELD-ENRICH-01 and FIELD-UI-04 remain **PHYSICAL PASS**, as supplied by the user. FIELD-DISC-03 remains **PHYSICAL CLEAN-START PASS**. The existing ONVIF identity/MAC merge, bounded post-Pair verification, Pair safety and immediate adapter badge behavior retain regression coverage.

Normal Scan remains fast and discovery-oriented. The supplied Hanwha mismatch/no-Probe-response observation is not classified as a Normal Scan defect. Opportunistic off-subnet Hello discovery, production WS-Discovery wildcard strategy, Advanced Scan boundaries and monitoring separation are unchanged. No private-subnet brute-force scanning or project schema migration was added.

Physical retest: open Network Adapter without a camera row; preview and apply an available 192.168.1.x host on the selected Ethernet adapter; verify authoritative Windows state and badge, then explicitly Scan. Test optional gateway and static/DHCP Restore including DNS. Restart with an active temporary configuration and confirm the recovery warning/Restore. Confirm Hanwha initial-setup guidance, explicit hint selection without authentication, normal external Edge launch with its certificate warning, and light-theme menu readability. New hardware-dependent behavior remains pending physical validation.

**MILESTONE 16.3.5 FIELD WORKFLOW + CREDENTIAL ASSISTANCE — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING**
