# Local metadata: isolated authenticated HTTP integration

October 28, 2026, Laptop 1. Branch `codex/post-field-corrections-1`, committed HEAD
`27d6127400a6c0f00453fb61579bd824ab509c04`. Master Blueprint v1.1 and existing
Phase 18C.7T restrictions remain authoritative.

## Files and preservation

Added only `src/test/local_metadata_authenticated_http.test.ts` and this report.
The four pre-existing extraction files were preserved byte-for-byte; before/after
SHA-256 checks matched:

| Existing file | SHA-256 |
| --- | --- |
| `src/server/backend_application.ts` | `4f4d7f312570309f58bbe90c6bf90b9c93c298b5860739b02b2aaff8b1b54191` |
| `src/test/metadata_write_context.test.ts` | `1bfc11ff348da563c97b7ad5af09fbef099e50606c3a67771765238b45f69a83` |
| `src/server/local_metadata_route.ts` | `c73a3851632f8cdb880a58bf98a6ce108eca7b6516bece2107bf0c1c1a7436ca` |
| `UI_TEST_001_METADATA_ROUTE_EXTRACTION_2026_10_28.md` | `bc621cdda886f0374cf37da74ac9c6e4f27d20f40efd93469cc97040e7157730` |

No runtime, dependency, production authentication or prior-test implementation
changed. The local working tree now contains the original four changes plus
these two additions. Nothing was staged or committed.

## Authentication and HTTP harness

The test mounts the exact `registerLocalMetadataRoute` export with a real
`LegacyConfigurationBoundary` and `SiteProjectDatabase('ISOLATED_TEST')`.
`validateHttpHost`, real `ProductionAuthenticationBoundary.http`, CORS and the
Express JSON parser precede the shared registration. Production composition is
read as text only: its one registration remains after config GET and before PTZ
POST, behind unchanged default-deny authentication.

Authentication reuses the documented trusted private-channel model from
`src/test/production_authentication_boundary.test.ts` and the shared-owner contract
in `PHASE_18C_7P_PRODUCTION_AUTHENTICATION_BOUNDARY.md`. As in those tests, the
existing private constructor test seam uses `Reflect.construct` with a synthetic
`CompanionLifetime`; actual bootstrap issuance, provisional session delivery and
activation run through `CompanionBootstrapAuthority`. Bearer values are generated
by the real authority and retained only in the private test closure. A separate
active fixture owner supplies the foreign-session negative case. No credentials,
owner setters, authentication bypasses or production seams were invented.

One strictly owned ephemeral IPv4 loopback listener exercises actual HTTP header
processing, middleware and Express JSON parsing, following the existing boundary
wire-test model. It never binds production port 3001. Requests connect only to
that listener; the exact `localhost:3001` Host and Origin are the existing
documented boundary fixture headers. A planned-request ledger and method/path/
remote-address checks reject unexpected traffic; no WS server is created.
Storage is process-local and synthetic, with documentation-range addresses and
two stable identities sharing one address. Save-content/reopen operations use
JSON strings in memory, not customer projects or disk storage.

This proves the real authentication middleware and shared route over HTTP using
the authorized synthetic owner seam. It does not prove real native private-channel
or TLS identity, a production handoff, browser-to-backend transport, or production
API admission. No native launcher or full backend was constructed or activated.

## Final per-case results

One top-level integration test contains 22 subcases. There are 21 HTTP requests;
the remaining subcase statically checks unchanged production registration order.
All passed; zero failed, blocked, cancelled or skipped in the final run.

| Case | Result |
| --- | --- |
| Current generation, exact Name/Location/Notes | PASS, 200 |
| Same-IP distinct identity, neighbor-only update | PASS, 200 |
| Absent body | PASS, typed 409 |
| Missing context | PASS, typed 409 |
| Null context | PASS, typed 409 |
| Array context | PASS, typed 409 |
| Empty context | PASS, typed 409 |
| Wrong context version | PASS, typed 409 |
| Extra context field | PASS, typed 409 |
| Malformed generation | PASS, typed 409 |
| Physical configuration payload | PASS, 410 UNSUPPORTED |
| Non-string metadata | PASS, 400 UNAVAILABLE |
| Unknown identity with valid context | PASS, 404 UNAVAILABLE |
| A context in replacement B, reused device ID/address | PASS, typed 409 |
| Fresh B context with reused ID | PASS, 200 |
| A to B to A with original context | PASS, typed 409 |
| Same-project reopen with prior context | PASS, typed 409 |
| Fresh reopened A context | PASS, 200 |
| Missing authentication, otherwise valid metadata | PASS, 401 |
| Missing authentication and missing generation | PASS, 401 before metadata validation |
| Real session from foreign fixture owner | PASS, 401 |
| Original production route position and default-deny construction | PASS, static |

The 11 generation denials assert the entire exact typed 409 body, including
`status: CONFLICT`, `code: METADATA_PROJECT_CONFLICT` and actionable message.
All responses assert JSON and `Cache-Control: no-store`. Success cases check
exact metadata, unchanged other devices, history growth, dirty state, stable
generation, one success audit and one matching broadcast. Broadcast device
comparison explicitly uses its HTTP JSON projection: optional `undefined`
properties exist in memory but are omitted on the wire.

## Denial and cleanup evidence

For all 17 rejected requests, a clean in-memory save-content baseline establishes
`dirty: false` before the request. Complete serialized session/history/audit/
broadcast snapshots are identical afterward. Exact error bodies contain no device
or success acknowledgment. Generation and metadata-validation denials occur
before identity lookup; the unknown-ID 404 performs one lookup without mutation.
All three authentication denials leave both admitted-handler and metadata-boundary
call counts unchanged, independently of project-generation validity.

Final fixture telemetry:

```json
{"casesPassed":22,"deniedWithoutEffects":17,"requests":21,"unexpectedRequests":0,"listenersRemaining":0,"socketsRemaining":0,"nativeChildren":0,"temporaryRoots":0,"projectFiles":0}
```

Cleanup disposes authentication, closes the owned listener, destroys and awaits
every tracked socket's close event, disposes both synthetic owners, verifies
their ended lifetimes and confirms the authentication abort listener is removed.
The test runner itself exits normally. No companion/helper/browser processes or
temporary roots were created. Protected historical sessions were not accessed.

## Validation history and limits

Final focused command, with process-scoped `TSX_DISABLE_CACHE=1`:
`node --import tsx --test src/test/local_metadata_authenticated_http.test.ts`.
Node reports 23 passed (22 subcases plus their parent), zero failed/cancelled/
skipped, exit 0. These are not 23 separate HTTP cases or a broader regression run.
`node node_modules/typescript/bin/tsc --noEmit --pretty false` completed with exit 0.
Whitespace checks passed. Prior extraction suites were not repeated.

The initial run exposed four test-only JSON-versus-in-memory comparison errors
and a cleanup assertion that ran before the final socket-close notification.
The harness now compares the explicit JSON projection and awaits all socket
closures. A subsequent run passed; the final run above additionally strengthened
every denial to start from a clean dirty-state baseline. Counts are not summed
across those runs. No route/authentication behavior or safety assertion was
removed to obtain a pass.

No production backend, generated bundle, external network, discovery, multicast,
camera operation, native owner, persistent project file, protected session or Git
remote was used. Phase 18C.7T remains incomplete. Production API/WebSocket
default-deny, native security gates, authoritative 825-file baseline, unresolved
records and unchanged 64-file ceiling remain untouched.

## One smallest next task

Review the six-file local change set for an explicitly authorized local checkpoint;
no automatic commit is performed.
