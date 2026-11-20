# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-006 as user-accepted COMPLETE for its plan-only assessment. WF-001 through WF-005 remain accepted COMPLETE for their recorded scopes; original WF-005 blocker remains preserved. Only the authorized documentation checkpoint publication/verification remains to report; no subsequent task is approved.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-006 |
| Status | COMPLETE |
| Goal | Identify the shortest safe realistic path from this repository to a usable Windows CCTV technician application, separating development, controlled field and production milestones. |
| Approved scope / files | Revision 1 plan-only assessment finished. Revision 2 permits acceptance records and one documentation-only commit/push of exactly TASKS.md and TASK_RESULTS.md, preserving the assessment, milestone blockers and all history. No implementation or other files changed. |
| Allowed operations | Record explicit user acceptance and COMPLETE; stage exactly the two workflow documents; one documentation-only commit and push to the existing origin/codex/post-field-corrections-1 branch; verify synchronization and clean index/tree. No execution, hardware authorization or subsequent implementation. |
| Tracker/result file writes authorized | Yes, revision 1 WORKFLOW and revision 2 explicit WF-006 acceptance/checkpoint instructions. |
| Acceptance criteria | Evidence-based practical readiness; exact blockers by development/controlled-field/production milestone; distinguish technical presence, historical results and newly verified observations; assess current testing permission; smallest safe sequence and deferrals without gate bypass; separate fresh review; REVIEW_REQUIRED or BLOCKED, never self-close. |
| Approved checks / execution boundaries | Static document/data and Git scope/whitespace/history/synchronization checks only. No implementation, builds, tests, launches, module execution, hardware operations or production/security/staging changes. Git publication limited to the two-document revision 2 checkpoint. |
| Required evidence references and expected measurements | Current package/startup/authentication composition; frontend workflow; native trust/launcher/bridge; deployment/field plans and Phase 18C.7T contracts/checkpoints. Record exact inspected paths/lines and document hashes; historical evidence is not rerun or upgraded. Blueprint standalone remains unavailable; no complete reconciliation. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; starting HEAD b5c667ce39f85ddf11a8cc0f8400e0eb80b66929; revision 2 verified clean index, only TASKS.md/TASK_RESULTS.md modified, no untracked files; exact remote branch matches starting HEAD. |
| Stopping conditions | Unexpected changes, scope conflict, missing evidence or unexplained failed check; stop after checkpoint/synchronization report. No next task approved. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — WF-006," approving the plan-only assessment. Revision 2: "CCTV Network Assistant — WF-006 acceptance," explicitly accepts the reviewed result and authorizes one documentation-only GitHub checkpoint of the two workflow files to the existing branch. |
| Latest result / blocker reference | WF-006 in TASK_RESULTS.md: retained independent PASS, no material findings; explicitly accepted COMPLETE as a qualified plan only. Assessment and milestone blockers preserved; publication results reported after verification. |
| User review / acceptance reference | Explicit user acceptance in "CCTV Network Assistant — WF-006 acceptance." No execution/hardware/production or next-task authority. |

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
