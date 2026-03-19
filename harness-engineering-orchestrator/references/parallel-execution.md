# Parallel Execution

## Purpose

Describe how Harness runs multiple child agents safely: eligibility rules, file-scope isolation, optimistic concurrency control, platform-specific launch behavior, and milestone/worktree merge ordering.

## Concurrency Modes

| Mode | Use case | Write model |
|------|----------|-------------|
| Read-only sidecar | Review, audit, research, scan | `read-only` |
| Scoped-write parallel task | Multiple safe tasks inside one milestone | Shared worktree, explicit disjoint `affectedFiles` |
| Worktree-isolated task | Risky writes or inter-milestone work | Separate worktree |

Default behavior is sequential. Parallelism activates only when `projectInfo.concurrency` permits it.

## Eligibility Rules

A task may join a parallel batch only when all of the following are true:

- `dependsOn` is satisfied
- milestone status is `PENDING` or `IN_PROGRESS`
- no active agent already owns the same task
- no active agent owns overlapping files or scope
- no pending scope changes are waiting for review
- UI implementation is not trying to bypass missing design artifacts

Dependency interpretation:

- `dependsOn` omitted: preserve legacy sequential behavior
- `dependsOn: []`: eligible immediately
- `dependsOn: ["T001", "T002"]`: eligible only after both are done

## File Overlap Guard

Two tasks cannot run in parallel when `affectedFiles` overlap.

Rules:

- If overlap is explicit, reject the batch.
- If ownership cannot be stated clearly, stay sequential or move one task into its own worktree.
- UI work is not eligible for shared-worktree writes until the relevant design artifacts already exist.

## Execution State Extensions

Parallel mode extends `execution` with:

- `activeAgents[]`
- `pendingScopeChanges[]`
- reservation metadata such as `ownershipScope`, timeout, and runtime handle

An `ActiveAgent` entry is parent-owned and exists for lifecycle control, not as a durable workflow artifact from the child.

## OCC Rules

All state mutations from parallel work must use `withStateTransaction()`.

Use transactions for:

- `completeTask()`
- `blockTask()`
- `registerActiveAgent()`
- `deregisterActiveAgent()`

On version conflict:

- retry up to 3 times
- if all retries fail, pause and surface the conflict

## Planner vs Launcher Boundary

Planning surface:

```bash
bun .harness/orchestrator.ts --parallel
bun .harness/orchestrator.ts --parallel --status
bun .harness/orchestrator.ts --parallel --packet-json
```

Execution surface:

```bash
bun harness:orchestrate --parallel
bun harness:orchestrate --parallel --json
bun harness:orchestrate --confirm <launchId> --handle <runtimeHandle>
bun harness:orchestrate --rollback <launchId> --reason "<why>"
bun harness:orchestrate --release <launchId>
```

Rules:

- `dispatchParallel()` computes candidate dispatches, packets, and reservation metadata.
- The launcher consumes that plan, writes `.harness/launches/<cycleId>.json`, and updates `.harness/launches/latest.json`.
- The parent runtime spawns children from that launch cycle, waits or defers according to policy, verifies postconditions, and closes children.
- Hooks remain guardrails only.

## Platform Launch Behavior

| Platform | Launch model |
|----------|--------------|
| Claude Code | `Agent` tool, typically worktree-isolated for write tasks |
| Codex CLI | Native subagents with parent-owned role hint, wait policy, close policy, and ownership scope |

Codex child rules:

1. Parent computes `SubagentDispatchPolicy` before spawn.
2. Parent may send follow-up input when required.
3. Parent waits only when blocked or batching integration.
4. Success is verified from state/filesystem evidence.
5. Child is closed after integration and deregistration.

## Worktree Isolation

### Intra-Milestone

Shared-worktree parallelism is allowed only when ownership is explicit and disjoint.

### Inter-Milestone

Parallel milestones require separate git worktrees.

### Merge Order

- Milestones merge in order.
- A later completed milestone waits in `REVIEW` if an earlier milestone has not merged.
- Rebase/merge conflicts block closeout until resolved.

## Lifecycle Management

- `bun harness:orchestrate --parallel` reserves scope in `execution.activeAgents[]` before parent-owned spawn.
- `bun harness:orchestrate --confirm <launchId> --handle <runtimeHandle>` binds the real child handle and marks the reservation `running`.
- `bun harness:orchestrate --rollback <launchId> --reason "<why>"` removes the reservation and restores the task snapshot from before launch.
- `bun harness:orchestrate --release <launchId>` removes the reservation after close/integration.
- Stale agents older than twice their timeout are cleaned up automatically.
- Spawn failure must roll back the reservation.

In parallel mode, `completeTask()` does not auto-activate the next task. The Orchestrator re-evaluates the graph on the next cycle.

## UI Routing Invariant

Parallel mode does not change the required UI sequence:

```text
frontend-designer -> execution-engine -> design-reviewer
```

Design artifacts are prerequisites, not optional side effects.

## Commands

```bash
bun .harness/orchestrator.ts --parallel
bun .harness/orchestrator.ts --parallel --status
bun .harness/orchestrator.ts --parallel --packet-json
bun harness:orchestrate --parallel
```
