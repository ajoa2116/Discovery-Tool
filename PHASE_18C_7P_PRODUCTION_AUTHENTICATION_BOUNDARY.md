# Phase 18C.7P — Production Authentication Boundary

Continued the confirmed session on `codex/post-field-corrections-1` from `07f09bdf3da6d9c644f1be10093ef8a0e284ae39`, without repeating the prior milestone review. Master Blueprint v1.1 and the established security contracts remain the baseline; no standalone blueprint is available in this checkout.

## Entry points and production behavior

`src/server/index.ts` creates the real Express HTTP server on loopback port 3001. Protected operations and reads are under `/api`, including project/device state, discovery, diagnostics, adapter/recovery workflows, credentials, camera workspace controls, tasks, reports, audit and support data. The same HTTP listener accepts `/ws` upgrades for event broadcasts. There are no production inbound WS command handlers.

The shared authentication boundary is installed immediately after existing Host validation and before CORS, JSON parsing, camera routes, report snapshot effects, task middleware and every API router. All API methods, including OPTIONS and HEAD, require authentication. There is no public about/preflight exception or bootstrap/login endpoint. Static UI assets remain available behind existing Host validation and confer no authority.

Production constructs the boundary **without an owner**. Every `/api` request therefore receives a generic no-store 401 before operation middleware; WS upgrades are rejected before subscriptions. Development does not receive an authentication bypass. Existing frontend and smoke clients cannot access the production API in this intermediate state. The currently running application was not restarted.

## Shared owner contract

The boundary has an immutable private owner reference reserved for future trusted server composition. It cannot be set through HTTP, environment credentials, cookies, URL parameters or WS subprotocols. The authorized path is exercised only by trusted synthetic test composition; this is not a verified production handoff.

Authentication requires one exact allowed Host, one exact allowed Origin, one syntactically valid native session Authorization header, no ambient cookie, server-side session validation, and the owner's exact receipt authorization. It retains receipt metadata, not bearer strings. Existing owner checks enforce provisional/active state, receipt identity, monotonic and absolute expiry, logout, and process/IPC loss. Origin/Host alone cannot authenticate a caller. Development Origins require explicit trusted composition and still require an owner.

HTTP output rechecks authority at write/end/header dispatch, independently of expiry timer delivery. Owner revocation destroys pending responses. Finished/closed responses remove their tracking listeners. This prevents late protected responses; it does not claim to cancel physical operations already admitted by a future integration.

WS admission checks exact GET `/ws` with no query, protocol/extension credential fallback or request body. Authority is rechecked after upgrade verification before accepting a subscription and before every outbound send. Owner revocation terminates subscriptions synchronously; a bounded sweep detects expiry without client activity. Dispatch also checks elapsed expiry before any timer callback. Completed sockets remove their tracking entries; boundary shutdown clears the sweep and owner listener.

Subscription limits are two clients, 256-byte inbound payloads, disabled compression, receive-only events, at most one event in flight per client, and a 256 KiB outbound event/buffer ceiling. Inbound commands/pings close subscriptions. Existing route, body and field-safety restrictions remain in place behind the new gate.

## Missing prerequisites

The production launcher currently starts a plain HTTP backend without a verified companion owner. The proven native probe accepts only fixed isolated pinned-TLS fixture destinations and synthetic operations. It cannot simply be pointed at production or used to forward credentials through Vite.

Before supplying a real owner, implement a verified unelevated launcher/private handoff tied to the intended backend instance and its pinned transport identity; implement the native production request/event transport with approved destinations and Origin policy while keeping session secrets outside renderer/browser JavaScript; and integrate cooperative operation-lifetime cancellation/rechecks into handlers that can outlive revocation. An HTTP response closing does not undo a device write or cancel an uncooperative handler. No standalone authority, temporary token, browser-accessible secret, public registration endpoint or fallback was introduced.

## Validation

- Focused security run: **56 passed**, zero failed/cancelled/skipped, 8.4 seconds. Files: `production_authentication_boundary`, `http_host_validation`, `websocket_host_validation`, `vite_websocket_proxy`, `companion_boundary_timing`, and `application_session_authority` tests. Includes **17 new boundary tests**, raw HTTP/WS duplicate headers, pre-middleware denial, provisional/foreign sessions, exact Origin/path checks, revocation/output races and resource limits. Owner tests use the established trusted private-channel model; wire tests use only ephemeral loopback listeners. Production server initialization is checked by registration assertions, not launched.
- Camera/field checks: **5 Node test entries passed**, including three camera route safety tests and two script-style test files. Field preparation made **57** successful checks; field workflow made **76** successful checks with injected adapter/services, without changing real adapters or launching real cameras.
- Independent `npx tsc --noEmit` passed. `npm run build` passed TypeScript, Vite (1,621 modules) and deterministic build identity generation. Browser asset hashes are unchanged.
- Early tests exposed client-close versus server-close observation ordering; tests now await actual server socket closure. TypeScript also caught overly broad inferred header fixture unions, corrected with explicit test types. Final affected tests and compilation passed.
- Diff checks passed. UI/core, native hosts/IPC, adapter implementation, launchers/scripts, Vite configuration and package files are unchanged. No full regression, native rebuild, production launch/restart or network-setting change was performed.

## Delivery

Files: shared production authentication boundary, production server registration/broadcast integration, focused boundary tests, updated production WS registration assertion, and this report. Existing Host-only transport unit fixtures remain Host-policy tests and are not presented as authenticated production connections.

Commit message: **Gate production API and WebSocket authentication**.

STOP after Phase 18C.7P. Production owner attachment and transport integration remain blocked on the prerequisites above.
