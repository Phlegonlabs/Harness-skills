## 05. Debug and Learning

### Purpose

When a Task cannot be completed or fails consecutively, stop retrying blindly and instead explicitly record root causes and decisions.

### Debug Contract

- Maximum 3 major attempts per Task
- After exceeding this limit, stop and escalate with blocker details for user decision
- If an approach change is needed, update the ADR first

### Learning Updates

Update `~/.codex/LEARNING.md` and `~/.claude/LEARNING.md` in the following situations:

- A Debug Loop resolved a new problem
- A Spike made a technical decision
- A new repeatable constraint was discovered

### Blocked Flow

If a Task is blocked by an external dependency:

1. `blockTask(taskId, reason)`
2. Record the reason in `docs/progress/04-blockers.md`
3. Proceed to the next executable Task
