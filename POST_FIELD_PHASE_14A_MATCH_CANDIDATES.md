# Phase 14A — FIELD-NET-02 Safe Match Network Candidates

Branch: `codex/post-field-corrections-1`
Starting HEAD: `26e78ab9cfc9ee2baa53c2ec77715058086c9d3a`
Commit message: `Add safe Match Network candidate selection`

## Scope and behavior

Added a read-only candidate endpoint and a separate “Find Match Network candidates (read-only)” panel in the existing device Pair dialog. It shows target device/IP, derived network/prefix, selected Ethernet interface, preferred candidate and optional fallback. It never creates a Pair session or advances to confirmation. Existing Pair/manual Network Adapter workflows are unchanged.

The preview requires a stable device anchor and the device's own known IPv4/subnet mask. Missing or unsupported masks block with an explanation; the adapter prefix is never substituted for device evidence. Duplicate-IP evidence, active target collisions, identity conflicts, and multiple records sharing a stable anchor block preview.

The bounded search follows Pair's existing host permutation, examining at most 32 positions and returning at most two candidates within an 8-second service deadline. It reuses the existing conservative multi-signal candidate checker and diagnostic/neighbor providers rather than adding an IP scanning engine. Deadline, provider failure, cancellation, or uncertain evidence produces no candidates.

Excluded addresses include target IP, target/selected-adapter network and broadcast addresses, all local adapter addresses, all retained database devices (including saved/current-only/hidden inventory), active collision addresses, known gateways and local DNS servers. Final checks reject newly occupied candidates, changed target identity/address/mask, or changed adapter topology.

Neighbor reads are scoped to the selected interface; valid neighbor occupancy rejects a candidate and multiple matching neighbor observations are treated conservatively. TCP 80/443 checks bind to the selected local address. Positive ICMP/TCP or TCP connection refusal rejects an address. Provider errors remain uncertain. Failed ping alone never establishes availability: only clean repeated neighbor absence plus bounded negative ICMP and both TCP checks on a verified on-link path support an offered candidate. Availability remains a risk-reduction observation, never a guarantee.

## Read-only boundary and limits

No Windows IPv4, DHCP, subnet, gateway, DNS, adapter enablement, camera configuration or credentials were changed. The service owns no recovery store, does not load/initialize recovery, does not save/clear recovery, and never invokes adapter apply/restore/admin methods. Existing recovery data and Pair state are untouched by candidate previews. No mutation confirmation or Phase 14B functionality was added.

A target subnet without an existing on-link path through the selected Ethernet interface returns no candidates. Off-subnet failed probes cannot establish vacancy without changing the adapter, which this phase explicitly forbids. This conservative limitation is explained in the UI. A later mutation phase must revalidate candidates and require explicit confirmation; this preview cannot apply them. Physical acceptance remains pending.

## Validation

New focused service tests: 41 passed. New browser presentation/read-only checks: 9 passed. Focused total: 50 passed.

Relevant non-browser regression: Pair 34; network configuration 48; IPv4 input 18; canonical identity 50; background collisions 42; identity-safe access 39; retained network/recovery 46; safe identity enrichment 46; post-Pair enrichment 57; browser boundary 211. Total: 591 passed.

Relevant browser regression: post-Pair 15; retained network 14; modal containment 63. Total: 92 passed.

Combined: 733 passed, 0 failed, 0 skipped. Tests used simulated providers and UI fixtures, not physical network operations. TypeScript and production build passed. `git diff --check` passed. No complete regression suite was run because shared mutation/recovery implementation was not changed.

## Files

- `src/core/network/match_candidate_service.ts`: bounded read-only service and scoped checker composition.
- `src/shared/match_candidate_preview.ts`: runtime preview contract.
- `src/server/index.ts`: candidate-only endpoint.
- `src/ui/components/MatchCandidatePanel.tsx`: read-only result presentation and stale-response invalidation.
- `src/ui/components/PairNetworkModal.tsx`: embeds the candidate panel.
- `src/test/match_candidates.test.ts`: focused safety checks.
- `src/test/browser/match_candidates.cjs`: presentation/read-only browser checks.
- This validation record.

Three original untracked CCTV trace files were left untouched. Stop after Phase 14A; no Phase 14B work started.
