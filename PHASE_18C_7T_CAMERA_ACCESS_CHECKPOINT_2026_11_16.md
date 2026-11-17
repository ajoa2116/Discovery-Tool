# November 16, 2026 - camera_access two-import provenance checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting baseline: `ee7d8928e9240714c5cec6a58782d7ae7a1b3666`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This is a non-authorizing development checkpoint, not execution or release approval.

## Implementation preserved

Exactly two new test-only files are preserved without implementation changes:

- `src/test/support/camera_access_rewrite_fixture.cjs`
- `src/test/camera_access_rewrite.test.cjs`

The opt-in fixture measures 14 source/tool/configuration/runtime inputs, including
`src/types/index.ts` and `src/shared/collision_state.ts`. It transpiles only
`src/shared/camera_access.ts` in memory using the reviewed TypeScript 5.9.3 test
profile. Production sources/imports and repository `noEmit` configuration are unchanged.

The exact four-import contract retains Device/IPCollisionRecord, hasIdentity,
isActiveCollision and normalizeIPv4 in slots 0-3. Only slots 1 and 3 redirect to
`./.consolidation/address-identity.generated.js`; declarations are never merged.
Original ranges [92,112) and [204,227) become [92,138) and [230,276).
Replacements remove 20 and 23 bytes and insert 46 bytes each: net increase 49.
The prefix (92 bytes), intervening middle (92 bytes) and suffix (2294 bytes) are
identical. Source CRLF coordinates are distinct from emitted LF/UTF-8 coordinates.

| Variant | Bytes | SHA-256 |
| --- | ---: | --- |
| Original | 2521 | `85dc3943cb11028d9283eab94dc7d084ec267f7888edf3bca6776fbd146ddb47` |
| Redirected | 2570 | `dff10ef322ebb0f25d3f6cb2389113370948784e91e316bd57b1d433c67cb8d2` |

## Recorded validation and independent review

Final focused validation: **73 passed, 0 failed**. Syntax and whitespace checks
passed; all 14 inputs re-observed unchanged. Compiler cache/environment were
preserved, forbidden activity was zero, and the compiler fixture created no child
processes, temporary roots or output-module files. Initial header/negative-case
assumptions were corrected before the final passing run; earlier invocations are
not added to that count.

Independent read-only byte-level review: **PASS for this bounded static derivation**.
A separate built-in-only script, without loading the fixture or TypeScript,
recomputed record/output hashes, independently located all four declarations and
both literals, confirmed disjoint ranges and the second-range shift, and rebuilt
the redirected bytes exactly. It also verified the untouched regions, UTF-8/CRLF/LF
coordinates, all 14 recorded input identities/hashes, limitations and false authority
flags. Recorded fresh-process compiler-free verification also passed, including
with non-built-in module loading denied. No coordinate defect was found for this
fixed profile. None of these observations establishes runtime behavior.

No compilation, tests, builds or generated execution are rerun during checkpointing.
Wrap-up uses file review, data-only artifact/output hashing and Git checks only.

## Local retained evidence - not committed

- Size: **12858 bytes**, within the 65536-byte record bound.
- SHA-256: `ffcfd75075d79d984232794fdf78275c0b2e92fc32fe0f382586708aa6df281a`.
- Exact location:
  `C:\Users\Omar\.codex\artifacts\phase18c7t-camera-access\ffcfd75075d79d984232794fdf78275c0b2e92fc32fe0f382586708aa6df281a.json`.

The JSON retains exact output texts, derivation and input observations as data,
without credentials or absolute user paths inside the record. It remains outside
the checkout and is **not committed or uploaded to GitHub**. Its existence, size,
record hash and both output measurements were rechecked at checkpointing. Both
code files still match their retained observations. The artifact is not regenerated
or modified; its reference alone does not make it available on another machine.

## Remaining blockers and next task

The retained Device/IPCollisionRecord type-use import **may not have valid runtime
exports under verbatimModuleSyntax**; runtime linking is unverified. Compiler
options were not changed to conceal that limitation. The compiler-free recognizer
is specific to this fixed header, not a general JavaScript parser. Capture hashes
and observed output references establish data integrity, not compiler authenticity,
trust signatures, historical admission or pinned/native mapped-image consumption.

Runtime equivalence, live bindings, initialization/failure timing, module/cache
identity, full dependency closure, facade removal and production admission remain
unproven. Generated-module execution remains unauthorized. Laptop 1's Windows
Home/Hyper-V limitation remains unresolved. No staging, signing, release or
production authority is granted by this checkpoint or its push.

**All 29 caller-review obligations remain open.** The authoritative **825-file
staging baseline** and **64-file ceiling** are unchanged; achieved/admitted reduced
payload count remains unknown. Production code/imports, staging, Master Blueprint
v1.1 and all default-deny, native/camera, authentication/TLS/ownership and release
gates remain unchanged. The existing network_match fixture is unchanged.

Next bounded task: read-only review of `src/core/storage/add_to_existing_project.ts`,
focusing on the `conflicts as conflict` island-import alias, original declaration
placement and other dependencies before proposing any alias-aware derivation
fixture. Do not compile, rewrite or execute it; implementation requires separate scope.

This checkpoint contains exactly the two test-only files above and this document.
Push is restricted to `origin/codex/post-field-corrections-1`; commit identity,
remote synchronization and clean-tree status are verified separately.
