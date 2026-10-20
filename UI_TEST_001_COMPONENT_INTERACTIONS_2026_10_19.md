# UI-TEST-001 — mounted component interactions, 2026-10-19

## Scope and starting point

Laptop 2, `C:\Users\Omar\Documents\Discovery-Tool`, branch
`codex/post-field-corrections-1`, committed HEAD
`bb87abd4dae073cf432b56c7255a87cbaffa0e2b`; working tree initially clean.
Master Blueprint v1.1 and the existing recorded security contracts remain the
baseline. Service-route candidate research remains closed and blocked.

This test mounts the production `DeviceInspectorDrawer`, `SiteSurveyReportModal`
and `MasterDeviceTable` under React 18 StrictMode in installed Microsoft Edge
155.0.4283.45. Assertions use actual DOM clicks, keyboard input, control state and
rendered output, rather than server rendering or pure-state tests. Two synthetic
devices deliberately share an IP but have different stable IDs and locations.

**Current result: one unchanged, unfiltered full-suite invocation passed all 23
cases across A–L, with 0 failures and 0 skips (exit 0).** The component suite now
has a complete passing single-run baseline. Earlier combined evidence, harness
failures and corrections remain recorded below; no application bug was observed.

## Changes and dependency

- `package.json`, `package-lock.json`: exact devDependency `playwright-core@1.56.1`.
  The lockfile adds only that package and its root devDependency reference; no
  existing dependency version changed. No browser was downloaded or installed.
- `src/test/browser/ui_component_interactions.html`: isolated fixture page, with
  no application entrypoint or injected Vite HMR client.
- `src/test/browser/ui_component_interactions.tsx`: actual production components,
  StrictMode, deterministic props, controlled location promises and fixture-only
  selection/filter controls. No production source is modified.
- `src/test/browser/ui_component_interactions.cjs`: bounded Edge driver, one
  loopback-only static Vite listener per invocation, explicit request allowlist,
  controlled report promises, assertions and scoped cleanup.
- This report and the additive UI-TEST-001 update in
  `POST_FIELD_PHASE_8_TECHNICIAN_ATTENTION.md`.

## Interaction evidence

| Group | Cases | Passing mounted behavior | Initial evidence invocation |
| --- | ---: | --- | --- |
| A | 1 | Open editor on A with confirmed Lobby value, no write | Full |
| B | 2 | Cancel and Escape discard draft, preserve Lobby, zero callbacks | Full |
| C | 3 | Unchanged value is a no-op; empty clears; surrounding whitespace survives; stable A ID/value delivered | Full |
| D | 1 | One pending callback; Save/Cancel disabled, Enter does not duplicate; confirmed value changes only after acknowledgment | Full |
| E | 1 | Rejection retains confirmed value, actionable Try again error, successful retry | Full |
| F | 3 | A→B, A→B→A and closing invalidate obsolete location acknowledgment | Full |
| G | 1 | Opening produces effective SELECTED scope, A ID, report information and columns; current preview renders | Full |
| H | 1 | Close releases scroll lock; reopening accepts current response and ignores old response | Full |
| I | 4 | Orientation, column and information changes/reversions, plus selected-ID change disable export until fresh preview | Targeted |
| J | 3 | PDF/CSV/JSON request matches accepted preview request plus accepted timestamp/timezone; inert blob URL, filename, anchor click and revocation | Targeted |
| K | 2 | Older success/error across close/reopen cannot replace newer preview, disable its export or show stale error | Targeted |
| L | 1 | Visible B select-all/clear preserves hidden A; zero-row header stays clear; restored rows show correct checkboxes | Full |

J verifies initiation with inert fixture blobs, not PDF rendering, filesystem
download completion or real CSV/JSON serialization. The anchor hook dispatches
the native DOM click and prevents its download default action, including for the
detached anchor created by the production component. Blob URLs must be fixture
owned and are revoked. C's clearing/whitespace behavior is component behavior;
backend acceptance is outside this test.

## Commands and actual validation chronology

Dependency metadata inspection and installation:

```powershell
npm.cmd view playwright-core@1.56.1 version dist.integrity engines dependencies scripts --json --ignore-scripts --no-audit --no-fund
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 was scoped to installation.
npm.cmd install --save-dev --save-exact playwright-core@1.56.1 --ignore-scripts --no-audit --no-fund --prefer-offline
```

Installation added one package, with scripts disabled. No dependency upgrade
cascade or browser download occurred.

Static validation (exit 0):

```powershell
node --check src/test/browser/ui_component_interactions.cjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
git diff --check
```

The CJS syntax check was also repeated after harness corrections. TypeScript
checked the mounted TSX harness; production builds and unrelated suites were not
run. Untracked text files were separately checked for trailing whitespace and
merge-conflict markers because ordinary `git diff --check` excludes them.

Invocation 1:

```powershell
node src/test/browser/ui_component_interactions.cjs
```

Exit 1 before interactions: 0 passed, 0 case failures, all 12 groups blocked.
The allowlist rejected an unprebundled React JSX development runtime request
before mounting; the expected fixture button timed out. The fix explicitly
prebundled `react/jsx-dev-runtime`; it did not broaden allowed network origins or
permit arbitrary node_modules requests.

Invocation 2, same command: exit 1, **14 passed, 9 failed, 0 skipped**.
A–H and L passed. All nine I/J/K failures were incorrect uppercase accessible-name
selectors (`PDF`/`CSV`/`JSON`); actual accessible text is lowercase, styled uppercase
by CSS. No application source was changed. The preview-ready helper was also
corrected to require an existing enabled pdf button, rather than allowing an
absent button to satisfy a negated optional-chain check. A source inspection
identified that the original document-level download observer would miss the
detached anchor; its hook was corrected before the J rerun.

Invocation 3:

```powershell
$env:UI_INTERACTION_GROUPS = 'I,J,K'
try { node src/test/browser/ui_component_interactions.cjs } finally { Remove-Item Env:UI_INTERACTION_GROUPS -ErrorAction SilentlyContinue }
```

Exit 0, **9 passed, 0 failed**; A–H and L explicitly not executed by filter.
Those 14 passes were reused from invocation 2. At that point available evidence was
23 passing cases, with historical setup/selector failures preserved, rather than
a claim that every attempted invocation passed.

### Invocation 4 — authorized clean full-suite validation

No tests, harness code, application code or dependencies were changed for this
run. Preflight confirmed the expected branch/HEAD, exactly the seven authorized
dirty files, no staged files, and installed `playwright-core@1.56.1`. The runner
passed `node --check src/test/browser/ui_component_interactions.cjs`.

Exact PowerShell invocation (filter removed; prior environment restored):

```powershell
$previousGroups = $env:UI_INTERACTION_GROUPS
$previousDebug = $env:DEBUG
Remove-Item Env:UI_INTERACTION_GROUPS -ErrorAction SilentlyContinue
$env:DEBUG = 'pw:browser'
try {
  node src/test/browser/ui_component_interactions.cjs
  $suiteExit = $LASTEXITCODE
} finally {
  if ($null -eq $previousGroups) { Remove-Item Env:UI_INTERACTION_GROUPS -ErrorAction SilentlyContinue } else { $env:UI_INTERACTION_GROUPS = $previousGroups }
  if ($null -eq $previousDebug) { Remove-Item Env:DEBUG -ErrorAction SilentlyContinue } else { $env:DEBUG = $previousDebug }
}
exit $suiteExit
```

**23 passed, 0 failed, 0 skipped/blocked; exit 0.** Per-group passing counts:
A 1, B 2, C 3, D 1, E 1, F 3, G 1, H 1, I 4, J 3, K 2, L 1; every group's
failed/skipped count is zero. All rows in the interaction table above are now
covered together by this fresh invocation, not merely reused earlier results.

Installed Edge 155.0.4283.45 emitted three native stderr diagnostics from
`chrome\browser\task_manager\providers\fallback_task_provider.cc:126`:
"Every renderer should have at least one task provided by a primary task provider."
These are browser-internal diagnostics, distinct from page-console/React errors.
No page-console error, page exception, unexpected HTTP/fetch request, WebSocket
attempt or fixture callback violation was recorded; `boundary:[]`, `fatal:null`.

Playwright recorded the owned Edge PID 22724 exiting normally with `exitCode=0`,
`signal=null`, followed by completed temporary-directory cleanup. All 23 contexts
closed, React unmounted and scroll ownership checks passed. The listener at
`127.0.0.1:55531` closed (`listening:false`, `address:null`). The exact owned root
`C:\Users\Omar\AppData\Local\Temp\discovery-react-interaction-UsdwQW` was removed:
19 remaining owned files removed, `remainingFixtureRoot:false`,
`cleanupConfirmed:true`, `browserDisconnected:true`, `listenerClosed:true`.
No lingering owned browser was reported; no global process enumeration or
protected-session inspection was performed. Renderer descendants were not
independently enumerated. This does not establish native birth-specific process
ownership or file-to-image identity.

Only this coverage document was edited after the run. Existing test, dependency
and other authorized file hashes were checked unchanged. Final whitespace checks
passed; earlier TypeScript validation was reused because no TSX changed.

## Isolation and cleanup evidence

Vite uses `configFile:false`, `envFile:false`, `proxy:undefined`, middleware mode,
`hmr:false` and `ws:false`. The application Vite configuration and its proxy are
not loaded. An owned HTTP server binds port 0 on `127.0.0.1` only. Browser and
listener checks admit only the fixture page, reviewed frontend source graph/CSS
and the fresh root's dependency cache. Unapproved requests are rejected and
recorded; there is no generic HTTP success fallback. WebSockets/EventSource are
denied, service workers blocked.

The exact preview/export fetch URLs are handled in-page with controlled promises
and inert responses; **no connection to localhost:3001 is made**. All other fetch
origins/methods/paths fail. Unrelated component callbacks throw and record a
violation. The source import graph excludes App/backend entrypoints.

Each invocation allocated a unique root under the resolved local temporary
parent, checking real paths and ancestor redirection/symlinks before use. No
historical fixture directory was read or reused. Each case owns a fresh browser
context; completed cases unmount React, assert scroll ownership released, close
the context and verify it leaves the browser context list. Final cleanup closes
remaining contexts, owned browser and Vite, closes the HTTP server, asserts
`listening === false` and `address() === null`, then removes only its own checked
root. Cleanup failure preserves the root and fails the runner.

| Invocation | Root suffix (`discovery-react-interaction-…`) | Loopback port | Contexts created | Removed files | Final result |
| --- | --- | ---: | ---: | ---: | --- |
| Setup failure | earwFM | 55595 | 1 | 17 | Listener closed, browser disconnected, root absent |
| Full | 7plGE0 | 61352 | 23 | 19 | Listener closed, browser disconnected, root absent |
| I/J/K | j0wmsf | 50232 | 9 | 19 | Listener closed, browser disconnected, root absent |

The initial three roots were under `C:\Users\Omar\AppData\Local\Temp`. The full and targeted
runs reported zero unexpected HTTP/WebSocket/console-error violations. The
initial setup denial was intentional fail-closed enforcement, not a passing
isolation scenario. All three reported `cleanupConfirmed:true` and
`remainingFixtureRoot:false`; no new retained root or listener remains.

Three owned Edge browser launches occurred during the initial implementation. Browser lifecycle cleanup is
Playwright's browser-close/disconnection contract; OS renderer subprocesses were
not globally enumerated, and this is not a birth-specific native process-exit
proof. The final targeted run additionally scoped Node-side temporary
profile/artifact allocation to its owned root. No protected historical owner or
evidence was inspected, signaled or cleaned.

## Limits, status and next step

UI-TEST-001 now has bounded mounted-component interaction evidence. It is **not
fully closed for field readiness**:

- App transport wiring, real location-update acknowledgments/refetch races and
  application-wide selection integration are unverified here. The location
  callback is an injected promise and does not persist or refetch metadata.
- Backend persistence, real API error formats, authentication, report generation
  and downloads remain unverified by these inert fixtures.
- Other report scopes/settings combinations, broader keyboard/accessibility,
  simultaneous modal ownership, and browser/version coverage are not exhaustive.
- No physical camera, native/provider, discovery, TLS field or stress validation
  was performed. No claim about generated-bundle execution or loader admission
  follows from this suite.

Production sources/security policies, API/WebSocket default-deny, native
authentication/TLS/ownership, camera gates, 825-file authoritative payload,
4,736 staging / 882 inventory unresolved records, and the 64-file executable
ceiling remain unchanged. Phase 18C.7T remains incomplete. No commit or remote
operation was performed.

**One recommended next step:** separately scope an inert App transport-wiring
interaction test for stable-ID location updates and acknowledgment/refetch
ordering, using the same deny-by-default request boundary and no backend.
