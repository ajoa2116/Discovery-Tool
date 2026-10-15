# Phase 18C.7T continuation checkpoint — October 14, 2026

Documentation-only, uncommitted checkpoint. Phase 18C.7T remains incomplete and non-authorizing. Master Blueprint v1.1 remains the baseline; its standalone text is unavailable in this checkout, so full blueprint reconciliation is not claimed.

## Repository state and scope

Repository: C:\Users\Omar\Documents\Discovery-Tool
Branch: codex/post-field-corrections-1
HEAD: 55f1dd11297d823824ccb1e4bbf2eff573aab4c4
Upstream: origin/codex/post-field-corrections-1

HEAD equals the previously confirmed committed checkpoint. At the start of this documentation task, no tracked or staged changes existed. Four installed-root files remained untracked:

| File | Role | Change in this task |
| --- | --- | --- |
| native/ApplicationCompanion/InstalledRootAdmission.cs | Internal unelevated Windows ACL/canonical-path/kernel-identity observer; no production caller or authority grant. | Preserved byte-for-byte. |
| src/test/support/installed_root_admission_fixture.cs | Independent synthetic ACL/path/ownership cases and fixture restoration harness. | Preserved byte-for-byte. |
| src/test/installed_root_admission.test.cjs | External fixture compilation, scenario assertions and handle-release observations. | Preserved byte-for-byte. |
| PHASE_18C_7T_INSTALLED_ROOT_ADMISSION.md | Installed-root contract, original focused results, completed live evidence and current limitations. | Documentation updated; still untracked. |

This dated note is a fifth untracked file. Neither it nor the original four files is included in HEAD. No files were staged, committed, pushed, reset or switched. No earlier checkpoint/handoff was edited.

The October 13 checkpoint describes its validation-time state before commit 55f1dd1; its historical wording is not a current uncommitted-state assertion. Its 496 eligible automated entries were not an uninterrupted full-suite pass. This documentation checkpoint does not add test passes to that aggregate.

## Completed protected installed-root evidence

Architecture A remains approved only as a direction: administrator-installed protected versioned Program Files storage; native owner and backend execute unelevated as the same interactive user; precompiled backend; an explicitly approved bundled runtime; stopped-runtime updates. No exact runtime or release has been approved by this exercise.

The approved disposable root was:
C:\Program Files\CCTVDiscovery-Admission-7a9d92caf3cf47c3a037d3231e9e48c6

The separate read-only verifier used InstalledRootAdmission.Verify on positive\v1. The observed complete-ancestry positive included that version root, ancestors through C:\ and its inert payload. It reported complete protected ancestry and InstalledRootAdmitted=true, with ProductionAuthority=false and RaceFree=false. The live payload-write case returned exit 3, effective-token-mutation and InstalledRootAdmitted=false at positive\v1\payload.txt. No backend, provider or camera execution followed.

These observations satisfy the previously missing controlled complete-ancestry positive and one actual live payload-write denial. They do not replace the original user-profile synthetic coverage with a complete live Program Files negative matrix, validate every sibling of the disposable root as a payload, or establish an actual production installation.

## Reconciliation and resource completion

Two external comparison defects were corrected narrowly without modifying the repository verifier:

- Descriptor restoration preserved owner/group and byte-identical baseline DACL, but Windows retained SE_DACL_AUTO_INHERITED. Recovery tolerated only that addition with the other captured fields unchanged.
- Directory W values had been retained before provisioning added children. The root's documented child-creation change was 29.5062 ms. Only fixed, justified directory transitions were accepted; original metadata and journal evidence were not overwritten.

An expired V2 challenge and stale positive were preserved. One explicitly reviewed append-only retirement/repreparation issued a new one-use challenge and required a new independent unelevated positive. Successful reconciliation recorded Nodes=7, Active=none, Faulted=False. These are external fixture recovery facts, not changes to InstalledRootAdmission or production trust.

All seven objects were individually closed and identity-verified before nonrecursive bottom-up deletion; absence and unchanged protected ancestor identities/ACLs were recorded. The original journal was then sealed and flushed. All ten original remaining handles (journal, two protected-ancestor pins and seven external pins) were explicitly released; the additional release ledger was closed and the original session finalized. There is no retained session authority to resume or reconstruct.

The final receipt records FINALIZED, originalHandlesClosed=10, ledgerClosed=true, sessionDisposed=true, rootAbsent=true and productionAuthority=false. Its completedUtc is 2026-10-15T00:24:29.5501642Z, October 14 at 8:24:29 p.m. EDT. This document's date follows local time.

## Preserved evidence and verified hashes

Evidence root, outside the repository and deleted fixture:
C:\Users\Omar\Documents\CCTVDiscovery-Fixture-Evidence\Phase18C7T-FinalRelease-22421123304d4c09a812c1a0fdb91ec0

The [65-entry archive manifest](C:/Users/Omar/Documents/CCTVDiscovery-Fixture-Evidence/Phase18C7T-FinalRelease-22421123304d4c09a812c1a0fdb91ec0/archive-manifest.json) preserves original fixture/recovery sources, journals, positive/negative receipts, blocked-run evidence and focused results, plus measured verifier artifacts. New release-tooling files and finalization artifacts reside alongside the archive and are not extra entries in that 65-file count. Original evidence remains in place.

The [final release receipt](C:/Users/Omar/Documents/CCTVDiscovery-Fixture-Evidence/Phase18C7T-FinalRelease-22421123304d4c09a812c1a0fdb91ec0/final-release-receipt.json) includes:

| Receipt field / artifact | SHA-256 |
| --- | --- |
| archiveManifestSha256 / archive-manifest.json | 9CD18CD063A690E43CBC7029559280E87D1A49E6390934AC92653365B98418AC |
| sealedJournalSha256 / sealed-final-journal.txt | FF5DE621387C65AC432967287CA5252A5D0A195AF65D6A1F724A9551336EC535 |
| releaseLedgerSha256 / release-ledger.txt | 3EDCCE599982C703AC2CB3566A78B3C1E319821D0A85A5D2D5912247C35C7BCA |

All three artifact hashes and all 65 archive-entry hashes were verified read-only while preparing this checkpoint. The receipt and archive are owner-operated evidence in user-owned storage, not a signed release, production authorization or immutable provenance service.

## What remains unproven

- Production authority and genuine native owner/receipt/listener adoption remain absent. BackendReleaseTrust.Production is null and production constructs an ownerless authentication boundary.
- Complete dynamic/conditional/package/WASM/native/DLL/CLR/helper/provider execution closure remains unverified. Staging selection, successful resolution and observed loading remain different evidence.
- ACL/path admission is not release-byte approval, executable or mapped-code integrity, future-file admission, or race-free loading. The helper returns after disposing observation handles.
- The live fixture covered one inert layout and one payload-write denial. Broader live negative coverage, other installation layouts, original SACL/MIC history and hostile administrator/kernel/filesystem interference are not certified.
- The external cleanup/resource-release checks demonstrate this completed fixture lifecycle, not production crash-atomicity, arbitrary handle-reuse safety or historical OS-wide absence of resources.

Historical records remain authoritative about their own failures: original unexplained launcher/artifact failures; earlier Node/composition cancellations; the missing original pipe-loss exception; the original Vite proxy stall; and desktop construction timeout causes remain unresolved. Later focused passes and repaired orchestration do not reconstruct those causes. Interrupted validation, original hard-link setup failure, UAC-blocked preparation, failed restoration/comparison attempts, expired recovery and stale evidence remain preserved rather than relabeled as clean passes. Original SACL/MIC omissions cannot be repaired retrospectively by descriptor normalization.

## Next implementation dependency and approval boundary

The next dependency is an explicitly reviewed, fixture-only admission/lifetime contract that joins protected-root observations to exact selected/measured release files and runtime inputs, using existing staging and verification mechanisms. It must define missing/ambiguous/mismatched evidence denial and how a root observation remains relevant at later use. A disposed observation result must not become a transferable loading capability. No implementation or production integration is authorized by this documentation checkpoint.

Production work still requires separate owner choices for final installation/update policy, exact bundled runtime version and upstream provenance, approved release files/digests, release-signing authority/key/certificate custody, expiry and rollback/offline policy. The technical Architecture A direction does not approve those choices. Keep the existing 64-file manifest ceiling and 128 MiB-per-file/256 MiB-total bounds; any change requires explicit review, not automatic expansion to fit a stage.

Production API/WebSocket remains default-deny. Camera safety gates, native authentication/TLS, session deadlines, process ownership, signing restrictions and release limits remain unchanged. No activation, physical provider/camera operation, installer execution or new privileged fixture is authorized.

## Documentation checks for this checkpoint

Receipt/hash/count consistency, local evidence links, code-file preservation, documentation whitespace, Git branch/HEAD and tracked/staged/untracked scope were checked. No new launches, runtime/native/test changes, broad tests, builds, privileged operations or archived-evidence modifications were performed. Existing validation results are historical evidence; no new automated implementation result is claimed.

Stop after documentation reporting.
