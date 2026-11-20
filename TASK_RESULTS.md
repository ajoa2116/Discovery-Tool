# Task results and evidence

Standing rules: [AGENTS.md](AGENTS.md). Active task: [TASKS.md](TASKS.md).

No execution result or task approval is initialized here. Use the following concise entry format for an approved task; append entries only when results-file writes are authorized. For read-only tasks, use these fields in the chat report instead. Retain earlier results and failures rather than replacing them with later successes.

## Result entry template

- **Task identifier / approved scope revision:**
- **Result date and status:** `REVIEW_REQUIRED`, `BLOCKED`, or user-accepted `COMPLETE`; include the approval/acceptance reference where applicable.
- **Outcome:** What was completed within scope; acceptance criteria met or still unmet.
- **Changed files:** Exact paths and purpose, or `None`; identify external artifacts separately.
- **Commands:** Exact commands and exit results, with secrets redacted. State when no commands were run.
- **Checks:** What was checked and by which method; list checks deliberately not run and why.
- **Counts:** Passed / failed / skipped / blocked. Separate attempts; do not sum repeated checks as independent coverage or count blocked work as passed.
- **Newly verified observations:** Measurements established during this task, including the verification method and its limits.
- **Retained or historical evidence:** Evidence reused without rerunning its producer; identify missing or inaccessible inputs and avoid claiming fresh verification.
- **Evidence references:** Absolute local path or approved URL, byte size, SHA-256 and role for each retained artifact; distinguish recorded measurements from bytes actually remeasured. A reference does not transfer bytes or authenticate their origin.
- **Unverified security boundaries:** Explicitly state applicable gaps in confinement, compiler/runtime authenticity, dependency closure, loader consumption, runtime linking/equivalence, mapped-image identity, admission and release authority. Tests never imply production authorization.
- **Blockers / discrepancies:** Concrete failures, missing evidence, conflicting instructions or required decisions; distinguish observations from suspected causes.
- **Cleanup / restoration:** Input preservation, environment/instrumentation/cache restoration, scratch resources removed or intentionally retained, unresolved owners and recovery limits. Do not infer cleanup solely from process return or a successful test.
- **Final Git status:** Branch, full HEAD, index, tracked/untracked changes and exact scope. Report synchronization only if it was verified through authorized operations; otherwise mark it unverified.
- **Review disposition:** What needs user review or approval. A possible follow-up is a proposal only; do not select, approve or start it automatically.

Leave `COMPLETE` and any subsequent task approval to explicit user acceptance under TASKS.md. Reporting results does not authorize publication or another operation.
