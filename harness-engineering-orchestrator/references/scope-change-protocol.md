# Scope Change Protocol

## Purpose

Reference guide for the semi-automated scope change flow. Covers how new requirements are added to the PRD and execution state during active development.

## Flow Overview

1. User describes new requirements
2. Orchestrator constructs `ScopeChangeRequest`
3. Request queued in `state.execution.pendingScopeChanges[]`
4. User previews: `bun harness:scope-change --preview`
5. User confirms: `bun harness:scope-change --apply`
6. PRD updated + `syncExecutionFromPrd()` syncs state
7. New tasks appear in next dispatch cycle

## G1 Compliance

The PRD is always written first — state is derived from the PRD. This preserves G1 (PRD is the single source of requirements).

## Scope Change Request

```typescript
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

## Target Resolution

| Condition | Behavior |
|-----------|----------|
| Target milestone is PENDING/IN_PROGRESS | Append tasks to it |
| Target milestone is MERGED/COMPLETE | Create new milestone |
| No target specified | Create new milestone |

## Continuation After Completion

When all milestones are complete but new scope is added:
- `syncExecutionFromPrd()` detects new milestones
- Phase resets from VALIDATING/COMPLETE to EXECUTING
- New milestones enter as PENDING

## PRD Delta Generation

```typescript
function generatePrdDelta(
  request: ScopeChangeRequest,
  state: ProjectState,
  prdContent: string
): PrdDelta

interface PrdDelta {
  insertAfterLine: number
  content: string
  newMilestoneId?: string   // Set when a new milestone is created
  newTaskIds: string[]      // IDs of tasks being added
}
```

### Target Milestone Resolution

| Condition | Behavior |
|-----------|----------|
| `targetMilestoneId` specified, milestone is PENDING/IN_PROGRESS | Append tasks under existing milestone |
| `targetMilestoneId` specified, milestone is REVIEW/MERGED/COMPLETE | Create new milestone with auto-incremented ID |
| `targetMilestoneId` not specified | Create new milestone with auto-incremented ID |

### ID Generation

New milestones: `M{N+1}` where N is highest existing. New tasks: `T{N+1}` where N is highest existing across all milestones.

## Phase Re-Entry

When scope is added after all milestones are complete:
- If `state.phase` is VALIDATING or COMPLETE, it resets to EXECUTING
- New milestones enter as PENDING with auto-generated worktree paths
- `syncExecutionFromPrd()` detects the new milestones and updates execution state

## Mid-Execution Safety

- **Non-interruption guarantee**: Running agents are never interrupted by scope changes. New tasks enter as PENDING.
- **Priority dispatch**: When `priority: "urgent"`, `activateNextTask()` prefers urgent tasks.
- **Dispatcher integration**: If `pendingScopeChanges` with `status: "pending"` exist, dispatcher surfaces them instead of dispatching any agent.

### Apply Sequence

1. Read all `pendingScopeChanges` with `status: "previewed"`
2. Generate PRD delta for each
3. Apply delta to `docs/PRD.md`
4. Run `syncExecutionFromPrd()`
5. Mark `status: "applied"`
6. Record `scope_change_applied` workflow event
7. Remove from `pendingScopeChanges`

## Commands

```bash
bun harness:scope-change --preview          # Preview changes
bun harness:scope-change --apply            # Apply changes
bun harness:scope-change --from-stdin       # Pipe in JSON request
bun harness:scope-change --urgent           # Mark as urgent
bun harness:scope-change --milestone M3     # Target specific milestone
bun harness:scope-change --reject <id>      # Reject a change
```
