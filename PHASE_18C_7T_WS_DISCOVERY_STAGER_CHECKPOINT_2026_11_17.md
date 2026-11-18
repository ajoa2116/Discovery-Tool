# November 17, 2026 - ws_discovery_transport stager-compatibility checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting committed baseline: `a54ccfe6aa85722ef6e64709b4935e1f2f745e34`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves test-only static evidence and grants no generated-code
execution, staging, facade-removal, signing, admission, release or production authority.

## Preserved files and recorded validation

Exactly two new test-only files are preserved without implementation changes:

- `src/test/support/ws_discovery_stager_compat_fixture.cjs`
- `src/test/ws_discovery_stager_compat.test.cjs`

Recorded focused compile-only/compiler-free validation: **124/124 passed, 0 failed**.
Syntax, whitespace, input-preservation and cleanup checks passed. The compiler-call
guard observed two in-memory transpiles using exactly the four stager options.
Activity/API guards recorded no forbidden calls. No emitted code or dependencies
were executed, transport/socket objects constructed, camera discovery invoked or
network/multicast activity performed. The fixture created no temporary roots,
output-module files or child processes; environment and compiler cache were preserved.

Independent compatibility review: **PASS for current stager-option compatibility
and retained static provenance**. Built-in-only inspection loaded neither fixture
nor compiler, verified all record/output hashes, compared the current stager option
site, independently located imports and reconstructed the redirected output exactly.
All **38 input observations and filesystem identities** matched. Validation/review
results are recorded evidence, not rerun during checkpointing. Checkpointing uses
repository inspection and data-only measurements; no compilation or tests occur.

## Measured profile and emission

The supplied TypeScript 5.9.3 options match the current stager's `.ts` branch:
**ES2022, ESNext, ReactJSX, rewriteRelativeImportExtensions: true**. No
`verbatimModuleSyntax` or other extra compiler option is supplied; no tsconfig
settings are inherited. TypeScript's internal defaults/forced transpile settings
remain distinct from supplied options.

Observed **12 source imports -> 10 emitted imports**. Six ordinary type-use bindings
are erased: `EvidenceProvenance`, `DiscoveryContext`, `WsDiscoveryEvidence`,
`RemoteInfo`, `Device` and `NICInfo`. Default `os` and `dgram` bindings survive.
Retained source slots are 0, 1, 2, 4, 5, 6, 7, 9, 10 and 11, in original order.

Only emitted slot 0 redirects `../../shared/identity_policy.js` to
`../../shared/.consolidation/address-identity.generated.js`. Half-open UTF-8 literal
ranges [63,94) and [63,120), excluding quotes, replace 31 bytes with 57 (+26).
The 63-byte prefix and 30,104-byte suffix match exactly; all retained bindings,
other imports, exports and unrelated code are preserved. Source CRLF and emitted
LF coordinates are measured independently; coincident first-literal positions
do not authorize reuse of source offsets.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| Original | 30,198 | `fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a` |
| Redirected | 30,224 | `a97fae6a4867a6a1509d5dec5f2a4e6ef1c43a46f74286c0a646e92b9c201783` |

Hard caps are 64 KiB each for caller source, stager source and each output;
128 KiB per selected dependency source; and 256 KiB for the complete JSON record.
Overflow rejects without truncation or automatic growth.

## Retained local JSON - excluded from this commit

- Exact path: `C:\Users\Omar\.codex\artifacts\phase18c7t-ws-discovery-stager\3caa94d6e90c8f03a1c1d6bc1edeb0585e77b0b59454233a5bb5733dc2d8d61a.json`.
- Size: **152,739 bytes**.
- SHA-256: `3caa94d6e90c8f03a1c1d6bc1edeb0585e77b0b59454233a5bb5733dc2d8d61a`.

The bounded, non-executable record retains exact source/stager snapshots, outputs,
option construction, measurements, correspondence, derivation, limits and warnings.
Artifact/output measurements and all 38 observations re-matched at checkpointing.
The two reviewed files and artifact were not modified. The JSON remains outside
the checkout and is not committed or uploaded; its path does not transfer its bytes.

## Preserved limitations and next bounded task

The five earlier fixtures retain separate `verbatimModuleSyntax` profile evidence;
their retained-record hashes remain unchanged and acquire no production-stager
correspondence or admission. This is a fresh capture, not a recovered historical stage.

The fixture uses a relative compiler filename while staging supplies an absolute
filename. No complete-staging or historical staged-output correspondence is
established. Compiler authenticity, pinned/native mapped-image consumption,
dependency closure, CommonJS/ESM interoperability, runtime equivalence and admission
remain unresolved. Fixed-profile recognition is not a general parser/name-resolution
proof; instrumentation is not OS-enforced confinement.

All readiness/admission/production authority flags remain false. **All 29 caller-output
obligations remain open.** The authoritative **825-file staging baseline** and
**64-file ceiling** are unchanged; achieved/admitted reduced payload count remains
unknown. Production sources/imports, staging, previous fixtures, Master Blueprint
v1.1 and every security/default-deny gate remain unchanged.

Next bounded task, requiring separate authorization: a compile-only filename-parity
check for this caller using relative and actual absolute filenames with the same
four options, retaining both results as data. It must not invoke the stager, execute
outputs/dependencies or inherit historical admission.

This checkpoint contains only the two test files and this document. Push is restricted
to `origin/codex/post-field-corrections-1`; commit identity, synchronization and clean
working-tree/index status are verified separately.
