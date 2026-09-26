# Phase 8 — Technician attention and diagnostic navigation

Branch: `codex/post-field-corrections-1`

Starting HEAD: `492f2beb26bf1ff96ed4f089933a14d6ae5670eb`

Master Blueprint v1.1 and the supplied Phase 8 requirements remain authoritative.
The expected branch/HEAD and clean tracked baseline matched before implementation.
Scope: FIELD-DIAG-01 and FIELD-UI-06. No Phase 9 work.

## Root causes and implementation

Diagnose posted an operation but did not foreground Inspector or select/focus its
Diagnostics section. Inspector did not observe the associated Task's lifecycle,
and App ignored progressive DIAGNOSTIC_EVIDENCE events. The manual diagnostic
completion route also used a persistent upsert, which could dirty a clean project.

All single-device Diagnose entry points now share one App handler: row Actions,
Inspector Diagnose Now, Duplicate Assistant, and a one-device selection. It opens
the selected Inspector, focuses Diagnostics even after a previous Identity tab
selection, and closes competing attention surfaces. One HTTP request starts one
existing diagnostic Task. Opening Inspector never starts a second diagnostic run.
Duplicate selected IDs are removed; repeated clicks while a request is pending
are coalesced.

The existing Task model gains transient per-device diagnostic state/IDs for result
navigation. It does not add a project schema or a second operation manager. The
existing Tasks poll is shared with Inspector; no extra polling loop is introduced.
Running, Completed, Failed, Cancelled and unavailable states are distinguished.
A failed/unacknowledged start request has its own explanatory text and does not
claim that a possibly accepted operation was stopped. Loss of Task status shows
Unavailable rather than treating stale progress/completion as current.

App consumes progressive evidence for the matching current device/IP. Inspector
reads the live inventory rather than a frozen selected-device snapshot. Existing
status rules and Phase 6 access decisions remain unchanged. It displays current-IP
checks, actual response codes/times, tested ports, TLS warnings and timestamps,
with an explicit statement that reachability does not establish browser/login or
selected-camera ownership. Missing evidence renders honestly. Diagnostic content
and its existing Inspector container use readable light surfaces.

The completion route diagnoses a detached device snapshot and commits via the
existing runtime `applyDiagnosticRefresh` path. This prevents a persistent edit,
identity/membership changes, or an old-address completion overwriting a moved
camera. Cancelled/superseded runs do not emit new progress. Task terminal state
continues to follow the actual operation, not the Inspector's visibility.

Bulk Diagnose opens the existing Tasks panel and selects its single bulk Task.
Per-device result links foreground that device's current Inspector Diagnostics;
they do not start new operations or open many Inspectors. Historical evidence
remains timestamped; the Inspector is not a new per-run report archive.

## Attention navigation

- One active collision: footer button opens the existing Phase 7 assistant directly.
- Multiple active collisions: a small chooser lists shared address and participant
  count; selecting a group opens that assistant. Three participants remain one
  choice. Phase 4's active predicate excludes resolved/historical collisions.
- Zero active collisions: passive text, no stale assistant navigation.
- Tasks: the existing header control remains; footer attention/history navigation
  uses the same panel and truthful active/attention counts. Unavailable status is
  identified. Navigation never creates a Task or changes its state/history.
- Task selection: the existing detail region automatically scrolls into view and
  receives focus, including repeated selection of the same Task.
- Unsaved changes: only a dirty PROJECT exposes the action. A small action surface
  provides Save Project, Save As and Close, calling the existing save/download
  command. Clicking the indicator alone does not save. Clean Project and Quick Work
  do not fabricate save attention.
- Device count, adapter/monitoring information and Ready/Scanning remain informational.

Buttons use native keyboard activation, dialog semantics, hover styling, visible
focus and readable contrast. The chooser/save surface reuses existing modal focus
handling. No general footer, Tasks, modal containment, or application-shell redesign.

Navigation changes no Windows adapter/camera configuration, credentials, device
identity, saved project/report membership, or clean-project state. Explicit Save
is still a technician-requested project action. Explicit Diagnose still performs
its existing read-only network checks. Monitoring does not become a Task. Phase 7
Refresh and Phase 6 Open safety remain intact.

## Tests and validation

Tests were added before implementation: the initial Phase 8 run reproduced 18
failures (4 passing characterization checks). Final focused coverage is 29 passing
checks, supplemented by 34 new browser checks. No existing safety assertions were
weakened. Phase 7's Diagnose browser check now expects Inspector navigation instead
of an acknowledgment inside the assistant, while retaining its selected-device
request assertion.

Coverage includes T01–T50 across the new tests and preserved integration regressions:

- T01–T17: one operation, all Diagnose entry points, focused Diagnostics, lifecycle,
  evidence truth, partial/missing evidence, clean runtime persistence, bulk results.
- T18–T26: single/multiple/three-device groups, correct chooser destination, active
  predicate, resolved history and passive zero state.
- T27–T31: Tasks entry, no extra operation, visible/focused detail and retained history.
- T32–T39: dirty-only Save attention, no automatic Save, real Save/Save As download,
  clean Project/Quick Work. The existing Phase 5 browser test executes actual
  no-change Reverify and confirms no Unsaved Changes attention (T38).
- T40–T47: keyboard/accessible controls, passive information, no configuration or
  credential calls, stable identity and project membership.
- T48–T50: Phase 7 assistant, Phase 6 access and Phase 5 dirty-state regressions,
  including live collision resolution/reopening and real Reverify workflow.

Additional tests cover cancelled results, late completion protection, lost Task
connectivity, repeated Task selection and resetting a previously selected Identity
tab. Browser tests use real in-memory database, Task manager and diagnostic engine
with injected check providers. They do not run physical discovery or mutations.

Validation results:

- Phase 8 focused: **29 passed**.
- Phase 1–7 focused: **312 passed** (50 / 46 / 46 / 42 / 43 / 39 / 46).
- Full regression: **2,347 passed across 63 test files**.
- Browser: **241 passed**: Phase 8 34, Phase 7 33, Phase 6 15, Phase 5 13,
  background collisions 13, Tasks 25, field workflow 25, V1 integration 28,
  scan/monitoring 41, retained network 14.
- Failed/skipped in final validation: **0 / 0**.
- TypeScript (`npx tsc --noEmit`): passed.
- Production build (`npm run build`): passed.
- `git diff --check`: passed.

The Windows Node uv_os_get_passwd/ENOMEM host issue required the approved TEMP-only
identity shim. It is removed after validation with NODE_OPTIONS unset. No shim or
local test output is committed. The UI-only Vite process is stopped. The three
original untracked field traces remain untouched.

## Files changed

- `src/shared/technician_attention.ts`: read-only attention/diagnostic presentation.
- `src/shared/tasks.ts`, `src/core/tasks/task_manager.ts`: per-device diagnostic results.
- `src/server/index.ts`: correlate existing diagnostic work and persist runtime evidence.
- `src/ui/App.tsx`: coordinated Diagnose and attention navigation.
- `src/ui/components/DeviceInspectorDrawer.tsx`: focus, lifecycle, live evidence/readability.
- `src/ui/components/Tasks.tsx`: shared snapshot, programmatic opening and detail focus.
- `src/ui/components/AttentionActions.tsx`: lightweight collision chooser and Save actions.
- `src/test/technician_attention.test.ts`: focused regressions.
- `src/test/browser/technician_attention.cjs`: navigation/evidence/browser coverage.
- `src/test/browser/duplicate_assistant.cjs`: preserve Phase 7 Diagnose assertion at new destination.
- This closeout document.

## Remaining risks and physical retests

FIELD-DIAG-01 and FIELD-UI-06: software validated; physical retest pending.
Diagnostic state follows existing Task polling (approximately 1.5 seconds), while
check evidence arrives through the existing progress connection. A connection loss
can delay results; the UI reports unavailable status and retains existing evidence.
Tasks remain session-scoped, and result links inspect current device evidence;
they do not create a new persistent diagnostic-report archive.

Retest row/Inspector/Duplicate Assistant Diagnose on real cameras, including failed
ping with useful HTTP/HTTPS evidence and self-signed TLS warnings. Verify bulk Task
selection/results, single and multiple collision navigation, keyboard activation,
Task detail visibility on a laptop, Save/Save As and clean no-change Reverify.
Confirm shared-IP Open stays blocked and retained Ethernet 192.168.1.205 is unchanged.
No physical validation claim is made by the automated tests.

Commit message: `Foreground technician attention and diagnostic results`.
