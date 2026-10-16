# Phase 18C.7T: fixture-only iconv variant equivalence

Baseline: Master Blueprint v1.1 and existing security contracts; branch codex/post-field-corrections-1, HEAD 4ac75692d18dcf282f4c29d3e6f689215b1a071f verified before execution. All sixteen existing uncommitted paths were preserved. The previously recorded absence of a standalone blueprint remains a reconciliation limitation. This task changes only the existing consolidation test, its shared iconv probe and this new record. No vendor, staging/inventory/admission implementation, production code or measured-input/ownership implementation changes.

**Result: bounded variant equivalence passed for all nine reviewed modes.** One focused invocation passed 2/2 tests, zero failures, with **149 checks per variant / 298 child checks**, nine original and nine prototype cold processes, and one compiler child. The original five-entry import cache regression remains exact. The prototype's genuine three-entry cache and raw load/resolve traces are retained. This is neither universal package equivalence nor production loading approval. The earlier topology-test failure remains recorded in PHASE_18C_7T_ICONV_CONSOLIDATION_EXPERIMENT.md; it was not erased or relabeled a pass.

## Contract and implementation

The existing original contract creates a new stage once and completes nine original cold controls. The existing opt-in consolidation test reuses that stage/evidence, compiles once with installed esbuild 0.28.2 using the unchanged options, then compares nine prototype cold controls mode by mode. No automatic retry or second variant exists. Raw owner/stdout evidence is written before acceptance; any spawn/exit uncertainty, denial or behavioral mismatch prevents the next mode and records consolidation-stop.json. Final identity/catalog verification errors also fail without cleanup or another invocation.

The shared probe keeps the exact original cache assertion: four iconv-lite/lib/ files plus safer-buffer/safer.js, with no cached encodings/ modules. The explicit prototype profile instead requires exactly lib/index.js, encodings/consolidated.cjs and safer-buffer/safer.js at entry. Both profiles require iconv.encodings===null, empty codec cache, no table loads, and no registry initialization or extra cache entries during repeated require/consumer-context require/ESM interop. No require.cache entries are fabricated, deleted or rewritten. Callback/load traces remain raw; repeated hook events are not counted as fresh executions.

Within each process the tests verify the exact entry path/module object, entry.exports, repeated require exports, both body-parser/raw-body resolution contexts, ESM default exports, stable encode/getCodec function references and the same codec-cache object. Original cached entry module objects remain unchanged after controls. Alias and repeated codec calls reuse exact codec objects. These demonstrate stable observed identities, not an exhaustive proof against every possible hidden initialization side effect.

Both variants exercise encodingExists, encode/decode, getDecoder incremental writes/end, aliases, BOM options, Unicode handling and unsupported-encoding errors. Real encodeStream/decodeStream Transform APIs also run for every positive vector, requiring readable end, writable finish and close before proceeding. Sixteen positive vectors per variant create 32 streams; **64 streams total confirm all three completion events**. Unsupported controls keep exact Error classification/message checks; ../tables/shiftjis.json remains an encoding label, not a filesystem module request.

Cross-variant comparisons include actual recorded output bytes/text, split and Transform results, supported/unsupported results and error messages, alias identity outcomes, codec-cache names, exposed export names, metadata, runtime and logical phased registry/cache state. The 408-key registry descriptor matches, comparing aliases/options/data structurally and functions by kind; function source text/prototypes and all encodings are not thereby proven equivalent. Raw physical cache/load traces are reported separately rather than normalized away.

The per-case table-load set is exact, both in require.cache and actual load callbacks. No table loads at initial import. Existing sticky violations remain a separate acceptance condition even when encodingExists catches exceptions; load-hook errors are now also recorded before rethrow. Prototype vendor resolve edges must match an explicit importer/specifier/target tuple. No new fault-injected unexpected-access child was run; the result establishes zero unexpected accesses in the reviewed controls, not exhaustive adversarial-code containment.

## Source, transformed edges and admission

The existing inventory and compiler metafile agree on all **13 incorporated JavaScript files and 38 dependency edges**. Each edge has an inventoried literal require, the same internal target or reviewed external target, and an explicit recorded mapping to an internal bundle wrapper or runtime external. No original edge is silently dropped. All input identities/SHA-256 values are retained, and compiler input byte counts agree with source measurements.

The bundle's runtime edges are explicitly enumerated for safer-buffer, buffer, stream, string_decoder and eight ./tables/*.json paths; the facade-to-bundle, safer.js-to-buffer and two consumer-to-entry edges make **16 permitted tuples**. Internal wrappers bypass Node hooks: their entries are static source-to-output accounting, not separately measured runtime file consumption. Runtime edge tuples are derived only after inventory/metafile correspondence checks, not from observed successful loads.

The generated facade and bundle are separately measured objects with their own compile-source and prototype-copy identities/hashes. Original package.json bytes are retained; installed/lock versions remain iconv-lite 0.4.24 and safer-buffer 2.1.2. Each cold process checks metadata version/main and exact package metadata resolution. Internal Node metadata reads remain incompletely observable.

The prototype uses an explicit test-only review list intersected with its copy manifest through the existing admission mechanism. Historical source admission is not promoted to generated output authority; the test explicitly confirms the authoritative stage/historical review cannot admit the generated bundle. Generated facade/bundle admission is a new explicit fixture review, not approval inherited from the old lib/index.js pathname. All default historical admission and production selection code is unchanged.

| File-count scope | Original | Experimental prototype |
| --- | ---: | ---: |
| iconv-lite + safer-buffer subset | 33 | 22 |
| JavaScript files | 14 | 3 |
| Conditional JSON data files | 8 | 8 |
| Original package metadata | 2 | 2 |
| Selected, unexercised files retained | 9 | 9 |
| Full authoritative backend payload | 825 | 825 unchanged |
| Historical reviewed package subset | 165 | 165 unchanged |
| Unresolved stage records | 4,736 | 4,736 unchanged |
| Release manifest ceiling | 64 | 64 unchanged |

The nine retained unknowns are iconv-lite/{Changelog.md,LICENSE,README.md,lib/index.d.ts} and safer-buffer/{dangerous.js,tests.js,LICENSE,Porting-Buffer.md,Readme.md}. They are not classified unnecessary and remain denied as runtime modules outside the fixed fixture admission. No full reduced backend stage was produced. Compiler, Node runtime, metadata reads and external providers are not closed by a 22-file package experiment.

## Single isolated validation

Fresh root:

`C:\Users\Omar\AppData\Local\Temp\discovery-iconv-equivalence-validation-0363ce597f99472fa97b430bd8a47a04\discovery-iconv-contract-jjHW92`

The independently unique envelope and ancestors reject observed reparse points; existing stage/catalog checks reject existing/linked/redirected output, hard-linked files and containment ambiguity. TEMP/TMP select only this envelope. Explicit child environments omit preload/search overrides, enforce read-only filesystem permissions restricted to this output, disable addons/workers/child creation and retain existing network/helper/timer guards. These are cooperative fixture controls, not an adversarial JavaScript sandbox or immutable filesystem/race proof. No prior fixture directory or preserved owner/evidence was inspected or accessed.

One invocation: node --test --test-concurrency=1 src/test/iconv_consolidation.test.cjs. **2/2 passed, 132.16 seconds**, original test 117.04 seconds including inventory/staging, consolidation/comparison 14.55 seconds. No broad suite, native build or second invocation.

| Cold mode | Checks per variant | Exact JSON tables loaded | Stream vectors per variant |
| --- | ---: | --- | ---: |
| ordinary | 22 | none | 2 |
| single-byte | 17 | none | 2 |
| shiftjis | 16 | shiftjis | 1 |
| eucjp | 12 | eucjp | 1 |
| gb18030 | 18 | cp936, gbk-added, gb18030-ranges | 3 |
| korean | 15 | cp949 | 1 |
| big5 | 17 | cp950, big5-added | 2 |
| unicode | 19 | none | 4 |
| unsupported | 13 | none | 0 |

No unexpected resolution, security violation, signal, timeout, compiler warning or cleanup uncertainty occurred. All **19 synchronous children returned**: nine original, nine prototype, one compiler. All controlled streams confirmed closure. Fixture-owned file opens close in finally. No Windows Job, measured-input/process lease, native module handle or ACL restoration owner was created/released by this experiment. Ordinary synchronous process return is not promoted to the birth-specific process-handle proof used by the separate native fixtures. Evidence remains intentionally retained; no automatic or broad cleanup occurred.

Final catalogs matched: baseline **830 files / 17,215,866 bytes** including 825 selected payload files plus five explicit diagnostic/probe inputs; prototype/compile/harness **28 files / 2,923,065 bytes** including 22 package artifacts plus six explicit build/diagnostic/probe inputs. All 33 original source/stage identities and hashes, 22 prototype source/copy identities and hashes, and the compiler binary identity/hash match their pre-run observations. Seven fixture/tool source hashes are unchanged during invocation. Syntax checks of the three directly relevant JavaScript files and git diff --check passed. Catalog/provenance observations are sequential file correspondence, not atomic pinned-object consumption.

Evidence: consolidation-report.json contains both counts, transformed/runtime edges, source maps, nine prototype results, scope/compatibility restrictions and final resource/catalog verification; iconv-contract.json retains nine original results. Each mode retains raw stdout and owner records, including raw paths/cache/load/resolution data. Compile intent/owner/metafile and both byte catalogs remain. The envelope retains focused-tests.log and before/after frozen hashes.

## Remaining scope and next blocker

This result covers the installed library/runtime bytes and the explicit vectors on the recorded current Node runtime. It does not execute backend consumers, approve upstream/runtime versions, exhaust character ranges/options/errors, validate legacy primitive extension or browser behavior, or establish all registry function semantics.

Deep imports of consolidated-away modules, physical cache deletion/reload behavior, module parent/children graphs, module filenames and error stacks remain observable compatibility differences or untested surfaces. Cache entries and internal wrapper caches are deliberately not equated. No universal package equivalence is claimed.

The smallest next packaging blocker is a bounded **generated-artifact selection/provenance mapping into the existing stager**: how to represent the facade/bundle's new identities and transformed edges without inheriting original-source admission or losing unresolved diagnostics. This successful fixture does not authorize that selection change. Full backend dynamic/provider closure remains unresolved; 825/165 still exceed 64. Exact native DLL mapped-image backing identity is a separate explicit release blocker. The preserved original owner, historical failures and physical camera/stress tests remain unresolved and untouched. Production API/WebSocket default-deny, native authentication, TLS/process/session/listener ownership, camera gates and release/signing/installation boundaries remain unchanged. No commit or push.
