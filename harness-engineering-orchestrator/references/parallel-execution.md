# Parallel Execution

## Purpose

Reference guide for the multi-agent parallel execution model. Covers the concurrency model, OCC mechanism, platform spawning, and merge strategy.

## Concurrency Model

Two levels of parallelism:

| Level | Scope | Mechanism |
|-------|-------|-----------|
| Intra-milestone | Tasks within one milestone | Shared worktree, disjoint `affectedFiles` |
| Inter-milestone | Milestones in separate worktrees | Separate git worktrees per milestone |

Default is sequential (backward compatible). Enable via `projectInfo.concurrency`:

```json
{
  "concurrency": {
    "maxParallelTasks": 3,
    "maxParallelMilestones": 1,
    "enableInterMilestone": false
  }
}
```

## Task Dependency Graph

Tasks declare dependencies via `dependsOn: string[]`:

- Absent: implicit-sequential (existing behavior)
- Empty array: eligible for immediate parallel dispatch
- `["T001", "T002"]`: eligible only when both are DONE

## Optimistic Concurrency Control

All parallel state writes use `withStateTransaction()`:

```typescript
withStateTransaction((state) => {
  // Read, mutate, write with version check
  completeTask(taskId, commitHash)
}, STATE_PATH, 3)
```

On version conflict, the transaction retries up to 3 times.

### Transaction Scope

All parallel agents use transactions for:
- `completeTask()` — marks task DONE, refreshes milestone statuses
- `blockTask()` — marks task BLOCKED, increments retry count
- `registerActiveAgent()` — adds entry to `activeAgents[]`
- `deregisterActiveAgent()` — removes entry from `activeAgents[]`

### Error Handling

```typescript
class ConcurrencyConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`State version conflict: expected ${expected}, got ${actual}`)
  }
}
```

If all 3 retries fail, the agent pauses and surfaces the conflict for manual resolution.

## Platform Spawning

| Platform | Mechanism |
|----------|-----------|
| Claude Code | `Agent` tool with `isolation: "worktree"` |
| Codex CLI | Independent agent sessions |

## Agent Lifecycle Management

- **Registration**: `registerActiveAgent(state, agent)` adds to `activeAgents[]`, increments `stateVersion`
- **Deregistration**: `deregisterActiveAgent(state, agentId)` removes from `activeAgents[]`, increments `stateVersion`
- **Stale cleanup**: Agents older than 2x their timeout limit are auto-deregistered
- **No auto-advance**: In parallel mode, `completeTask()` does NOT auto-call `activateNextTask()`; orchestrator re-evaluates eligible tasks on next dispatch cycle

## Merge Strategy

1. Milestones merge in ID order (M1 before M2) regardless of completion order
2. If M2 completes before M1, M2 waits in REVIEW until M1 merges, then M2 rebases
3. If rebase conflict occurs, milestone stays REVIEW, `task_blocked` event recorded with `blockedReason: "merge-conflict"`, user prompted
4. Conflict detection triggers BLOCKED status — never auto-resolve merge conflicts

## File Overlap Guard

Two tasks sharing `affectedFiles` entries cannot run in parallel. The dispatcher checks pairwise overlap before dispatching.

## Commands

```bash
bun .harness/orchestrator.ts --parallel    # Dispatch eligible tasks
bun .harness/orchestrator.ts --parallel --status  # Parallel status
bun .harness/orchestrator.ts --parallel --packet-json  # JSON output
```
