# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-004 as user-accepted COMPLETE for its documentation-only workflow implementation. WF-001 through WF-003 remain accepted COMPLETE in TASK_RESULTS.md. No task is active and no subsequent task is approved; only the explicitly authorized WF-004 checkpoint publication remains to be verified and reported.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-004 (workflow update only) |
| Status | COMPLETE |
| Goal | Reduce manual message relay through a bounded ONE-APPROVAL TASK CYCLE with separate independent review and explicit user acceptance. |
| Approved scope / files | Only AGENTS.md, TASKS.md and TASK_RESULTS.md; preserve WF-001 through WF-004 history. Revision 2 permits acceptance records and one commit/push of exactly those three documents. |
| Allowed operations | Revision 1 implementation and separate review finished. Revision 2 permits COMPLETE/acceptance records, staging exactly the three documents, one documentation-only commit, push only to origin/codex/post-field-corrections-1 and synchronization verification. No additional infrastructure. |
| Tracker/result file writes authorized | Yes, revision 1 AUTHORIZED CHANGES and revision 2 explicit acceptance/checkpoint instructions. |
| Acceptance criteria | One bounded approval can cover the named cycle; fresh independent inspection is required or stop at REVIEW_REQUIRED; PASS remains REVIEW_REQUIRED with acceptance recommendation, material issue becomes BLOCKED; retain six statuses and security boundaries; no new technical task approved. |
| Approved checks / execution boundaries | Document consistency and Git scope/whitespace/synchronization checks only; no builds, tests, compilation or module/application execution. No production, staging or security code changes; no reset, rebase, force-push or additional publication. |
| Required evidence references and expected measurements | Three workflow documents and actual Git diff/status; retain existing WF-001 through WF-003 evidence without rerunning producers. Record review context separation and reviewed revisions/hashes. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; starting HEAD 27951f73aa6dff23495537f9f4a869452330d19e; revision 2 verified clean index, exactly AGENTS.md, TASKS.md and TASK_RESULTS.md modified, no untracked files; remote branch matches starting HEAD. |
| Stopping conditions | Unexpected changes, existing synchronized WF-004 checkpoint, conflicting evidence, failed checks or scope expansion; stop after reporting checkpoint and synchronization. No subsequent task. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — Streamline Codex workflow," November 19, 2026. Revision 2: "CCTV Network Assistant — WF-004 acceptance and checkpoint," explicitly accepts documentation-only WF-004 and authorizes one three-document commit/push only to origin/codex/post-field-corrections-1. |
| Latest result / blocker reference | WF-004 in TASK_RESULTS.md; retained separate fresh-context review PASS, no material findings; explicitly accepted COMPLETE. Checkpoint publication/verification reported after Git operations. |
| User review / acceptance reference | Explicit user acceptance in "CCTV Network Assistant — WF-004 acceptance and checkpoint." No production admission or next task authorized. |

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
