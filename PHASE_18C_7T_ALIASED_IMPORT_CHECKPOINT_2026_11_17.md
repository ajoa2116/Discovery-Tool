# November 17, 2026 - aliased-import provenance checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting committed baseline: `e0417cc2bcad6d653aad0b5a62a525a15dd431be`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves development evidence only; it grants no generated-code
execution, staging, facade-removal, signing, release or production authority.

## Implementation and measured outputs

Exactly two new test-only files are preserved without implementation changes:

- `src/test/support/add_to_existing_project_rewrite_fixture.cjs`
- `src/test/add_to_existing_project_rewrite.test.cjs`

The explicit opt-in fixture measures 15 source/dependency/tool/configuration/runtime
inputs and transpiles only `src/core/storage/add_to_existing_project.ts` in memory.
It retains the reviewed TypeScript 5.9.3 compile-only profile and all four imports,
including the exact imported/local relationship **conflicts -> conflict**.

Only the slot-0 specifier changes from `../../shared/identity_policy.js` to
`../../shared/.consolidation/address-identity.generated.js`: 31 bytes become 57,
net increase 26. Independently located ranges [70,101) and [70,127) delimit the
original and redirected literals. The 70-byte prefix and 5390-byte suffix match
exactly, preserving all non-island imports, bindings, declaration positions,
`const matches = sharesAnchor`, conflict calls and unrelated emitted bytes.

| Variant | Bytes | SHA-256 |
| --- | ---: | --- |
| Original | 5491 | `76f2d794f703d5c37545374e7ca1dc2727d839b4cc13850ff998ec561c3dbc20` |
| Redirected | 5517 | `19260089f5818f8439618b7995e4cb116640fcdf4d5f08374e94bab824520838` |

## Recorded validation and independent review

Final focused validation: **79 passed, 0 failed**. Syntax/whitespace checks passed.
Compiler-free checks passed in fresh processes, including with non-built-in module
loads denied. All 15 observations re-matched; environment/cache were preserved,
forbidden activity was zero, and the compiler fixture created no child processes,
temporary roots or output-module files. Earlier development invocations are not
added to the final count. Neither emitted module was executed.

Independent read-only byte-level review: **PASS for bounded static provenance**.
A separate built-in-only script did not load the fixture or TypeScript. It
recomputed record/output hashes and lengths, independently located all four
headers and the alias literal, reconstructed the redirected output exactly, and
confirmed CRLF-source/LF-emitted UTF-8 coordinates, prefix/suffix equality,
usage/class preservation, all 15 input identities and false authority flags.
No blocking coordinate/alias defect or required missing negative case was found
for this fixed profile. The fixture is ready for a non-authorizing checkpoint.

These test/review results are recorded evidence, not rerun during checkpointing.
Wrap-up performs repository/file review, data-only hashing and Git checks only;
no compilation, tests, builds or generated execution are performed.

## Retained local JSON - excluded from this commit

- Size: **19479 bytes**, below the 65536-byte record limit.
- SHA-256: `0f01b7bc44ffa4516aaf0512da6d269eb19974e09947d601e27e70c36b321ffb`.
- Exact local location:
  `C:\Users\Omar\.codex\artifacts\phase18c7t-add-project-alias\0f01b7bc44ffa4516aaf0512da6d269eb19974e09947d601e27e70c36b321ffb.json`.

The bounded, non-executable record retains both exact output texts, configuration,
derivation and all observations without credentials or absolute user paths inside
the record. It remains outside the checkout and is **not committed or uploaded**.
Existence, size, SHA-256 and both output measurements were rechecked at checkpointing.
Both code files still match their reviewed retained hashes. The artifact is not
regenerated or modified; its reference does not transfer its bytes to another host.

## Preserved blockers and next bounded task

The retained **Device type-use import may not have valid runtime exports under
verbatimModuleSyntax**; runtime linking is unverified. Compiler behavior was not
changed to conceal this limitation. Header/usage recognition is fixed-profile
lexical checking, not a general JavaScript parser or name-resolution proof.

Compiler authenticity, pinned/native mapped-image consumption, runtime equivalence,
initialization/failure timing, live bindings, module/cache/function identity,
complete dependency closure, facade removal and admission remain unproven.
Capture hashes establish data integrity, not trust signatures or historical
admission. Laptop 1's Windows Home/Hyper-V limitation remains unresolved.

**All 29 caller-review obligations remain open.** The authoritative **825-file
staging baseline** and **64-file ceiling** are unchanged; achieved/admitted reduced
payload count remains unknown. Production code/imports, staging, Master Blueprint
v1.1 and all default-deny, native/camera, authentication/TLS/ownership and release
gates are unchanged. Both earlier provenance fixtures remain unchanged.

Recommended next task: read-only review of `src/core/network/pair_service.ts` and
its three island-import occurrences, including two distinct address imports.
Record required separate declaration slots and bindings before proposing another
fixture. Do not compile, rewrite, execute or discharge obligations in that review.

This commit contains exactly the two test-only files above and this document.
Push is restricted to `origin/codex/post-field-corrections-1`; final commit identity,
remote synchronization and clean-tree status are verified separately.
