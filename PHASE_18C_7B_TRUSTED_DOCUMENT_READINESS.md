# Phase 18C.7B — Trusted companion document readiness

Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `42992b79258456dec7429631e8cbb4a4b415de89`.

## Isolated trusted fixture

ApplicationCompanion now hosts its own WebView2 instance using the pinned `Microsoft.Web.WebView2` version `1.0.4191.47` and a separate package lock. It has no CameraBrowserHost project/source links, camera protocol, React integration, launcher integration, backend HTTP/WS integration, or authentication composition. No bootstrap or session authority is delivered.

The only approved document URL is exactly `https://companion-fixture.invalid/ready.html`. WebView2 receives a fixed compiled fixture response through `WebResourceRequested`; there is no HTTP listener, CLI URL, arbitrary file, or external fixture server. Query/fragment, scheme, host, path and user-info variants are refused. Both external redirects and redirects back to the identical approved URL are rejected. Only the initial top-level navigation is accepted. Reload or subsequent navigation invalidates the lifetime; source changes away from the approved URL also fail closed, including same-document fragment changes.

The fixed fixture's inline script is the sole document bridge. Host objects, developer tools, default context menus, script dialogs, password saving and autofill are disabled. Popups are marked handled and end readiness. Any frame creation ends readiness, with frame navigation cancelled; no frame message handler is installed. Requests outside the approved document are answered locally with 403. CSP denies external scripts, connections, frames, forms and base-URL changes; the adversarial frame fixture deliberately permits `about:` frames in CSP solely to exercise the independent native frame rejection. There is no general-purpose URL/script or native-command bridge.

## Readiness and loss semantics

`DocumentReadiness` owns an irreversible state machine: Created → Navigating → Challenged → Ready, with any rejection/loss ending in Terminal. An initial allowed navigation establishes a generation and WebView2 navigation ID. Only a matching successful `NavigationCompleted`, still at the exact approved source, can create a fresh random 256-bit nonce and a 2.5-second challenge. Navigation IDs travel as strings to avoid JavaScript integer precision loss. The host posts the challenge only to the top-level document; it does not inject global document-created scripts or expose secrets.

A response is accepted once, before the monotonic deadline, only while Challenged. The handler checks both message sender source and current top-level source, exact property set, version/type, generation, navigation ID and nonce. Duplicate keys, extra/missing fields, wrong types, malformed/nested/oversized messages, premature replies, stale replies and replay fail closed. Rejection invalidates the generation and clears the nonce; no late event can restore readiness. The companion sends its private READY only after this validation. The supervisor retains the Phase 18C.7A lifetime/ownership contract; its startup bound is now 16 seconds to accommodate WebView2 initialization, while the native total document-readiness deadline is 12 seconds and the challenge deadline remains 2.5 seconds.

Navigation, popup, frame, renderer/browser process failure, private-channel loss or cancellation immediately invalidates native readiness and stops heartbeats. A bounded, allowlisted FAILED/FAILURE_ACK exchange reports the nonsecret rejection cause before WebView disposal. The supervisor exposes an allowlisted failure code with lifetime loss or startup rejection. This reporting acknowledgment neither activates authority nor permits retries. Atomic Job-list creation, suspended launch, unelevated token checks, private pipe ACLs, reciprocal child identity, process handles and bounded shutdown remain intact.

Platform references: [Microsoft WebView2 security guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security), [top-level web-message behavior](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.webmessagereceived?view=webview2-dotnet-1.0.4022.49).

## Validation and limitations

The final focused suite contains **34 Windows lifecycle/readiness/security tests**, including **76 native policy assertions** in its native document-policy test. Actual WebView2 cases cover successful persistent readiness, nonce/generation/navigation-ID validation, extra/malformed/oversized/premature messages, challenge timeout/late response, unapproved navigation, external and same-URL redirects, popup/frame rejection, replay, reload, fragment changes, and actual renderer crash via the fixed native `Page.crash` fixture action. Foreign-source, duplicate-key, exact-deadline, stale-completion and irreversible-state checks run against the native policy independently of WebView event timing. Existing cancellation, PID/ACL, independent-lifetime, Job-assignment failure, parent EOF and broker/companion death checks remain. Suite cleanup inventories both owned application processes and WebView2 processes using the fixture's dedicated profile namespace.

Validation history: the first expanded run rejected two adversarial documents but exposed an exit-before-diagnostic race. Private failure acknowledgment fixed that race. A later renderer crash exposed disposal-before-notification delay; invalidation now occurs first, failure reporting precedes WebView disposal, and a targeted renderer/fragment/policy run passed. No rejection assertion was relaxed. The final complete suite and final build results are recorded at closeout below.

This validates a fixed intercepted document, not Vite, production assets, arbitrary application scripts, authentication, or the complete browser network surface. `NavigationCompleted` by itself is never readiness. Same-user debugging/injection, development executable replacement and administrator compromise remain outside this proof. Actual elevated-parent execution was not attempted; token rejection remains fail closed. Each fixture uses a distinct InPrivate WebView2 environment under the temporary `CCTVApplicationCompanion` profile namespace. Browser process cleanup is checked, but leftover profile directories/crash metadata are not securely deleted or claimed absent. Deployment/profile cleanup and capability delivery remain later work.

## Closeout

Final results: **34/34 Windows tests passed, zero failures/skips**, including all 76 native policy assertions. The final suite confirmed no newly owned companion or fixture WebView2 processes remained. Final TypeScript `--noEmit` passed. Production TypeScript/Vite/build-identity generation passed. Release builds for ApplicationCompanion, BootstrapTransport and CameraBrowserHost passed with zero warnings/errors. Working and staged diff checks are required before the commit.

Changed files: ApplicationCompanion project/lock, `DocumentReadiness.cs`, `DocumentTests.cs`, `FixtureDocument.cs`, `FixtureWindow.cs`, `Program.cs`, the isolated Node lifetime supervisor, its Windows test suite, and this report. Existing camera code, bootstrap transport, React UI, launchers and production HTTP/WS/authentication composition remain unchanged. No running application restart, camera contact or network discovery was performed.

Commit message: **Add trusted companion document readiness**.

Stop after Phase 18C.7B. Do not begin Phase 18C.7C.
