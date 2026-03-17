## 01. Preflight

### Purpose

Before starting any Task, confirm that state, documents, environment, and prerequisites are all in an executable state.

### Inputs

- `.harness/state.json`
- `AGENTS.md`
- `docs/PROGRESS.md` + `docs/progress/`
- `~/.codex/LEARNING.md` or `~/.claude/LEARNING.md`

### Required Checks

1. Read `execution.currentTask`, `execution.currentMilestone`, `execution.currentWorktree`
2. Confirm Task status is not `DONE` / `BLOCKED`
3. Confirm the requested work still matches the current Task and `prdRef`
   - If the user introduced new scope, do **not** implement it yet
   - First update `docs/PRD.md` / `docs/prd/`, then run `bun harness:sync-backlog`
   - Only resume execution after the new scope exists as a milestone/task in `.harness/state.json`
   - If the request belongs to a future delivery version (`V2+`), keep it deferred until the next version is explicitly promoted
4. Confirm PRD and Architecture entries exist:
   - `docs/PRD.md` + `docs/prd/`
   - `docs/ARCHITECTURE.md` + `docs/architecture/`
5. Confirm current progress entries exist:
   - `docs/PROGRESS.md` + `docs/progress/`
6. Run environment checks:

```bash
bun --version
git status
git branch
[configured typecheck command from state.toolchain.commands]
```

Use `state.toolchain.commands` as the source of truth for project-specific validation commands. Do not assume `bun run typecheck` outside Bun/TypeScript projects.

### Parallel Execution Awareness

When running as a parallel agent (dispatched via `--parallel`), perform these additional preflight checks:

1. **Check `affectedFiles` scope** — Read the `inlineConstraints.affectedFiles` from the task packet
2. **Verify no overlap with active agents** — Confirm no other active agent has overlapping `affectedFiles` in `state.execution.activeAgents[]`
3. **If overlap detected** — Do not start. Report the conflict back to the orchestrator for re-scheduling.

### Scope Change Check

Before beginning implementation, check `state.execution.pendingScopeChanges`:
- If any scope changes have `status: "pending"`, do not start the task
- Report the pending scope changes back to the orchestrator
- The orchestrator will surface them to the user before re-dispatching

### Outputs

- Safe to start the Task
- Or scope changed: hand back to Orchestrator / PRD update flow instead of coding
- Or pending scope changes: hand back to Orchestrator for user review
- If failed, enter Debug / Blocked flow
