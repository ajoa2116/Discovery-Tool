# November 18, 2026 - catalog-bound source-hook callback checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting HEAD: `51941294014f3b09e866044dd6611cc8b02dff39`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves a non-executing, test-only callback prototype and grants
no module execution, production integration, staging, admission, pruning,
facade-removal, signing, release or runtime authority.

## Preserved files and recorded validation

- `src/test/support/catalog_source_hook_fixture.cjs`
- `src/test/catalog_source_hook.test.cjs`

Recorded focused validation: **93/93 passed, 0 failed**. Independent review of the
corrected prototype: **PASS for the non-executing callback scope**. Syntax, whitespace,
source preservation, environment/instrumentation/cache restoration and owned-resource
cleanup checks passed. These results are recorded; checkpointing reruns no tests,
compilation, builds, hook registration or module evaluation. Implementation is unchanged.

## Fixed original inert samples

| Sample | Explicit format | UTF-8 bytes | SHA-256 |
| --- | --- | ---: | --- |
| `sample.cjs` | `commonjs` | 68 | `1466fc8f7080131b02c77ac0b929e9481cdb3856c611127914aeaa88275a93ef` |
| `sample.mjs` | `module` | 46 | `f0004e0a09450688e346d91ea293c9c7721daed3b10279ba817dc482d20a31e6` |

The source literals were independently decoded as data and their exact lengths and
SHA-256 values rechecked during checkpointing. Neither sample was evaluated.

## Supported callback observations

The fixture reads permitted source through bounded private buffers (1,024-byte cap),
checks file identities, UTF-8 correspondence, exact lengths and hashes against private
fixed pins, and retains immutable strings. Callbacks return the verified strings with
explicit CommonJS/ESM formats and `shortCircuit:true`. Covered entries never delegate
to `nextLoad`. Tests changed the on-disk files after verification and demonstrated
unchanged returned source while additional source-content reads were blocked.

Plain-data attribute validation checks descriptors, exact permitted properties and
prototypes; proxies are rejected before reflection. Getters and `toJSON` methods are
not invoked. Catalog validation requires exactly two ordered, fully populated entries;
sparse trailing slots, extra properties, accessors and substitutions reject.

Initialization is guarded after temporary-root creation. Primary errors remain intact,
cleanup failures are reported separately, and an explicit `pendingCleanup` owner allows
retry until removal succeeds. Before initial identity capture, cleanup removes only an
empty directory. Fault tests cover initial lstat/write failures, combined cleanup
failures, source-read errors and descriptor-close errors, plus restoration and cleanup.

## Limits and remaining blockers

This is source-handoff evidence from direct callback invocation. Actual Node hook
registration is **unverified** (`NOT_INSTALLED`); actual module evaluation is
**unverified** (`UNOBSERVED`). ESM cache behavior and real hook-chain ordering remain
**unverified**. Legitimate empty attributes are established only for the explicitly
accepted plain-data callback shapes; general live-Node context compatibility is unproven.

External confinement is **not established**. Filesystem observations are sequential,
not an immutable namespace or held consumption lease. Native mapped-image identity,
real loader consumption, CommonJS/ESM runtime interoperability, complete application
dependency closure and production readiness remain unproven. No application,
third-party dependency or generated module was loaded or evaluated by the prototype.

All ten authority flags remain false: `executionAuthority`, `stagingAdmission`,
`runtimeTrust`, `signingApproval`, `releaseAuthority`, `productionAuthority`,
`productionReady`, `runtimeEquivalence`, `facadeRemovability`, and `completeClosure`.
**All 29 caller-output obligations remain open.** Backend baseline **825 files** and
ceiling **64 files** are unchanged. Production, staging, existing loader hooks,
Master Blueprint v1.1 and all default-deny/security gates remain unchanged.

Next bounded task: read-only definition of the minimum confinement and fresh-consumer
conditions for a fixed inert hook-registration/evaluation probe. Specify cache isolation,
hook ownership, exact Node identity, permitted context shapes, lifecycle limits and
cleanup evidence before requesting any runtime authorization. This checkpoint grants none.

Only the two test files and this document belong in this commit. Push is restricted to
`origin/codex/post-field-corrections-1`; local/tracking/GitHub synchronization and clean
working-tree/index status are verified separately.
