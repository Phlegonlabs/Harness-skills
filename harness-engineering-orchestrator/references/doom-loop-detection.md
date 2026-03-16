# Doom-Loop Detection

6 heuristics for detecting agent cycling behavior, with thresholds and escalation.

## Heuristics

### H1: Repeated File Edit
- Same file edited ≥ 3 times in one task session without intermediate commit → **Warn**
- Same file edited ≥ 5 times in one task session without intermediate commit → **Auto-pause, escalate**

### H2: State Oscillation
- `BLOCKED → IN_PROGRESS → BLOCKED` cycle with same/similar `blockedReason` → **Auto-pause** after second cycle
- `IN_PROGRESS → DONE(fail) → IN_PROGRESS` cycle → Already handled by 3-retry behavior

### H3: Token Waste
- 2 consecutive responses with zero file mutations during EXECUTING → **Warn**
- >50% of per-agent token budget consumed with zero commits → **Auto-pause**, suggest task decomposition

### H4: Duplicate Action
- Same `bun harness:validate` command executed 3+ times with same failure → **Escalate**
- Agent reads same file 3+ times in one session → **Warn**, suggest compaction

### H5: Repetitive Output
- Output with >80% token overlap to previous attempt on same task → **Warn**
- 2+ consecutive outputs exceeding 80% overlap threshold → **Auto-pause, escalate** with diff summary

### H6: Semantic Stall
- >3 file writes but task DoD checklist items unchanged after validation → **Warn**
- DoD checklist unchanged after 5+ file writes and at least one validation run → **Auto-pause, escalate**

## Escalation Ladder

```
Warn → Auto-pause → Escalate
```

## Gear-Drop Protocol

On any auto-pause:
1. Switch to planning-only mode
2. Break task into subtasks
3. If still stuck: skip and escalate (mark BLOCKED with `"gear-drop: {heuristic}"`)

## Type Reference

```typescript
type DoomLoopHeuristic =
  | "repeated_file_edit"
  | "state_oscillation"
  | "token_waste"
  | "duplicate_action"
  | "repetitive_output"
  | "semantic_stall"
```

See also: [error-taxonomy.md](./error-taxonomy.md), [agents/execution-engine/02-task-loop.md](../agents/execution-engine/02-task-loop.md)
