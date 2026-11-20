# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-002 as accepted COMPLETE. WF-001 remains accepted COMPLETE in TASK_RESULTS.md. No task is active and no subsequent task is approved.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-002 |
| Status | COMPLETE |
| Goal | Test-only generated-byte handoff integration. |
| Approved scope / files | Revision 1: existing generated selection and source callback contracts; minimal test-support adapter/refactor and focused tests; TASKS.md and TASK_RESULTS.md. Revision 2: acceptance updates and the WF-002 checkpoint document; commit/push exactly the six reviewed files plus that document. No production files. |
| Allowed operations | Revision 1 implementation/checks are finished. Revision 2 permits workflow acceptance updates, one non-authorizing checkpoint, one seven-file commit and push only to origin/codex/post-field-corrections-1, and synchronization verification. |
| Tracker/result file writes authorized | Yes, explicitly in the WF-002 prompt. |
| Acceptance criteria | Existing generated validation binds exact source bytes/observations to direct callback output; reject missing, altered, unapproved or ambiguous entries; retain production-hook denial and false authority flags; report exact focused results and cleanup. |
| Approved checks / execution boundaries | Recorded focused results only; no test reruns, compilation, module execution, hook registration or broad validation. Git publication is limited to the explicitly authorized revision 2 checkpoint. |
| Required evidence references and expected measurements | Current generated-artifact selection, byte catalog and source-hook prototype; reuse existing synthetic test infrastructure, not historical archives. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; f72e3a3162c91575f40aa1a2c06d1b1bd2b49fab; initial modifications only TASKS.md and TASK_RESULTS.md from accepted WF-001, preserved. |
| Stopping conditions | Stop on unexpected changes or an existing synchronized checkpoint. Stop after reporting the authorized checkpoint; do not start another task. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — WF-002." Revision 2: "CCTV Network Assistant — WF-002 acceptance and checkpoint," explicitly authorizing acceptance and the bounded seven-file commit/push. |
| Latest result / blocker reference | WF-002 in TASK_RESULTS.md: 170/170 recorded focused checks, independent PASS, accepted synthetic callback-only scope; runtime boundaries remain unverified. |
| User review / acceptance reference | Explicit user acceptance in "CCTV Network Assistant — WF-002 acceptance and checkpoint." |

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

This task's approval comes only from the explicit user message referenced above. No next task is approved by this file.
