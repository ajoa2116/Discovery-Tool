# Phase 3 — Healthy retained network state and elective restoration

Branch: `codex/post-field-corrections-1`

Starting HEAD: `e4fc744b23914c9bf372457db3991bfeef3dc870`

Scope is Phase 3 only. Master Blueprint v1.1 remains authoritative. Identity/enrichment production policy, monitoring coordination, collision reconciliation, automatic Match Network, and later phases are unchanged. The three pre-existing trace files were not read, changed, or staged.

## Audit and test-first evidence

Previously, initialization classified every unfinished persisted Pair session as `ROLLBACK_REQUIRED` without inspecting Windows. Readiness and Tasks also treated stable recovery availability as attention. Adapter snapshots had an interface index but no persistent physical interface identifier, so restore could target a reused index. Shutdown already preserved recovery without restoring; projects and scan completion had no restore call.

The initial new regression file was run before production edits: **11 passed, 23 failed**. Failures reproduced healthy restart classification, absent machine-readable distinction and Keep Current, restart idempotence, external restoration detection, changed/missing/mismatched adapters, malformed and legacy snapshots, interrupted mutation classification, and missing retention UI. Additional checks cover actual disk persistence, project Save/Save As/close, Tasks, DHCP restoration, exact configuration comparison, concurrent restore, and startup preparation races. The Tasks presentation check separately reproduced the old attention treatment before that change.

## State and behavior

The existing Pair state machine is retained. `PairSessionState.recoveryDisposition` distinguishes `HEALTHY_RETAINED`, `ALREADY_RESTORED`, and `ATTENTION_REQUIRED`; `adapterMutationActive` reports apply/verification/restore ownership, including confirmation preflight, rather than stable retention. Persisted state alone is not trusted as a current classification.

Healthy retained means a valid original and applied snapshot identify the same physical Windows interface GUID, the saved operation finished `PAIRED` with adapter verification, and the currently inspected, Up adapter matches the applied configuration. Static address/prefix sets, gateway sets, DHCP mode, DNS mode, and manual DNS sets must match. DHCP leases and automatic DNS values may change without changing those configured modes. Camera responsiveness is not required to retain a successful adapter configuration.

Keep Current returns status only. It performs no adapter command, save, clear, DHCP/gateway/DNS change, or baseline replacement. The UI dismisses the controls after success. Healthy retention uses informational presentation, completed Tasks, and no automatic recovery-modal opening on startup. Both workflows expose Keep Current and Restore Original and show the current address/prefix.

Restore Original is explicit. It reinspects and uniquely resolves the original interface GUID, uses the current interface index for that physical adapter, and supplies the captured original IPv4/DHCP/gateway/DNS configuration. The PowerShell command checks GUID again before mutation. Verification compares the full applicable configuration before recovery is cleared. Failures retain evidence and attention. If the adapter already matches the original, restoration does not issue a Windows write.

At restart, original A means already restored and verified recovery completion, applied B means healthy retained, and different C means attention with no automatic write. Missing/ambiguous/mismatched physical adapters, malformed data, unreadable JSON, and interrupted unverified operations remain attention cases. Malformed bytes are preserved. Legacy snapshots without a GUID are deliberately unsafe for automatic classification or restoration; neither alias nor reused index is substituted as physical identity.

Repeated healthy restarts make no mutation and preserve A. New Pair/Match preparation is blocked while recovery is outstanding, including while startup inspection is pending. Retaining B never silently makes it the new original. Concurrent Restore requests cannot overlap.

Recovery remains in the existing local-app-data JSON store with exclusive temporary-file creation and atomic rename. No credential fields or project recovery state were introduced. The persisted adapter/session recovery evidence remains local; project serialization is independently tested not to contain it. Shutdown remains free of restore calls.

## Validation

- Focused Phase 3: **46 passed**.
- Phase 1 canonical identity: **50 passed**.
- Phase 2 safe enrichment: **46 passed**.
- Complete regression: **2,118 assertions across 58 files; 0 failed, 0 skipped**.
- Browser: **54 passed** (14 new retained-network, 25 field-workflow, 15 post-Pair), 0 failed/skipped. All backend calls mocked; no physical network mutation performed.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- Diff reviewed for scope and whitespace.

Existing tests retain their safety and identity assertions. Three old restart expectations were changed to the newly locked healthy-retention behavior. Fixtures now expose distinct interface GUIDs and report the actual static/DHCP behavior of temporary apply; no identity assertion was weakened.

## Files and remaining work

Production: `pair_service.ts`, `windows_adapter_service.ts`, new `shared/pair_recovery.ts`, shared types, readiness and Tasks projection, the Keep Current API route, App recovery banner, and both adapter workflow components.

Tests: new retained-network unit/integration and browser tests; Pair, field-workflow, V1 integration, post-Pair, safe enrichment, and shared physical fixture adjustments. This document records the closeout.

Phase 4 still needs to consume `adapterMutationActive`/`recoveryDisposition` in monitoring coordination: the existing monitoring gate still treats `PAIRED` as blocked. Background identity/collision reconciliation is unchanged. No physical retest was claimed; GUID capture, retain/restart, external changes, and explicit restore require field validation. Legacy recovery without physical identity requires manual evidence-based resolution rather than guessing an adapter.
