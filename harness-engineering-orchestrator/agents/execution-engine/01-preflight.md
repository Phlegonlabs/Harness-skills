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
bun run typecheck
```

### Outputs

- Safe to start the Task
- Or scope changed: hand back to Orchestrator / PRD update flow instead of coding
- If failed, enter Debug / Blocked flow
