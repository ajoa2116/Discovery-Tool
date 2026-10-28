# Camera Location: isolated boundary-to-disk integration evidence

Date: October 28, 2026. Branch: `codex/post-field-corrections-1`.
Starting committed HEAD: `bf72e12c80c9f490eb1a898a230ba1885b72814e`.
The working tree was clean before this test-only task. Master Blueprint v1.1
and the recorded Phase 18C.7T contracts remain the baseline.

## Scope and results

`src/test/device_location_persistence.test.ts` uses the real
`LegacyConfigurationBoundary` with `SiteProjectDatabase('ISOLATED_TEST')`.
It constructs no backend, HTTP handler, listener, provider or native launcher.

| Parameter | Exact submitted location | Result |
| --- | --- | --- |
| Ordinary | `North entrance` | Passed |
| Clearing | empty string | Passed |
| Surrounding whitespace | `  North Door  ` | Passed, including both spaces at each end |

One invocation passed all three scenarios: **36 grouped checks, zero failures,
zero unrun scenarios**, with 12 explicit saves and nine fresh-store reopens.
These are grouped assertions in one test script, not 36 independent test cases.

Each parameter verifies:

- Exact stable-ID targeting of one of two same-IP, distinct-identity devices;
  unchanged neighbor and non-location target properties.
- An in-memory update marks the project dirty but leaves the saved bytes intact.
- Unknown identity and non-string location reject without session mutation or
  any saved-file byte changes.
- Explicit `saveProject` persists the exact string; a fresh store reopens it.
- Reopened devices are `UNKNOWN` / `NOT_VERIFIED`, retain their saved status
  snapshot and synthetic provenance, and have no live reachability, diagnostics
  or telemetry. Exactly one location-change history event survives.
- The same store/boundary switches to a separate project B with a reused device
  ID and different identity. Separate A/B saves and independent fresh reopens
  preserve each project's records without mixing them.

## Commands and directly relevant validation

Tests used the installed `tsx`, with `TSX_DISABLE_CACHE=1` scoped to each command
and the prior environment value restored afterward. No installs or downloads.

| Command | Actual result in this task |
| --- | --- |
| `node --import tsx src/test/device_location_persistence.test.ts` | 3 scenarios / 36 grouped checks passed; 0 failed, 0 unrun |
| `node --import tsx src/test/project_persistence.test.ts` | 28 passed, 0 failed |
| `node --import tsx src/test/device_location_editing.test.ts` | 26 behavior/static-rendering + 2 source-wiring checks passed, 0 failed |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Exit 0 |
| `git diff --check` | Exit 0 |

Each test script ran once. Existing mounted React interaction results were not
rerun or counted as fresh evidence. No production build or broad suite ran.

## Isolation and cleanup

The trusted parent was `C:\Users\Omar\AppData\Local\Temp`; its ancestor
Windows reparse-point attributes were checked before execution. The new test
also checks canonical paths, symlink/junction absence, direct containment and
stable root filesystem identity, and accepts only six fixed project filenames.

Exact newly allocated root:
`C:\Users\Omar\AppData\Local\Temp\discovery-location-disk-h6gH5I`.
All six project files were accounted for and individually removed; the owned
root was removed and its absence confirmed with `ENOENT`. No recursive or
force deletion is used by the new test. Unexpected entries/identity or cleanup
uncertainty fail closed. Path checks are not an adversarial filesystem sandbox.

Socket connect, server listen and datagram creation tripwires were installed
before loading the storage/boundary modules and restored in `finally`.
Recorded network attempts: **zero**. No browser, listener or provider child was
created; the test Node processes exited normally. The existing generic
persistence test completed its own fresh-root `finally` cleanup; its root path
was not emitted, so it has no separate root-absence attestation here.
No protected historical session or evidence was accessed.

## Evidence boundaries and remaining issues

This proves in-memory boundary updates, explicit disk serialization and fresh
store readback **within the same process**. It does not establish process-restart,
power-loss, filesystem flush or crash durability.

It does not exercise the HTTP handler, authentication, broadcast, App transport,
backend acknowledgment delivery or physical camera behavior. Synthetic saved
status is not live-camera evidence. Existing broader UI evidence remains separate.

The backend request has no project-generation token. A delayed request from A
arriving after a switch to B may address B when the device ID is reused. The B
test deliberately updates the current project; it does not prove rejection of
such delayed cross-project requests. No API/schema or ownership policy changed.

Only this test and report were added. Production API/WebSocket default-deny,
authentication/TLS/native ownership/camera gates, the authoritative 825-file
baseline, unresolved dependency records and the 64-file executable ceiling are
unchanged. Phase 18C.7T remains incomplete. No commit or remote operation.

Smallest next task: a read-only local-checkpoint readiness review of these two
files; any commit requires separate owner authorization.
