# Material Policy Guide

## Purpose

Document the design and extension points of `getAgentMaterialPolicy()` in `runtime/orchestrator/material-policy.ts`, which determines what references, constraints, and conditions each agent receives when dispatched.

## Architecture

The material policy system produces an `AgentMaterialPolicy` for each agent dispatch, containing `agentId`, `conditions`, `inlineConstraints`, `requiredRefs`, and `optionalRefs`. The policy is assembled in three constraint layers, then augmented with agent-specific logic.

## Three-Layer Constraint Model

### Layer 1: `commonConstraints()`

Applied to every agent regardless of identity or platform. These are the universal project rules:

- Keep AGENTS.md and CLAUDE.md synchronized (G8)
- No forbidden patterns or secret-like values in source (G4/G6)
- No single source file may exceed 400 lines (G3)
- Dependency direction enforcement (G5)
- LEARNING.md must not enter the repo (G9)
- Explicit validation gates before progression

### Layer 2: `platformConstraints(platform)`

Applied based on the detected `AgentPlatform`:

- **claude-code** — PreToolUse hooks enforce guardians at write time; retry on rejection.
- **codex-cli** — Codex notify hooks detect violations after action; git pre-commit hooks are the final guardrail.
- **unknown** — No platform-specific constraints.

### Layer 3: Agent-Specific

Each agent's `switch` case in `getAgentMaterialPolicy()` adds role-specific constraints. For example:

- `execution-engine` adds `executionConstraints()`: implement only current task work (G1), no feature work on main (G2), one atomic commit per task (G10), and UI design spec requirements (G7) when the task is a UI task.
- `design-reviewer` adds: review against the current milestone UI spec only, block commit if Design Review approval is missing (G7).
- `code-reviewer` adds: review security practices, performance, and architecture adherence.
- `frontend-designer` adds: define design system only for the active surface, cover all UI states (loading, empty, error, responsive, accessibility).

## Reference Resolution: `packetRefsFor()`

`packetRefsFor(agentId, state)` returns `{ requiredRefs, optionalRefs }` for each agent. References are resolved through filesystem existence checks via `existingRefs()` and `existingRef()`.

### Common Base

Every agent starts with `[entry.specPath, ".harness/state.json"]` as required references.

### Per-Agent Sources

| Agent | Required (beyond base) | Optional |
|-------|----------------------|----------|
| `project-discovery` | — | README.md, PROGRESS.md |
| `market-research` | — | PRD index, README.md |
| `tech-stack-advisor` | — | PRD index, Architecture index |
| `prd-architect` | — | PRD index, Architecture index |
| `scaffold-generator` | PRD requirements, Architecture rules | PROGRESS.md |
| `frontend-designer` | PRD design, PRD requirements, Architecture frontend | DESIGN_SYSTEM.md, milestone UI spec |
| `execution-engine` | Sub-specs (task or spike), PRD requirements, Architecture rules | PROGRESS.md, design materials (UI tasks) |
| `design-reviewer` | DESIGN_SYSTEM.md, milestone UI spec | PROGRESS.md |
| `code-reviewer` | PRD requirements, Architecture rules | PROGRESS.md |
| `harness-validator` | PROGRESS.md | CONTEXT_SNAPSHOT.md |
| `context-compactor` | PROGRESS.md | CONTEXT_SNAPSHOT.md |
| `entropy-scanner` | PROGRESS.md, golden-principles.md | entropy-latest.md |
| `fast-path-bootstrap` | discovery-questionnaire.md, stacks.md | README.md, scaffold-generator spec |

PRD and Architecture references resolve through fallback chains (e.g. `docs/PRD.md` then `docs/prd/01-overview.md`) via the `prdRef()` and `architectureRef()` helper functions.

## Conditions and Warnings

The `conditions` field carries advisory or blocking messages. Advisory conditions (e.g. `"Attach design materials only for UI tasks."`) inform scope. WARNING conditions (e.g. `"WARNING: Design materials incomplete for UI task"`) signal missing inputs that may degrade output. Warnings are added when filesystem checks fail and do not block dispatch.

## Adding a New Agent

1. Add the agent ID to `AgentId` in `harness-types.ts`.
2. Register in `AGENT_ENTRIES` in `runtime/orchestrator/agent-registry.ts`.
3. Add a `packetRefsFor()` case in `material-policy.ts` for `requiredRefs` and `optionalRefs`.
4. Add a `getAgentMaterialPolicy()` case for `inlineConstraints` and optional `conditions`.
5. If needed, extend `platformConstraints()` for platform-specific behavior.
6. Write the agent spec file at the registered `specPath`.

## Per-Agent Budget Limits

Maximum reference file counts per dispatch (NFR-01.6):

| Agent | Required Refs (max) | Optional Refs (max) | Total Budget |
|-------|-------------------|-------------------|-------------|
| `project-discovery` | 2 | 2 | 4 |
| `market-research` | 2 | 2 | 4 |
| `tech-stack-advisor` | 2 | 2 | 4 |
| `prd-architect` | 2 | 2 | 4 |
| `scaffold-generator` | 4 | 2 | 6 |
| `frontend-designer` | 4 | 4 | 8 |
| `execution-engine` | 6 | 4 | 10 |
| `design-reviewer` | 4 | 2 | 6 |
| `code-reviewer` | 4 | 2 | 6 |
| `harness-validator` | 3 | 1 | 4 |
| `context-compactor` | 3 | 1 | 4 |
| `entropy-scanner` | 3 | 2 | 5 |
| `fast-path-bootstrap` | 4 | 2 | 6 |
