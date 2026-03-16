# Concurrent Sessions

## Purpose

Supplement the [worktree-workflow.md](worktree-workflow.md) document with the session management perspective: how the harness runtime tracks, isolates, and cleans up parallel milestone work across multiple worktrees.

## State Tracking

Each active worktree corresponds to one milestone session. The runtime tracks the active session through three fields in `ExecutionState`:

- `execution.currentMilestone` — the milestone ID currently being worked on (e.g. `"M2"`)
- `execution.currentTask` — the task ID within that milestone (e.g. `"T007"`)
- `execution.currentWorktree` — the filesystem path to the worktree (e.g. `"../my-app-m2"`)

When switching sessions, the runtime calls `activateNextTask()` in `runtime/execution.ts`, which updates all three fields atomically and sets the milestone status to `IN_PROGRESS` if it was `PENDING`.

## Dev Server Isolation

Each worktree session may run its own dev server. The `observability.devServers[]` array stores one `DevServerState` entry per active server, keyed by `milestoneId`:

```typescript
{ pid: 4821, port: 3001, milestoneId: "M2", startedAt: "...", healthy: true }
```

Port allocation scans the 3000-3999 range sequentially. On worktree switch, the runtime allocates a different port to prevent conflicts between concurrent sessions.

## Session Lifecycle

1. **Create** — `git worktree add ../project-m2 milestone/m2-name` establishes the directory. The runtime records `worktreePath` on the `Milestone` object.
2. **Activate** — `preserveActiveTask()` or `activateNextTask()` sets the three tracking fields and starts the task loop.
3. **Pause** — Switching to a different milestone clears `currentTask` for the paused session. The worktree directory and its dev server remain intact.
4. **Merge** — `completeMilestone()` marks the milestone `MERGED`, clears the tracking fields, and triggers `refreshMilestoneStatuses()`.
5. **Cleanup** — After merge, remove the worktree and prune stale references.

## Cleanup Commands

```bash
# Remove a specific worktree after milestone merge
git worktree remove ../my-app-m2

# Prune worktrees whose backing directories were deleted
git worktree prune

# Delete the milestone branch after merge
git branch -d milestone/m2-name
```

On milestone merge, the runtime also sends SIGTERM to any dev servers for that milestone and removes their entries from `observability.devServers[]`.

## Constraints

- A single branch cannot have two worktrees simultaneously.
- The main worktree is never used for feature work (G2).
- Each worktree has its own `.harness/state.json` copy; the main worktree holds the canonical state.

## Multi-Agent Parallel Execution

When `ConcurrencyPolicy` is configured, the orchestrator can dispatch multiple agents simultaneously within the same session lifecycle.

### Active Agent Tracking

In addition to the legacy `currentMilestone/currentTask/currentWorktree` fields, the runtime tracks all parallel agents via `execution.activeAgents[]`:

```typescript
interface ActiveAgent {
  agentId: string
  milestoneId: string
  taskId: string
  worktreePath: string
  startedAt: string
  platform: AgentPlatform
}
```

Legacy fields are populated from the first entry in `activeAgents[]` for backward compatibility.

### Optimistic Concurrency Control

Multiple agents writing to `state.json` use `withStateTransaction()`:

1. Read state + version
2. Apply mutation
3. Write with version check — if stale, retry (up to 3 times)

### Merge Order

When inter-milestone parallelism is active:

- Milestones merge in ID order (M1 before M2) regardless of completion order
- A completed milestone waits in REVIEW until all prior milestones are merged
- Rebase conflicts trigger BLOCKED status with `merge-conflict` reason

### Stale Agent Cleanup

On each orchestrator invocation, agents older than 2x their timeout limit are deregistered from `activeAgents[]`. This prevents orphaned entries from blocking dispatch.
