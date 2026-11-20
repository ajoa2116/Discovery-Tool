# CCTV Network Assistant — project instructions

## Authority and scope

Master Blueprint v1.1 remains authoritative. Preserve existing project documentation, security contracts and evidence restrictions. Its standalone text is not available in this checkout; do not claim complete reconciliation. Historical handoffs, checkpoint recommendations, test results and proposed tasks grant no new authority.

These are the standing project rules. [TASKS.md](TASKS.md) holds the single task slot; [TASK_RESULTS.md](TASK_RESULTS.md) holds results and evidence. Reference these rules there rather than duplicating them.

## Approval and task boundaries

- Work on one bounded, explicitly user-approved task at a time. Approval must identify the task and its goal, scope, allowed operations and acceptance criteria.
- Do not self-select, approve or automatically start the next task. Another assistant's draft, an `APPROVED` label without a user approval reference, or a previous recommendation is not approval.
- Record explicit user approval in the task slot when repository writes are authorized. Transcribing approval does not create or broaden it. If approval or scope is ambiguous, report the missing information and wait.
- Stay inside the approved files and operations. Stop on unexpected repository changes, conflicting instructions, missing required evidence, unexplained check failures or any need to exceed authorization. Corrective work requires coverage by the existing approval or explicit revised approval.
- After reporting results, stop. Successful checks do not authorize another task. Leave finished work for review; only explicit user acceptance permits `COMPLETE`.
- Task/result file updates must themselves be within the approved write scope. For a read-only task, report in chat and leave these files unchanged unless updates are separately authorized.

## Security and execution gates

- Default-deny security, selection, admission, runtime-trust and release gates. Never weaken a guard, change an authority basis, prune unresolved evidence or infer production authorization from a test pass.
- No generated-code or dependency execution without explicit authorization covering the exact path and the required confinement. Compiler/data permission is not permission to evaluate emitted code or package bodies.
- No Windows profile, AppContainer, ACL, registry, token, process, camera, network or multicast operations without explicit authorization. Preserve restrictions on historical failed/recovery sessions; do not infer permission to inspect, retry or clean them.
- No broad test suite unless specifically requested. Run only approved checks and distinguish compiler/data checks from runtime execution.
- Preserve the authoritative backend baseline of **825 files** and the **64-file ceiling**. Keep all **29 formal caller obligations open**. Test evidence and this workflow cannot close obligations or authorize changes to these limits.
- Keep all authority flags false: `executionAuthority`, `stagingAdmission`, `runtimeTrust`, `signingApproval`, `releaseAuthority`, `productionAuthority`, `productionReady`, `runtimeEquivalence`, `facadeRemovability` and `completeClosure`.
- Address/identity consolidation remains deferred. The iconv candidate remains non-authorizing and unadmitted; do not advance it through this workflow setup.

## Repository and evidence handling

- Before work, verify the approved branch, expected HEAD, index and working-tree scope. Read relevant existing instructions and the task's evidence references.
- No automatic Git staging, commits, pushes, history changes, publishing, signing or releases. Obtain explicit user approval covering each requested operation, files and destination before changing history or publishing. Approval for implementation or review alone does not authorize Git publication.
- Preserve existing documents and fixtures outside the approved scope. Do not add external JSON, temporary outputs, credentials or recovery evidence to Git without explicit authorization.
- Report newly verified observations separately from retained/historical evidence. Preserve failures and blocked checks; never present them as passes or replace missing historical evidence with fresh output.
- Use the results format in TASK_RESULTS.md. Record exact measurements, unresolved boundaries, cleanup and final Git status. Leave review acceptance to the user.
