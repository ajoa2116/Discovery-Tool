# Phase 18C.7T — Inert AppContainer ownership and recovery checkpoint

November 18, 2026. Non-authorizing checkpoint on `codex/post-field-corrections-1`, based on `ffb531439701846138045ee4cd45386bb4348618`.

## Scope and recorded evidence

- `src/test/support/appcontainer_ownership_model.cjs` — explicitly opted-in, private in-memory ownership model.
- `src/test/appcontainer_ownership_model.test.cjs` — focused ownership, interruption, cleanup, observation and false-success regression cases.
- Recorded focused validation supplied for this checkpoint: **209/209 passed, 0 failed**. Tests were not rerun for this checkpoint.
- Independent read-only static re-review: **PASS**; the former false-Released path rejects and the model is ready for a non-authorizing checkpoint. No remaining concrete defect was identified in that review. This is not Windows execution or confinement evidence.

The two test files are preserved without implementation changes. Production, staging, previous fixtures and security gates are untouched.

## Ownership and transition contract

The five ownership states are `IntentRecorded`, `Created`, `Attested`, `CleanupPending` and `Released`. Exclusive synthetic recovery-record creation establishes a run. Ordered resource creation requires committed intent before a creation receipt; repeated `IntentRecorded`/`Created` transitions build ownership. `Attested` requires all seven receipts and matching synthetic identities, Job limits and suspended child properties. Terminal denial enters `CleanupPending`; creation and attestation cannot resume. Only fully verified ordered cleanup can reach `Released`.

Private creation receipts bind each synthetic object to its run, receipt and identity. Names, SIDs, PIDs and copied snapshots do not confer ownership. The recovery record and every still-owned resource are identity-checked before each cleanup operation; uncertainty blocks automatic release.

Interruption points simulate effects and commits in private memory. Simulated restart invalidates prior session epochs, denies further preparation and preserves receipts, cleanup progress, retry counts and uncertainty. An interrupted pending operation requires manual recovery rather than speculative release. Durability and recovery remain simulated: there is no filesystem journal, real crash-durability proof or execution-resume mechanism.

Teardown order is strict: terminate; confirm exit; close thread; close process; close Job; restore output ACL; restore input ACL; remove output directory; remove input directory; delete profile; complete and close the recovery record. Cleanup has a three-attempt limit per step that is not reset by restart or positive observation refresh. Primary errors and cleanup errors remain separate.

For an owned process or Job, every dependent release operation requires current termination requested/confirmed evidence, signaled process exit, zero active Job processes, valid exit confirmation and matching confirmation/observation revisions. This covers retained-handle release, intermediate cleanup, profile release and final completion, including a check inside the final transition. Fully positive observations may advance an existing valid confirmation to the new revision; they cannot create confirmation.

Contradictory, missing or stale completion evidence after confirmation permanently invalidates it, clears its revision and preserves unresolved ownership in `CleanupPending`. Later positive reports and simulated restart cannot restore it. The corrected false-Released regression confirms exit with zero active Job processes, then reports one active process: the report rejects immediately, remaining cleanup blocks and `Released` is unreachable. Regression cases cover changes before every dependent release stage, immediate pre-completion changes, restart, retry exhaustion, preserved teardown order and forged success claims.

## Limits and retained boundaries

Fixed simulated limits remain one active process, 128 MiB process memory, 128 MiB Job memory, 10% CPU hard cap and a five-second external deadline. These are represented policy values, not demonstrated enforcement.

Actual Windows confinement is unverified. The model invokes no AppContainer, ACL, token, registry or process APIs, launches no process, writes no filesystem state and performs no network activity. No model or test module was loaded or executed, and no tests, builds or compilation were run while preparing this checkpoint.

No production admission, staging admission, runtime authority, signing approval or release authority is granted. All authority flags remain false: `executionAuthority`, `stagingAdmission`, `runtimeTrust`, `signingApproval`, `releaseAuthority`, `productionAuthority`, `productionReady`, `runtimeEquivalence`, `facadeRemovability` and `completeClosure`. Model assessment remains `BLOCKED` regardless of simulated cleanup success.

All **29 caller obligations remain open**. The backend baseline remains **825 files** and the manifest ceiling remains **64 files**. Master Blueprint v1.1 remains authoritative; standalone full reconciliation is not claimed. Existing security gates remain unchanged. Phase 18C.7T remains incomplete and non-authorizing.
