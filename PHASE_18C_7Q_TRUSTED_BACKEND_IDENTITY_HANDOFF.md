# Phase 18C.7Q — Trusted Backend Identity Handoff Foundation

Continued on `codex/post-field-corrections-1` from `e1265165be2501299310d4a06146ee7d5e387a52`. Master Blueprint v1.1 and the existing security contracts remain the baseline, with the previously documented absence of a standalone blueprint in this checkout. No prior milestone review was repeated.

## Scope and guarantees

This is an independently safe, **process-local binding candidate**, not a completed native-to-backend handoff. No verified production launcher/private handoff is available. The new module is deliberately absent from production composition and public routes; it cannot activate the production authentication boundary. Its result explicitly has `productionAuthority: false`.

`createBackendInstanceIdentity` registers an exact live HTTP/HTTPS listener object bound to IPv4 loopback. A private WeakMap carries the listener association. A fresh UUID, process ID and port are diagnostic metadata, not credentials or peer verification. A copied/serialized descriptor, another registered listener, or replacement listener on the same process/port cannot replace the original identity. Listener closure/error permanently terminates that identity; restarting the original listener cannot revive it.

`BackendIdentityHandoff` requires a real private-brand `CompanionBootstrapAuthority` and its exact active session receipt. It invokes the actual prototype validator rather than an injected lookalike method. Existing native owner lifetime rules still apply. It binds exact owner, receipt and listener references using an opaque process-local challenge, and confirms once. Each owner and backend lifetime can be reserved once, including after a failed confirmation or revocation. Matching owner PID/generation or backend PID/port never grants authority. Reentrant construction rechecks reservations, and confirmation publishes consumption before calling liveness clocks or revocation callbacks.

Both pending and confirmed candidates have a ten-second monotonic deadline, additionally shortened by absolute expiry. Clock rollback/nonfinite values fail closed. Confirmation/assertion recheck deadlines synchronously; a 250 ms sweep revokes idle candidates. Owner logout, owner process/channel loss, listener termination, caller cancellation and explicit revocation end candidates. Terminal state is published before abort callbacks, listeners are detached and the sweep cleared. Revocation does not terminate the owner or close unrelated listeners. Reservations are intentionally not released for retry within a lifetime.

There is no wire protocol, transferable proof, bearer-token copy, attachment route or environment credential. Outputs contain only nonsecret identity/session metadata and the explicit false authority flag. Serialization of the challenge carries no proof. Production HTTP/WS authentication, TLS pinning contracts, credential isolation, resource limits and field gates remain unchanged. No React, native IPC, launcher, camera, adapter or production route file changed.

## Validation and evidence limits

- **83 focused tests passed**, zero failures/cancellations/skips. Includes **27 new handoff tests**, plus the existing production boundary (17), session authority (21), deadline/lifecycle (11), HTTP Host (3), WS Host (3), and Vite WS proxy (1) tests.
- New tests begin with valid exact candidates before testing binding/expiry failures. They exercise real private-brand owner objects over the established modeled private transport and actual ephemeral loopback listeners. They demonstrate same-process port reuse after awaited closure, genuine alternate listener/challenge rejection, replay, owner substitution, stale owners, reference-copy rejection, cancellation, pending/bound lifetime loss, reentrant confirmation/construction, and cleanup. Idle expiry must produce the actual abort event before a rejecting watchdog; a stalled candidate cannot pass.
- Native peer verification is modeled, not newly established or exercised against hostile OS processes. These tests prove local reference/lifetime enforcement and absence of production composition. They do not claim arbitrary local processes have been authenticated or an OS trust channel exists.
- `npm run build` passed TypeScript, Vite (1,621 modules) and deterministic build identity generation. Browser asset names remain `index-DBrmYWSu.js` and `index-DETTyMO_.css`. An initial TypeScript narrowing error in the HTTP/HTTPS runtime guard was corrected; final compilation passed.
- Diff whitespace checks passed. Only the new module, its tests and this report changed. No full regression, native build, application restart, adapter change, camera launch or production integration was performed.

## Remaining blockers and residual risks

A verified unelevated launcher must establish a private, bidirectional native-owner/backend channel using kernel-verified peer ownership and launch provenance, bind a fresh backend lifetime/nonce and pinned transport identity, and reject replacement, replay and process loss across that channel. The candidate implemented here is not sufficient evidence for production attachment. It assumes trusted Node composition and cannot defend against malicious code already executing inside that trusted process. It should not be exposed as an HTTP registration API or treated as a native proof because its diagnostic metadata matches.

The existing native transport still supports isolated fixture endpoints, not production requests/events. Production remains default-deny without an owner. Native production request/event transport and cooperative cancellation/rechecks for future physical operations remain prerequisites. TLS pinning was not modified or bypassed; this module does not itself establish TLS identity. Its short-lived candidate expiry is a reservation policy, not a new production session lifetime or an authentication grant.

The next safe integration scope is verified launcher/channel provenance and backend identity attestation, with negative OS peer/substitution tests, before any production authority attachment. No temporary browser credential or bypass is permitted.

## Delivery

Commit message: `Add fail-closed backend identity handoff foundation`. This report is included in that commit. Stop after delivery; do not enable production operations.
