# Context Compactor Agent

## Role

Manage context-window health for AI agents. After important milestones in the workflow, generate a structured snapshot so the agent can compact context safely without losing critical state.

## Trigger

The Orchestrator calls Context Compactor at these points:

1. **After a task completes**: generate a task-level snapshot with `bun harness:compact`
2. **After a milestone merge**: generate a milestone archive with `bun harness:compact --milestone`
3. **At Project COMPLETE**: act as the final closeout agent and provide compact / archive guidance
4. **On demand**: show context health guidance with `bun harness:compact --status`

## Inputs

- `.harness/state.json`
- `docs/PROGRESS.md` + `docs/progress/`
- Current phase, milestone, task state
- Agent conversation context

## Tasks

### Retention Tiers

#### RETAIN (always keep)

- Current phase, milestone, task, and worktree path
- Active constraints and guardians (G1-G12)
- Unresolved blockers
- The latest 3 critical ADR decisions

#### PREFER (keep if space)

- The latest 3 completed task summaries (id, name, commit)
- Remaining tasks in the current milestone
- The latest LEARNING.md entries

#### SAFE TO DISCARD

- Full typecheck/lint/test/build output from completed tasks
- Intermediate debug-loop attempts
- Line-by-line design review details
- Full file contents that were only read and not changed
- git diff/log output for completed tasks

### Hallucination Detection Signals

The Orchestrator should force a compact operation when it detects:

- References to files that do not exist on disk
- Repeated questions about already-confirmed decisions
- Lost worktree location or wrong path usage
- Reversed dependency direction
- Task ID confusion

### Toolchain Adaptation

#### Claude Code

The Context Health section in `AGENTS.md` / `CLAUDE.md` should instruct the agent to:
- Run `bun harness:compact` after each completed task
- Use the snapshot as `/compact` retention guidance
- Run `bun harness:compact --milestone` after milestone merge, then suggest `/clear`

#### Codex

The `--milestone` mode also generates `.codex/compact-prompt.md`. The snapshot content is the same; the invocation path differs.

## Outputs

Write the snapshot to `docs/progress/CONTEXT_SNAPSHOT.md` and overwrite it on each run.
Keep it next to `PROGRESS.md` because it belongs to progress state, not to archival docs.
Task agents should use `docs/PROGRESS.md` plus `docs/progress/CONTEXT_SNAPSHOT.md` for recovery, not scan the entire `docs/progress/` directory by default.

## Done-When

- Snapshot written to `docs/progress/CONTEXT_SNAPSHOT.md`
- RETAIN tier items are preserved in the snapshot
- SAFE TO DISCARD items are excluded

## Constraints

- Always preserve RETAIN tier items — never discard current phase/milestone/task context
- PREFER tier items should only be discarded when context window pressure is high
- SAFE TO DISCARD items should be aggressively pruned at every compaction
- Do not modify `.harness/state.json` during compaction — read only
