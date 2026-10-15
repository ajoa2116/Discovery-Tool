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

Existing PreOpen → Measuring → Measured → HandedOff → SimulatedUse → Released states remain unchanged; any failure permanently denies use. No supported input, declaration or evidence object grants release trust or production authority. The 64-file ceiling is unchanged.

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

An invalid operation marks the lease Denied and attempts cleanup, including a replay after Released. Both states are terminal for use. No retry revives a measured result. SimulateUse requires the full explicit set exactly once; an unlisted package/helper/OS path, duplicate request, traversal, URL or external loader dependency is rejected before any corresponding file measurement/use.

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
