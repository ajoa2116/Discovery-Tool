# Phase 18C.7T — five outside-backend caller source/build scope

Non-executing extension of `src/test/support/application_caller_mapping.cjs`.
Master Blueprint v1.1 remains authoritative; Phase 18C.7T remains incomplete.
No application build, application import, generated execution, staging adoption,
runtime trust, signing approval or production authorization is established.

## Current source boundary

The existing caller mapping's five outside-backend occurrences now have a
separate opt-in current-source descriptor in the same evidence helper. It reuses
the existing byte/identity observer, content hashing, immutable results and
one-use/sticky-denial assessment pattern. It does not run a dependency inventory
or import the historical archive. The historical 39/34 mapping is not revalidated
or silently updated by this descriptor.

All chains begin with the root `index.html` module script targeting
`src/ui/main.tsx`, whose default `App` import has an observed JSX use.

| Caller | Observed source consumer chain after main | Original island import |
| --- | --- | --- |
| `src/shared/device_sort.ts` | App → MasterDeviceTable → sortDevices call | `./address_validation.ts`: ipv4Number |
| `src/shared/pair_adapter.ts` | App → pairAdapterInterfaces call | `./address_validation.ts`: prefixMask |
| `src/ui/App.tsx` | App JSX use in main | `../shared/address_validation.ts`: prefixMask |
| `src/ui/components/DeviceRemovalDialog.tsx` | App → MasterDeviceTable → DeviceRemovalDialog JSX | `../../shared/identity_policy.ts`: hasIdentity |
| `src/ui/components/LegacyOnboardModal.tsx` | App → LegacyOnboardModal JSX | `../../shared/address_validation.ts`: normalizeIPv4, normalizeManualMac |

Fourteen fixed inputs cover these sources, main/table, both original island
targets, HTML, package.json, tsconfig.json, vite.config.ts and build-identity.cjs.
Each assessment binds current file identities, sizes and hashes, exact import
occurrences/bindings, target export declarations and consumer call/JSX syntax.
Original inputs are measured again after inspection. These are sequential
observations, not pinned-object consumption or authenticity guarantees.

The declared build command is `tsc && vite build && node scripts/build-identity.cjs`.
The inspected TypeScript configuration includes `src` with `noEmit: true`; Vite's
declarative configuration uses the React plugin and has no explicit build entry
or per-source output map. The post-build script is measured but never imported
or run. Tool resolution and plugin execution remain unverified.

Every caller's generated destination, backend destination and required facade
remain null. Source reachability is not emitted chunk correspondence, runtime
equivalence, complete transitive closure or proof that these are the only
consumers. Changed or unsupported build shapes fail closed for fresh review.

## Focused validation and limits

The dedicated static fixture exercises current repository inputs and independent
copies of only these 14 files. Negative cases cover missing/duplicate/substituted
callers, source/target measurement changes, altered imports/consumer chains,
unsupported HTML/build configuration, invented output mappings or equivalence,
historical-admission reuse, false reduced counts, and authority claims. Inspection
of a copied source containing an explicit throw demonstrates it is not executed.
Success remains `blocked`; repeated assessment, repaired denial or reused owner
cannot grant admission. Existing path-specifier checks remain unchanged.

Recorded focused invocation: `node --test --test-concurrency=1
src/test/application_caller_source_scope.test.cjs
src/test/application_caller_specifier.test.cjs` — **46/46 passed**: 42 new cases
(two positive, 40 denial), their parent and three existing specifier tests.
Both changed/new CJS syntax checks and `tsc --noEmit` passed. Original 14 input
observations matched after the cases; all fresh fixture roots were removed,
instrumentation restored and forbidden transport/process activity was zero.
An initial run exposed unsupported exported-constant declarations in the new
AST check before any fixture allocation; that check was corrected. A subsequent
44-entry run passed before two additional HTML denial cases were added; these
invocations are not added together as independent coverage. No historical
archive-backed mapping suite, application build or runtime equivalence test ran.

The authoritative staging baseline remains **825 files**, ceiling **64**, achieved
payload count unknown and ceiling unmet. No unresolved dependency is discharged.
Existing global diagnostics and historical source/compile evidence remain intact;
fresh source measurements do not inherit their admission or claim their freshness.
Native mapped-image backing, executable dependency closure, runtime/compiler
approval, generated-byte equivalence/admission and production lifecycle integration
remain separate blockers. Production API/WebSocket default-deny, authentication,
TLS, native/camera security and release gates are unchanged. No protected historical
fixture directory is accessed. No staging, commit or remote operation is authorized.
