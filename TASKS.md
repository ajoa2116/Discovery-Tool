# Active task

Standing rules: [AGENTS.md](AGENTS.md). Results format: [TASK_RESULTS.md](TASK_RESULTS.md).

The single task slot retains **Level 2 Stage A** as user-accepted COMPLETE for its offline-only scope, under "CCTV Network Assistant — Stage A Acceptance". No Stage B is created or authorized. WF-001 through WF-008 remain user-accepted COMPLETE for their recorded scopes; their results and blockers remain preserved in TASK_RESULTS.md. Group A is NOT execution-authorized and whole-run confinement remains NOT PROVEN. This task creates no WF-009 and authorizes no follow-on work.

## Task slot

| Field | Value |
| --- | --- |
| Task identifier | Level 2 Stage A |
| Status | COMPLETE |
| Goal | Implement a dependency-free, fail-closed Windows isolation-readiness preflight limited to offline development and inert query-response tests. |
| Approved scope / files | Create scripts/windows-isolation-readiness-preflight.ps1 and src/test/windows_isolation_readiness_preflight.test.ps1; modify only TASKS.md and TASK_RESULTS.md for this approval, evidence and review. |
| Allowed operations | Revision 1 implementation/validation/review finished. Revision 2 permits only verification, recording explicit acceptance/COMPLETE in TASKS.md and TASK_RESULTS.md, preserving the two implementation files and all existing evidence, and final four-file checkpoint-scope reporting. No additional implementation or tests. Revision 3 permits one exact four-file stage/commit/push to origin/codex/post-field-corrections-1 and read-only synchronization verification, under "CCTV Network Assistant — Stage A Git Checkpoint". |
| Tracker/result file writes authorized | Yes, revision 1 implementation approval, revision 2 "CCTV Network Assistant — Stage A Acceptance" and revision 3 "CCTV Network Assistant — Stage A Git Checkpoint" for publication approval/evidence recording only. |
| Acceptance criteria | Dependency-free offline-only entrypoint; absent/malformed/ambiguous/mismatched host or VM identity, non-Off VM, missing capabilities, network access or incomplete controls deny readiness; even favorable synthetic configuration never attests isolation or grants execution. Focused inert tests, independent review, stop at REVIEW_REQUIRED or BLOCKED. |
| Approved checks / execution boundaries | Revision 1 retained: 48 inert cases, two AST checks and independent PASS. Revision 2: read-only Git/file-data scope, preservation, hash and whitespace/diff checks only; no additional tests, AST validation or script execution. No live Windows/Hyper-V/VM operations, dependencies or broad suites. |
| Required evidence references and expected measurements | Accepted WF-008/WF-007 in TASK_RESULTS.md; NOVEMBER_16_2026_DEVELOPMENT_CHECKPOINT.md; PHASE_18C_7T_APPCONTAINER_OWNERSHIP_CHECKPOINT_2026_11_18.md. Historical results are not rerun or upgraded. Record exact new checks, file sizes/hashes, review context and final Git state. |
| Expected branch / HEAD / working-tree scope | codex/post-field-corrections-1; 93bb4b6d62ea4fb8843ee2912c0b1afba9a0f5f5; initially clean index/tree verified before edits; thereafter exactly the four approved files. |
| Stopping conditions | Unexpected changes, failed prerequisites, conflicting instructions, unexplained failed checks, missing required evidence or scope expansion. Routine defects may be corrected within approval; material independent-review findings require BLOCKED and stop. |
| User approval reference and approved scope revision | Revision 1: "CCTV Network Assistant — Level 2 Stage A" approved implementation, AST checks, inert tests, routine corrections, fresh-context read-only review and these four files only. Revision 2: "CCTV Network Assistant — Stage A Acceptance" explicitly accepts completed offline Stage A and authorizes acceptance records/COMPLETE plus verification/reporting only; no staging/commit/push or Stage B. Revision 3: current explicit "CCTV Network Assistant — Stage A Git Checkpoint" authorizes one commit of exactly the four named files with message "checkpoint: accepted offline isolation preflight", push only to origin/codex/post-field-corrections-1 and verification; no amend/rebase/force-push, implementation change, tests or Stage B. |
| Latest result / blocker reference | Level 2 Stage A in TASK_RESULTS.md: 48 inert cases and AST checks passed; separate fresh-context read-only review PASS, no material findings; user-accepted COMPLETE for offline Stage A only. Preflight remains NOT READY. No host or VM selected, queried or assumed suitable. |
| User review / acceptance reference | Explicit current user message "CCTV Network Assistant — Stage A Acceptance" accepts completed offline Stage A. COMPLETE is user acceptance of this scope only, not isolation readiness or execution authority. |

Publication exception (revision 3) applies only to this single accepted four-file checkpoint; prior no-publication limits remain binding beyond it. Commit hooks/signing and push hooks are disabled per invocation, with no persistent configuration change. Final SHA/synchronization are reported after verification, not asserted prospectively.

Explicit prohibitions: live Windows/Hyper-V queries; VM provisioning, boot/execution/configuration; Group A, cameras, production or unapproved dependency execution; additional files/dependencies/infrastructure; Git publication beyond the revision 3 checkpoint; automatic follow-on work. AGENTS.md and Master Blueprint v1.1 remain authoritative (standalone Blueprint unavailable); baseline 825/ceiling 64, all 29 obligations, all ten false authority flags and existing security gates remain unchanged. Address/identity remains deferred and iconv unadmitted.

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
