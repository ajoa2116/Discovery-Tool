# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-007 as user-accepted COMPLETE for its read-only planning scope. WF-001 through WF-006 remain accepted COMPLETE for their recorded scopes, with all prior blockers/evidence retained. Only the authorized documentation checkpoint publication/verification remains to report. Group A is the first candidate rehearsal, not execution authorization; no subsequent task is approved.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-007 |
| Status | COMPLETE |
| Goal | Identify the shortest safe way to inspect/test existing CCTV frontend without starting protected backend or accessing hardware. |
| Approved scope / files | Revision 1 read-only preparation finished. Revision 2 permits acceptance/checkpoint records and one documentation-only commit/push of exactly TASKS.md/TASK_RESULTS.md, preserving findings and limitations. No implementation or test/tool changes. |
| Allowed operations | Record explicit user acceptance and COMPLETE; stage/commit only the two workflow documents, push only to existing origin/codex/post-field-corrections-1 and verify synchronized HEAD/clean index/tree. No test/module/dependency execution, builds, launches or next task. |
| Tracker/result file writes authorized | Yes, revision 1 WORKFLOW and explicit revision 2 WF-007 checkpoint acceptance instructions. |
| Acceptance criteria | Viable UI-only options distinguished by logic/component/browser layer and backend/native/generated import boundaries; exact proposed commands/tools/requirements without execution; assess existing permission limits; recommend one smallest useful first rehearsal with safety prerequisites/stops; independent fresh review; REVIEW_REQUIRED or BLOCKED only. |
| Approved checks / execution boundaries | Static document/data preservation and Git scope/whitespace/synchronization checks only. No tests/builds/launches/dependency imports or execution, fixtures/implementation, backend/native/camera/security operations, gate changes or production changes. Publication limited to revision 2's two-document checkpoint. |
| Required evidence references and expected measurements | package.json/lockfile, Vite/TS configuration, existing Node logic tests and browser runners/TSX/HTML/import graphs; runtime/dependency declarations inspected as data only. Exact evidence paths, sizes/SHA256 and existing-harness limitations; no historical passes upgraded. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; starting HEAD e41079997bc94b45141c866265bbdd6858fdb4c6; revision 2 verified clean index, exactly TASKS.md/TASK_RESULTS.md modified, no untracked files; remote branch matches starting HEAD. |
| Stopping conditions | Unexpected changes, conflicts, missing evidence, unexplained failed check or need for implementation/execution; stop after checkpoint/synchronization report. No subsequent task approved. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — WF-007," plan-only UI rehearsal preparation. Revision 2: "CCTV Network Assistant — WF-007 checkpoint," explicitly accepts the read-only planning result and authorizes COMPLETE plus one documentation-only commit/push of the two workflow documents to the existing project branch. |
| Latest result / blocker reference | WF-007 in TASK_RESULTS.md: retained independent PASS, explicitly accepted COMPLETE for planning only. Group A remains first candidate; exact execution/confinement prerequisites and all limitations remain unsatisfied/unverified as recorded. No execution or next task approved. |
| User review / acceptance reference | Explicit user acceptance in "CCTV Network Assistant — WF-007 checkpoint." Acceptance grants no rehearsal execution or production authority. |

## Status contract

| Status | Meaning |
| --- | --- |
| PENDING_APPROVAL | Empty slot or bounded draft awaiting explicit user approval; no task execution authorized. |
| APPROVED | The user explicitly approved the identified scope and operations; approval reference is recorded or supplied directly in chat. |
| IN_PROGRESS | Work is proceeding within that approval. |
| REVIEW_REQUIRED | Work stopped and results were reported; user acceptance is required after independent PASS, or a separate fresh review is still required if unavailable automatically. |
| BLOCKED | Work stopped because an identified prerequisite, conflict or authorization boundary prevents progress. |
| COMPLETE | The acceptance criteria were met and the user explicitly accepted the result. |

## Handoff procedure

1. The user supplies or approves a task identifier and fills the bounded task fields, including checks and stopping conditions. A draft is not approval.
2. After explicit approval, Codex verifies the repository and prerequisites and works only on that task under AGENTS.md's ONE-APPROVAL TASK CYCLE, including only covered routine corrections and explicitly permitted focused checks. Update the slot only if tracker writes are authorized; direct chat approval does not expand repository write scope.
3. Obtain the separately authorized fresh-context read-only review under AGENTS.md. Record detailed findings using TASK_RESULTS.md's fields. On PASS recommend user acceptance and set `REVIEW_REQUIRED`; if independent review is unavailable set `REVIEW_REQUIRED` without claiming PASS; on a material issue set `BLOCKED` and stop. Report concisely and stop; for read-only work without tracker write permission, report the fields and status in chat.
4. The user reviews the result. Corrections need explicit coverage by the existing approval or a revised approval. The user accepts completion or explicitly replaces/withdraws the task before another task occupies this slot. Do not mark unfinished work `COMPLETE`.
5. A next task always requires new explicit approval. There is no polling, automatic queue, self-assigned follow-up or recurring task loop.

This task's approval comes only from the explicit user message referenced above. No next task is approved by this file.
