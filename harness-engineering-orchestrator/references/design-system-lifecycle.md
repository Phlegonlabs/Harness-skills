# Design System Lifecycle

## Overview

The harness maintains a two-tier design artifact structure: a global design system shared across all surfaces and per-milestone UI specs scoped to the active milestone. This separation lets the design system evolve incrementally while keeping each milestone's visual contract self-contained.

## File Paths

| Artifact | Path | Scope |
|----------|------|-------|
| Global design system | `docs/design/DESIGN_SYSTEM.md` | All surfaces, all milestones |
| Milestone UI spec | `docs/design/{milestoneId}-ui-spec.md` | Single milestone |

The global path is defined as `DESIGN_SYSTEM_PATH` in `runtime/orchestrator/material-policy.ts`. The milestone spec path is resolved by `currentMilestoneSpecPath()`, which lowercases `state.execution.currentMilestone` and checks for the file on disk using `existingRef()`.

## Lifecycle Stages

### 1. Creation by Frontend Designer

The `frontend-designer` agent creates or updates both artifacts. `packetRefsFor("frontend-designer")` attaches `DESIGN_SYSTEM_PATH` and `currentMilestoneSpecPath()` as optional refs so the agent can read existing content before making changes.

The material policy enforces: "Define or update the design system only for the active product surface." This prevents a web milestone from altering mobile-specific tokens or vice versa.

### 2. Validation by Design Reviewer

The `design-reviewer` agent validates design artifacts against the milestone spec. Its required refs always include `DESIGN_SYSTEM_PATH` and `currentMilestoneSpecPath()`. If either is missing, `getAgentMaterialPolicy()` appends a warning to the policy conditions:

- Missing `DESIGN_SYSTEM.md`: "WARNING: DESIGN_SYSTEM.md is missing -- design review may lack baseline."
- Missing milestone spec: "WARNING: Milestone UI spec is missing -- design review has no reference target."

The review constraint is: "Review against the current milestone UI spec only; do not fan out into unrelated docs."

### 3. Implementation by Execution Engine

During task execution, design materials are conditionally attached. `packetRefsFor("execution-engine")` includes `DESIGN_SYSTEM_PATH` and `currentMilestoneSpecPath()` only when `task.isUI` is true. The policy condition reads: "Attach design materials only for UI tasks."

If design materials are incomplete for a UI task (missing design system or milestone spec), the execution engine's material policy appends: "WARNING: Design materials incomplete for UI task -- implementation may lack visual guidance."

The frontend-designer constraint also requires that design output cover loading, empty, error, responsive, and accessibility states. The execution engine is expected to implement these states when the milestone spec calls for them.

## Dispatch Triggers

`needsFrontendDesigner()` in `runtime/orchestrator/agent-registry.ts` checks two conditions:

1. `needsDesignSystem()` — Returns true when `docs/design/DESIGN_SYSTEM.md` does not exist
2. `needsMilestoneSpec(milestone)` — Returns true when the milestone has UI tasks but `docs/design/{milestoneId}-ui-spec.md` is missing

The dispatcher calls `needsFrontendDesigner()` before dispatching the execution engine. If design artifacts are missing, the frontend designer runs first.

## Collection and State Tracking

`collectDesignSpecs()` in `runtime/shared.ts` scans `docs/design/` for files matching the pattern `m{N}-*-ui-spec.md` and returns them sorted. `deriveStateFromFilesystem()` populates `docs.design.milestoneSpecs` with this list and sets `docs.design.exists` based on whether the global design system file is present on disk. The `docs.design` section is only populated when `isUiProject(types)` returns true; non-UI projects omit it entirely.

The `HarnessDocuments.design` type captures the full state:

| Field | Type | Meaning |
|-------|------|---------|
| `systemPath` | `string` | Always `docs/design/DESIGN_SYSTEM.md` |
| `exists` | `boolean` | Whether the global design system file is on disk |
| `milestoneSpecs` | `string[]` | Sorted list of discovered milestone UI spec paths |
