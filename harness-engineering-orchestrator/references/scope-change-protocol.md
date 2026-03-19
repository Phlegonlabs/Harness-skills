# Scope Change Protocol

## Purpose

Define the PRD-first flow for adding requirements after execution has already started. Scope changes never bypass the PRD and never interrupt running agents.

## Core Rule

The PRD is always updated first. Execution state is derived from the PRD afterward.

## ScopeChangeRequest

```ts
interface ScopeChangeRequest {
  id: string
  description: string
  source: "plan-mode" | "user-request" | "prd-edit"
  priority: "normal" | "urgent"
  targetMilestoneId?: string
  proposedTasks: Array<{
    name: string
    dod: string[]
    isUI: boolean
    affectedFiles?: string[]
    dependsOn?: string[]
  }>
  createdAt: string
  status: "pending" | "previewed" | "applied" | "rejected"
}
```

Queued requests live in `state.execution.pendingScopeChanges[]`.

## Flow

1. User describes new scope.
2. Orchestrator creates a `ScopeChangeRequest`.
3. Request is queued with `status: "pending"`.
4. User previews the PRD delta.
5. User confirms apply or reject.
6. PRD is updated.
7. `bun harness:scope-change --apply` runs `syncExecutionFromPrd()` and refreshes backlog/progress automatically. Use `bun harness:sync-backlog` only after direct manual PRD edits.
8. New milestones/tasks become eligible on a later dispatch cycle.

## Preview Output

Preview should show:

- request id
- target milestone behavior
- any new milestone id that would be created
- new task ids that would be added
- the PRD delta before it is written

## Target Resolution

| Condition | Result |
|-----------|--------|
| `targetMilestoneId` is `PENDING` or `IN_PROGRESS` | Append tasks there |
| `targetMilestoneId` is `REVIEW`, `MERGED`, or `COMPLETE` | Create a new milestone |
| No target supplied | Create a new milestone |

New milestone ids auto-increment. New task ids auto-increment globally.

## Phase Reopening

If new scope lands after all current work is done:

- `VALIDATING` or `COMPLETE` reopens back to `EXECUTING`
- new milestones enter as `PENDING`
- new worktree paths are derived for the added milestone when needed

## Mid-Execution Safety

- Running agents are never interrupted.
- Pending scope changes are surfaced before any new execution dispatch.
- Urgent scope changes may influence next-task priority only after apply.

## Commands

```bash
bun harness:scope-change --preview
bun harness:scope-change --apply
bun harness:scope-change --urgent
bun harness:scope-change --milestone M[N]
bun harness:scope-change --reject <id>
bun harness:scope-change --from-stdin
```

## Apply Sequence

1. Read all previewed scope changes.
2. Generate the PRD delta for each.
3. Write the PRD changes.
4. Sync execution state from the updated PRD.
5. Record the workflow event.
6. Remove or finalize the applied requests.

## Dispatcher Integration

The dispatcher checks for `pendingScopeChanges` before sending execution agents. If unresolved entries exist, it surfaces them to the user and stops there.

## Guarantees

- G1 remains intact because execution state never becomes the source of truth.
- Scope changes may add work, but they do not retroactively fake completion.
- Rejected requests remain auditable through workflow history even if they do not enter the backlog.
