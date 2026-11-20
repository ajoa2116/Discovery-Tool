# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains WF-008 as user-accepted COMPLETE for its plan-only assessment. WF-001 through WF-007 remain accepted COMPLETE for recorded scopes and prior blockers/evidence remain preserved. Only the authorized documentation checkpoint publication/verification remains to report. Group A is NOT execution-authorized; whole-run confinement remains NOT PROVEN. No subsequent task is approved.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | WF-008 |
| Status | COMPLETE |
| Goal | Determine whether existing documented Windows capabilities/evidence can safely support ui_component_interactions.cjs group A and identify the smallest useful visual fallback if not. |
| Approved scope / files | Revision 1 assessment finished. Revision 2 permits acceptance records and one documentation-only commit/push of exactly TASKS.md and TASK_RESULTS.md, preserving confinement findings and all history. No implementation or other file changes. |
| Allowed operations | Record explicit user acceptance and COMPLETE; stage/commit exactly the two workflow documents; push only to existing origin/codex/post-field-corrections-1; verify synchronized HEAD and clean index/tree. No execution, Windows security/camera operations or new task. |
| Tracker/result file writes authorized | Yes, revision 1 WORKFLOW and revision 2 explicit WF-008 checkpoint instructions. |
| Acceptance criteria | Proven/not-proven confinement judgment tied to group A; exact required tooling/resources/ownership; missing prerequisites and current authorization decision; smallest visual-feedback fallback with limits; independent review; REVIEW_REQUIRED or BLOCKED, never self-close. |
| Approved checks / execution boundaries | Static document/data preservation and Git scope/whitespace/synchronization checks only. No builds/tests/launches/dependency execution, Windows security/camera operations, production/staging changes, fixtures or infrastructure. Publication limited to revision 2's two-document checkpoint; group A not execution-authorized. |
| Required evidence references and expected measurements | WF-007 preserved prerequisites and group A runner/entry/config; UI-TEST-001 historical component report; AppContainer inert model/checkpoint; existing native ownership code as text, optional existing screenshot/static-asset inventory. Repository file-data measurements only; historical external failures/recovery sessions untouched. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; starting HEAD 50bf27fc88d498b425ef3b272bfa96749a237f4c; revision 2 verified clean index, only TASKS.md/TASK_RESULTS.md modified, no untracked files; remote branch matches starting HEAD. |
| Stopping conditions | Unexpected changes, conflicts, failed checks, missing evidence or need for execution/system changes; stop after checkpoint/synchronization report. Group A remains blocked and no next task approved. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — WF-008," plan-only environment-readiness assessment. Revision 2: "CCTV Network Assistant — WF-008 checkpoint," explicitly accepts the independently reviewed assessment and authorizes COMPLETE plus one documentation-only GitHub commit/push of the two workflow files to the existing branch. |
| Latest result / blocker reference | WF-008 in TASK_RESULTS.md: retained independent PASS, explicitly accepted COMPLETE for assessment only. Whole-run confinement NOT PROVEN; group A NOT execution-authorized. Findings and prior history preserved; publication results reported after verification. |
| User review / acceptance reference | Explicit acceptance in "CCTV Network Assistant — WF-008 checkpoint." No execution, production or subsequent task authority granted. |

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
