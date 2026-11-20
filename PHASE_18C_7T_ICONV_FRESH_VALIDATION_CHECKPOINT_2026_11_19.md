# Phase 18C.7T — restored iconv fresh-validation checkpoint

November 19, 2026. Non-authorizing checkpoint on `codex/post-field-corrections-1`, starting from `de08bdd36c02e0b841824c20385e6be0c186a027`.

## Preserved correction and recorded validation

- `src/test/support/iconv_artifact_fixture.cjs`
- `src/test/iconv_fresh_artifact.test.cjs`

These reviewed test files are preserved without further implementation changes. Fresh mode replaces its dependency on missing historical reports, outputs, metafile, compile intent and stage manifest with explicit measured local inputs. Historical archival mode remains separate and retains its existing checks. Neither missing historical output identities nor the unavailable 4,736-record historical manifest are reconstructed, updated or discharged.

Recorded final focused validation: **9/9 passed, 0 failed, 0 skipped**. Independent read-only review: **PASS**, ready for a non-authorizing checkpoint. Syntax and whitespace checks passed during implementation. Tests and compilation were not rerun during checkpointing.

All **37 local input pins** matched during independent review and again at checkpointing: 33 originals, two consumer contexts and two compiler metadata files. Fresh observations bind lengths, SHA-256 values and filesystem identities; consumed source bytes and subsequent input re-observations are checked. Package and lock versions agree: **iconv-lite 0.4.24**, **safer-buffer 2.1.2**, **esbuild 0.28.2** and its win32-x64 package **0.28.2**. These observations do not establish upstream authenticity or pinned loader consumption.

## Layout and generated evidence

| Disjoint selected-file category | Original | Proposed isolated layout |
| --- | ---: | ---: |
| Reviewed implementation JavaScript | 14 | 3: generated facade, generated bundle, unchanged safer.js |
| Encoding-table JSON | 8 | 8 |
| Package manifests | 2 | 2 |
| Retained unknown files | 9 | 9 |
| Total | **33** | **22** |

The proposed payload contains **two generated outputs and twenty retained inputs**. Thirteen incorporated originals remain build evidence rather than extra proposed payload files. Potential backend saving: **11 files, NOT achieved**. No authoritative reduced backend stage or admitted replacement was produced; the backend baseline remains 825 files.

Existing generated-artifact, catalog, provenance and selection validators still require **13 incorporated modules, 38 transformed occurrences and 16 runtime tuples**, with unchanged compiler settings and independent output pins:

| Generated output | Bytes | SHA-256 |
| --- | ---: | --- |
| `node_modules/iconv-lite/lib/index.js` facade | 73 | `6f337c46a421eb2e3ca175624f6ffc81ab55cb04bee0a77b95af5ceb873fc7c5` |
| `node_modules/iconv-lite/encodings/consolidated.cjs` bundle | 126,517 | `6880817d8741d1e77cf89dced6c4eaba6b0c7413f7800d4a400b18ae75116669` |

All **seven admission-denial groups** remain: generated-output tampering with sticky denial after restoration; wrong independent review digest; duplicate transformed occurrence; external dependency tampering with sticky denial; missing source occurrence; incorrect compiler options; and removed provenance/status-downgrade fallback. Independent cases use separate manifest/selection owners. The valid report has **13 evidence-only admissions**; all **nine unknown files remain selected and unadmitted**. `atomicMeasuredHandleBinding:false` remains explicit. The production package-hook rejection of this evidence-only report is preserved and asserted; its authority basis is not relaxed.

## Successful accounting and unsuccessful attempts

Successful local accounting record, excluded from Git:

- Path: `C:\Users\Omar\AppData\Local\Temp\discovery-iconv-fresh-validation-79621b913584469081ae898ba471bb13\fresh-build-accounting.json`
- Size: **50,110 bytes**.
- SHA-256: `218467afe71018df9e7cdfe1a8d47734030af089d151d44cb34eebe95b8584b3`.

Existence, size and SHA-256 were verified again at checkpointing. The record reports `completed`, one compiler invocation, successful compiler return, input preservation and cleanup confirmed; its fixture scratch root is absent and only the accounting JSON remains in its parent. Environment/compiler-cache restoration assertions passed in the recorded focused run. Generated files were removed by successful cleanup, so their output measurements remain recorded evidence, not files rehashed at checkpointing. The local reference does not transfer evidence bytes to GitHub or another host.

Both earlier attempts remain unsuccessful: each recorded **8 passed, 1 failed**, with journals left at `compiler-returned-not-yet-validated`. Their external evidence roots remain preserved:

- `C:\Users\Omar\AppData\Local\Temp\discovery-iconv-fresh-validation-0f024192597f45bc8977c0adfd647695`
- `C:\Users\Omar\AppData\Local\Temp\discovery-iconv-fresh-validation-5499140955a840fb85acc99e89157bcb`

The fresh adapter initially looked up compiler lock entries using a `/package.json` filename key. The existing validator rejected the absent lock data. The correction uses package keys without that suffix; no validator was weakened. Failed counts are not added to the final passing coverage, and successful-run cleanup does not claim those failed roots were removed.

## Remaining authorization boundaries

Historical output/metafile correspondence, runtime equivalence, actual loader consumption and production admission remain **unverified and unauthorized**. Generated/dependency execution, real loader consumption and production admission checks were not attempted; archive-backed regressions remain unrun because their inputs are missing. Compiler authenticity, protected consumption, complete dependency closure and native mapped-image binding remain separate production blockers. Cooperative fixture/compiler/data validation supplies no confinement or runtime authority.

Address/identity consolidation remains **deferred**. All **29 formal caller obligations remain open** and all authority flags remain false: `executionAuthority`, `stagingAdmission`, `runtimeTrust`, `signingApproval`, `releaseAuthority`, `productionAuthority`, `productionReady`, `runtimeEquivalence`, `facadeRemovability` and `completeClosure`. Backend baseline **825 files** and ceiling **64** remain unchanged. Master Blueprint v1.1 and existing security gates remain authoritative; complete standalone Blueprint reconciliation is not claimed. Production, staging, package hooks, release policy and prior fixtures outside these two reviewed test files are unchanged. Phase 18C.7T remains incomplete and non-authorizing.

Smallest next bounded task: read-only definition of the minimum generated-byte consumption contract for these two iconv outputs at the existing package-hook boundary, specifying what must prevent reopening substituted bytes while preserving terminal denial. Do not install hooks, execute modules or grant admission during that review.
