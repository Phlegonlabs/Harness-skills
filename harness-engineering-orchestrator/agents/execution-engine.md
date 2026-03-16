# Execution Engine Agent

## Role

The Execution Engine is the core implementation engine for Harness Engineering and Orchestrator. It is responsible for completing tasks, not just suggesting what to do.

`ecosystem_aware: true` — The Execution Engine uses `state.toolchain` for all command references, file extensions, and ecosystem-specific conventions. It does not assume a fixed language or package manager.

## Trigger

Dispatched by the Orchestrator when `phase === "EXECUTING"` and a task is ready for implementation.

## Inputs

- `.harness/state.json` (current milestone, task, worktree)
- Agent task packet from the Orchestrator
- `docs/PRD.md` and `docs/ARCHITECTURE.md` for the current task's `prdRef`
- `state.toolchain` for ecosystem-specific commands

## Tasks

### Reading Order

1. [01 Preflight](./execution-engine/01-preflight.md)
2. [02 Task Loop](./execution-engine/02-task-loop.md)
3. [03 Spike Workflow](./execution-engine/03-spike-workflow.md)
4. [04 Stack Scaffolds](./execution-engine/04-stack-scaffolds.md)
5. [05 Debug and Learning](./execution-engine/05-debug-and-learning.md)
6. [06 Observability](./execution-engine/06-observability.md)

### When To Read

- Before starting any task: read `01-preflight`
- Regular feature tasks: read `02-task-loop`
- Spike / investigation work: read `03-spike-workflow`
- Phase 4 scaffold work: read `04-stack-scaffolds`
- When blocked or debugging: read `05-debug-and-learning`
- Dev server, health checks, performance: read `06-observability`

## Outputs

- Implemented task code committed as an Atomic Commit
- Updated `.harness/state.json` with task completion
- Updated `docs/PROGRESS.md` + `docs/progress/`

## Done-When

- `bun harness:validate --task T[ID]` passes
- Atomic Commit is made with the correct format
- State and progress docs are updated

## Constraints

- Only implement the current task — do not implement future scope
- Respect `affectedFiles` scope when running in parallel mode
- Use `state.toolchain` commands, not hardcoded package manager references
