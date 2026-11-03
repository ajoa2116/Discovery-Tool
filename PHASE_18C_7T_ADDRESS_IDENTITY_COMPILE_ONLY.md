# Phase 18C.7T — address/identity compile-only fixture

Master Blueprint v1.1 remains authoritative. This is an isolated, opt-in
compiler observation, not execution approval, runtime equivalence, dependency
removability, staging admission, signing approval or production trust.

## Fixed boundary

The fixture reuses the existing application-island member list, byte-catalog
file observer, generated-artifact content hashing and generic non-authorizing
metadata record. It does not invoke the historical island/archive-backed
assessment or inspect protected historical fixture directories. The generic
record uses the existing synthetic metadata profile; it is not a new admitted
compiler profile or a release manifest.

Exactly two application sources are compiled at their original paths:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| src/shared/address_validation.ts | 1168 | e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc |
| src/shared/identity_policy.ts | 3176 | b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614 |

An in-memory 100-byte `island-entry.ts` re-exports these two modules. It is a
fixture input, not an additional proposed shipped file. Its contribution is zero
bytes in the output. The compiler graph reports address_validation importing
identity_policy. It also reports identity_policy's `../types/index.ts` reference
as external in input metadata. That target is not incorporated and there are no
output imports. This source-only observation is retained, not reclassified as a
discharged runtime dependency.

Installed esbuild 0.28.2 runs through its asynchronous service API using the
measured local win32-x64 executable, SHA-256
`c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef`.
Node is v24.19.0. Configuration is bundle:true, format:esm, platform:node,
target:es2022, treeShaking:false, write:false, metafile:true, legalComments:inline,
with the current repository tsconfig. ES2022 agrees with that configuration.
This is an experimental bundle configuration, not the production stager's
per-source transpilation or the frontend Vite build.

Before/after observations bind sources, package/lock/tsconfig, esbuild API and
package files, binary/package files and TypeScript parser/package files. Package
and lock versions must agree. These observations do not authenticate upstream
tools, cover all transitive tool inputs or provide pinned-object consumption.

## Measured result

One in-memory JavaScript output, `address-identity.generated.js`: **3634 bytes**,
SHA-256 `4fecf936ef7325855b8ec36a3e35afcb773b720c4a246b1d21a73f41ffa5de6b`.
No emitted code is written, imported or evaluated. The compiler metadata and a
separate AST inspection agree on all 13 exports:

- addressRelationship, ipv4Number, normalizeIPv4, normalizeManualMac, prefixMask
- canonicalAnchor, canonicalMac, conflicts, hasIdentity, mergeAnchors,
  sameIdentity, selectIdentity, sharesAnchor

Compiler-reported output contributions are 929 bytes for address_validation and
2405 for identity_policy. These are compiler attribution metrics, not independent
physical files or proof of behavioral equivalence. Export order, live bindings,
evaluation timing and module/cache identity are not certified by equal names.

## Validation and cleanup

Focused opt-in invocation:

```powershell
$env:DISCOVERY_ISLAND_COMPILE='1'
node --test --test-concurrency=1 src/test/application_island_compile.test.cjs
```

The fixture checks one compiler child, zero unexpected process requests, zero
network/server attempts and zero outside-write attempts in its instrumented Node
process. Vite and Rollup refusals are neither needed nor exercised. The service
is stopped, its close event awaited, instrumentation/environment restored and
the exact owned temporary root removed after verifying it is empty. No generated
module is retained. The counters are instrumentation evidence, not OS-level
attestation of the native compiler or a complete execution-closure proof.

Negative cases cover substituted source identity/digest, changed compiler/config,
missing exports, unexpected/missing modules, altered edges, extra outputs,
external output imports, zero contributions, false output measurements,
reduction/admission/equivalence claims and discarded caller obligations.
Synthetic failure cases exercise original/frozen error preservation and continued
cleanup after a stop/restoration acknowledgment error; primitive cleanup errors
cannot become success.

Two initial invocations failed an overly strict input-edge assertion: the first
reported the failure and the second exposed the exact source-only types edge.
Both compiled but produced no accepted evidence; both reported zero unexpected
activity and complete cleanup. The assertion was corrected to preserve that
exact edge while still requiring only two incorporated application modules and
no output imports. A subsequent 33-entry run passed, then cleanup coverage was
added; these invocations are not summed as independent coverage.

Final focused invocation: **39/39 passed**, zero failed/skipped/cancelled,
including three parent/top-level entries, 29 negative candidate subcases,
one positive candidate subcase, one resource-cleanup subcase and five synthetic
failure-cleanup subcases. The four synthetic roots and one compiler root were
removed in that invocation. Source/tool/config observations matched after use;
the output measurement above was unchanged. Both CJS syntax checks, TypeScript
`--noEmit` and whitespace checks passed. No broader suite or frontend emission
observation was run.

## Unchanged obligations

The 29 rewritten-caller output identities/reviews remain unresolved historical
requirements, not renewed current evidence. Original imports and sources are
unchanged. Neither original file nor any facade may be removed on this evidence.
The authoritative baseline is 825 files, the ceiling remains 64, achieved/admitted
payload count remains unknown and all unresolved dependency records are retained.
Phase 18C.7T remains incomplete. Native mapped-image identity, executable closure,
compiler/runtime approval and production lifecycle/admission remain separate
blockers. Production API/WebSocket default-deny, native/camera/authentication/TLS
and release gates are unchanged. No staging adoption, commit or remote operation.
