# Resume Command

## Purpose

The resume script reads `.harness/state.json` and `docs/PROGRESS.md` to print a concise summary of the current project state. It is the fastest way to regain **main-thread** context after switching machines, starting a new session, or resuming work the next day.

## Invocation

```bash
bun harness:resume
bun .harness/resume.ts    # direct path equivalent
```

No flags are required. The script exits with code 1 if `.harness/state.json` is missing.

## Output Sections

### Header

Displays the project display name (or package name), current phase via `phaseLabel()`, and last-updated timestamp from `state.updatedAt`.

### Tech Stack

When `state.techStack.confirmed` is true, the first five `techStack.decisions[]` entries are listed by layer and choice.

### Execution Progress

Shown only when `state.phase === "EXECUTING"`. The script computes:

- **Total tasks** — all tasks across all milestones (`execution.milestones.flatMap(m => m.tasks)`)
- **Done tasks** — tasks with `status === "DONE"`
- **Percentage** — `Math.round((doneTasks / totalTasks) * 100)`
- **Progress bar** — 20-character bar of filled and empty blocks

Current milestone, current task, and current worktree are printed when available.

### Blocked Tasks

Any task with `status === "BLOCKED"` is listed with its `blockedReason`. Resolving blocked tasks is the recommended first action before continuing execution.

### Milestone List

All milestones are listed with a status icon and task completion ratio (`done/total`). Status icons map as follows:

| Icon | Status |
|------|--------|
| Checkmark | `COMPLETE` or `MERGED` |
| Gear | `IN_PROGRESS` |
| Yellow circle | `REVIEW` |
| Hourglass | `PENDING` |

### Next Steps

The footer prints context-aware next-step commands:

- **EXECUTING with a current task (main-thread)** — suggested `codex` and `claude` invocations that reference `AGENTS.md`, `PROGRESS.md`, `CONTEXT_SNAPSHOT.md`, and `state.json`
- **COMPLETE** — points to `bun harness:autoflow` for final compact + context health, plus `bun harness:compact --status` for manual inspection
- **Other phases** — points to `bun .harness/orchestrator.ts` and the `--next` flag

When the orchestrator dispatches Codex child subagents, those children should not perform a full resume flow. They should use only the orchestrator-provided task packet and scoped references.

Validation commands (`harness:validate`, `harness:guardian`) are always printed.

## Key Functions

| Function | File | Role |
|----------|------|------|
| `loadState()` | `harness-resume.ts` | Reads and parses `.harness/state.json` |
| `loadProgress()` | `harness-resume.ts` | Reads `docs/PROGRESS.md` and `docs/progress/CONTEXT_SNAPSHOT.md` |
| `phaseLabel()` | `harness-resume.ts` | Maps phase enum to human-readable label |

## Progress Document Sources

`loadProgress()` checks multiple locations in order:

1. `docs/PROGRESS.md` (index file)
2. `docs/progress/CONTEXT_SNAPSHOT.md` (context snapshot)
3. All `.md` files in `docs/progress/` (modular fallback)
