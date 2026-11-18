# November 17, 2026 - project_db inline type-erasure provenance checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting committed baseline: `7dd3c2ef7bb033ed961a92aac485c2d34986f388`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves test-only static evidence; it grants no generated-code
execution, staging, facade-removal, admission, signing, release or production authority.

## Preserved files and recorded validation

Exactly two new test-only files are preserved without implementation changes:

- `src/test/support/project_db_rewrite_fixture.cjs`
- `src/test/project_db_rewrite.test.cjs`

Recorded focused compile-only/compiler-free validation: **118/118 passed, 0 failed**.
Syntax, whitespace, input-preservation and cleanup checks passed. Fresh-process
retained-evidence verification passed without TypeScript; independent byte operations
reconstructed the redirected output and rechecked all 20 input observations.
Guards recorded no forbidden process/network/write/compiler-API activity. No caller
or emitted module was loaded or evaluated, and no protected project store was
constructed. The fixture created no temporary roots, output-module files or child
processes; environment and compiler cache were preserved.

Independent static provenance review: **PASS for retained static provenance**.
The review loaded neither fixture nor compiler, independently located all ten
declarations and binding pairs, recomputed record/output hashes and lengths, and
reconstructed the redirected bytes exactly. No blocking defect or required missing
negative case was found for this fixed profile. These are recorded validation/review
results, not rerun during checkpointing. Checkpointing uses repository inspection and
data-only measurements; no compilation, tests, builds or emitted execution occur.

## Observed derivation

Using the reviewed TypeScript 5.9.3 compile-only profile, **10 source imports -> 10
emitted imports**. Slot 9 erases only the inline `type ProjectExportOperation`
binding while retaining the declaration and both value bindings:
`createProjectReplacementProtection` and `ProjectReplacementAuthorityError`.

Only island slot 3 redirects `../../shared/identity_policy.js` to
`../../shared/.consolidation/address-identity.generated.js`. UTF-8 literal-content
ranges are [366,397) original and [366,423) redirected, excluding quotes. The
31-to-57-byte replacement adds 26 bytes. The 366-byte prefix and 37,582-byte suffix
match exactly; `promises as fs`, other imports, declaration order, exports and all
unrelated code, including the top-level store initializer as text, are preserved.
The source uses CRLF and outputs use LF; byte-based verification preserves non-ASCII
suffix content. No initializer was executed.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| Original | 37,979 | `c50a9c3bb5b39fc2c3a99b9137ede5fb8c4213516624bf837e08387fc4910924` |
| Redirected | 38,005 | `1e2c932871829b9ada3eeeeb7f178a307406668e199718d37dfcf47f1d34d399` |

Caps are 64 KiB each for source/output, 128 KiB per selected dependency source and
256 KiB for the complete JSON record. Overflow rejects without truncation or growth.

## Retained local JSON - excluded from this commit

- Exact path: `C:\Users\Omar\.codex\artifacts\phase18c7t-project-db-rewrite\700c6635379d5b9fde6dfdab960e23befdb18a22f2327193c824e83d132124c9.json`.
- Size: **113,135 bytes**.
- SHA-256: `700c6635379d5b9fde6dfdab960e23befdb18a22f2327193c824e83d132124c9`.

The bounded non-executable record retains both exact outputs, source header,
measurements, correspondence, derivation, limits and limitations. Artifact/output
measurements and **all 20 input observations and identities** re-matched during
checkpointing. The two reviewed files and artifact were not modified. The JSON
remains outside the checkout and is not committed or uploaded; this path reference
does not transfer its bytes to another host.

## Remaining blockers and next bounded task

Ten ordinary type-use bindings remain runtime-export uncertainties:
`MetadataWriteContext`, `CctvProjectBundle`, `Device`, `IPCollisionRecord`,
`ProjectSession`, `ReachabilityEvidence`, `RogueDHCPOffer`, `SiteProject`,
`AppendProjectHistory` and `ProjectHistoryFilter`. Project-history type re-export
ancestry and authority type-only backreferences do not establish dependency closure.

Compiler authenticity, pinned/native mapped-image consumption, complete dependency
closure, runtime linking/equivalence and external confinement remain unproven.
Compiler-free recognition covers this fixed header/profile, not general JavaScript
or name resolution. Hash integrity does not establish trust or historical admission.

All readiness/admission/production authority flags remain false. **All 29 formal
caller-review obligations remain open.** The authoritative **825-file staging
baseline** and **64-file ceiling** are unchanged; achieved/admitted reduced payload
count remains unknown. Production sources/imports, staging, previous fixtures, Master
Blueprint v1.1 and all security/default-deny gates remain unchanged.

Next bounded task: read-only import-boundary review of
`src/core/drivers/ws_discovery_transport.ts`, focusing on the mixed default/named
`node:dgram` import and ordinary `RemoteInfo` type use before proposing another
fixture. No execution or obligation discharge is authorized by this recommendation.

This commit contains only the two test files and this document. Push is restricted
to `origin/codex/post-field-corrections-1`; commit identity, synchronization and
clean working-tree/index status are verified separately.
