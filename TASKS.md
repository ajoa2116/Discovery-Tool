# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-005 as user-accepted COMPLETE for revision 2's denial-only scope. Original revision 1 BLOCKED history/evidence remain in TASK_RESULTS.md; WF-001 through WF-004 remain accepted COMPLETE. Only the authorized acceptance checkpoint publication/verification remains to report; no subsequent task is approved.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-005 |
| Status | COMPLETE |
| Goal | Establish whether existing package callbacks can be captured/examined and directly exercise denial only, without TypeScript/generated/third-party execution or actual registration. |
| Approved scope / files | Revision 2 implementation: src/test/package_hook_callback_inspection.test.cjs plus TASKS.md/TASK_RESULTS.md records. Revision 3: acceptance records and one commit/push of exactly those three reviewed files; test bytes unchanged. Preserve original blocker/history; no production/staging/security or AGENTS.md edits. |
| Allowed operations | Revision 2 denial-only implementation and separate review finished. Revision 3 authorizes COMPLETE/acceptance records, staging exactly the three reviewed files, one non-authorizing commit and push only to origin/codex/post-field-corrections-1, then synchronization verification. No new implementation or execution. |
| Tracker/result file writes authorized | Yes, revision 2 WORKFLOW and explicit revision 3 acceptance/checkpoint instructions. |
| Acceptance criteria | Establish dependency-free callback capture feasibility and direct denial behavior; verify synthetic generated-report-shaped inputs remain rejected before capture; state precisely limited coverage and preserved original observation blocker; focused checks and separate fresh review; REVIEW_REQUIRED or BLOCKED only. No permitted positive target loads. |
| Approved checks / execution boundaries | Revision 2 focused syntax/test results retained, not rerun. Revision 3 permits document/data/Git scope, whitespace and synchronization checks only; no new tests, builds, dependency execution, hook registration, production/staging/security changes, reset, rebase or force-push. |
| Required evidence references and expected measurements | scripts/staged-backend-review.cjs construction/top-level import chain and copied builder; existing instrumentation in src/test/generated_source_handoff.test.cjs inspected only; prior WF-005 TypeScript blocker retained. Record focused command output, source/test hashes and fresh reviewer evidence. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; starting HEAD 757c65679e1aebc5309c3d734598fc042e57196e; revision 3 verified clean index, TASKS.md/TASK_RESULTS.md modified, only reviewed test untracked; remote branch matches starting HEAD. |
| Stopping conditions | Unexpected changes, conflicts, unexplained failures or scope expansion => stop. Stop after checkpoint/synchronization report. No next task. Original generated-observation execution blocker remains unresolved. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — WF-005," blocked as retained in results. Revision 2: "CCTV Network Assistant — WF-005 scope revision." Revision 3: "CCTV Network Assistant — WF-005 acceptance checkpoint," explicitly accepts revised denial-only implementation and authorizes one three-file non-authorizing commit/push only to origin/codex/post-field-corrections-1. |
| Latest result / blocker reference | WF-005 revision 2: retained 7/7 focused checks and independent PASS; explicitly accepted COMPLETE for that scope. Original observation-validation blocker remains unresolved and preserved. Publication results reported after Git verification. |
| User review / acceptance reference | Explicit user acceptance in "CCTV Network Assistant — WF-005 acceptance checkpoint." No production admission or next-task authorization. |

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
