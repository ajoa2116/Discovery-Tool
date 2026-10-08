# Phase 18C.7G — Session boundary hardening

Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `5758ec186039376babb9b52877518c620482f7d8`. The checkpoint matched and the working tree was clean before edits. Master Blueprint v1.1 remains authoritative. No standalone blueprint file exists in this checkout, as recorded by earlier milestones; this phase preserves the implemented baseline contracts and introduces no product integration.

## Logout and ownership

The owner now holds its verified transport in an ECMAScript private field. Its public, frozen `companion` facade exposes lifecycle observations, owner-controlled logout and shutdown, but no bootstrap redemption, session delivery or activation mutators. Direct `owner.companion.logoutSession()` delegates to `owner.logout()`, revoking server authority synchronously before any asynchronous native acknowledgment. Successful low-level native logout also ends the supervisor lifetime, ensuring an independently composed authority observes loss. Replayed logout/activation/grant operations remain denied; owner logout still waits for bounded native acknowledgment and process cleanup.

The server authority remains the only authorization source. Native `IsActive` and fixture status grant no application operation. The trusted server proof API remains private to server composition; no credentials are delivered to JavaScript or web storage. Native wire schemas, generation/receipt/nonce/digest/expiry binding, single-use state, child identity, unelevated execution and Job supervision remain intact.

## Time bounds

`CompanionDeadline` tracks a fixed elapsed deadline and an optional absolute expiry. Wall rollback cannot extend the elapsed lifetime; a forward wall change can expire a grant earlier. Invalid, throwing or regressing elapsed clocks fail closed, and terminal deadlines cannot revive. Production elapsed time uses Node's `performance.now()`; injected clocks exist only as trusted test seams.

Heartbeat loss uses elapsed time, with the existing 4.5-second bound and 500 ms polling. The synchronous alive check also enforces the deadline before owner authorization, and late idle heartbeats cannot renew an expired lease. Startup and operation responses are checked against elapsed deadlines before being accepted, independently of timer callback ordering. An outstanding private operation retains its existing eight-second bound rather than depending on idle heartbeats.

The server session deadline begins when provisional authority is issued, covers delivery/activation, and is never reset by final acknowledgment. A 250 ms watcher proactively revokes pending or active authority, including stalled activation. Validation also checks the elapsed and absolute bounds synchronously, so a delayed timer cannot extend authorization. Timer/clock failure disposes authority and ends the companion. These are event-loop bounds, not a claim that code can run while Windows or the process is suspended.

Logout during pending activation terminates the owner and prevents a late acknowledgment from creating authority. Existing Job supervision and bounded termination behavior remain unchanged.

## Validation scope and limits

Deterministic trusted-transport tests cover pending native activation without server authorization, elapsed expiry during activation, late acknowledgment, cancellation, immediate direct logout, logout replay/cancellation, wall rollback, absolute expiry, and invalid or throwing clocks. Actual Windows tests cover direct owner/native logout, a broker stalled after session activation, rollback with an elapsed heartbeat deadline, autonomous heartbeat loss, existing native session/bootstrap security cases, process loss and owned process cleanup. Low-level wire tests now construct their own isolated authority/transport fixture instead of accessing private owner mutators.

No React, HTTP/WS, launcher, camera IPC or production authentication integration was added. Production safety gates and Windows identity/Job primitives are unchanged. The running application was not restarted; adapters and cameras were not operated. Elevated-parent execution, deployment integrity, same-user injection, secure managed-string erasure and secure deletion of temporary browser profiles remain outside this proof. HTTP/WS integration remains deferred.

Initial regression runs passed their test cases but failed the final WebView2 cleanup probe. Investigation while the runner was alive showed CIM reporting fixture PIDs that `System.Diagnostics.Process.GetProcessById` identified as no longer running. The probe now intersects profile-qualified CIM records with live process enumeration; it still requires zero surviving owned runtime processes. Speculative native teardown changes were removed. Final validation results follow below.

- Focused Windows lifecycle/readiness/session, deterministic boundary timing, server authority, async transport and restricted bootstrap transport: **149 passed, zero failed or skipped**. Live owned broker/UI/runtime cleanup assertions passed.
- `npm run build`: TypeScript and Vite production build passed (1,621 modules; deterministic build identity generated).
- Release builds of ApplicationCompanion, BootstrapTransport and CameraBrowserHost: passed, zero warnings or errors.
- `git diff --check`: passed. Excluded product integration and existing transport/camera paths have no changes.

Commit message: **Harden companion session boundaries**.

STOP after Phase 18C.7G. Do not begin Phase 18C.7H.
