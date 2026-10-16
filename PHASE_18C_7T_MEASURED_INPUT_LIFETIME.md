# Phase 18C.7T — fixture-only measured-input lifetime contract

Baseline: Master Blueprint v1.1, Architecture A technical direction and existing 7T security contracts. The standalone blueprint remains unavailable; full reconciliation is not claimed. This separately authorized bounded implementation follows the October 14 continuation checkpoint; that historical note and all five pre-existing untracked files are preserved byte-for-byte.

No production launch, authentication, release trust, signing policy or camera integration is added. Phase 18C.7T remains incomplete.

## Scope and explicit inventory

The contract resides under src/test/support and is compiled only into an independent external console fixture. It is outside the native application's default source glob. No production caller exists.

All files below are inert synthetic inputs. The two owner JSON sidecars are parsed only by the fixture's bounded consistency check; none is executed, mapped as an image, interpreted by a CLR host, or loaded by Node/.NET. Expected lengths and SHA-256 values come from explicit synthetic fixture selection, not observed module loads, a release signature or an approved runtime. The fixture is not another dependency inventory/resolver.

| Role | Exact installed-root-relative fixture path |
| --- | --- |
| node-runtime | runtime/node.exe |
| backend-entry | backend/main.cjs |
| native-addon | native/bridge.node |
| native-owner | owner/ApplicationCompanion.exe |
| configuration | owner/ApplicationCompanion.deps.json |
| configuration | owner/ApplicationCompanion.runtimeconfig.json |
| metadata | node_modules/inert/package.json |
| dependency | node_modules/inert/index.cjs |
| dependency | owner/ApplicationCompanion.dll |

The four primary roles must each occur exactly once. The owner's deps/runtimeconfig sidecars must be explicitly selected configuration inputs; naming them does not admit them automatically. Other configuration/metadata/dependency inputs require exact individual selections. Unknown roles, duplicate/case-alias paths, missing required configuration, invalid digests and paths deny.

The matching owner .dll is now mandatory as an explicitly selected dependency. It receives the same identity, SHA-256, metadata, canonical-path, ownership and lifetime checks as every other selected file. The baseline fixture has nine inputs; a separate positive includes a tenth inert owner/InertDependency.dll to exercise an additional declared app-local dependency.

## Narrow managed-sidecar consistency subset — October 14 continuation

This follows the read-only loader-boundary audit: the previous eight slots omitted the managed application DLL and treated sidecars as opaque bytes. The correction does not connect measurements to a real loader.

Both sidecars are read through the existing retained streams, bounded to 64 KiB each, and their parsed byte buffers must match the selected SHA-256 and retained metadata. The check runs during measurement, handoff and simulated-use revalidation. Malformed JSON, comments, trailing commas, excessive nesting, duplicate/case-aliased members and unsupported shapes deny terminally with tracked-resource cleanup.

Supported data subset (exact names, no inferred defaults):

- runtimeconfig: exactly `{"runtimeOptions":{"tfm":"net10.0"}}`. This is a synthetic declaration label, not a runnable configuration or approval of .NET 10.
- deps: exactly runtimeTarget, targets and libraries. runtimeTarget contains only name `.NETCoreApp,Version=v10.0`; targets has exactly that one key. Matching library identifiers use Name/major.minor.patch, with library metadata exactly `{"type":"project"}`. Each target library contains only runtime, whose assets are exact app-local DLL basenames with empty metadata objects.
- Each asset maps directly beneath the selected native owner's directory and must match one exact selected dependency. No subdirectories, traversal, URLs, absolute paths, alternate streams, casing aliases, duplicate targets or search fallback. The declared set must equal all selected owner-directory DLL inputs and include the matching managed entry. Missing declarations, undeclared selected DLLs, unselected targets and library/target mismatches deny.

This intentionally excludes normal richer deps metadata, package probing, dependency graphs, native/resources/runtimeTargets forms and alternate targets. It does not prove normal generated sidecars are supported. Framework/frameworks/includedFrameworks, rollForward and additionalProbingPaths are unresolved-provider denials; RID target selection is an unresolved-target denial. Other unsupported forms deny without fallback. Handoff evidence explicitly lists framework selection, RID alternatives, roll-forward, additional probing paths, WebView2/runtime providers and actual loader mappings as unresolved even on success. Declaring and measuring an app-local DLL never verifies its imports, managed identity, WebView2 runtime, hostfxr/hostpolicy/CoreCLR or transitive behavior.

At the managed-sidecar checkpoint, PreOpen → Measuring → Measured → HandedOff → SimulatedUse → Released was the only use path. The fixture-only consumption extension below adds an optional explicit consumer lifetime; the existing SimulateUse API remains supported. No supported input, declaration or evidence object grants release trust or production authority. The 64-file ceiling is unchanged.

Existing bounds are preserved: at most 64 selected files, 128 MiB per input, 256 MiB total. The reused admission observer independently retains its existing ancestor/directory/file bounds. No manifest/schema/key/expiry policy changes occur. This inventory does not prove these are all inputs required by real Node, addon, CLR, OS or package loaders.

## Joining root observations and measurements

PreOpen accepts an explicit root, optional PRIVATE FIXTURE boundary and exact inputs. It obtains its own fresh InstalledRootAdmission.Verify (complete ancestry) or ObserveFixtureSubtree (deliberately limited ancestry) result. It does NOT accept a previously returned result, archived Program Files receipt or caller-created approval as authority.

The unprivileged temporary positive uses a fixture boundary; CompleteAncestry remains false. Strict verification without that boundary must still deny the writable user-profile ancestry. No Program Files fixture was provisioned or revisited.

A fixture-only reflection adapter reuses the existing observer's private Canonical, Open, Identity and Descriptor methods. Layout/method failures deny; there is no fallback verifier. This preserves the original five files and avoids new native bindings. It is deliberately coupled test tooling, not an approved production API.

The contract:
1. Requires an unchanged exact set of observed paths, volume/file IDs, roles, descriptor bytes and effective-access facts between pre-open and later checks.
2. Requires the actual root's file set to equal the explicit selected file set. Extra package members or missing inputs do not acquire admission from directory membership.
3. Retains its OWN metadata handle for every observed root/ancestor/directory/file, comparing each acquisition to the fresh observation. The observer's earlier handles have already been disposed and are not treated as retained authority.
4. Opens one owned read-only FileStream per selected input, checks its identity against the pinned file, and claims that kernel volume/file ID for exactly one active fixture lease.
5. Binds each input to root plus normalized relative path, role, volume/file identity, length, SHA-256, creation/write FILETIME, attributes, hardlink count and private fixture owner correlation. Metadata, bytes and canonical identity are checked around hashing and again at handoff and inert use.
6. Revalidates the root observation and retained descriptor bytes. Access time is excluded because reads can change it; creation/write times and other captured metadata remain exact within the measured lifetime.
7. Retains handles through handoff and simulated use; release closes read streams then metadata handles. Duplicate leases cannot share ownership; a denied foreign lease cannot release another owner's claims.

The fixture owner GUID is diagnostic correlation only. Object identity, retained ownership and private state enforce this local experiment. No handle, challenge, callback, loader, process launcher or consumer-executable operation is exposed.

## State machine

| State | Permitted next operation | Evidence/lifetime |
| --- | --- | --- |
| PreOpen | Measure or Release | Fresh private observation/selection; no retained handles yet. Substitution before acquisition denies. |
| Measuring | Internal acquisition/hash/recheck only | Every acquisition is registered before fallible identity collection; partial failure closes tracked resources. |
| Measured | Handoff or Release | All explicit inputs and root facts passed; handles remain owned. |
| HandedOff | SimulateUse with the EXACT returned evidence object, or Release | Single handoff. Copying all fields/owner correlation does not create equivalent evidence. |
| SimulatedUse | Release | All exact requested paths were rechecked once; no execution occurred. |
| Released | No further measurement/handoff/use | Explicit Release replay denies; IDisposable cleanup is idempotent. |
| Denied | Cleanup only via IDisposable | Invalid transition, mismatch, foreign object, premature close or unsupported request permanently invalidates use. |

An invalid operation marks the lease Denied and attempts cleanup, including a replay after Released. Under the consumption extension below, cleanup is deferred while exact consumer completion is pending. Both states are terminal for use. No retry revives a measured result. SimulateUse requires the full explicit set exactly once; an unlisted package/helper/OS path, duplicate request, traversal, URL or external loader dependency is rejected before any corresponding file measurement/use.

Instance operations are serialized. Owned file identities are registered process-locally; Dispose/Release is mandatory. The registry deliberately retains unfinished owners and does not promise abandoned-lease or crash cleanup. Claims are removed only when tracked SafeFileHandle objects report closed. If cleanup cannot close a resource, it remains outstanding/terminal and its claim is not reassigned; forced OS closure and arbitrary descriptor reuse are not certified.

All handoff reports have ProductionAuthority=false, CompleteClosure=false and RaceFree=false. Reporting old measurements after release is diagnostic data, not a reusable loading capability.

## Windows assertions and execution limitations

Existing native identity APIs establish observed canonical paths, local fixed-disk scope, volume/file identity and rejection of reparse points/hardlink aliases. GetSecurityInfo and AccessCheck establish the observer's captured owner/group/DACL and effective-token checks. Read sharing excludes ordinary incompatible write/delete opens while retained; [CreateFileW sharing rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) also describe the access/share compatibility requirement.

SHA-256 establishes correspondence between the bytes read and this fixture's explicitly supplied digest, bracketed by metadata checks. These sequential observations do not prove no concurrent mapped write, privileged modification, malicious filesystem behavior or previously mapped image reuse. Historical SACL/MIC constancy and every other user's privileges are not certified by this observer.

There is NO mapping from these data handles to an executed image. Windows loader choices, loaded-module reuse, dependency search, CLR/framework selection, Node conditions/computed imports/WASM/assets and native DLL imports can select additional inputs. [DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order) and [LoadLibraryW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryw) make loader/module behavior a separate concern from measuring a named data file.

Unsupported loader paths are denied by this inert contract, not resolved or implicitly trusted. No selected Node/addon/owner/configuration file was executed to establish compatibility. Pre-existing mappings and actual mapped-code integrity were not tested. After final observation or handle release, a real loader could reopen paths; close-to-execution races are not eliminated. No production TOCTOU or signed release authorization is claimed.

## Focused validation

Command:
~~~powershell
node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs src/test/installed_root_admission.test.cjs
~~~

Original lifetime implementation run: two Node runner entries passed, zero failures/cancellations/skips. That version completed 62 scenario records, measured eight files and retained 17 root-observation facts. Its independent console compiled with zero warnings/errors. The existing installed-root runner passed its unchanged synthetic admission checks. These counts describe the prior implementation, not the managed-sidecar continuation below.

Coverage includes same-length byte mutation before measurement; same-path identical-byte replacement rejected by file identity; missing and renamed inputs; extra package files; hardlinks and junctions; traversal/URL/ADS/absolute/ambiguous paths; duplicate paths and simultaneous ownership; missing configuration and unsupported roles; 64-file/per-file bounds; mutation/rename attempts while retained; premature handle closure; copied handoff, double measure/handoff, use/release replay, use after release; unknown package and external DLL requests; pre-open release; idempotent Dispose; and ownership availability only after release.

Mutation/replacement before measurement was deliberately performed in private controlled files, then protection restored before the check. Tests do not claim a post-hash mapped-content mutation was exercised. While-held write/rename attempts were blocked, without attributing the failure solely to ACLs or solely to sharing.

Evidence:
C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-icPXVt

lifetime-results.json records the exact measured roles/relative paths/digests/native IDs/metadata, root/ACL observations, scenario outcomes and unresolved categories. build.log, result.stdout/stderr and cleanup.json are retained. Every lease reported zero tracked handles on completion; after ACL restoration the previously protected input and private case directories could be renamed. The console exited. The private junction was removed explicitly without traversing its target. Escrow ACL-restoration handles belong only to private test setup, not to the measured contract or production protection.

An initial focused run passed before report enrichment, additional pre-open-release/Dispose checks and the serialized diagnostic accessor. The final run above covers the final code plus the affected existing admission runner; no unexplained historical failure was retried. No full suite, broad/native application build, real provider, production service or privileged fixture ran.

## Exact repository scope and remaining blockers

New files only:
- src/test/support/measured_input_lifetime.cs — fixture-only measured-input inventory/ownership/state machine.
- src/test/support/measured_input_lifetime_fixture.cs — inert synthetic cases, reusing existing private ACL fixture setup/restoration.
- src/test/measured_input_lifetime.test.cjs — isolated console build/runner and post-release checks.
- PHASE_18C_7T_MEASURED_INPUT_LIFETIME.md — this contract/evidence note.

The two existing October 14 notes, original InstalledRootAdmission implementation, original C# fixture and original admission test remain byte-for-byte unchanged. Archived live fixture evidence remains untouched. No package/lock/configuration, native project, production launcher, auth/TLS, session deadline, API/WebSocket or camera gate is changed.

The managed-sidecar continuation changes only the same four measured-input files listed above. It preserves all nine pre-existing untracked files, editing these four in place and leaving the other five unchanged. No earlier checkpoint or archived evidence is edited.

### Managed-sidecar focused results (before ACL-restoration correction)

Final command: `node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs`.

One Node runner entry passed, zero failures/cancellations/skips, 14.017 seconds total; 114 internal scenario records passed. Baseline evidence measures nine files; a separate positive measures the managed entry plus an additional explicit inert dependency (ten inputs). The independent fixture compiled with zero warnings/errors. Exact denial reasons were checked for malformed/duplicate sidecars, case aliases, traversal/absolute/URL targets, missing or unselected declarations, undeclared selected DLLs, library mismatch, unsupported asset/configuration forms, RID/framework/roll-forward/probing conditions and duplicate target ownership. Same-size sidecar/entry tampering denied; premature closure of either sidecar or the managed entry denied. Existing lifecycle, ownership, replay, path and content checks remain included.

Final external evidence: C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-rcIV6u (lifetime-results.json, build.log, result.stdout/stderr and cleanup.json). All tracked lease handles closed, fixture exited and private fixture directories were renameable after restoration; no selected synthetic executable was executed. ProductionAuthority, CompleteClosure and RaceFree remain false. An earlier focused pass preceded the additional exact-reason and managed-handle checks; the final run covers those changes. No affected admission implementation boundary changed, so its unchanged runner was not repeated. No broad validation or application build occurred.

`git diff --check` and a direct whitespace/conflict-marker scan of the four edited untracked files passed. The other five untracked files match their prior Git-object hashes; no tracked/staged change exists, HEAD remains 55f1dd11297d823824ccb1e4bbf2eff573aab4c4 on codex/post-field-corrections-1. Archived evidence was untouched.

### Fixture ACL restoration ownership correction

The pre-commit review found that Writable stopped on its first failed DACL restore, while Dispose closed all escrow handles in finally. The measured fixture now attempts every applicable unresolved object and records each failure's acquired path, operation and exception. A failed pass closes no escrow handles. Successfully restored objects are accounted separately and skipped on an explicitly permitted retry.

Each retained object has one original baseline and escrow capability across re-protection. Reuse compares the retained and freshly opened canonical object identities through existing admission APIs; a replacement receives its own baseline/handle, while the old object's restoration ownership remains accounted. This avoids replaying intermediate protected ACL snapshots during partial recovery. No native observer or measured contract change was needed.

Cleanup states:

- Active: fixture protection/setup is in use; restoration may begin.
- Restored: every recorded DACL restore returned success; handles remain owned until disposal. Synthetic checks also read back owner/group and baseline DACL bytes.
- RecoveryPending: restoration or release failed with retained capability still available. Protection, new measured use, implicit restoration retry and disposal are blocked pending review. Only failures known to be deterministic injections have a private, explicit synthetic retry method, after removing the injection. There is no automatic retry adapter for real failures.
- Terminal: an unresolved object's original handle is unavailable/invalid. That authority cannot be reconstructed; other objects are still attempted in the initial pass, remaining capabilities are retained, and owner review is required.
- Released: all restoration completed and all escrow SafeFileHandle objects report closed. Normal disposal is idempotent.

On unexpected unresolved cleanup, strongly referenced case owners remain in the fixture process. The fixture appends recovery-pending.jsonl outside the repository with PID, original descriptor snapshots, per-object state and failures, emits FIXTURE_RECOVERY_PENDING, and waits without changing ACLs or closing retained capabilities. The runner reports/preserves the detached owner on this marker or a timeout; it no longer timeout-kills a possibly responsible fixture owner and skips its private-junction cleanup. Owner-preserved diagnostics are written externally. A genuine pending owner must not be terminated or its files cleaned before review. No interactive recovery/control adapter is provided by this change.

Handles do NOT survive owner-process exit. Detachment does not guarantee survival of logout, reboot, crash, external termination or an enclosing supervisor/job. If evidence writing fails, the stderr diagnostic and live owner are the remaining sources; durable preservation is not guaranteed. A missing capability is terminal, not repaired by a new handle. The indefinite hold deliberately needs an owner decision and is not crash-safe production recovery. This hold path is inspected but deliberately not exercised by stranding a live protected fixture during focused validation.

Deterministic early, late and combined restoration failures exercise real private temporary objects with only the selected restore calls suppressed. Tests verify exact attempt order, individual errors, all other DACLs restored, retained handle counts unchanged, blocked implicit retry/use/protection, explicit retry of only pending objects, original baseline restoration after re-protection, and leak-free/idempotent final disposal. No failure injection or recovery path is exposed to production.

The first correction run failed the existing same-path replacement scenario: path-only escrow reuse protected the parked original rather than the replacement. Object-aware reuse corrected that fixture regression. The failed run exited after ordinary restoration; it did not require a preserved recovery owner. Subsequent focused passes and final results below retain that failure history.

Final command: `node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs`. One runner passed, zero failures/cancellations/skips, 13.897 seconds; 141 internal scenarios passed. Compilation had zero warnings/errors. Each early/late/combined case retained all 18 escrow handles while pending; four injected failures across those cases were reported individually. All 51 case owners reached Released, recoveryHandlesOpen=0 and all measured lease handles closed. The fixture exited, private directories were renameable after restoration, and a read-only process query found no matching measured fixture dotnet process.

Evidence: C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-IXM9jJ. lifetime-results.json includes restorationFailureEvidence with individual failures, original descriptor snapshots and final resource accounting; cleanup.json, build.log and stdout/stderr remain external. The unresolved-owner hold branch and actual failed native CloseHandle behavior were not live-tested; normal closure and injected restoration failures are the demonstrated cases. No unexpected recovery owner was left running.

This correction edits only src/test/support/measured_input_lifetime_fixture.cs, src/test/measured_input_lifetime.test.cjs and this note. The measured contract, admission observer, other fixtures/checkpoints and archived evidence are unchanged. All nine untracked files remain present; no tracked/staged change, commit, push or branch switch. Whitespace/conflict checks and git diff --check passed. The corrected checkpoint is ready for another read-only pre-commit review; earlier parser coverage suggestions and production loading limitations remain open.

The next dependency is a separately reviewed interface for any future real loader that can consume exact approved inputs while preserving ownership/lifetime; this private reflection/test API and inert handoff do not implement that join. Actual runtime/provider dependency selection and execution semantics remain unresolved. Before production integration, exact runtime version/provenance, approved release-file digests, signing authority/key/certificate custody, final installation/update, expiry/rollback/offline policy and genuine owner/receipt/listener adoption require their outstanding owner decisions and verification. Architecture A alone does not approve them.

Original native failures, unexplained cancellations, missing original diagnostics, Vite stall and desktop timeout histories remain unresolved. Production default-deny, camera gates, native authentication/TLS, existing signing assumptions and the 64-file ceiling remain unchanged. Stop after this focused implementation; no commit or push.

## Fixture-only consumption lifetime — October 15, 2026

Starting branch and full HEAD were verified as codex/post-field-corrections-1 and 4ac75692d18dcf282f4c29d3e6f689215b1a071f, with a clean worktree. This extension changes only this note, the existing measured-input contract, its private console fixture and its Node test runner. Master Blueprint v1.1 remains the recorded baseline; its standalone text is still unavailable, so full reconciliation is not claimed.

The existing SimulateUse path remains intact. An optional BeginConsumption path reuses the same selection, exact handoff object, retained identities, ownership registry and Recheck. It requires HandedOff, the full exact selected path set and successful fresh revalidation before publishing one opaque ConsumerLease. The consumer token contains no path, GUID, handle, callback or executable operation. Constructed or memberwise-copied tokens cannot register themselves with the owner. One lease never issues a second consumer, even after completion or denial.

### Permitted transitions and independent state

| Operation | Required state/evidence | Result |
| --- | --- | --- |
| BeginConsumption | HandedOff, exact issued handoff, exact selected set, fresh Recheck | Phase Consuming; consumer Active; all original handles retained. |
| CheckConsumption | Exact issued consumer, Active, no stop reason | Existing identity/bytes/root revalidation only; no execution. |
| CancelConsumption / FailConsumption | Exact Active consumer | Irreversible Denied phase, Terminal consumer, first stop reason Cancelled / Failed; pins retained. |
| Invalid use, duplicate begin, premature Release or Dispose | Any unfinished consumer | Irreversible Denied phase; first stop reason preserved; no consumer-completion inference or pin cleanup. |
| ObserveSimulatedEnd | Exact Active or Terminal consumer | Consumer EndObserved; one opaque CompletionEvidence object issued; normal phase becomes ConsumptionEnded; denial stays Denied. Pins remain retained. |
| CompleteConsumption | Exact consumer AND its exact issued completion object, EndObserved | Consumer Completed before cleanup; no subsequent use permitted. Cleanup may succeed or remain Pending. |
| Dispose after Completed | No unfinished consumer | Idempotent cleanup of remaining owned resources; cannot revive denied consumption. |

CompletionPending includes Active, Terminal and EndObserved. Denial cannot clear it. A normal end event stops simulated use but does not release anything until its exact completion is acknowledged. Forged, copied, stale, foreign and replayed completions deny, preserving an unfinished consumer and its original pins. A duplicate end event cannot replace the original completion object. The genuine original completion remains usable solely for final cleanup after denial; it never restores consumption.

Consumer state (None/Active/Terminal/EndObserved/Completed), first stop reason (None/Denied/Cancelled/Failed), overall phase and cleanup state are reported separately. Thus Completed plus Denied is truthful: the simulation ended after denial. Completed plus Pending means completion was accepted but cleanup is unfinished. An invalid replay after normal completion permanently denies the overall lease; it cannot reacquire handles or revive the completed consumer.

### Cleanup and preservation

Cleanup has a central CompletionPending guard, including indirect cleanup from old fixture APIs. Release while completion is pending throws consumer-completion-pending. Dispose publishes denial and returns without releasing resources or claiming completion. Original ownership claims strongly retain unfinished leases; abandoned consumers have no implicit completion, timeout success or finalizer recovery.

After exact completion, cleanup attempts every unfinished read stream in reverse acquisition order. Namespace/metadata pins are closed only after every read stream reports closed. Each exception records acquired path, stream/pin operation and exception; outstanding resources remain Pending. Claims remain reserved for the entire selected set until every tracked handle reports closed. A failed completion cleanup does not retry in its catch path. Subsequent explicit disposal can continue unfinished cleanup; historical failures remain recorded. Repeated successful disposal is idempotent.

Private deterministic tests suppress selected close calls through a reflection-only set, with no callback or production injection interface. They demonstrate one retained stream with all namespace pins preserved, and separately one retained pin after streams and other pins close. Both cases preserve ownership against another measuring lease, then explicitly remove only the known test suppression and finish disposal. This does not simulate a real failing CloseHandle or prove arbitrary OS handle-reuse safety.

The console fixture now blocks restoration of a case with pending consumer completion or measured cleanup. Its existing recovery journal/hold path also accounts for unfinished measured owners, their phases, first stop reason, handle counts, measurements and cleanup failures. The runner preserves the process on the existing recovery marker or timeout rather than killing it or cleaning its junction. The inconclusive-completion test verifies pin retention and blocked restoration, then supplies an explicit genuine simulated end; it does not strand a live owner to exercise the indefinite hold branch. Strong references and open handles survive only while that process lives. Crash/logout/reboot survival and durable recovery are not claimed.

### Focused validation and limits

Final command: `node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs src/test/installed_root_admission.test.cjs`.

Both Node runner entries passed, zero failures/cancellations/skips, 30.873 seconds total. The measured-input runner passed 261 internal scenarios, including 120 new consumer-lifetime checks; its console compiled with zero warnings/errors. Existing negative assertions remain intact. The unchanged installed-root runner also passed its scoped admission checks. The first focused run passed before three additional completion-boundary cases and stronger cleanup-order assertions; the final command covers those changes.

Coverage includes normal completion; denial while active; premature Release/Dispose and release after observed end; duplicate begin; copied/forged consumers; forged/copied/stale completion and copied-consumer acknowledgement; end/completion replay; cancellation/failure with first-reason preservation; no use after end; inconclusive completion blocking restoration; exact retained SafeFileHandle objects/counts; ownership exclusion before final cleanup and reuse only afterward; deterministic stream/pin close failures; and all existing measured-input/sidecar/restoration checks. All 76 case owners reached Released, recoveryHandlesOpen=0 and every measured lease reported zero tracked handles. The fixture exited, private case directories were renameable after restoration, and a read-only process query found no matching final measured-fixture dotnet process. `git diff --check` passed.

Final measured evidence: C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-aIoe5O (lifetime-results.json, consumptionEvidence, build.log, result.stdout/stderr, cleanup.json). Admission evidence: C:\Users\Omar\AppData\Local\Temp\discovery-installed-root-rWFmb0. Earlier successful focused evidence remains at C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-daOM5n. Evidence is external; no earlier archive was modified.

ObserveSimulatedEnd is a trusted inert fixture event, not proof that an actual process, thread, CLR or loader stopped. Exact private object identity plus the registered end/ack state prevents manufactured descriptions and replay within this model; possession of an exact token is not real-world termination evidence. No executable input was run, loaded or mapped. There is no consumer callback, native application build, provider launch, elevation, installation, production caller, signing decision, API/WebSocket activation or camera operation. ProductionAuthority, CompleteClosure and RaceFree remain false. All existing manifest limits, native authentication, TLS, process/session/listener and camera boundaries are unchanged.

The smallest next technical blocker is a reviewed way to bind the simulated end transition to genuine birth-specific consumer termination/lifetime evidence before connecting any executable loader. Executable dependency closure, owner bootstrap provenance, mapped-code integrity and outstanding release-policy decisions remain unresolved. Historical failures and pending physical camera/stress tests remain unchanged. No commit or push is performed by this task.

## Owned harmless process termination bridge — October 15 continuation

The starting branch/HEAD again matched codex/post-field-corrections-1 / 4ac75692d18dcf282f4c29d3e6f689215b1a071f. The preceding four-file implementation was already uncommitted and was extended in place, not reset or discarded. Its 261 existing scenarios and simulated APIs remain. Master Blueprint v1.1 and existing security contracts remain the baseline; the unavailable standalone blueprint prevents full reconciliation.

### Construction and identity

New test-only owned_input_process.cs links to the unchanged native/ApplicationCompanion/OwnedChild.cs in the external console project. A fail-closed reflection adapter invokes only its private StartOwned, with the current fixture.exe apphost and one fixed harmless child protocol. It accepts no caller executable, command line, PID or process handle. The child runs only local pipe reads/writes, controlled waiting, normal return or an explicit abnormal Environment.Exit(7). It never opens the selected executable inputs. The independent fixture project still explicitly lists every compile input.

New owned_child_link_guards.cs supplies compilation-only symbols for the unselected launcher/Node/artifact/bridge branches in that linked source. Modes are empty or methods throw; none returns verification success or launches a provider. This avoids importing the application, WinForms, backend, addon or provider dependency graph solely to compile the existing process creation primitive. It is not a replacement verifier or a test of those excluded branches. Production OwnedChild and WindowsBoundary remain byte-for-byte unchanged.

StartOwned creates suspended with its existing atomic Job list and checks membership before the callback and ResumeThread. In that callback, the adapter retains the exact OwnedChild object, original birth-specific process SafeFileHandle and owned Job reference. DangerousAddRef keeps the original kernel process handle physically open even when OwnedChild.Dispose marks its SafeHandle closed. A non-owning observation wrapper references that same retained handle value; it does not reopen a PID. Every observation requires the wrapper to remain valid and to match the retained original value. The additional reference prevents ordinary handle-number reuse during this lifetime. No arbitrary external/forced CloseHandle, hostile reflection, memory corruption or injection resistance is claimed.

Fresh root/selection/hash/handoff checks run before the consumer token is published; registration and token association occur before the child resumes. A process cannot be registered twice or transferred to another measured owner. The fixed child image and installed framework are authorized solely as harmless test machinery, not as approved production release inputs or runtime provenance.

### Release authority and shutdown order

Process-backed consumers cannot use ObserveSimulatedEnd: it denies with process-exit-required. ObserveProcessEnd requires the exact consumer plus its registered process association, and WAIT_OBJECT_0 from the retained original birth handle. WAIT_TIMEOUT, failed waits, invalid/substituted observation handles and oversized waits never establish completion. Confirmed exit creates the existing exact CompletionEvidence object. CompleteConsumption validates both object identities and checks the same retained process handle again before marking Completed or releasing input pins. An exit code, child readiness message, PID, path, GUID or caller boolean supplies no exit authority.

CheckConsumption additionally requires the registered process to remain active and not be ending. Denial/cancellation/failure/owned-channel loss publishes terminal state first, then requests the existing bounded OwnedChild shutdown. Job closure and its kill-on-close behavior occur through OwnedChild.Dispose. Its return, Alive=false and its own bounded waits are explicitly NOT sufficient exit evidence. The adapter's extra SafeHandle reference survives that disposal; input pins stay owned until an independent exact-handle wait succeeds and the genuine completion is accepted.

The private local pipe uses existing WindowsBoundary creation/peer checks and carries only readiness/end control, never credentials or authority. Unexpected data, EOF or channel IO loss triggers terminal denial and bounded shutdown. Expected normal ending also blocks further consumption checks. The end control cannot authorize pin release. A delayed child waits at an explicit second-message gate, so live-process negative checks do not depend on a scheduler delay.

The implemented cleanup sequence attempts: exact exit observation; exact completion acknowledgement with another exit check; input read-stream closure; namespace-pin closure; another exact exit check; OwnedChild/Job/pipe disposal; confirmation that their tracked handles report closed; observation-wrapper disposal; final DangerousRelease of the original birth handle. The final added pre-release IsClosed check is defective: the retained DangerousAddRef can keep the SafeHandle unclosed until DangerousRelease, so requiring IsClosed first blocks its own final release. The final run stopped at this boundary as detailed below; this sequence is not validated as correct. All selected-file ownership claims remain reserved until input AND process resources are released. Pending input cleanup retains process identity evidence; pending process-evidence cleanup retains claims and diagnostic failures even if input handles already closed. Cleanup never infers exit from disposal, an elapsed deadline or an abnormal exit code.

The recovery journal now includes bound process evidence for pending measured owners, including startup failures after association. Existing indefinite owner preservation and no-timeout-kill behavior remain; no test deliberately strands a real recovery owner. On inconclusive termination or cleanup, pins/evidence stay available for owner review. Handle guarantees end on owner-process death; durable crash recovery is not implemented.

### Focused evidence and remaining boundary

The earlier focused run at C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-r8bQRu passed 321 internal scenarios: all preceding 261 plus 60 process checks across 17 harmless children. This was BEFORE the final pre-release IsClosed check. Cases cover normal and gated delayed exit; live denial; cancellation/failure; actual private-pipe loss; controlled abrupt exit and rejection of further consumption; simulated-completion bypass; stale/copied/replayed completion; duplicate begin; premature disposal; a real live-process wait timeout; injected WAIT_FAILED and suppressed shutdown; substitution with a real handle to a different process; input close suppression; and process-evidence cleanup suppression. Suppressions are private deterministic test controls removed explicitly after their negative assertions. All original negative assertions remain intact. These earlier results do not validate the final source.

In that earlier run each child demonstrated suspended birth-handle/Job registration and an actual signaled retained-handle wait before input release. Its cleanup assertions required closed original process/observation/Job/pipe handles, completed monitor tasks, zero retained process references, zero measured handles and released restoration owners. The final source does not currently pass those assertions. The controlled abrupt case is not an OS fault/crash-dump test. The failed-wait and failed-cleanup cases do not claim an actual failing Windows wait/CloseHandle implementation.

Final command: `node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs`. It FAILED: zero passing runner entries, one failed, 25.686 seconds, and owner preservation was triggered. The directly affected unchanged admission runner passed earlier in the combined two-runner command. Earlier successful process runs preceded deterministic exit gating, stronger active-process checks and registration/cleanup review corrections; their outputs remain historical. Only changed focused checks were repeated. No broad suite, production/native application build or unrelated validation ran.

Final FAILED-run evidence root: C:\Users\Omar\AppData\Local\Temp\discovery-measured-input-NHddGL. Its owner-preserved.json and recovery-pending.jsonl contain the failure, original descriptors, measurements and process evidence. No successful lifetime-results.json or cleanup.json is asserted for this run. The build passed with zero warnings/errors. Admission evidence: C:\Users\Omar\AppData\Local\Temp\discovery-installed-root-IjFAvZ. The earlier focused process build had three reflection-only field warnings; explicit initializers eliminated them in subsequent builds. No archived evidence was modified.

### Current stop boundary: live preserved cleanup owner

Owner PID 9784, creation time October 15 at 6:26:31 p.m. EDT, remains in the existing recovery hold. Its registered harmless child was PID 6460; the journal records repeated exact-birth-handle signaled observations. Consumer state is Completed, overall phase Denied, cleanup Pending. Input streams/namespace pins already closed after confirmed exit, but one process-handle reference and all 18 original private-case ACL restoration handles remain retained. Job and pipe report closed. The final check observed birthHandleClosed=false, observationClosed=false and retained=true, and repeatedly classified owned-cleanup-inconclusive rather than dropping authority or restoring protected objects.

The fixture restoration guard then blocked case disposal and preserved the owner/journal. This is a real unresolved owner, not an injected failure or a passing cleanup result. No process termination, external ACL restoration, file cleanup, native handle reconstruction, debugger/injection or automatic retry was performed. There is no live-control adapter in this owner. Preserve its process and evidence pending a separately reviewed recovery action; changing source cannot repair its already loaded state.

Earlier fixture observations demonstrate exact owned harmless-process termination; the current implementation remains incomplete at cleanup. They do not establish actual consumption of measured bytes, mapped-image integrity, complete executable dependency closure, production bootstrap trust or descendant-wide termination. The child code creates no descendants. The existing Job controls are reused, but a general provider/process-tree exit proof would require additional review. No measured executable was executed or mapped. No Node backend, addon/provider, PowerShell, camera, network service, installation, elevation, release/signing policy or production authority was enabled. The 64-file/128 MiB/256 MiB limits and native authentication/TLS/process/session/listener/camera gates remain unchanged. Production API/WebSocket stays default-deny.

The immediate smallest blocker is owner-reviewed recovery of PID 9784 without losing its original restoration capabilities, followed by correcting and revalidating the SafeHandle disposal/add-reference ordering. Do not retry another fixture or claim this implementation complete before addressing that boundary. Beyond it, connecting a genuinely owned consumer's actual file-open/loader boundary to the exact retained measured objects remains unresolved. Exact process exit alone does not prove it consumed those objects or close dynamic/native/CLR/provider dependencies. Master Blueprint reconciliation, historical unexplained failures and pending physical camera/stress validation remain outstanding. No commit or push.

## Future-run release ordering correction — static validation only

Branch/HEAD were confirmed as codex/post-field-corrections-1 / 4ac75692d18dcf282f4c29d3e6f689215b1a071f with the six pre-existing uncommitted files preserved. This task edits only owned_input_process.cs, the directly related measured_input_lifetime.test.cjs assertions and this note. It does not repair or interact with the preserved owner's loaded code. No process query, preserved evidence read, handle operation, protected-file access or ACL change was performed against that session. Its previous failed-run record remains authoritative and unchanged.

ReleaseEvidence no longer requires birth.IsClosed before balancing the additional reference. It records independent disposalRequested/disposalCompleted, referenceReleaseAttempted/referenceReleased and closureConfirmed states, with diagnostic releaseFailure. Disposal completion means the existing OwnedChild.Dispose call returned; it does not mean its add-referenced birth handle is already closed. A failed disposal request is not repeated and then mistaken for success merely because OwnedChild's internal idempotence flag makes subsequent Dispose calls return immediately.

After the existing exact exit/consumer checks and input cleanup, the adapter requests owned disposal, verifies Job/pipe closure, invalidates the non-owning observation wrapper and marks the additional-reference release attempted before calling DangerousRelease. It sets referenceReleased and clears retained only when that call returns. It checks original-handle/wrapper/Job/pipe closure afterward and publishes released=true only when every postcondition holds. Existing simulated consumer APIs, completion identity/replay rejection, timeout denial, channel-loss handling, bounded shutdown and input-stream-before-namespace-pin ordering remain in place.

An exception from DangerousRelease leaves referenceReleaseAttempted=true, referenceReleased=false and a diagnostic failure; whether the decrement occurred is explicitly uncertain. An ordinary return with unconfirmed closure also remains unresolved. Subsequent cleanup attempts stop at the release-issued guard before another wait or decrement. Wait likewise rejects an already issued release. Neither uncertain state restores consumption or silently drops ownership. OutstandingHandles now conservatively includes unresolved process evidence whenever a birth object exists without confirmed closure, even if retained became false after a successful decrement. This count is a pending-resource reservation, not a claim that an ambiguous native handle is definitely still open. The unchanged measured lease therefore keeps its ownership claims until all process/input evidence is resolved. Its existing cleanup-failure reporting captures errors; no new recovery control or authority was added.

The one-shot pre-registration construction-unwind path remains separate from registered-consumer ReleaseEvidence; this task does not add or claim runtime fault coverage for that path. The new release/disposal accounting applies to registered consumer shutdown and final evidence cleanup.

Validation performed:

- The source-only test `source guards enforce exactly-once process reference release ordering` passed (one test). It checks ordering, the single decrement site in ReleaseEvidence, the irreversible attempt guard, post-release closure checks, conservative unresolved-resource accounting and existing lease cleanup/claim boundaries. Selected by Node's test-name filter, it reads checkout source only; the runtime fixture test body was not executed.
- The same eight linked C# sources compiled as a Library with UseAppHost=false in a new, unrelated temporary SourceCheck project. Compilation passed with zero warnings/errors. No emitted assembly was executed, no fixture marker was created and no consumer process was launched. Compile output: C:\Users\Omar\AppData\Local\Temp\discovery-future-static-b14c9cbda9c54d488ca0f15425bfc12b.
- The existing runtime report assertions were extended to require disposal accounting, exactly one release-issued event, completed reference release and confirmed final closure. Those assertions were NOT run.
- `git diff --check` passed. Production OwnedChild, the measured lease/state machine, camera/authentication/TLS gates, release policy and the 64-file/128 MiB/256 MiB limits were not modified by this correction.

Static ordering checks and compilation do not establish live SafeHandle behavior or successful cleanup. Normal exit, cancellation, failed/ambiguous decrements, extra outstanding references and final closure still require separately authorized focused runtime validation. That validation was deliberately not attempted while the original owner remains unresolved. Recovery of that session remains blocked by the absence of an authenticated authorized in-process recovery control; this source change provides none. Master Blueprint v1.1 remains the baseline with its standalone text unavailable, and historical failures/physical camera/stress gaps remain unresolved. No commit or push.

## Inert loader-consumption boundary — isolated fixture evidence

This later bounded task preserves all six existing uncommitted paths at branch codex/post-field-corrections-1 / HEAD 4ac75692d18dcf282f4c29d3e6f689215b1a071f. It extends only measured_input_lifetime.cs, measured_input_lifetime_fixture.cs, their existing Node test and this document. The preserved original owner and its directory/evidence were not accessed or changed. The historical failed run above remains unresolved; neither the earlier independent 321-scenario success reported by the user nor this new run repairs that owner.

The existing measured lease now owns one private InertLoaderBoundary associated with its exact registered process-backed ConsumerLease and original handoff object. No separate admission authority, executable handle transfer, callback, production interface or execution permission is introduced. Its copied explicit edge array has at most 64 entries; the existing 64-file manifest ceiling and size limits are unchanged. Requests are opaque objects registered in that boundary, issued once per edge and consumed at most once, including unsuccessful attempts. Owner/boundary/consumer reference identity, active birth-specific process evidence and the existing complete measured-input recheck gate both issue and consumption. Failure terminally denies further requests and uses the existing bounded owned-child shutdown and completion/cleanup sequence.

The deliberately small fixture graph maps backend/main.cjs through selected node_modules/inert/package.json to node_modules/inert/index.cjs, then through an explicit static fixture edge to native/bridge.node. These are inert bytes, never loaded. Metadata is read through the existing bounded, digest-matched retained-stream Sidecar mechanism. Only the synthetic exact name/main shape and a selected .cjs basename are supported. Duplicate/unsupported properties, missing or incorrectly classified metadata, disagreement with the selected target, unknown edges and dynamic resolution deny. This is not an implementation or approval of Node package resolution, builtin handling, conditional exports, native DLL search or CLR/provider resolution. The supplied graph is a private fixture choice; provenance and approval of a production dependency graph remain unproved.

Evidence distinguishes three different claims: retained stream measurements establish checked file-object facts (volume/file ID, digest and metadata); repeated existing admission/path checks establish sequential namespace observations; accepted request identity/edge matching is fixture behavior only. Every receipt explicitly reports RealLoaderConsumedMeasuredHandle=false, ProductionAuthority=false, CompleteClosure=false and RaceFree=false. The parent models requests associated with its owned harmless child; the child sends no loader requests and does not read or execute selected inputs. Request objects or copied receipts are not process-authenticated IPC or execution authority.

The 24 new cases cover valid package/static edges; copied, forged, replayed and cross-session stale requests; duplicate edge issuance/boundary registration; substituted targets; unselected dependencies; absent, wrong-role, mismatched, duplicate and unsupported metadata; unknown dynamic requests/edges; wrong importer; copied boundary/consumer/handoff; cancellation/failure; blocked namespace replacement; and deterministic suppressed input cleanup. Existing lifetime, timeout, denial, process-evidence suppression and ownership negative assertions remain. Each new case checks pins remain open until exact exit/completion, then awaits the monitor and requires zero input/process resources. The cleanup suppression is a known private injection removed explicitly after its pending-state assertion, not recovery from an unexpected cleanup failure. A blocked rename does not distinguish ACL protection from handle sharing.

Validation used one fresh envelope under the checked non-reparse trusted temporary parent:

`C:\Users\Omar\AppData\Local\Temp\discovery-loader-validation-9c785763cbf84fdab03353343b25b510`

The runtime runner independently allocated its unique root:

`C:\Users\Omar\AppData\Local\Temp\discovery-loader-validation-9c785763cbf84fdab03353343b25b510\discovery-measured-input-Ro6Ktu`

Before execution the branch/HEAD, six-path worktree state, containment/reparse checks and absence of preserved-session identifiers in selected sources were checked. The concurrency check excluded the preserved PID and inspected no original-owner state. Ten source/baseline hashes remained unchanged throughout the invocation. No fixture ran concurrently and no source/build configuration changed during execution.

- Compile-only Library check: zero warnings/errors after correcting a switch fallthrough caught before runtime. JavaScript syntax and the focused source guard passed.
- Exactly one complete affected runner invocation: `node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs`. Both runner tests passed, zero failed (44.26 seconds). No case selector, broad suite or production application build ran.
- Runtime: 408/408 internal scenarios, including 87 new loader checks; 41 harmless children (17 existing process cases plus 24 new loader cases). The independent fixture build had zero warnings/errors.
- All 41 final proofs contain retained birth-handle exit observations, exactly one additional-reference-release-issued event, successful disposal/decrement accounting, confirmed original process/observation/Job/pipe closure and final process-evidence release after input cleanup. Monitor waits returned. All measured leases report zero resources; all 117 restoration owners are Released with zero restoration handles. Cleanup evidence confirms fixture exit and successful private-directory rename checks after restoration. No preservation state occurred.
- Evidence is retained only in the new envelope: runner-exit.json records invocation count one/exit zero; its fixture root contains lifetime-results.json, cleanup.json and build/output logs. `git diff --check` passed after documentation.

No production loader/provider/backend, camera, network service, PowerShell provider, elevation, installer, signing/update policy or production API/WebSocket activation was introduced. Authentication, TLS/process/session/listener binding, camera gates and default-deny restrictions remain unchanged. Master Blueprint v1.1 remains the baseline, with the previously recorded standalone-text reconciliation gap; historical unexplained failures and physical camera/stress validation remain open.

The smallest next technical blocker is proving how one concrete real loader's consumption binds to these retained objects, including its initial executable and dependency/metadata re-resolution. A pathname-based loader reopening a selected path is not proven to consume the measured handle by these tests. Any next step needs a separately bounded review of that loader boundary and request provenance before execution integration; this fixture supplies no production authority or approved release policy. No commit or push.

## One opt-in harmless LoadLibraryExW experiment

This separately authorized experiment is the first actual DLL-load exception to the earlier inert-input-only fixture descriptions. It is test support only, at the same branch/HEAD, preserving all prior uncommitted work and historical failures. No production addon, N-API entrypoint, Node backend, ApplicationCompanion executable, provider or camera was executed. The preserved original owner and its evidence were not accessed. Master Blueprint v1.1 and all existing security restrictions remain the baseline; the standalone-blueprint reconciliation gap is unchanged.

The existing complete runner opts in only with DISCOVERY_NATIVE_DLL_EXPERIMENT=1. It compiles three reviewed tiny C sources with the installed x64 MSVC tools into its fresh root, with /NOENTRY, /NODEFAULTLIB and /MANIFEST:NO. The primary DLL exports only a constant marker; the dependency exports a constant-return function; the negative probe imports that function without an entrypoint. No exported function is called. PEReader checks AMD64/PE32+ DLL format, zero entrypoint, no CLR/TLS/delay imports/resources, no primary/dependency imports, and exactly one explicit randomly named probe import. Unsupported structure or import sets stop the experiment. Compiler/framework/OS machinery remains fixture infrastructure, not approved production bootstrap provenance.

The case copies the primary PE to the existing native/bridge.node fixture slot (the name does not make it a production addon), and explicitly selects native/probe.dll and node_modules/inert/experiment_dep_9e01e443aef55b699b25323b67748bf7.dll. Eleven files are measured; the manifest ceiling remains 64, with no automatic selection. The existing boundary consumes three exact one-use static requests and derives paths/facts internally. Dispatch rejects another process association, wrong graph/selection and foreign/replayed requests; callers cannot supply raw load commands to OwnedInputProcess. The child's bounded framed exchange uses the existing verified private pipe and birth-specific ownership. Its report is diagnostic, never exit/release authority. Existing EOF monitoring resumes after the single response.

Actual loading occurs only in the registered harmless child: full canonical paths, null hFile, flags exactly LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR (0x100). No PATH, application-directory, user-directory, System32 or default-directory search flag is requested. This constrains directory search, not every Windows redirection/reuse mechanism. The probe's reviewed dependency is deliberately available in this child's current directory outside the DLL directory. The probe load returns null/error 126; neither probe nor dependency appears as a retained module, and the inventory returns to its baseline. There is no successful allowed-directory probe control in this run, so the result corroborates restricted search but does not uniquely prove the missing import caused that error or establish all dependency-resolution behavior.

The primary load succeeds. GetModuleFileNameW returns the requested path; K32GetMappedFileNameW returns its matching device path. VirtualQuery reports MEM_IMAGE with the same allocation base. GetProcAddress locates the exported data in that allocation and its marker matches. A new post-load read-only path open observes the same volume/file ID, length and digest as the pre-load measured fact:

- Volume: 3202858132; file ID: 3659174697603210; length: 1024 bytes.
- SHA-256: e8046189c491df153923b34e2e267706e6a779ae81549b65cde512bd576d7fb8.

Only the expected primary module is newly present. A second full-path load returns the same HMODULE. Two successful FreeLibrary calls balance two successful loads: the module remains after the first free and is absent after the final free, with the original module inventory restored. This tests same-file reuse, not stale/pre-existing different-image reuse, basename collision or adversarial mapped-image replacement.

| Observation | Established | Not established |
| --- | --- | --- |
| Lease before/after request | Retained file-object identity, digest, descriptors and sequential namespace checks | Atomic binding of loader open to retained handle |
| Attempted rename while pinned | Substitution attempt blocked in this protected fixture | Successful adversarial replacement/race; ACL versus sharing attribution |
| Module path and mapped device name | Matching loader/module and mapped-name observations | File ID of the image section's backing object |
| MEM_IMAGE and exported marker | Actual image mapping and matching small mapped-data marker | Full mapped-image content digest or mapped-image integrity |
| Post-load file reopen | Current namespace object matches preverified ID/digest | That this reopened handle is the loader's original section handle |
| Module inventory/import checks | Expected imports and observed module delta at sampled boundaries | Complete dynamic/OS/runtime closure or absence of transient mappings |
| Exact exit and cleanup | Original consumer exit precedes pin release; references balanced | Production authority or general provider-tree termination |

Microsoft documents [LoadLibraryExW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw) as pathname based with a reserved null file-handle parameter. [GetMappedFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getmappedfilenamew) supplies a mapped filename, not a retained section-backing file identity. Accordingly AtomicMeasuredHandleBinding=false and ProductionAuthority=false even when the diagnostic report passes. No inference of atomic consumption follows from matching paths, IDs of separately opened files, hashes or marker bytes. Mismatching/unknown observations stop further loading; ambiguous unloads are never retried, and uncertain consumer/cleanup state enters the existing owner-preservation path.

Validation used exactly one complete focused runtime invocation, with the native opt-in set, under:

`C:\Users\Omar\AppData\Local\Temp\discovery-native-loader-validation-18c85626ad03482487afb894c80d58dc\discovery-measured-input-G1JmBF`

The trusted temporary parent/ancestors and fresh root containment were checked for reparse/redirection, selected runner sources contained no preserved-session identifiers, and concurrent-owner checks explicitly excluded the preserved PID. Thirteen source hashes remained unchanged throughout execution. Compile-only checks passed with zero warnings/errors; JavaScript syntax and the existing source-only release guard passed. The single runtime invocation passed both tests in 54.61 seconds: 414/414 scenarios (all prior 408 plus six native checks), zero failures. Its independent C# build also had zero warnings/errors.

The new child (diagnostic PID 8588) demonstrated suspended birth-handle/Job registration, exact retained-handle exit, exactly one DangerousRelease, confirmed process/observation/Job/pipe closure and completed monitoring. All 42 children in the complete runner have those final process accounting postconditions. All measured handles are closed; all 118 restoration owners are Released with zero restoration handles. Native module accounting is two load references, two successful frees, zero remaining references; the failed probe adds no retained module. Pins stayed open through module unloading and until exact consumer termination/completion. The fixture owner exited normally, private directories passed post-restoration rename checks and no preservation marker occurred. Evidence remains in the new root (native-observation.json, lifetime-results.json, cleanup.json and native-build/build.log) and its envelope (source hashes, invocation count one/exit zero, validated-accounting.json). No second runtime invocation or cleanup retry occurred. `git diff --check` passed after this note.

The smallest remaining blocker is a demonstrable binding between the real image section's backing file object and the retained measured identity. These supported observations do not expose that binding; an additional proof or a reviewed architecture constraint is needed before any production loader integration. No loader-signing, installation, update, expiry, rollback or release-policy choice is made. Default-deny production API/WebSocket, authentication, TLS/process/session/listener boundaries, camera gates, 64-file limits and pending historical/physical-camera/stress gaps remain unchanged. No commit or push.

## Paired DLL dependency-search controls and documented image-backing assessment

This bounded continuation preserves all existing uncommitted work at codex/post-field-corrections-1 / 4ac75692d18dcf282f4c29d3e6f689215b1a071f. It extends native_dll_experiment.cs, the measured lease's existing request preparation, owned_input_process.cs dispatch, the existing fixture/Node runner and this record. The three harmless C sources, production sources and earlier evidence/failure records are unchanged. Master Blueprint v1.1 remains authoritative with its previously recorded standalone-text reconciliation gap. The preserved original owner and its evidence were never accessed.

The same compiled probe and dependency are now copied to two explicit measured locations before protection. Negative: native/probe.dll with its dependency only in node_modules/inert (the child's current directory). Positive: allowed/probe.dll with its dependency beside it in allowed/. Both use full-path LoadLibraryExW, null hFile and flags exactly 0x100 (LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR). No AddDllDirectory, search-policy mutation, PATH lookup, default-directory flag or production dependency is introduced. The allowed search directory is the directory of the selected positive probe. All thirteen files have individual admission, digest, identity, retained pins and explicit dependency edges; the 64-file ceiling is unchanged. The boundary consumes five exact one-use requests and derives the command internally; positive paths/facts are not caller assertions.

The case checks the copies have identical lengths/hashes but different file identities. Current-run comparable inputs (volume 3202858132):

| Pair | Negative file ID | Positive file ID | Length | SHA-256 |
| --- | --- | --- | --- | --- |
| Probe | 3659174697607160 | 3659174697607164 | 2048 | cdd4c498280f5911788a29cfe6780224ce598fdc22281eaa476bd44928e2aa24 |
| Dependency | 3659174697607161 | 3659174697607166 | 2048 | 419c934f3485a5436fc24d701a1b67bca0cb35200b6db6f05ca155ea043d98c1 |

The import basename is experiment_dep_818be28c6b971e9700db02f93bd86270.dll for both probes. Neither probe nor dependency is initially loaded. The negative load returns null/error 126 and leaves the module inventory unchanged. The positive load then succeeds fresh, adding exactly the admitted allowed/probe.dll and allowed dependency. Their module paths, mapped device names, MEM_IMAGE allocation bases and separately reopened file IDs/digests match the respective selections. The probe's resolved import slot points exactly to GetProcAddress(dependency, fixture_dependency); the function is never called. The dependency HMODULE is borrowed for observation and is never passed to FreeLibrary. One successful FreeLibrary on the owned probe reference removes both probe and implicit dependency, restoring the initial module-handle set. Repeating the negative load after that cleanup again returns 126. This is a paired fresh-resolution control, separate from the existing primary DLL's two-load/same-HMODULE reuse check.

Only module handles are inventoried in this owned child. Path, mapped-name, PE and reopened-file inspection applies to the selected fixture images (plus the owned fixture apphost binding warm-up), not unrelated modules or another process. An unexpected handle delta denies; no attempt is made to identify or load an unknown DLL. The PE parser is also tested with the real harmless probe against an empty expected-import set: it rejects unexpected-native-dependency before loading. After successful module cleanup, a request lacking an approved dependency edge terminally denies and requests existing bounded owned-child shutdown. Pins remain retained until exact birth-handle exit and completion, even though DLL unloading already succeeded. This intentional denial replaces the native case's normal-exit request; other normal-exit fixtures remain unchanged.

### Documented user-mode evidence boundary

The reviewed API contracts support the following distinctions. This is an assessment of these documented mechanisms, not a universal claim that no other Windows mechanism could exist.

| Documented mechanism | Evidence available | Why it does not establish atomic measured-handle binding |
| --- | --- | --- |
| [LoadLibraryExW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw) | Path-based load and dependency-search controls | hFile is reserved and must be null; no retained file/section handle is accepted |
| [GetModuleFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-getmodulefilenamew), [GetMappedFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getmappedfilenamew) | Loader path and filename associated with a queried mapped address | Neither returns the backing file object/ID or a handle to that object |
| [VirtualQuery](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualquery), [MEMORY_BASIC_INFORMATION](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-memory_basic_information) | Allocation base, image type and page properties | Mapping classification is not file identity, content attestation or proof against changed private image pages |
| [QueryVirtualMemoryInformation](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-queryvirtualmemoryinformation), [WIN32_MEMORY_REGION_INFORMATION](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/ns-memoryapi-win32_memory_region_information) | Documented supported MemoryRegionInfo: allocation and mapping properties | No backing file ID/handle in the documented output; reviewed only, not added to the fixture |
| [GetModuleInformation / MODULEINFO](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-moduleinfo) | Image base, size and entrypoint | These identify address-space properties, not the backing file object; reviewed only |
| [GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex), [FILE_ID_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info) | Identity of a supplied open file handle | No conversion from HMODULE/address to the loader's backing file handle; reopening a reported path observes the namespace again |
| [CreateFileMappingW](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-createfilemappingw) | A separately created mapping can be tied to a supplied file handle | That independent mapping is not proof that LoadLibraryExW used it; no mapping experiment or manual loader was added |

Consequently dependency-search success/denial is now controlled more strongly, but AtomicMeasuredHandleBinding=false and ProductionAuthority=false remain mandatory. File ID/hash matches refer to retained inputs or separate diagnostic opens. Mapped names, marker bytes and resolved import addresses corroborate the observed images; they do not establish the section's exact backing object or hash the entire mapped image. There are no unsupported information classes, kernel calls, drivers, injection, elevation or speculative provenance fallbacks. Directory restrictions do not certify all Windows redirection, loaded-module reuse, transient mappings or complete framework/provider dependency closure.

### Single fresh-session validation

Fresh root:

`C:\Users\Omar\AppData\Local\Temp\discovery-dll-controls-validation-68b8e9ea673f4aa6acb84ecb7fcbd15f\discovery-measured-input-9Ucowv`

Trusted parent/ancestor and containment checks rejected reparse/redirection ambiguity; branch/HEAD and worktree were rechecked. Selected source contained no preserved-session identifiers. Concurrent-fixture checks excluded the preserved PID without inspecting it. All thirteen source hashes stayed unchanged during execution. Compile-only Library validation passed with zero warnings/errors; JavaScript syntax and the existing source-only release guard passed.

Exactly one complete focused runtime invocation ran with the native opt-in: node --test --test-concurrency=1 src/test/measured_input_lifetime.test.cjs. Both tests passed in 45.02 seconds, with 422/422 internal scenarios, zero failures, including all preceding 414 assertions and eight added controls (fourteen native checks total). The independent fixture build had zero warnings/errors. No broad suite or production build ran.

The new native child (diagnostic PID 12600) retained its original birth-specific handle and Job association. Following intentional terminal denial, exact retained-handle exit was confirmed before input release; one DangerousRelease was issued and completed, original process/observation/Job/pipe closure was confirmed and its monitor completed. All 42 harmless children have those final accounting postconditions. All 118 case restoration owners are Released; measured resources and restoration handles remaining are both zero. Three explicit successful loads (one positive probe plus two primary loads) balance three successful FreeLibrary calls. The automatically loaded dependency disappears with its probe; it has no separately owned free/decrement. Both failed negative loads leave no retained fixture module. Post-restoration directory rename checks and fixture-owner exit passed. No preservation marker, ambiguous cleanup or retry occurred.

Evidence remains only in this new session: native-observation.json, lifetime-results.json, cleanup.json and build logs in the fixture root; source-before.json, invocation count one/exit zero and validated-accounting.json in its envelope. `git diff --check` passed after this note. All prior changes remain; no commit or push.

The smallest next blocker remains proving (or obtaining a separately reviewed architecture constraint for) the real loader image section's identity against the exact retained measured file object. The allowed-directory control closes the prior search-test gap, not that backing-object gap. Production API/WebSocket default-deny, camera gates, authentication/TLS/process/session/listener binding, release-policy limits and pending historical/physical camera/stress tests remain unchanged.
