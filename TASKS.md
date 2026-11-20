# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

This file supports **one task slot only**. It is currently empty: **no task is selected or approved**. The initial `PENDING_APPROVAL` status is inactive; the blank fields below authorize no operations.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | NONE |
| Status | PENDING_APPROVAL |
| Goal | Not specified |
| Approved scope / files | None |
| Allowed operations | None |
| Tracker/result file writes authorized | No |
| Acceptance criteria | Not specified |
| Approved checks / execution boundaries | None |
| Required evidence references and expected measurements | None |
| Expected branch / HEAD / working-tree scope | Not specified |
| Stopping conditions | Follow AGENTS.md; task-specific conditions not specified |
| User approval reference and approved scope revision | None |
| Latest result / blocker reference | None |
| User review / acceptance reference | None |

## Status contract

| Status | Meaning |
| --- | --- |
| PENDING_APPROVAL | Empty slot or bounded draft awaiting explicit user approval; no task execution authorized. |
| APPROVED | The user explicitly approved the identified scope and operations; approval reference is recorded or supplied directly in chat. |
| IN_PROGRESS | Work is proceeding within that approval. |
| REVIEW_REQUIRED | Work stopped and results were reported; user review is required. |
| BLOCKED | Work stopped because an identified prerequisite, conflict or authorization boundary prevents progress. |
| COMPLETE | The acceptance criteria were met and the user explicitly accepted the result. |

## Handoff procedure

1. The user supplies or approves a task identifier and fills the bounded task fields, including checks and stopping conditions. A draft is not approval.
2. After explicit approval, Codex verifies the repository and prerequisites and works only on that task. Update the slot only if tracker writes are authorized; direct chat approval does not expand repository write scope.
3. Codex reports results using TASK_RESULTS.md's fields, sets `REVIEW_REQUIRED` or `BLOCKED` when file updates are permitted, and stops. For read-only work, report the status in chat.
4. The user reviews the result. Corrections need explicit coverage by the existing approval or a revised approval. The user accepts completion or explicitly replaces/withdraws the task before another task occupies this slot. Do not mark unfinished work `COMPLETE`.
5. A next task always requires new explicit approval. There is no polling, automatic queue, self-assigned follow-up or recurring task loop.

No task is approved by creating these workflow files.
