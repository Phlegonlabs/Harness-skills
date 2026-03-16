# Partial Completion

## Purpose

Define the semantics of milestone partial completion: how the runtime handles milestones that have a mix of DONE, PENDING, BLOCKED, and SKIPPED tasks, and when automatic status transitions occur.

## Milestone Status Derivation

`refreshMilestoneStatuses()` in `runtime/execution.ts` recalculates each milestone's status after every task state change:

- **REVIEW** — all tasks are DONE or SKIPPED. The milestone is ready for merge review.
- **IN_PROGRESS** — at least one task has started (status is IN_PROGRESS, DONE, or BLOCKED), but not all are finished.
- **PENDING** — no task has started yet and the milestone is not already MERGED or COMPLETE.
- **MERGED / COMPLETE** — these terminal states are never overwritten by the refresh logic.

A milestone with three DONE tasks, one BLOCKED task, and two PENDING tasks remains `IN_PROGRESS`. It cannot auto-upgrade to REVIEW until every task reaches a terminal state (DONE or SKIPPED).

## Effects of `skipTask()` and `blockTask()`

### `skipTask(taskId, reason)`

- Sets the task to `SKIPPED` with a required reason.
- SKIPPED counts as a terminal state: `refreshMilestoneStatuses()` treats it identically to DONE when checking whether all tasks are finished.
- A milestone where every task is either DONE or SKIPPED will auto-promote to REVIEW.

### `blockTask(taskId, reason)`

- Sets the task to `BLOCKED` and increments `retryCount`.
- BLOCKED is not a terminal state. The milestone remains `IN_PROGRESS` as long as any task is BLOCKED.
- The runtime clears `currentTask` and calls `activateNextTask()` to find the next PENDING task, allowing forward progress on other work while the blocked task awaits resolution.

## Merge Gate Conditions

Before `completeMilestone()` accepts a merge, it enforces:

1. **Status must be REVIEW** — the milestone cannot be merged from IN_PROGRESS or PENDING.
2. **Milestone checklist must pass** — `assertMilestoneChecklistPasses()` checks critical items against the harness level:
   - All levels: `allTasksComplete`, `typecheckPassed`, `lintPassed`, `testsPassed`, `buildPassed`, `noBlockingForbiddenPatterns`, `agentsMdSynced`, `changelogUpdated`
   - Full level adds: `gitbookGuidePresent`
   - Standard and Full add: `compactCompleted`
3. At `lite` level, checklist failures produce warnings instead of blocking errors.

## Validation Checklist

`validateMilestone()` in `runtime/validation/milestone-score.ts` populates the milestone checklist by running the toolchain (typecheck, lint, format, test, build), scanning for forbidden patterns, checking file sizes, and verifying documentation artifacts. The checklist is persisted to state after each validation run.

## State Transition Diagram

```
PENDING ──[first task starts]──> IN_PROGRESS
IN_PROGRESS ──[all tasks DONE/SKIPPED]──> REVIEW
REVIEW ──[completeMilestone()]──> MERGED
MERGED ──[finalizeMilestone()]──> COMPLETE
```

Tasks that are BLOCKED keep the milestone in IN_PROGRESS. To unblock, either resolve the blocker and retry, or call `skipTask()` to move the task to a terminal state.
