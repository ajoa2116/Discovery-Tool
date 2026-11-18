# November 17, 2026 - pair_service compile-only provenance checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting committed baseline: `2a37306d862ddc8ee9f05c0eda0501f181869055`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves test-only static evidence and grants no generated-code
execution, staging, facade-removal, signing, admission, release or production authority.

## Preserved implementation and recorded validation

The following two new test-only files are preserved without implementation changes:

- `src/test/support/pair_service_rewrite_fixture.cjs`
- `src/test/pair_service_rewrite.test.cjs`

Recorded focused compile-only/compiler-free validation: **107 passed, 0 failed**.
Syntax, whitespace, input-preservation and cleanup checks passed. Fresh-process
retained-evidence verification passed with non-built-in module loads denied.
Process/network/write and compiler-API guards recorded no forbidden activity;
no emitted module executed, service was instantiated or pairing action invoked.
The fixture created no temporary roots, output-module files or child processes;
environment and compiler cache were preserved.

Independent static provenance review: **PASS for retained static bytes**. A separate
built-in-only review loaded neither fixture nor compiler, recomputed all three
record/output measurements, independently located the three import literals and
reconstructed the redirected output exactly. All **29 input observations** matched:
the 27 reviewed source-boundary observations plus the two new-file measurements.
These validation/review results are recorded evidence, not rerun during checkpointing.
Checkpointing performs repository inspection and data-only byte/hash checks only;
no compilation, tests, builds or generated execution occur.

## Observed emitted-byte derivation

The reviewed TypeScript 5.9.3 profile compiles only
`src/core/network/pair_service.ts` in memory, without application loading.
**21 source import declarations correspond to 20 emitted imports**: the explicit
type-only `MatchApplyPlan` declaration is erased. The earlier source-only evidence
remains unchanged, including its historical UNOBSERVED emission fields.

Three independent specifier-only rewrites preserve separate declarations:

| Source slot -> emitted slot | Original range | Redirected range | Delta |
| --- | --- | --- | ---: |
| 1 -> 0: canonicalAnchor, sharesAnchor | [47,78) | [47,104) | +26 |
| 3 -> 2: addressRelationship | [187,221) | [213,270) | +23 |
| 20 -> 19: normalizeIPv4 | [1593,1627) | [1642,1699) | +23 |

Ranges are UTF-8 bytes, half-open and exclude quotes. Only
`../../shared/identity_policy.js` and the two separate
`../../shared/address_validation.js` occurrences redirect to
`../../shared/.consolidation/address-identity.generated.js`. Cumulative preceding
shifts are 0, 26 and 49 bytes; total increase is 72 bytes. Both address-validation
declarations, all imported/local pairs, declaration ordering, unrelated imports and
the `promises as fs` alias are preserved. Prefix, both middle regions and the entire
49,603-byte suffix are identical, including pairing/recovery/adapter-management code.

The sole dynamic import is emitted as `import("./match_candidate_service.js")` and
is unchanged between outputs; its byte start shifts from 29,396 to 29,468.
Actual outputs use LF; the pinned source uses CRLF. The independent recognizer is
restricted to this fixed header/profile, not a general JavaScript parser.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| Original | 51,230 | `d03ff52713ce34036ddb1f59ce7e9abfcc9bdd5eff374a7c221f5059e1ffa4fc` |
| Redirected | 51,302 | `2018608955300c29fbac7adbb753a918a8996a055980fcb7bdc2ccc573c2c0f5` |

Hard caps remain 64 KiB per output and 256 KiB for the complete retained JSON.
Overflow rejects without truncation or automatic growth.

## Retained local JSON - excluded from this commit

- Exact location: `C:\Users\Omar\.codex\artifacts\phase18c7t-pair-service-rewrite\b41bca4c2f52f45897514e4ff56360a919d08fc308fde924fa5d2f5d9667ee22.json`.
- Size: **172,322 bytes**.
- SHA-256: `b41bca4c2f52f45897514e4ff56360a919d08fc308fde924fa5d2f5d9667ee22`.

The bounded, non-executable record contains both exact output texts, measurements,
derivation, limits, source-boundary evidence and unresolved warnings. Its bytes are
outside the checkout and are not committed or uploaded. Artifact/output sizes and
hashes and all 29 observations re-matched during checkpointing; the artifact and both
reviewed test files were not modified. A location reference does not transfer the
artifact to another host.

## Remaining blockers and next bounded task

Eight ordinary interface-import runtime-export uncertainties remain unresolved:
`NetworkMatchInput`, `Device`, `PairCandidate`, `PairSessionState`,
`WindowsAdapterSnapshot`, `PingProvider`, `NeighborProvider` and
`WindowsNetworkAdapterService`. Their runtime exports under verbatimModuleSyntax
remain unverified; the compiler profile was not changed to conceal that limitation.

Compiler authenticity, pinned/native mapped-image consumption, transitive dependency
closure, dynamic resolution/fallback behavior, runtime linking/equivalence and external
confinement remain unproven. Data integrity and static correspondence do not establish
historical admission, facade removability or production readiness.

All readiness/admission/production authority flags remain false. **All 29 caller-output
obligations remain open.** The authoritative **825-file staging baseline** and
**64-file ceiling** are unchanged; achieved/admitted reduced payload count remains
unknown. Production sources/imports, staging, existing fixtures, Master Blueprint
v1.1 and all security/default-deny gates remain unchanged.

Next bounded task: read-only review of the remaining caller-output inventory to
select the next structurally distinct source contract, avoiding redundant fixtures.
This recommendation authorizes no compilation, execution or obligation discharge.

This checkpoint contains only the two new test files and this document. Push is
restricted to `origin/codex/post-field-corrections-1`; commit identity, synchronization
and clean-tree status are verified separately.
