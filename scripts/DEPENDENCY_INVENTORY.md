# Informational dependency inventory

Run `node scripts/dependency-inventory.cjs` from the repository root, or pass a checkout path as the single argument. JSON is written only to stdout. The tool never launches the backend, runs inspected code/install scripts, installs packages, or changes files.

The report lists project and installed non-development lockfile package candidates, source references with line numbers, runtime diagnostics, native/WASM assets and subprocess hints. `unresolved` records missing/computed inputs, package resolution uncertainty, native loading limits and scan failures. `limits` explains static-analysis gaps. Existing native build outputs are candidates only; stale outputs are not approved artifacts. Missing installations are reported rather than downloaded.

This is a broad candidate scan, not a proven reachable backend graph. Type-only references are marked where declaration syntax identifies them. CommonJS package resolution is an inspection hint and may differ from ESM/custom-loader behavior. C#/PowerShell analysis is heuristic, and wrappers/aliases, DLL search, generated code, WASM selection, subprocess arguments and external system runtimes need manual review. Default bounds are 20,000 files and 2 MiB per analyzed text file; hitting a bound explicitly reports partial analysis. Symlinks/junctions are not followed.

`typeOnly` records explicit declaration-level type-only syntax, not complete semantic usage. Ordinary imports inside `.d.ts` files may remain `typeOnly:false`; inline type specifiers, type-only use, `typeof` queries and `ReturnType` do not automatically reclassify those records. Neither a resolved CommonJS target nor `typeOnly:false` proves JavaScript emission, runtime execution or cross-loader equivalence.

Every report declares `informationalOnly: true`, `productionAuthority: false`, `completeVerification: false` and an unapproved diagnostic runtime. No report can establish provenance, grant trust, authorize a release or enable an operation. No hashes/signatures are produced. Inspection is not protected against concurrent file mutation. Production composition and safety gates do not consume the report.

Focused tests: `node --import tsx --test src/test/dependency_inventory.test.ts`.

## Provisional roles and entrypoint reachability

The report declares its explicit roots in `entrypoints`. Defaults are production backend startup and server, frontend `src/main.tsx`, build identity, development inventory, and the three smoke/receive test scripts. These are declared analysis roles, not evidence those scripts execute or grant production authority.

Override defaults with repeated `--entry role:relative-path` arguments, for example `node scripts/dependency-inventory.cjs --entry production-backend:src/server/index.ts --entry build:scripts/build-identity.cjs`. The programmatic API accepts `options.entrypoints` (an empty array means no roots).

File `annotation.roles` may contain multiple provisional roles. `reachability.status` is `observed` only when a declared root reaches that file through an inventoried resolved reference path; otherwise it is `unknown`, never excluded. Evidence identifies the originating entrypoint and representative incoming edge. Dynamic imports and module URLs remain conditional candidate references, package resolution remains a hint, and type-only paths are labeled separately. This is observed static reachability, not observed execution. Source annotations on references and unresolved flags describe their source file only, not a proven target.

No roles are inferred from filenames, directory names or installed-package status. Existing candidates, flags, packages and analysis limits are retained. Missing/uninventoried entrypoints are reported separately in `annotationIssues`; annotations do not expand scan coverage or invent subprocess/native-project edges. Original trust-denial fields remain unchanged.

Annotation-only tests: `node --import tsx --test --test-name-pattern=annotations src/test/dependency_inventory.test.ts`.

## Child-process bindings

Subprocess records now include `childProcessBinding.status`: `confirmed` means local lexical provenance from an explicit Node `child_process` import/require was found; `ambiguous` retains name-based hints such as an unrelated `.exec()`. Confirmation does not establish command execution, package integrity or an approved executable.

Named aliases, namespace/default imports, CommonJS namespace/destructured bindings and local aliases are supported. Parameter/block/function shadowing and observed assignments invalidate confirmation. `executableArgument` resolves literal strings and bounded const-string/concatenation chains; computed arguments, environment values, process.execPath, parameters and mutable strings remain computed. Original computed/unresolved evidence is retained even when a constant hint is added. Exec arguments are shell command text; fork arguments identify module inputs. No executable paths or commands are executed or verified.

Wrappers, createRequire, inter-file aliases, indirect mutation and module monkey-patching remain analysis limits. A binding-analysis failure is reported explicitly and keeps ambiguous evidence.

Focused binding tests: `node --import tsx --test --test-name-pattern="child-process bindings" src/test/dependency_inventory.test.ts`.
