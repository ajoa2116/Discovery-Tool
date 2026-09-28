# Phase 17D — Minimal Windows WebView2 host and private handoff

Status: **NATIVE DEVELOPMENT BOUNDARY VALIDATED — IFRAME REMAINS DEFAULT**.

## Checkpoint and previous blocker

Branch: `codex/post-field-corrections-1`. Starting HEAD: `6de08ad9f3a3dc9ccac07ee4af90259e6f75e76c`. The tracked tree was clean. The existing uncommitted blocker report is updated here; the three original CCTV trace files were not opened, modified or staged. Master Blueprint v1.1, Phase 17B architecture and Phase 17C authorization remain authoritative.

The initial attempt stopped correctly when PATH, standard directories and registration exposed no .NET SDK. The user deliberately installed the SDK outside Codex before resuming. This execution environment still had a stale PATH, so the existing executable at `C:/Program Files/dotnet/dotnet.exe` was used directly. No SDK or Evergreen Runtime was reinstalled.

## Exact tooling and project

| Item | Selection / observed result |
| --- | --- |
| SDK | **10.0.401 x64**, MSBuild 18.9.11; `native/global.json` selects 10.0.401 with latest-patch roll-forward. |
| Target | **net10.0-windows**, WinForms, x64, framework-dependent executable. Tested on Windows 11 build 26200. |
| Installed Desktop Runtime | **Microsoft.WindowsDesktop.App 10.0.12**, with Microsoft.NETCore.App 10.0.12. |
| Native package | **Microsoft.Web.WebView2 1.0.4191.47**, exact PackageReference and NuGet lockfile. Sole direct native dependency. |
| Actual WebView2 initialization | Host reports **153.0.4234.48**, matching the prior Evergreen registry evidence. |
| Native build | Passed, **0 warnings / 0 errors**. |

The current stable [Microsoft WebView2 SDK package](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4191.47) was selected for its supported WinForms APIs and verified against the installed Runtime. The package imports both UI bindings; an MSBuild target removes the unused WPF reference, resolving its WindowsBase conflict without introducing WPF or suppressing warnings.

`native/CameraBrowserHost` contains the project, asInvoker manifest, Windows pipe/process boundary, bounded wire protocol, application-side broker, minimal WinForms window and native self-tests. `src/core/connect/native_camera_proof.ts` owns the Phase 17C protocol adapter and development launch. Native binaries, object files and screenshots are ignored. Vite ignores native bin/obj outputs because the native screenshot capture can hold an exclusive Windows file lock; no production renderer behavior changes.

## Private handoff architecture

```text
Trusted Node development caller, stable Device.id
  -> existing Phase 6 decision / Phase 17C native lease
  -> owned .NET broker through redirected private stdin/stdout
  -> broker creates two Windows named-pipe endpoints
  -> broker launches exact companion image with non-secret rendezvous + broker PID
  -> kernel-verified host connection; HELLO/version check
  -> OFFER secret crosses bootstrap pipe
  -> REDEEM returns to Node; existing Phase 17C validates and rotates secret
  -> GRANT with sanitized session metadata + rotated token
  -> bootstrap pipe disposed; verified second pipe becomes active session channel
  -> authorized WebView2 navigation and periodic Phase 17C checks
```

The .NET broker is the application-side Windows helper, not a second authorization system. The same executable provides broker and host modes. It creates the protected endpoints before exposing their names. Node remains the only issuer/redeemer and reuses `CameraBrowserSessions`; native redemption is not exposed over HTTP. The existing 30-second one-time handoff and five-minute absolute active lifetime are unchanged.

The original handoff digest is replaced at redemption. Replays, wrong session/device/channel, expired leases and revoked evidence fail closed. Each proof instance owns its own Phase 17C channel and broker/process tree. Sanitized metadata includes only the existing public session DTO: IDs, approved address/origin, display identity, timestamps and renderer kind. No saved passwords, credential-manager contents, Project/report data or Pair recovery information crosses the boundary.

## Windows security versus application protocol

Windows enforcement:

- A protected pipe DACL grants access only to the current interactive **logon SID**, obtained through `GetTokenInformation(TokenLogonSid)`. Managed group enumeration omits this SID and was not used as a weaker fallback.
- Handles are non-inheritable. `FILE_FLAG_FIRST_PIPE_INSTANCE`, one server instance and a fresh 192-bit random name prevent silent reuse/name replacement. `PIPE_REJECT_REMOTE_CLIENTS` rejects network clients.
- Before secret delivery, the broker uses the kernel-reported client PID and requires its owned host PID, current Windows session and exact executable path. The host verifies the kernel-reported server PID, session and executable path before exchanging application data.
- A private kill-on-close Windows Job Object owns the host tree. Broker termination closes that job and terminates the owned host/descendants; no unrelated process tree is targeted.

Application enforcement:

- Version 1, exact message shapes, duplicate-key rejection in the native shape validator, strict UTF-8, 16 KB frame bounds, allowed message/category enums and bounded waits.
- Ten-second bootstrap/connect waits, five-second frame operations, ten-second active host inactivity bound and a twelve-second Node broker watchdog. Explicit asynchronous wait deadlines also cover streams whose underlying operation may not honor cancellation promptly.
- Single-use bootstrap, rotated per-session capability, expected session/device binding, irreversible revocation and no authority to delegate to general application APIs.

The native tests inspected the actual protected DACL and its single logon-SID ACE, exercised real named pipes, checked peer PIDs, rejected a second connection and verified disposal/timeouts. A separate interactive account was not provisioned to run a cross-account attack test. The ACL is not claimed to defeat administrators, code executing with control of the technician's account, process injection or a replaced development binary. Kernel peer checks add a boundary even if another process in the same logon races the rendezvous; such a race may deny service but receives no secret. Signing and protected installation paths remain deployment work.

Windows API basis: [CreateNamedPipe flags](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea) and [GetNamedPipeClientProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid). Protocol behavior and the test results above are repository implementation evidence, not assumed platform guarantees.

## Execution privileges

Both modes use an **asInvoker / uiAccess=false** manifest. Both explicitly reject elevated tokens, session 0 and non-interactive contexts before pipe creation or WebView2 initialization. No UAC request, adapter operation, Pair/Match Network capability or privileged camera-configuration command is present.

The actual test context was the interactive technician account at **medium mandatory integrity**, with Administrators present only as a deny-only group. Native token checks, self-tests and actual GUI tests passed in that context. Node also rejects a broker readiness claim marked elevated.

**Elevated-parent to unelevated-interactive-user launch remains an explicit gate.** This phase does not attempt a privilege drop. An elevated child is rejected rather than treated as unelevated merely because its manifest says asInvoker. No elevated/UAC test was requested or performed. A future elevated main application needs a separately validated unelevated launcher or privilege split before native integration can work from that context.

## Window, navigation, TLS and runtime behavior

The host presents a WinForms window with the authorized camera identity, loading state, one WebView2 control, a truthful failure explanation and normal close behavior. It does not duplicate the full Phase 17A toolbar. The authorized target arrives only after redemption, not through an IP/URL argument. Arbitrary-IP command-line invocation is rejected.

The exact approved HTTP(S) origin is navigable, including relative camera paths. Other origins and schemes, userinfo URLs, changed ports and HTTP/HTTPS transitions are blocked. A same-IP scheme change is recognized as a transition requiring new authorization, not silently trusted. Popups, downloads and permissions are denied. There is no arbitrary address bar, host object or web-message bridge. Password saving/autofill, developer tools, default context menus and script dialogs are disabled.

Resource filtering blocks observed requests outside the approved origin. It is a navigation foundation, **not a proven universal network sandbox for every worker, WebSocket or browser-internal channel**. Real-camera exposure remains gated on broader localhost authentication/resource isolation and Phase 17F hardening. This phase's runnable invocation serves controlled local fixtures only.

Certificate errors are cancelled and reported as `CERTIFICATE_REJECTED`, with the intended device/IP retained in the native window. No AlwaysAllow, global TLS flag, OS trust change or exception workflow is used. The actual HTTPS fixture test used a self-signed in-memory OpenSSL certificate; WebView2 reported rejection and the HTTPS server received zero HTTP requests.

Actual Runtime initialization passed. A controlled nonexistent runtime directory exercised the real SDK initialization failure path without uninstalling anything: it produced `RUNTIME_UNAVAILABLE`, no initialized event and a clean session close. Initialization or renderer failure disposes content and directs the technician back to the existing application for Open External; it does not launch a cached URL or change browser preferences.

## Lifecycle and data handling

Each window receives a unique browser-data directory and an InPrivate controller. It never uses a personal Edge profile. Heartbeats revalidate Phase 17C once per second; expiry, current-evidence failure or transport loss ends the session. Close/failure messages close only that session. Parent-channel loss and watchdogs close abandoned authorization; Job Objects contain owned child lifetimes. Two concurrent real host instances were tested, and closing one did not close the other.

Normal close attempts bounded cleanup of only the generated GUID-named profile directory under `LocalApplicationData/CCTVNativeProof`. Busy files or abrupt process termination may leave profile remnants; no secure-erasure or guaranteed crash-cleanup claim is made. A later packaging/retention policy must address these owned remnants. Recovery data is never part of cleanup.

Secrets travel only in redirected private process streams and protected named pipes. They are not placed in arguments, URLs, files or inherited environment variables. The launcher supplies a small environment allowlist and does not inherit WebView2 override flags or unrelated environment credentials. Actual broker and host command lines were inspected during the two-window test: they contained neither authorization tokens nor camera addresses.

Normal diagnostic callbacks expose only allowlisted failure/state categories and a validated Runtime version. Raw IPC payloads and broker stderr are not forwarded to normal logs. Native exceptions produce generic allowlisted codes; no exception text or URL query/fragment is emitted. Phase 17C secret wrappers, redaction and persistence boundaries remain unchanged and passed regression testing.

## Controlled invocation and artifacts

No production UI, route or default-renderer code imports the native proof launcher. **The normal Camera Browser remains iframe-backed; Open External is unchanged and independent.**

From the repository, using the already-installed SDK:

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
Push-Location native
& 'C:/Program Files/dotnet/dotnet.exe' restore CameraBrowserHost/CameraBrowserHost.csproj --locked-mode
& 'C:/Program Files/dotnet/dotnet.exe' build CameraBrowserHost/CameraBrowserHost.csproj -c Release --no-restore
Pop-Location
node --import tsx src/test/native_camera_smoke.ts
```

The smoke command takes no target argument. It creates a fixture with stable mock identity, binds an owned HTTP page to an already-existing private address on this PC, obtains genuine Phase 6/17C authorization and invokes the host. This is proof of the software boundary with synthetic identity, not discovery or physical camera ownership evidence. It performs no network configuration. The native control verifies the fixture DOM marker, captures a PNG into its ignored build directory and closes through the authorized session. The captured page was visually inspected and showed the controlled fixture content.

Build artifacts are a framework-dependent host EXE/DLL, runtime configuration/dependency files and the WebView2 managed/native loader assets. They are local ignored outputs, not a new installer or distributable. The sole new native package is locked; npm dependencies and package-lock are unchanged. The lifecycle fixture additionally uses the already-installed OpenSSL 3.4.1 executable to generate a certificate/key in memory, without certificate-store writes.

## Validation results

| Focused native/protocol validation | Passed |
| --- | ---: |
| Node native protocol, replay, authority and redaction | 29 |
| Actual executable rejection, malformed input, parent loss and timeout | 4 |
| Native Windows ACL, peer, wire and navigation self-tests | 19 |
| Actual GUI smoke: initialized, rendered/captured, fixture requested, authorized close | 4 |
| Actual initialization failure, TLS rejection, process arguments, independent windows and revocation | 10 |
| **Focused total** | **66** |

Related software suites: Phase 17C **55**, Phase 6 identity-safe access **39**, Duplicate Assistant **46**, duplicate remediation **34**, Connect/Open External **29**, error/support redaction **33**, credential guidance **30**: **266 passed**.

Mocked browser regressions: Phase 17A workspace **36**, identity-safe access **15**, Duplicate Assistant **33**: **84 passed**. The unchanged production iframe behavior remains covered. The complete application regression suite was not run; production routing/identity and generic browser infrastructure were not changed.

Final selected total: **416 passed, 0 failed, 0 skipped**. TypeScript, production build, native build and diff checks pass. Native build has zero warnings/errors. This includes actual native GUI validation; a build alone is not counted as rendering proof.

Development findings were corrected before validation: stale PATH handled by the installed SDK path; omitted managed logon-SID lookup replaced with the token API; unused WPF reference removed; fixture OpenSSL path escaping fixed; Vite watcher excludes native artifacts after an exclusive screenshot-lock failure. No security check or existing regression assertion was weakened.

## Side effects, remaining gates and stop

No real camera was authenticated or configured. No camera IP, Windows IPv4/DHCP/gateway/DNS, adapter Restore or Pair recovery data was changed. No SDK or Evergreen Runtime installation occurred during the resumed phase.

**Tooling side effect:** the SDK's first build reported installing an ASP.NET Core HTTPS development certificate as part of its first-run setup. No trust command was run and this certificate was not used. Subsequent builds set `DOTNET_GENERATE_ASPNET_CERTIFICATE=false`. This is disclosed rather than claiming the SDK made no user-profile changes; it is unrelated to camera TLS handling or Windows network configuration.

Before Phase 17E exposure: resolve authenticated application bootstrap and privileged localhost/WebSocket boundaries, real-camera resource-isolation gates, and the elevated-parent integration path where needed. Protect/sign installed executable paths and define profile cleanup/update ownership before deployment. Phase 17E still owns the final toolbar/workspace integration; Phase 17F owns detailed navigation exceptions, certificate UX and adversarial web-content hardening. ActiveX/NPAPI and all legacy camera compatibility are not solved.

Stop after Phase 17D. Native remains a controlled development proof, not the default renderer or a released real-camera workflow.
