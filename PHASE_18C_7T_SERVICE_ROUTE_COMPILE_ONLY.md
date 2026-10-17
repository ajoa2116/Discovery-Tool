# Phase 18C.7T — one service-route compile-only feasibility observation

Master Blueprint v1.1 and established Phase 18C.7T restrictions remain authoritative; no new standalone blueprint reconciliation or release approval is claimed.

## Starting state and scope

Verified C:\Users\omarc\Documents\Discovery-Tool, codex/post-field-corrections-1, HEAD 85216d07b8d0a28211c47f7fcfd22c407e2a5d7e. Expected pre-existing work only: DEPENDENCY_INVENTORY.md clarification plus the static service-route helper, test and report. All four were measured before the experiment and checked unchanged afterward.

Historical evidence was read only from C:\Users\omarc\Documents\CCTV_Complete_Baseline_Recovery_2026_10_17. Existing catalog verification matched all 827 entries / 17,152,182 bytes before and after. Four route files and caller matched pinned historical digests/lengths. No current build replaced historical inputs; no recovered file was modified.

Exactly ONE compiler invocation occurred, with no retry or version subprocess. No generated module, historical route module, backend, provider or package script was executed.

## Compiler and invocation

Local esbuild 0.28.2, identified through two matching installed package records, matching lockfile versions, and binary SHA-256 c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef. Compiler bytes were copied and independently measured; original installed observations remained unchanged. This does not independently authenticate upstream provenance or approve a production compiler/runtime.

Exact arguments (working directory: the isolated stage):
~~~
src/server/service_routes.entry.js
--bundle
--platform=node
--format=esm
--target=node24
--tree-shaking=false
--packages=external
--external:../core/reporting/report_service.js
--external:../shared/error_presentation.js
--external:../core/tasks/operation_tasks.js
--legal-comments=inline
--outfile=src/server/service_routes.generated.js
--metafile=../evidence/esbuild-metafile.json
--log-level=warning
~~~

The explicit entry re-exported current-list, task integration, report-set, then report factory/renderer ID. It was a measured compile-only input, never a proposed extra shipped runtime file.

## Actual compiler correspondence

Five actual compiler inputs: four original route modules and the explicit entry. All four original modules have positive output contributions. Metafile input lengths match measured copies; seven original external source occurrences remain external and no package/service bodies were incorporated.

| Emitted request | Imported symbol / generated local names |
| --- | --- |
| express, four occurrences | Router / Router, Router2, Router3, Router4 |
| ../core/tasks/operation_tasks.js | observeBatch |
| ../core/reporting/report_service.js | ReportService |
| ../shared/error_presentation.js | technicianErrorResponse |

Exactly five output exports: REPORT_RENDERER_ID, createCurrentListRouter, createReportRouter, createReportSetRouter, taskHttpIntegration. No added default export, dynamic loader, module-relative asset operation, source map or legal-comment sidecar was found in the statically parsed output.

Output src/server/service_routes.generated.js: 9,497 bytes, SHA-256 3feedc565c11808b57d773ff87c784deb641dbd2ce7222a2563e19c70ae6ea57.
Metafile: 3,810 bytes, SHA-256 4fec4eb0ec68e8ab45034a5a0ee2b58ae8f8dba4492d43686dc0290996269b6f.

The separately retained PHASE_18C_7T_SERVICE_ROUTE_COMPILE_EVIDENCE.json includes exact arguments, entry text, original input provenance, input/output compiler metadata, raw metafile, measured observations, output import/export descriptions and accounting catalogs. It is non-executable evidence, not an executable manifest or admission. Generated JS bytes were deleted after successful review/measurement; recorded identities describe a historical workspace object.

## Physical arithmetic and unresolved obligations

Measured compiler runtime output count: one. No additional emitted source maps, metadata or sidecar output. Root ESM package metadata is an existing retained boundary, not a new file. Compiler executable, harness, entry, metafile and diagnostics were experiment inputs/evidence, not shipped payload.

Conditional candidate projection: four original route outputs -> one bundle plus zero identified mandatory shipped compatibility/support files = three hypothetical files saved. This assumes future explicit redirection of four backend caller imports. Current staging/probe consumers of old paths remain unchanged and would need candidate mappings. No actual compatibility facade requirement was demonstrated or waived. If three additional mandatory physical files emerge, the saving disappears and investigation must stop.

Authoritative selection remains 825. No verified 822-file payload exists. The 4,736 staging unresolved records, 882 separate inventory records and all 354 retained dispositions remain unchanged. Four Express resolution flags remain open.

Compiler incorporation is not runtime reachability. Combining the modules changes import grouping and may initialize external dependencies earlier. ESM evaluation order, live-binding/cache/function identity and runtime equivalence remain unproven. Exact owned-consumer loading, independent generated admission, upstream authenticity, mapped-image binding and release policy remain separate blockers.

## Validation and owned resources

The existing static assessment was checked before compilation and rederived afterward. Two Node harness syntax checks and one PowerShell driver syntax check passed. Fourteen postcompile static/accounting check groups passed before cleanup; a fifteenth summary cross-check matched pre-cleanup copied-module/compiler/root-metadata measurements to original measurements. This was not a rerun of the 25-test static suite or broad regression testing.

Fresh root: C:\Users\omarc\.codex\visualizations\2026\10\17\01a14ab7-ef0b-7190-a5e8-4e411622f090\service-route-compile-1792267449076. Ancestors rejected observed reparse points; the root was created exclusively. The compiler was started directly without a shell or visible window. Its original Process/SafeHandle was retained; birth time was recorded, WaitForExit signaled, HasExited was true and exit code zero. Output/error were empty. Stream readers, process object and original safe handle were explicitly disposed/closed. No PID lookup, signal, process enumeration or global cleanup occurred. No fixture Job or ACL-restoration capability was created. This does not assert machine-wide process absence or production OwnedChild equivalence.

Final catalog accounted for exactly 18 owned files. All were identity-checked and individually unlinked; ten directories were removed bottom-up without recursive deletion. Root absence was confirmed. Zero retained case files or fixture roots; generated output, compiler copy and harness scripts are gone. The non-executable repository summary retains their measurements. No protected historical session was accessed.

## Decision and smallest next step

GO for subsequent NON-EXECUTING review of the recorded compiler graph, derivation, and exact four-caller/review-probe mappings. No additional compiler run is authorized by this result. Require explicit treatment of changed initialization ordering before any future execution proposal. Fresh live generated bytes would be required for later independent admission; archived measurements cannot grant it.

All authority flags remain false. Production API/WebSocket default-deny, native authentication/TLS/process ownership, camera gates, generated-bundle execution prohibition, signing/release restrictions and unchanged 64-file ceiling remain intact. No staging, commit, push or merge.
