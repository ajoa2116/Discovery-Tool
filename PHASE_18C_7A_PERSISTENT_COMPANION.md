# Phase 18C.7A — Persistent application companion foundation

Starting branch: `codex/post-field-corrections-1`. Starting HEAD: `aa75ecdc8214707382a46042d8021d185927d076`.

## Isolated implementation

`native/ApplicationCompanion` is a new WinForms executable with broker and fixture modes. It has no project/source links to CameraBrowserHost, camera protocol imports, WebView2 dependency, HTTP listener, bootstrap capability, or session authority. Its fixed native window contains static fixture text; readiness means the WinForms `Shown` handler connected and acknowledged, not HTML document readiness. It accepts no URL, arbitrary script, document, executable path, or privileged command.

The private application pipe uses its own `cctv-application-` namespace, random names, first-instance creation, remote-client rejection, and a protected DACL containing only the current interactive logon SID. Boundary and frame primitives were copied into this project from the earlier proof and adapted locally; existing camera files are unchanged. Both executable modes require an interactive, non-elevated token and nonzero Windows session. The manifest uses `asInvoker`, which does not de-elevate a parent; an elevated invocation is refused. Reciprocal pipe peer checks compare PID, session and fixed image; the broker also retains the original companion process handle and checks that it remains alive before and after peer verification. No secret is placed in arguments or environment.

The broker creates an unnamed kill-on-close Job first. `PROC_THREAD_ATTRIBUTE_JOB_LIST` assigns the companion atomically during `CreateProcessW`; creation is also suspended. The broker verifies actual membership before resuming the initial thread. No inherited handles, shell launch, or breakaway flag is used. Invalid Job assignment fails before fixture execution. This closes both the child-execution escape and broker-crash-before-assignment orphan gap. Unsupported atomic creation fails closed rather than falling back to post-launch assignment. Design reference: [Microsoft's atomic Job-list creation explanation](https://devblogs.microsoft.com/oldnewthing/20230209-00/?p=107812/).

## Lifetime contract

`src/server/application_companion_supervisor.ts` starts only the fixed new executable with a restricted environment. `startApplicationCompanion()` resolves a frozen lifetime handle on verified native fixture readiness while the broker and UI remain alive. The handle includes nonsecret process IDs, a terminal `lost` Promise, a `closed` Promise reporting whether broker close was observed, and idempotent bounded `shutdown()`.

Parent START/STOP and native READY/PULSE/ACK frames are bounded and strict. The Node decoder validates streaming UTF-8 and exact READY/ALIVE frame grammar, rejecting extra/duplicate keys, malformed frames, and repeated readiness. No public endpoint or reconnect path exists. Heartbeats retain the private connection; disconnect, deadline, child exit, broker exit, stream failure, cancellation or unexpected protocol input ends the lifetime irreversibly. Parent input EOF closes the native ownership boundary. Shutdown sends STOP, escalates to broker termination, and bounds cleanup to four seconds. Native Job disposal kills the companion tree and uses bounded waits. A kill request alone is never reported as confirmed exit; unsuccessful cleanup rejects shutdown. Startup rejection can precede asynchronous bounded cleanup.

The initial suspended-then-assigned prototype was strengthened to atomic Job-list creation before final validation. No existing bootstrap transport or supervisor was changed.

## Validation

**14 focused Windows lifecycle tests passed, zero failed/skipped**, covering:

- Actual private pipe DACL/first-instance rejection and normal interactive token acceptance.
- Readiness while both processes remain live; heartbeat persistence and repeated shutdown.
- Concurrent companion independence.
- Actual companion and broker termination, loss notification and owned UI cleanup.
- Cancellation before launch, during initialization, and after readiness; event-loop responsiveness.
- Readiness timeout, mismatched peer and invalid atomic Job assignment.
- Immediate fixture exit and private pipe disconnect.
- Parent input EOF after readiness.

The suite's final process inventory confirmed no newly owned ApplicationCompanion process remained, including rejected startups. TypeScript `--noEmit` passed; `npm run build` also passed TypeScript, Vite and build-identity generation. Release builds passed for ApplicationCompanion, existing BootstrapTransport and CameraBrowserHost with zero warnings/errors. Diff checks passed. The first test attempt hit the sandbox's `tsx` user-info restriction; the authorized lifecycle run passed. Native restore required local SDK/NuGet access and used a temporary package-source-free configuration; the new project adds no package dependencies.

Actual elevated-parent execution was not attempted; both broker and fixture enforce the existing Windows token rejection policy. Same-user injection/debugging, development binary replacement and administrator compromise remain outside the IPC/Job proof. This is a native fixture foundation: WebView2 top-level document readiness, bootstrap/session integration, deployment integrity and application HTTP/WS authentication are deferred. No runtime application was restarted; no network discovery or camera operation was performed.

## Files and stop

- `native/ApplicationCompanion/ApplicationCompanion.csproj`, `app.manifest`, `Program.cs`, `OwnedChild.cs`, `FixtureWindow.cs`, `WindowsBoundary.cs`, `Wire.cs`.
- `src/server/application_companion_supervisor.ts`.
- `src/test/application_companion_lifecycle.test.ts`.
- This report.

Commit message: **Add persistent application companion foundation**.

Stop after Phase 18C.7A. Do not begin Phase 18C.7B.
