# Local metadata POST: behavior-preserving registration extraction

October 28, 2026, Laptop 1. Branch `codex/post-field-corrections-1`.
Starting HEAD `27d6127400a6c0f00453fb61579bd824ab509c04`; initial tree clean.
Master Blueprint v1.1 and existing Phase 18C.7T contracts remain the baseline.

## Scope

Four files only:

- Added `src/server/local_metadata_route.ts`: exports
  `registerLocalMetadataRoute(app, dependencies): void`, registering exactly one
  existing POST `/api/device/:identifier/config`.
- Modified `src/server/backend_application.ts`: replaces the inline POST with
  that registration, in the same position after config GET and before PTZ POST.
- Modified `src/test/metadata_write_context.test.ts`: invokes the real shared
  registration against a recording app, then its registered callback against
  request/response doubles and isolated in-memory storage. Removes runtime AST
  extraction/transpilation/VM execution; AST inspection remains static only.
- Added this evidence document; earlier reports remain historical evidence.

Dependencies are limited to `projectDb.getProject`,
`legacyConfigurationBoundary.updateLocalMetadata`, `logAudit` and `broadcast`.
Production passes its existing collaborators; the audit adapter preserves the
existing `appStateDb.logAudit` receiver. No authorization/owner injection, toggle,
listener, launcher, duplicate POST, additional endpoint or standalone handler
export was introduced. The registration function returns no capability/authority.

Production authentication construction and middleware, Host checks, JSON parser,
backend lifecycle and the config GET remain unchanged. Production mounts the
registration after its existing authentication middleware. Mounting the shared
function elsewhere does not itself provide authentication; future test composition
must explicitly use the existing authenticated fixture middleware.

## Preservation checks

The callback's normalized TypeScript AST matches the pre-extraction committed
handler, with only `appStateDb.logAudit` renamed to the explicit `logAudit`
collaborator. SHA-256 of that normalized baseline:
`8d9bf79f0bd7fb27377e7858fd8bc1b221739204c285bd7acbbc751dbdfa3f4f`.
This is a structural regression check, not artifact admission or execution authority.

Existing 28 ownership checks remain, including synchronous generation validation,
409 conflict before identity lookup/mutation/success effects, exact string values,
same-IP identity separation, stale project generations and physical-field denial.
Six additional checks cover single registration/no returned authority, the handler
baseline, absent-body conflict, success audit/broadcast/ack ordering and contents,
and generic Error/non-Error response semantics. Existing 400/404/410 paths remain.

## Focused validation

| Exact command | Result |
| --- | --- |
| `node --import tsx src/test/metadata_write_context.test.ts` | 34 passed, 0 failed |
| `node --import tsx src/test/truthful_configuration_boundary.test.ts` | 20 passed, 0 failed |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Final exit 0 |
| `git diff --check` | Passed |

The test scripts ran with process-scoped `TSX_DISABLE_CACHE=1`, once each. An
initial TypeScript check flagged two partial request doubles; explicit test-only
`unknown` casts corrected the typing without changing runtime code or assertions.
The final typecheck was rerun; behavioral tests were not unnecessarily repeated.

No HTTP requests, server construction, listeners, child processes, temporary roots,
project files or camera operations were used. Cleanup count is zero because none
of those resources were allocated. Protected historical sessions were untouched.
Prior mounted-App results were reused, not described as freshly validated.

## Limits and next task

This verifies the actual shared registration/handler through non-network doubles
and checks production mounting structurally. It does not exercise Express HTTP
parsing or authentication at runtime. The authenticated HTTP integration suite
was deliberately not implemented or run in this task.

Next task: separately authorize one isolated authenticated HTTP integration test
mounting this same registration with isolated storage behind the existing real
authentication middleware/private-channel fixture model, without production
backend construction or authentication injection into production.

No saved schema, authentication/TLS/native ownership, default-deny, release policy,
staging selection or camera gate changed. Phase 18C.7T remains incomplete; the
authoritative 825-file baseline, unresolved records and 64-file ceiling remain.
No commit or remote operation.

## Interrupted-task resumption verification — October 28, 2026

Resumed on Laptop 1 at the expected committed HEAD
`27d6127400a6c0f00453fb61579bd824ab509c04` and branch
`codex/post-field-corrections-1`. The working tree contained exactly the four
files listed above: modified backend composition and metadata-context test,
untracked shared route and this report. They were preserved in place.

The implementation was already complete, not a partial extraction. No runtime
source or test correction was necessary during resumption. Only this report was
appended to record the verification and its limits.

Fresh read-only static verification compared the actual committed HEAD callback
with the extracted callback using the TypeScript AST printer. The callbacks
matched after the sole intended `appStateDb.logAudit` to `logAudit` substitution;
the independently recomputed baseline SHA-256 matched the value above. Replacing
the new import and registration with the committed import and inline statement
reconstructed the entire committed backend source exactly after CRLF/LF
normalization. This confirms unchanged surrounding middleware, dependencies,
route position and precedence, rather than relying only on substring ordering.
There is one shared POST registration, one production call and no remaining
inline POST. The emitted shared-route syntax had zero diagnostics and its only
runtime import was the existing typed metadata-conflict module; the storage,
boundary, Express and DTO imports are type-only. No emitted code was executed.

The unchanged boundary still synchronously validates project-generation context
before identity lookup or metadata mutation, rejects physical configuration and
invalid metadata, and retains exact string values. Typed 409 handling and the
existing 400/404/410 mappings, audit receiver, audit-before-broadcast-before-response
sequence and payloads are preserved by the callback comparison and inspection.
Production still constructs its authentication boundary without an owner and
registers this route behind the existing API authentication middleware, after
config GET and before PTZ POST. No authentication injection or bypass was added.

Validation accounting: the previously recorded 34/34 metadata-context checks,
20/20 truthful-boundary checks and final TypeScript exit 0 above are reused as
pre-interruption evidence, not claimed as fresh executions or independently
recovered process logs. No source/test edits invalidated those recorded results.
Fresh verification consisted only of the committed-source/AST comparison,
shared-route syntax/import inspection and `git diff --check` (passed). No focused
behavioral suite or full-project typecheck was unnecessarily repeated. Actual
Express parsing and authenticated HTTP behavior remain unverified by this
extraction task; the existing limits and separately authorized next task above
remain applicable.

No backend/listener, camera/provider, external network operation, generated bundle
or protected historical session was used. No Git staging, commit or remote
operation occurred. The exact four-file inventory remains; production API/WS
default-deny, native security gates, Phase 18C.7T incomplete status, authoritative
825-file baseline and unchanged 64-file ceiling remain untouched.
