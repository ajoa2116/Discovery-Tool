# Phase 14B — Confirmed Match Network Apply

Branch: `codex/post-field-corrections-1`
Starting HEAD: `46d54318970b83ab30b3c22c116dc51cda0a8d67`
Commit message: `Apply Match Network with explicit confirmation`

## Workflow and safety

Phase 14A candidate results now include an opaque server-held preview ID. At most eight previews are retained for two minutes. Review consumes that ID and passes a server-owned snapshot into the existing Pair service; client-supplied addresses, identity anchors or adapter snapshots cannot substitute for it. Search/review does not apply or save recovery. Review shows the intended physical adapter/GUID, current IPv4, selected address/prefix, fallback, preserved original settings, and what changes/remains unchanged. Cancel performs no mutation.

Only explicit Confirm and Pair proceeds. Confirmation is tied to a Pair session ID and selected candidate. Changing a Match candidate rotates that ID. The existing privilege, physical-adapter GUID, current-baseline and state-machine guards remain in force. Stable target anchor/IP/mask, duplicate-IP evidence and active collisions are revalidated.

The confirmed candidate receives a fresh bounded occupancy recheck through the Phase 14A multi-signal checker. Local adapter addresses, retained/current devices, gateways, DNS and active collision evidence are excluded. Positive neighbor/ICMP/TCP evidence, TCP refusal, ambiguous evidence or provider failure blocks apply. Failed ping alone never authorizes availability. Final target, adapter and current occupancy are checked again after asynchronous work; occupancy appearing while recovery is persisted blocks apply too.

If the preferred candidate becomes unsafe, fallback is revalidated. A successful fallback recheck only updates the review with a NEW confirmation ID and an explicit explanation; no adapter change occurs. A new explicit confirmation and another final check are required for fallback. If neither candidate is safe, apply is blocked.

## Mutation and recovery

No second mutation engine was introduced. Match uses Pair's existing applyTemporary, recovery store, diagnostics, retained-state and Restore paths. Before mutation, the original snapshot is persisted. A healthy retained configuration may be matched again on the same verified physical adapter: original A is carried forward, while current temporary B is the new comparison baseline. Cancelling a subsequent preview restores the prior in-memory retained state without touching Windows or its recovery record. A different adapter or unresolved recovery state blocks review.

Apply targets the selected interface index plus verified GUID. Match independently inspects Windows afterward instead of trusting the command result. Verification checks the requested address/prefix, static mode, no gateway, retained DNS mode/settings and physical identity. Failures enter the existing ROLLBACK_REQUIRED path with original evidence preserved. A recovery-save failure blocks apply and reports attention truthfully.

Adapter success is distinct from bounded read-only camera communication verification. Missing camera response leaves PAIRED/HEALTHY_RETAINED with communication unverified. Identity changes during verification cannot overwrite the new live identity or claim camera success. Keep Current is nonmutating; Restore remains explicit. App close, scan, project change or later camera address changes do not automatically restore or follow the camera.

## Validation

- New Match apply service checks: 39 passed.
- Phase 14A service checks: 41 passed.
- Relevant existing subset: Pair 34; retained network/recovery 46; network configuration 48; identity-safe access 39; canonical identity 50; background collisions 42; post-Pair enrichment 57. Total: 316 passed.
- Full final non-browser suite (justified by shared Pair confirmation changes): 2,665 assertions across 72 files passed, zero failed suites.
- Browser: Match apply 11; Phase 14A candidates 9; post-Pair 15; retained network 14; modal containment 63; field workflow 25. Total: 137 passed, 0 failed, 0 skipped.
- TypeScript: passed (`npx tsc --noEmit`).
- Production build: passed (`npm run build`).
- Diff whitespace check: passed.

The initial new browser fixture assumed Cancel left the dialog open; it was corrected to reopen the dialog, preserving existing application behavior. A missing vendor field in a new late-occupancy test fixture was corrected after TypeScript caught it. Final checks are green; existing assertions were not weakened.

All automated adapter mutations, partial failures, restarts and restores used fake adapters and memory recovery stores. Browser requests used fixtures. The real Windows adapter, physical cameras, credentials and local recovery record were not changed. The temporary test-only environment shim and UI-only server were removed/stopped after validation.

## Files and limitations

Implementation: match_candidate_service.ts, pair_service.ts, server/index.ts, shared/match_candidate_preview.ts, types/index.ts, MatchCandidatePanel.tsx and PairNetworkModal.tsx. Tests: match_apply.test.ts and browser/match_apply.cjs. This record documents closeout.

Phase 14A's conservative on-link requirement remains: an off-subnet target without an existing selected-Ethernet path yields no safe candidates. No subnet guessing or pre-confirmation adapter changes were added to bypass this limitation. Availability evidence is not an absolute guarantee of vacancy. Physical Match Network acceptance is pending and was not attempted. Legacy recovery retirement remains deferred.

Three original untracked CCTV trace files remain untouched. Stop after Phase 14B; Phase 14C was not started.
