# Phase 18C.7T — static service-route consolidation contract

Baseline: Master Blueprint v1.1 through the recorded Phase 18C.7T contracts. Standalone blueprint reconciliation is not newly claimed. Starting checkpoint: codex/post-field-corrections-1 / 85216d07b8d0a28211c47f7fcfd22c407e2a5d7e. Preserve the existing DEPENDENCY_INVENTORY.md clarification.

## Evidence and boundary

Explicit historical copy: C:\Users\omarc\Documents\CCTV_Complete_Baseline_Recovery_2026_10_17. The five original emitted files independently matched catalog/provenance before model derivation:

| Output under src/server | Bytes | SHA-256 |
| --- | ---: | --- |
| current_list_routes.js | 556 | 0f025aeb5f1a0dfcd7c334a7ca7ad271dacbbf171dfd962ad70e9f898dbcb1fb |
| report_routes.js | 2873 | 0f9995779fefd57955ae782a70e42cbbf3d3cc761bd12ef359c99bb3122852c6 |
| report_set_routes.js | 1140 | 17ac1741cf26bb5b2eb3ce95d66685cb3b654fd12dd51712e4af39f863813b57 |
| task_routes.js | 5803 | 2ea6946ef101e81f20569d43061c3c7f91252c564850139b842d8411c22ad337 |
| backend_application.js | 75082 | 9a355e4ecd98a1fc19eacb789706c23b114d1fbd095cc908c31ab36aef258f8f |

The helper verifies the existing full 827-entry catalog read-only, binds all 825 selection/provenance/catalog records, parses all 97 emitted application texts for incoming imports, and records recovery observations separately from historical source/output identities. All four current route TypeScript sources match historical hashes. The current caller differs in CRLF bytes; an in-memory LF diagnostic matches historical source bytes. No on-disk normalization or transfer of historical file identity occurs.

This is an explicit static fixture profile, reusing byte-catalog verification/observations, generated-artifact descriptions, the existing caller relative-specifier validator, and island/whole-plan one-use, sticky-denial and disjoint-accounting patterns. Existing pair and Express/iconv planner profiles remain specialized and unchanged. This profile does not pass itself off as an accepted existing whole-plan replacement.

## Exact emitted boundary

All incoming imports come from backend_application.js; zero-based statement slots are 0, 10, 50 and 51. Each imports its same-named function without aliasing:

| Origin | Caller binding | Other required export |
| --- | --- | --- |
| current_list_routes.js | createCurrentListRouter | none |
| task_routes.js | taskHttpIntegration | none |
| report_set_routes.js | createReportSetRouter | none |
| report_routes.js | createReportRouter | REPORT_RENDERER_ID = 'field-document-v2' |

Seven emitted imports remain external, never incorporated:
- Each of the four routes imports Router from express.
- report_routes.js imports ReportService from ../core/reporting/report_service.js and technicianErrorResponse from ../shared/error_presentation.js.
- task_routes.js imports observeBatch from ../core/tasks/operation_tasks.js.

The other six of 13 source reference occurrences have no corresponding import in these exact emitted bytes: project_db, report_set twice, application types, task_manager, and shared tasks. The model retains the original occurrence indices, records and annotations. Absence from emitted imports is not a scanner type-only reclassification or permission to exclude those files. Mixed import declarations retain only the actual emitted names.

The model records the complete caller import sequence and exact four factory-call expressions/positions. Invocation order is task integration, current-list router, report-set router, report router; preserving call expressions and mount order is mandatory. Import evaluation order is a separate issue.

## Identity, evaluation and tooling

Proposed output: src/server/service_routes.generated.js, in the same directory as the four original outputs. Its identity, digest and size are null; it is unbuilt and unadmitted. All external paths, package metadata, singleton/class/function identities and shared root ESM metadata remain retained. Generated descriptions contain no measured output and confer no admission.

Combining imports can initialize ReportService/error/task dependencies earlier than the original interleaved caller imports. Top-level route definitions contain imports, function declarations and the renderer string constant, but external dependency side effects are not proven equivalent. Live-binding, evaluation, cache/function identity and runtime behavior remain explicit prerequisites before execution. No resolve hook, compiler, loader, listener or executable receipt exists in this profile.

staged-backend-review.cjs lists all four old review paths. staged-backend-probe.cjs directly references task/current-list/report-set paths. These tools are outside the selected payload and remain unchanged; a future explicit candidate mapping is necessary before using them with a proposed stage. Historical admission cannot transfer to generated files. Existing TypeScript source paths remain intact. No shipped facade is required by the recorded production incoming graph; compatibility with old probe paths is not claimed as already implemented.

## Arithmetic and stop conditions

Candidate-only proposal: four original route outputs -> one generated output, zero mandatory shipped facades, zero retained island originals, zero additional shipped assets/metadata: hypothetical net saving three. Rewritten backend_application.js replaces an existing output and adds no file. All external files and shared metadata stay counted once.

This is GO for a separately authorized compile-only investigation, not approval to run a compiler now. It is not a verified reduced stage, a claim of an 822-file payload, a complete dependency graph, or production readiness. All result flags executionAuthority, productionAuthority and productionReady are false; successful assessments remain blocked.

Stop if source/output identity mismatches, missing consumers/exports, unresolved ownership or cleanup uncertainty appear. Explicitly re-account any facade/support requirement; three extra physical files beyond the bundle eliminate the saving. Any new shipped file or changed mapping requires a new reviewed model, not silently increased overhead.

## Validation

Focused tests operate only on in-memory descriptions and the explicit read-only copy. They create no fixture roots, compiler/consumer processes, Jobs, ACL restoration capabilities or cleanup-owned files. The final focused test re-verifies all 827 catalog entries and 17,152,182 bytes. Negative cases cover altered bytes/hashes, callers/exports/aliases, dependencies, caller/factory order, replacement overlap, unaccounted facade/support costs, lost uncertainty/tooling and false authority. Neither historical JS nor package bodies are executed.

Final focused invocation: 25 tests passed, zero failures/cancellations/skips; both necessary node --check commands passed. An earlier 24-test invocation also passed before exact factory-call order coverage was added; results overlap and are not summed. Final full-catalog verification matched 827 files / 17,152,182 bytes. git diff --check and separate new-file whitespace checks passed after removing extra trailing blank lines. No isolated fixture roots were necessary: zero created files/roots requiring cleanup. Three new source/test/report files remain untracked; the pre-existing documentation change is preserved.

Authoritative selection remains 825, staging unresolved records 4,736, separate inventory unresolved records 882, manifest ceiling 64. All 354 unresolved dispositions, native/authentication/TLS/ownership, production API/WebSocket default-deny, camera gates, generated-execution prohibition and preserved-session restrictions remain unchanged. No commit or push.
