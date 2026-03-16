# Atomic Commit Protocol

## Purpose

Define the atomic commit contract enforced by Guardian G10: one task produces exactly one commit containing one logical unit of work, traceable to the PRD.

## Definition

An atomic commit satisfies all of the following:

- Exactly one commit per task. No partial commits, no multi-task bundles.
- The commit builds, passes lint, and passes tests on its own.
- The commit can be individually reverted without breaking other features.

## Commit Message Format

```
<type>(<scope>): <description>

[optional body]

Task-ID: T{nnn}
PRD: PRD#{ref}
```

The commit message must include the Task-ID (e.g. `T003`) and the PRD mapping (e.g. `PRD#F001`). Both are verified programmatically by `inspectAtomicTaskCommit()`.

## Runtime Validation

`inspectAtomicTaskCommit()` in `runtime/atomic-commit.ts` performs a multi-step inspection when `completeTask()` is called. It returns an `AtomicCommitInspection` object with an `ok` flag and a `reasons[]` array of failures.

### Inspection Steps

1. **Task lookup** — Confirms the task exists in `state.execution.milestones[].tasks[]`.
2. **Commit resolution** — Runs `git rev-parse --verify` to confirm the commit hash exists.
3. **Branch check** — Runs `git branch --show-current`. Fails if the branch is `main` or `master` (G2 violation).
4. **Working tree cleanliness** — Runs `git status --porcelain`. Fails if there are uncommitted changes.
5. **HEAD alignment** — Runs `git rev-parse HEAD`. Fails if HEAD does not match the task commit hash.
6. **Message content** — Reads the commit message via `git log -1 --pretty=%B`. Fails if the message does not contain the Task-ID or PRD reference.
7. **Commit count** — Counts commits in the range since the previous task's commit (or since the merge-base with main/master for the first task). Fails if the count is not exactly 1.

### Failure Formatting

When inspection fails, `formatAtomicCommitFailure()` produces a human-readable summary listing each violation. `completeTask()` throws an error with this message, preventing the task from being marked DONE.

## Task Validation Integration

`validateTask()` in `runtime/validation/task.ts` also runs the atomic commit inspection as part of the task checklist. The `atomicCommitDone` field on `TaskChecklist` records whether the inspection passed. This validation can be triggered independently via:

```bash
bun harness:validate --task T003
```

## G10 Guardian Enforcement

G10 is enforced across three surfaces:

| Surface | Mechanism |
|---------|-----------|
| Git commit-msg hook | Validates message format at commit time |
| Claude PreToolUse(Bash) | Intercepts commit commands to verify format |
| `completeTask()` runtime | Runs `inspectAtomicTaskCommit()` before marking DONE |

At `lite` harness level, checklist failures produce warnings. At `standard` and `full` levels, failures block task completion.

## Checklist Summary

Before marking a task DONE, confirm:

- [ ] `git status --porcelain` is empty (working tree clean)
- [ ] `git rev-parse HEAD` matches the task commit hash
- [ ] Commit message includes `T{nnn}` (Task-ID)
- [ ] Commit message includes `PRD#{ref}` (PRD mapping)
- [ ] Exactly 1 commit since the previous task or merge-base
- [ ] Branch is not `main` or `master`
- [ ] Build, lint, and tests pass
