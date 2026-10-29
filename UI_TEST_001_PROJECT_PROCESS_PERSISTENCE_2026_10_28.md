# Separate-process project persistence — stopped on ownership uncertainty

October 28, 2026, Laptop 1. Verified repository
`C:\Users\Omar\Documents\Discovery-Tool`, branch
`codex/post-field-corrections-1`, initial clean HEAD
`26a5fdead9c2cbacbf8d017d7a762dd9076d74ab`. Master Blueprint v1.1 remains
authoritative. No commit or remote operation.

## Test-only implementation

Added:

- `src/test/project_process_persistence.test.cjs`: parent ownership and sequential
  writer/reader supervision, bounded output/lifetimes and nonrecursive cleanup.
- `src/test/support/project_process_worker.cjs`: distinct Node writer/reader
  roles, guarded dynamic storage imports and persistence assertions.
- `src/test/support/project_process_fixture.cjs`: fixed synthetic values, path/
  identity checks, filesystem mutation guards and network/process tripwires.
- This evidence report.

No production code, schema, authentication, policy or existing tests changed.
The parent uses installed TSX source-test invocation. Workers are launched as
plain Node processes; their installed TypeScript `transpileModule` hook transforms
individual source modules in memory, without writing compiled outputs or loading
a generated bundle. Whether the observed unexpected child is related to tooling
or the OS is unknown; no interpretation is substituted for identity verification.

The intended protocol pauses each worker after guarded storage imports at READY.
The parent verifies process/root ownership before sending GO. Writer success and
complete close are required before reader launch. Only `a.cctvproj` and
`b.cctvproj` are intended durable fixture outputs; exclusive temporary save files
are tracked by identity until rename. Reader filesystem mutations are denied.

## Actual validation and stop

Syntax checks completed before the focused attempt:

```text
node --check src/test/project_process_persistence.test.cjs
node --check src/test/support/project_process_worker.cjs
node --check src/test/support/project_process_fixture.cjs
```

All three exited 0. Subsequent test-only ownership/diagnostic edits were made
before the first focused run; there was no final syntax/type/whitespace pass
after the stop condition. These syntax results are not a final passing validation.

Exactly one focused invocation ran, with process-scoped `TSX_DISABLE_CACHE=1`:

```text
node --import tsx src/test/project_process_persistence.test.cjs
```

It exited **1**. The parent observed writer READY, but the first worker ownership
inspection found one unexpected direct child PID, **11844**, where the required
child list was empty. GO was not sent and the reader was not launched. Thus no
save or readback scenario passed; metadata, identity/history persistence, secret
exclusion, fresh-process readback and saved-byte preservation remain **unrun**.
No results from earlier persistence suites are counted as new evidence.

The failure path attempts to terminate and await the owned Node worker. Its PID
and close/exit record were not emitted by this early-failure path; no verified
worker-exit or descendant-cleanup assertion is claimed. PID 11844's executable,
start time, lifetime and relationship beyond the reported direct-child result
were not investigated after the mandatory stop. A surviving process is neither
asserted nor ruled out. The test runner itself exited.

## Retained root — do not clean without ownership review

Exact newly created root:

`C:\Users\Omar\AppData\Local\Temp\discovery-project-process-E1IcfX`

Recorded root identity:

```json
{"dev":"3202858132","ino":"2814749767174215","birth":"1793240906547259500"}
```

The harness set ownership uncertainty and correctly refused root deletion:
`CLEANUP UNCERTAIN; preserve ...`. No cleanup retry, post-failure directory scan,
process inspection, test rerun or further validation was performed. Root absence,
file accounting and complete process cleanup are **not confirmed**. The failure
occurred before the parent's GO authorization for any save, but current directory
contents were not independently reinspected and are not claimed empty.

There was no backend, frontend, listener, native launcher, camera/discovery or
external-network operation requested by the fixture. Network/process tripwires
were installed before storage imports; the unexpected child means the process
containment claim is not validated. No protected historical evidence was accessed.

## Limits and next task

Even a future passing run would prove explicit successful saves followed by a
separate fresh-process readback, not automatic recovery, crash/power-loss
durability or filesystem flush guarantees. Canonical/reparse checks and process
tripwires are not an adversarial same-user filesystem/process sandbox.

One smallest next task: a separately authorized bounded read-only diagnosis of
the unexpected-child observation and retained-root ownership, before any rerun
or cleanup. Do not infer ownership from PID alone after time has elapsed.

Phase 18C.7T remains incomplete. Production API/WebSocket default-deny,
authentication/TLS/native security protections, authoritative 825-file baseline,
unresolved dependency records and unchanged 64-file ceiling remain untouched.

## Test-only observation/telemetry correction — no persistence rerun

The subsequent owner-authorized change modifies only the parent harness,
`project_process_fixture.cjs` and this report. The writer/reader worker source is
unchanged. Initial branch/HEAD and the exact four untracked paths were confirmed.
No production files, existing tests or security policies were changed or committed.

Future parent inspections now emit a sanitized structured `process-observation`
snapshot **before** evaluating process/child classification. Available records
contain PID, parent PID, UTC creation time with a millisecond projection,
executable path and command line. The snapshot includes the parent, writer before
and after candidate observation, and each candidate's initial and repeated record.
Only candidate children selected by the current writer's numeric parent-PID filter
are inspected; unrelated system processes are not enumerated for diagnostics.

Observation remains bounded: at most two candidate records are expanded, command
lines are limited to 1024 characters and executable paths to 512. Truncation,
missing fields, query errors, excessive output or unavailable values cause UNKNOWN;
they never silently permit a process. Secret-like command lines are redacted and
also cause UNKNOWN. Raw PowerShell errors and worker stderr are not logged.
Existing 10-second/8192-byte observer and 30-second worker/3-second cleanup bounds
remain. No actual observer was invoked to validate this source change.

The parent emits launch-request and spawn records containing the fixed executable,
argument vector, parent/child PIDs and the request-to-spawn wall-clock interval.
Future initial writer creation time must fall within that interval. Parent identity
is pinned from the initial parent observation; writer identity is pinned only
after an allowed initial observation. Subsequent records must retain creation
time, PID/parent PID, executable and command line. The fixed writer argument vector
is checked; ambiguous command-line quoting fails closed. Clock inconsistencies
are UNKNOWN, not grounds to widen the window automatically.

A numeric ParentProcessId match alone never establishes ancestry. Candidates
predating the writer, changing identity between queries, lacking required metadata
or appearing more than once are UNKNOWN. A fully populated, temporally consistent
candidate is still DENY because the fixture permits no worker children. There is
no tooling/console-host allowlist or retrospective exception. Empty observed
candidate lists can allow progress only when all required parent/writer checks
pass; they are point-in-time observations, not proof against all transient or
adversarial descendants.

Exit and close events are emitted independently of assertion success. A final
worker record is emitted from `finally`, including available launch/identity data,
whether exit and close were observed, exit code/signal, termination-request result
if attempted by a future run, and cleanup uncertainty. Close is not conflated with
successful delivery, absence of descendants or authority to remove the root.
The existing fail-closed retained-root behavior is preserved. The source's cleanup
path was not executed during this correction.

### Static and synthetic validation only

- `node --check` passed for the parent, fixture helper and unchanged worker source.
- 23 inline pure checks using `node -e` and only the helper export passed: 19
  classification cases, one redaction assertion and three source-contract checks.
  Cases include a complete empty-child observation, complete child denial,
  PID-only history, pre-writer candidates, missing metadata, candidate/worker PID
  reuse, parent/worker pins, launch-time mismatch, truncated/duplicate children,
  query/root errors, ambiguous quoting and secret-like command-line redaction.
- The embedded PowerShell template parsed without syntax errors using the
  existing tool shell's `System.Management.Automation.Language.Parser.ParseInput`.
  It was not executed; no PowerShell/CIM observation subprocess was started.
- Source checks confirmed snapshot emission before classification, failure-path
  lifecycle events and unchanged bounded observer/worker settings. Whitespace
  checks passed. No TypeScript compiler or full build was run for these CJS edits.

Synthetic records establish only deterministic classification behavior. Actual
CIM field availability, runtime quoting, creation-time precision, observer output
size, process exit/close races and real filesystem/process containment remain
unverified. The persistence harness, writer, reader, backend and native launcher
were not executed. The protected failed-session directory was not enumerated,
opened, hashed, modified or cleaned, and no process was terminated.

PID 11844 remains historically unidentified. The earlier read-only review's
absence of a current matching process does not establish historical exit or
complete cleanup. This correction makes no new claim about surviving processes,
retained-root contents or current ownership; the recorded root identity remains
historical evidence only. The original failed run and unrun persistence assertions
above are unchanged.

One smallest next task: separately review this test-only telemetry patch for
readiness before authorizing any new execution. Stop if its identity contract or
failure evidence is inconsistent; no rerun or protected-root cleanup is implied.

## Failure lifecycle correction — synthetic validation only

The subsequent read-only readiness review returned **NO-GO**. It identified two
source-level blockers: the outer timeout race could leave observer/workflow
continuations active during cleanup, and early failures could leave cleanup
uncertainty false without completed descendant observation. The earlier statement
that fail-closed retained-root behavior was preserved was too broad; it did not
cover these paths. This correction does not change the historical run's outcome.

Changed only the parent harness, fixture helper and this report. Worker source,
production code, persistence assertions, identity classification policy and all
security/release restrictions remain unchanged. The exact four untracked paths,
branch and committed HEAD were verified before editing; no commit was created.

The pure lifecycle gate now has an irreversible first-failure latch and abort
signal. Timeout, malformed READY, stderr, observer error/UNKNOWN/DENY, failed
assertions and unresolved settlement permanently forbid cleanup for that run.
Progress checks protect bootstrap input, GO, observation results, EXIT, successful
completion and reader startup. The former outer timeout race is removed: timeout
latches failure and cancels awaited operations, allowing the workflow to unwind
through its actual finally block. Late responses cannot restore success or
advance the workflow. Lifecycle/exit diagnostics and settlement bookkeeping remain
permitted after failure; they cannot grant cleanup authority.

Each observer is tracked from launch until **both** callback and process close.
Its private AbortSignal requests cancellation of only the owned execFile helper;
callback completion alone does not establish process closure. Sanitized snapshots
are still emitted before classification, including late diagnostic snapshots
marked afterFailure. Classification/proof mutation is blocked after failure.
Observer timeout/output limits remain 10 seconds/8192 bytes; worker lifetime and
stdout limits remain 30 seconds/16384 bytes, with first stderr treated as failure
and only its byte count retained. Owned-worker closure and observation settlement
use concurrent three-second waits. Unsettled activity remains explicitly pending
and cannot authorize root access/deletion; the parent does not extend that worker
settlement window. Baseline-observer failure has its own bounded settlement wait.
Cancellation requests and elapsed waits never imply successful OS termination.

Containment starts UNKNOWN. The cleanup gate requires no failure, no pending
workflow/observer activity, and both successful worker records with initial and
final complete ALLOW/no-child observations, pinned identity, observed clean exit,
close and workflow settlement. Close alone never supplies descendant proof.
This remains a point-in-time synthetic-fixture observation contract, not proof
against transient/adversarial descendants. Any failed run preserves its root,
even if subsequent callbacks/closure arrive. Existing canonical root identity,
reparse checks, fixed-file accounting and nonrecursive removal remain required
after authorization. No observed child PID is made a termination target.

### Actual checks for this correction

Commands run from the repository root (no TSX import):

```text
node --check src/test/project_process_persistence.test.cjs
node --check src/test/support/project_process_fixture.cjs
node --check src/test/support/project_process_worker.cjs
node src/test/support/project_process_fixture.cjs --lifecycle-self-test
```

All three syntax checks passed. **17/17 pure lifecycle checks passed**: default
UNKNOWN; close without descendant proof; verified-safe cleanup; missing exit;
missing close; pending observer; pending workflow; timeout/cancellation with a
pending observer; malformed READY; early stderr; late success callback; blocked
reader/new observation after failure; observer failure after settlement;
UNKNOWN/DENY observations; first-failure preservation; drain waiting for actual
settlement; and consumed late rejection after cancellation. These checks use
synthetic records, promises and timers only. The positive cleanup case evaluates
authorization only and deletes no files. No Windows process behavior is simulated
as established OS evidence.

Untracked-file whitespace checks used `git diff --no-index --check -- NUL <path>`
for each of the four listed paths. They emitted no whitespace-error diagnostics;
exit 1 indicates the files differ from NUL. Git emitted LF-to-CRLF normalization
warnings. Parent syntax was checked again after the final lifecycle edit. Final
Git status still showed exactly the original four untracked files, with no tracked
changes or staging. The unchanged worker SHA-256 remains
`66333F8552DF0D7ECA66C7CC6D22EA6924D1FC8906B2451F26466751092311E1`.

The harness, writer, reader and PowerShell/CIM observer were **not executed**.
No process was terminated and no fixture root was created or cleaned. Actual
Windows abort/close ordering, CIM availability/precision, process containment,
filesystem cleanup and project persistence remain unverified. PID 11844 remains
unidentified; historical process cleanup and retained-root ownership/contents
remain unknown. The protected historical directory was not accessed.

One smallest next task: a separately authorized single fresh-root persistence
attempt, using the conservative failure/retention rules above and leaving the
historical failed session untouched. Do not infer runtime success from these
synthetic checks. Phase 18C.7T remains incomplete; production API/WebSocket
default-deny, native protections, authoritative 825-file baseline, unresolved
dependency records and unchanged 64-file ceiling remain unchanged.

## One authorized fresh-root execution — stopped before GO

Executed once after verifying repository, branch
`codex/post-field-corrections-1`, committed HEAD
`26a5fdead9c2cbacbf8d017d7a762dd9076d74ab` and exactly the original four
untracked test-only paths. Source inspection confirmed the terminal latch,
pending-activity gate, initial/final identity checks and failure retention.
Only this report was edited for this execution task. No test source was changed.

Exact PowerShell invocation from the repository root:

```powershell
$env:TSX_DISABLE_CACHE = '1'
node --import tsx src/test/project_process_persistence.test.cjs
```

The process exited **1**, approximately 4.82 seconds after invocation. Actual
recorded UTC timestamps fall on October 29 (October 28 local evening). There was
no retry. This is a new failed experiment, separate from both the PID-11844
historical failure and the 17 passing pure lifecycle checks.

### Identity evidence emitted before classification

Parent Node identity was observed at baseline and again during writer inspection:

```json
{"pid":20268,"parentPid":2744,"creationUtc":"2026-10-29T03:34:52.6102790Z","creationMs":1793244892610,"executable":"C:\\Program Files\\nodejs\\node.exe","commandLine":"\"C:\\Program Files\\nodejs\\node.exe\" --import tsx src/test/project_process_persistence.test.cjs","unavailable":false}
```

Baseline classification was ALLOW/PARENT_BASELINE_ONLY. The writer reached the
validated READY stage, then paused awaiting GO. Launch request was
1793244894247 ms UTC, spawn observation 1793244894262 ms UTC. Identical writer
before/after records contained:

```json
{"pid":3588,"parentPid":20268,"creationUtc":"2026-10-29T03:34:54.2515950Z","creationMs":1793244894251,"executable":"C:\\Program Files\\nodejs\\node.exe","commandLine":"\"C:\\Program Files\\nodejs\\node.exe\" C:\\Users\\Omar\\Documents\\Discovery-Tool\\src\\test\\support\\project_process_worker.cjs writer","unavailable":false}
```

The writer's creation time was within the launch window. Its child candidate had
identical before/after records, a creation time after the writer, and parent PID
3588:

```json
{"pid":9644,"parentPid":3588,"creationUtc":"2026-10-29T03:34:54.2671700Z","creationMs":1793244894267,"executable":"C:\\WINDOWS\\system32\\conhost.exe","commandLine":"\\??\\C:\\WINDOWS\\system32\\conhost.exe 0x4","unavailable":false}
```

The observation at 1793244896807 ms UTC reported rootReparsePoints=0,
rootError=false, observationError=false and childrenTruncated=false. The full
classification was **DENY/UNEXPECTED_CHILD**. Identity metadata distinguishes
this new conhost.exe observation from a PID-only report; it does not authorize
that child or establish its lifecycle. No allowlist exception was applied.
Nothing identifies historical PID 11844 as this executable.

Two owned observer invocations emitted callback snapshots and observer-close
events before classification (baseline and writer). Their configured executable
was the fixed WindowsPowerShell executable in System32, launched through the
owned execFile handle. Observer PIDs, creation times, independent executable
identity verification and close exit codes are not emitted by the existing
telemetry; those details cannot be supplied from this run. No extra observer or
post-failure process inspection was launched to fill this gap.

### Failure settlement and assertion outcomes

GO was withheld. The terminal latch remained set; there was no reader launch or
overlap. The existing owned-worker failure path reported killRequested=true and
both writer-exit and writer-close with code=null, signal=SIGTERM. Final telemetry:

```json
{"role":"writer","pid":3588,"containment":"UNKNOWN","exitObserved":true,"closed":true,"exitCode":null,"signal":"SIGTERM","workflowSettled":true,"killRequested":true,"activitySettled":true,"lifecycle":{"failed":true,"pending":[]},"cleanupUncertain":true}
```

This confirms recorded closure of the owned writer and settlement of tracked
observer/workflow activity. It does not prove descendant exit or complete process
containment. No observed descendant PID was targeted for termination.

Persistence assertions remain **UNRUN/BLOCKED**: explicit A/B saves, fresh-reader
reopen, exact Name/Location/Notes, stable device identity/IP history, distinct
project identities, UNKNOWN/NOT_VERIFIED reopen state, preserved non-secret
history, secret/runtime-token exclusion and reader byte preservation. No new
successful persistence assertion is claimed. The run reported no network attempt;
it did not reach the final network counter assertion or worker DONE counters.

### Fresh root retained; no file accounting claim

The parent created this independently owned fresh root:

`C:\Users\Omar\AppData\Local\Temp\discovery-project-process-gH5Urn`

Creation-time root identity:

```json
{"dev":"3202858132","ino":"9007199254808528","birth":"1793244894230674800"}
```

Initial canonical/root-identity checks passed and the observer reported no
reparse-point ancestors. On DENY, the cleanup gate refused authorization before
enumeration/removal and emitted CLEANUP UNCERTAIN; preserve. The new root was
retained. Since failure preceded post-inspection file accounting, its contents
and current ownership were not independently verified and are not claimed empty.
No successful save was authorized. No root-absence or file-removal assertion
passed. No subsequent root inspection, process query or cleanup was attempted.

The protected historical E1IcfX directory was not accessed. Historical PID 11844,
historical cleanup, and any surviving descendant from this new run remain
unknown. The runner exited; no global or unrelated-process cleanup occurred.
There was no backend/UI/native/camera operation or remote Git operation.
Production code/security policy and release restrictions remain unchanged;
Phase 18C.7T remains incomplete.

One smallest next task: a bounded read-only diagnosis of this specifically
identified console-host child and whether a launch-only configuration can avoid
its creation while retaining strict descendant rejection. Do not rerun, permit
conhost by assumption, or inspect/clean either retained root in that task.

## October 28 session close — blocked experiment checkpoint

The subsequent bounded read-only launch-configuration review returned **NO-GO
for changing the worker launch configuration on current evidence**. The current
spawn already uses windowsHide=true, shell=false and private pipe stdio, with
detached omitted. A Windows console-host side effect is plausible, but neither
causation nor safe suppression was established from the available local
documentation. No launch option, descendant allowlist or identity rule changed.
No worker/observer was run during that review.

Final evidence distinction: the first attempt stopped before GO on unidentified
historical PID 11844; the second stopped before GO on identified conhost.exe PID
9644 with DENY/UNEXPECTED_CHILD. The reader never launched in either attempt;
all separate-process persistence assertions remain unrun. The 17/17 pure
lifecycle checks passed separately and do not establish actual persistence,
project recovery or verified descendant cleanup. Both retained directories
remain protected; no current ownership, contents or descendant-survival claim
is made.

Owner-authorized session wrap-up checkpoints only these four test/evidence files
and `RESTART_HANDOFF_2026_10_28.md`. Validation is limited to Node syntax,
whitespace and Git scope checks; the persistence harness is not rerun. No remote
Git operation, retained-root access or process cleanup is authorized or performed.
Earlier chronological next-task recommendations above are superseded by this
session-close decision: return to application improvements, and defer
separate-process recovery until supported launch evidence is available. Master
Blueprint v1.1 remains authoritative and all existing security/release gates
remain unchanged.
