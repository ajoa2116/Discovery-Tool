# November 17, 2026 - compiler filename-parity checkpoint

Repository: Discovery-Tool. Branch: `codex/post-field-corrections-1`.
Starting committed baseline: `deb858e7af0c520b069db45c28b35da94e8585a8`.
Master Blueprint v1.1 remains authoritative. Phase 18C.7T remains **incomplete**.
This checkpoint preserves test-only evidence; it grants no generated-code execution,
staging, facade-removal, signing, admission, release or production authority.

## Preserved files and recorded validation

Exactly two new test-only files are preserved without implementation changes:

- `src/test/support/ws_discovery_filename_parity_fixture.cjs`
- `src/test/ws_discovery_filename_parity.test.cjs`

Recorded focused compile-only/compiler-free validation: **93/93 passed, 0 failed**.
Syntax, whitespace, input-preservation and cleanup checks passed. Guarded calls
observed exactly two in-memory transpiles, one per filename, with no forbidden
process/network/write/compiler-API activity. No emitted code or dependencies were
executed, transport/socket objects constructed or production stager invoked. The
fixture created no temporary roots, output-module files or child processes;
environment and compiler cache were preserved.

Independent filename-parity review: **PASS for this measured caller, compiler and
option set**. Built-in-only inspection loaded neither fixture nor compiler, verified
record/output measurements, counted zero differing bytes/runs and independently
recognized identical imports. All **19 input observations and filesystem identities**
matched. These validation/review results are recorded evidence, not rerun during
checkpointing; only repository inspection and data-only measurements are repeated.

## Filename arguments and measured results

The relative compiler filename was `src/core/drivers/ws_discovery_transport.ts`.
The actual canonical absolute filename for this checkout was
`C:\Users\Omar\Documents\Discovery-Tool\src\core\drivers\ws_discovery_transport.ts`.
It was constructed locally with `path.resolve(repo, SOURCE)`, checked against
`fs.realpathSync.native` and the measured source identity, and passed directly to
the second compiler call. It was not obtained from retained/untrusted evidence.

Both calls supplied precisely the current production-stager `.ts` options:
**ES2022, ESNext, ReactJSX, rewriteRelativeImportExtensions: true**. No
`verbatimModuleSyntax`, other extra option or inherited tsconfig setting was supplied.
TypeScript 5.9.3 and the current stager/configuration bytes were measured.

| Filename variant | Output bytes | SHA-256 |
| --- | ---: | --- |
| Relative | 30,198 | `fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a` |
| Actual canonical absolute | 30,198 | `fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a` |

Outputs are byte-identical: **zero differing bytes and zero differing runs**.
All ten import declarations, default/named bindings, specifiers, ordering and UTF-8
coordinates match. This is filename parity for the measured source/profile only,
not universal compiler filename equivalence or a complete-stage comparison.

## Retained local JSON - excluded from this commit

- Exact artifact path: `C:\Users\Omar\.codex\artifacts\phase18c7t-ws-discovery-filename\cb2b905913586489e983f4bb3481d97990feb2cc5d7cf9394c260dcd8d94300c.json`.
- Size: **130,612 bytes**.
- SHA-256: `cb2b905913586489e983f4bb3481d97990feb2cc5d7cf9394c260dcd8d94300c`.

The bounded, non-executable JSON retains exact outputs, source/stager snapshots,
measurements, arguments' roles/construction, options, imports, comparison and limits.
Its concrete absolute compiler argument is redacted; this document records the local
path separately. Exported JSON alone cannot replay or independently recover that
redacted argument. No credential or environment values are captured.

Artifact/output measurements and all 19 observations re-matched at checkpointing.
The existing compatibility fixture and six prior evidence records remain unchanged
and retain separate scope without inherited admission. The artifact and reviewed
test files were not modified. JSON remains outside the checkout and is not committed
or uploaded; its path reference does not transfer its bytes to another host.

## Remaining blockers and next bounded task

Full-stage/historical output correspondence, compiler authenticity, pinned/native
mapped-image consumption, dependency closure, CommonJS/ESM interoperability, runtime
equivalence and admission remain unproven. Header recognition is fixed-profile lexical
inspection; guards are instrumentation rather than OS-enforced confinement.

All readiness/admission/production authority flags remain false. **All 29 caller-output
obligations remain open.** The authoritative **825-file staging baseline** and
**64-file ceiling** are unchanged; achieved/admitted reduced payload count remains
unknown. Production sources/imports, staging, existing fixtures, Master Blueprint
v1.1 and all security/default-deny gates remain unchanged.

Next bounded task: read-only review of the `fast-xml-parser` CommonJS entry closure,
including its literal local requires, eager builder branch and `strnum` provider.
Record exact provider/metadata paths and unresolved linking/closure assumptions;
do not execute dependencies, omit files, bundle or infer admission.

This commit contains only the two test files and this document. Push is restricted
to `origin/codex/post-field-corrections-1`; final commit identity, synchronization and
clean working-tree/index status are verified separately. No compilation or tests
are run during checkpointing.
