# Phase 18C.7T — bounded iconv-lite lazy encoding contract

Baseline: Master Blueprint v1.1 and current security contracts; branch codex/post-field-corrections-1, HEAD 4ac75692d18dcf282f4c29d3e6f689215b1a071f. All eleven pre-existing uncommitted paths were preserved. The standalone-blueprint reconciliation limitation remains. This task adds only a test, its support probe and this record. No vendor, inventory, staging, admission, byte-catalog or production implementation was changed.

**Result:** the controlled installed library's lazy module/table requests are now observed with exact staged-file provenance. This is not full backend execution, a production dependency approval, or permission to prune/bundle. The selected payload remains 825 files, the existing reviewed package subset remains 165, the unresolved stage records remain 4,736 and the release-manifest ceiling remains 64. Exact real DLL image-section backing identity remains a separate explicit release blocker.

## Version, ancestry and consumer boundary

The installed and lockfile versions agree: iconv-lite **0.4.24**, main ./lib/index.js, depending on safer-buffer >=2.1.2 <3; installed safer-buffer **2.1.2**, main safer.js. Neither package declares an exports map or type field. Node's CommonJS entry resolution and ESM interop were exercised at those current files; no alternate ESM implementation was found or substituted. iconv-lite's browser metadata maps lib/streams and lib/extend-node to false for supporting browser bundlers. That browser behavior was not exercised and must not be applied to Node selection.

Existing staging metadata classifies these lock/package-consistent edges as required: body-parser -> iconv-lite, raw-body -> iconv-lite, iconv-lite -> safer-buffer. Source package metadata, lock integrity strings/locations, selected reasons, source/staged identities and SHA-256 values are retained in package-provenance.json. Installed-file correspondence is established; upstream tarball integrity/authenticity was not independently verified. These are reviewed local fixture inputs, not approved production upstream provenance.

The source-observed backend path is src/server/backend_application.ts:160 registering express.json() with default options. body-parser/lib/types/json.js:130 onwards defaults to utf-8 and rejects charsets whose lowercased prefix is not utf-. body-parser/lib/read.js forwards the charset to raw-body, which calls iconv.getDecoder; the optional verify/decode branch is also visible in source. Those middleware/backend bodies were **not executed**. Actual createRequire calls using both staged consumer filenames as resolution contexts resolved iconv-lite to the same staged lib/index.js and returned the same cached exports, without executing the consumer bodies.

The charset-prefix check is not an UTF-8-only allowlist. Controlled UTF-7, UTF-7-IMAP and UTF-16 variants work in this installed library; utf-32 is unsupported. This supports a narrow source inference about potential UTF-prefixed requests on that observed JSON path, not successful HTTP/JSON requests or complete caller analysis. Windows-1252, Shift-JIS and other non-UTF controls below exercise broader library capability; they are not evidence that this JSON registration reaches those codecs. Other raw-body/body-parser APIs, future configuration, computed callers and mutation remain outside this proof. No charset policy was narrowed.

## Exact file contract and observed phases

There are **33 selected files** under iconv-lite and safer-buffer. The fixture uses the existing buildPackageAdmission intersection with a separate fixed test-only list of **24 paths**: fourteen JavaScript files, eight table JSON files and two package metadata files. It does not derive admission from observed loads or alter the existing 165-path review list. All other package files remain selected; attempting to load a file outside the fixture review is a terminal fixture failure.

| Class | Exact files (relative to node_modules unless qualified) | Evidence and retention rule |
| --- | --- | --- |
| Import-time modules, 5 | iconv-lite/lib/index.js, bom-handling.js, streams.js, extend-node.js; safer-buffer/safer.js | Observed in every cold process at import, before any codec registry/table loads; retain for the unchanged current Node path |
| First-lookup registry/codec modules, 9 | iconv-lite/encodings/index.js, internal.js, utf16.js, utf7.js, sbcs-codec.js, sbcs-data.js, sbcs-data-generated.js, dbcs-codec.js, dbcs-data.js | All observed on the first lookup, including UTF-8 and unsupported names; retain under this unmodified library implementation |
| Conditional tables, 8 | iconv-lite/encodings/tables/shiftjis.json, eucjp.json, cp936.json, gbk-added.json, gb18030-ranges.json, cp949.json, cp950.json, big5-added.json | All observed across explicit library controls; keep admitted for those supported paths. No backend-wide omission is established |
| Resolution metadata, 2 | iconv-lite/package.json, safer-buffer/package.json | Individually measured and retained; main/version/dependency/browser evidence is static plus actual resolver outcomes, not an exhaustive trace of Node's internal metadata reads |
| Selected but unexercised, 9 | iconv-lite/Changelog.md, LICENSE, README.md, lib/index.d.ts; safer-buffer/dangerous.js, tests.js, LICENSE, Porting-Buffer.md, Readme.md | Not loaded by these controls; remain selected. No inference that they are unnecessary or safe to remove |

In the first row the four named iconv lib files all reside under iconv-lite/lib/. The full normalized paths, exact identities and hashes for every selected package file are in the machine-readable provenance/classification reports; no filename class supplies trust.

Source inspection shows encodings/index.js literally requires eight definition modules. getCodec first initializes that registry, then canonicalizes a supplied name, follows string/object aliases and invokes the selected codec constructor. DBCS constructors call reviewed table callbacks, whose require specifiers are literal filenames. The computed value is the encoding/codec selection, not a caller-supplied filesystem module specifier. No new runtime-discovery or directory-scanning resolver was introduced. Unsupported ../tables/shiftjis.json is treated as an encoding label and fails without loading that table.

Observed require.cache phases are five files at initial require and after ESM interop, then fourteen JavaScript files after the first lookup. All nine cold processes independently start without any staged package cache entries. ESM import('iconv-lite'), direct CommonJS require and both consumer-context requires share the same exports and CommonJS cache object in this Node version. Direct aliases and repeated codec lookups return the same codec object and add no cached files. Neither require.cache nor the vendor source/encoding maps are manually edited to induce a result.

Every reviewed file load/resolve is checked against its staged identity and SHA-256 around fixture observations. The hooks record resolutions, module load callbacks and cache snapshots separately; repeated hook callbacks are not automatically fresh module execution. All observed vendor builtin requests are buffer, stream and string_decoder. Additional fs/path/url/module requests belong to the copied fixture/admission tooling. No additional package or external file module loaded. Node's internal package.json reads are not exhaustively exposed by these hooks; lack of a metadata module-load event does not justify removing metadata.

## Deterministic positive/negative controls

| Cold case | Controls | Loaded table JSON files |
| --- | --- | --- |
| Ordinary | UTF-8 A/Euro bytes, UTF-16LE, UTF_8 / unicode11utf8 / UTF-8:2004 and UCS-2 aliases, BOM options | None |
| Single-byte | Windows-1252 Euro=80, Latin-1 e-acute=e9; cp1252/win1252 aliases | None; SBCS definitions are registry JavaScript |
| Shift-JIS | Hiragana a=82a0; SJIS/cp932/windows31j aliases | shiftjis.json |
| EUC-JP | Hiragana a=a4a2 | eucjp.json |
| Chinese | GB18030, GBK and GB2312 Chinese middle character=d6d0; chinese alias | cp936.json, gbk-added.json, gb18030-ranges.json |
| Korean | EUC-KR Hangul ga=b0a1; korean/windows949 aliases | cp949.json |
| Big5 | Big5 and CP950 Chinese middle character=a4a4; big5/cnbig5 aliases | cp950.json, big5-added.json |
| Unicode variants | UTF-16BE, UTF-7 and IMAP shifted pound sign, CESU-8 surrogate pair, UTF-16 BOM detection | None |
| Unsupported | not-an-encoding, utf-32, ../tables/shiftjis.json: encodingExists=false and expected getDecoder error | None; registry JavaScript still initializes |

Known byte vectors are checked in both directions with split incremental decoder writes/end. These are not exhaustive character/range/error/option tests: for example the GB18030 range table loads, but the vector is a two-byte character rather than exhaustive four-byte algorithm coverage. Transform encodeStream/decodeStream execution, browser/old-Node branches and primitive extension remain unexercised. Node-version conditions load streams/extend-node definitions here; no primitive extension method is called, and Buffer method identities remain unchanged. The registry exposes 408 keys including aliases, codec constructors and options, not 408 independently verified public encodings.

encodingExists catches arbitrary exceptions in the vendor implementation. The fixture therefore separately retains unexpected resolution/guard violations and fails even if a codec lookup could mask one. No such violations occurred. Invalid encoding results do not become permission to tolerate missing byte provenance or an unreviewed module.

## Isolation, validation and resource evidence

Fresh evidence root:

`C:\Users\Omar\AppData\Local\Temp\discovery-iconv-validation-1a5fddeeb4e74bfe82ff6dd7f08b6125\discovery-iconv-contract-uQpVYz`

The parent/ancestors and new output reject observed reparse/redirection. The existing stager produced an independent stage; the probe and copied existing admission tooling/configuration are explicit test-only overlays, outside the selected application payload. No selected byte or manifest selection was rewritten. The existing catalog covers the complete stage, original inventory/manifest and three fixture inputs: **830 files / 17,208,989 bytes**, verified before and after. All 33 original and staged package identities (BigInt dev/ino/size/mtimeNs/ctimeNs observations) and SHA-256 values matched before/after. All seventeen frozen source/baseline hashes matched the pre/post validation snapshots; none was edited during the invocation. Original unresolved diagnostics/edges remain in stage-manifest.json, inventory.json and the catalog; iconv-contract.json adds evidence without rewriting those flags.

Each child is the fixed current Node executable with a fixed probe and one enumerated mode, explicit environment without preloads/search overrides, stage working directory, readonly filesystem permission limited to the new output, addons/workers/child processes prohibited and TypeScript stripping disabled. The existing staged probe's operation families are guarded before package loading: networking, helpers, timers and interface enumeration. These are cooperative fixture guards, not an adversarial JavaScript sandbox. No backend/consumer body, listener, camera, helper, native addon or production provider was executed. The only exercised vendor bodies are the explicitly reviewed encoding library modules and safer-buffer.

One focused invocation passed **24/24 tests**, zero failures: the 23 directly relevant inventory/staging tests plus the new contract test. Its nine cold encoding children passed **106 checks**, all exited status zero with no signal, timeout or unexpected resolution. No failed test or mode was retried. JavaScript syntax checks and git diff --check passed. Invocation: node --experimental-strip-types --test --test-concurrency=1 src/test/dependency_inventory.test.ts src/test/backend_staging.test.ts src/test/iconv_lazy_contract.test.cjs. Total duration 115.75 seconds includes fresh inventory/staging; the new contract test took 111.22 seconds. No native build or unrelated suite ran.

Current fixture runtime: Node v24.19.0 x64 Windows, C:\Program Files\nodejs\node.exe SHA-256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237. This is a diagnostic file/version observation, not approval, packaging or atomic executable-launch identity. Every child reports that same runtime version. No alternate production Node version, builtin implementation or browser bundler is validated.

Fixture-owned file opens close in finally and would fail the test on close errors; after verification, no fixture descriptor is intentionally retained. Nine ordinary tool child invocations returned completely. No Job, ACL restoration owner, native process reference or measured consumption lease was created or released by this experiment. Their standard synchronous runner status is not promoted into the birth-specific native ownership/exit authority used elsewhere in 7T. No protection or production process contract is weakened. These sequential file/hash observations do not prove immutable namespace, loaded-code identity or mapped image backing.

Evidence: iconv-contract.json contains classifications, ancestry, edges, phased loads/cache, builtin resolutions, runtime differences, retained diagnostics and process results; package-provenance.json contains source/staged identities and hashes; byte-catalog.json and byte-verification.json contain original catalog verification; each cold mode has raw stdout and owner-result records. The enclosing envelope holds focused-tests.log, invocation count one/exit zero, worktree state and frozen hashes. Evidence is retained; no broad cleanup occurred.

## Smallest defensible next packaging experiment

Perform a **compile-only iconv-lite/safer-buffer consolidation prototype alongside the unchanged stage**, using the reviewed literal graph and exact source hashes as inputs, with no tree-shaking/pruning and all original files/metadata retained as evidence. Audit every emitted table reference, builtin edge and module-relative path against this contract before considering any execution or selection change. The smallest unresolved transformation issue is preserving relative lazy table resolution and shared cache/object identity when modules move into a bundle; a successful compile alone cannot prove either. This task does not implement or authorize production adoption of that prototype.

This contract provides no basis to discard the eight tables solely because the observed JSON registration forwards UTF-prefixed charsets. Full backend caller/configuration and other computed-loading boundaries remain unresolved. The 825-file payload/165-file review subset still exceed 64. Exact mapped-image backing identity, upstream/runtime approval, remaining Express/provider resolution, historical failures and physical camera/stress tests remain separate gaps. The preserved original owner/evidence was never inspected or touched. API/WebSocket default-deny, native authentication, TLS/process/session/listener ownership, camera gates and release-policy boundaries are unchanged. No commit or push.
