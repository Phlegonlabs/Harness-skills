# Extension Guide

## Purpose

Describe the minimum changes required to extend Harness with new agents, guardians, phases, templates, ecosystems, or platforms while staying aligned with the PRD and runtime model.

## Add a New Agent

1. Write the agent spec in `agents/{agent-id}.md`.
2. Add the id to `references/harness-types.ts`.
3. Register it in `references/runtime/orchestrator/agent-registry.ts`.
4. Define material policy and platform constraints in `references/runtime/orchestrator/material-policy.ts`.
5. Add dispatch logic in `references/runtime/orchestrator/dispatcher.ts`.
6. Add after-completion guidance in `references/runtime/orchestrator/context-builder.ts`.
7. Add any child-role/default `SubagentDispatchPolicy` mapping when parallel/runtime-native dispatch matters.
8. Update `templates/AGENTS.md.template`.
9. Add tests under `references/runtime/orchestrator/`.
10. Update the PRD-facing docs that describe the agent contract and interaction model.

Agent spec structure:

- `Role`
- `Trigger`
- `Inputs`
- `Tasks`
- `Outputs`
- `Done-When`
- `Constraints`

## Add a New Guardian

1. Define the rule in `references/gates-and-guardians/01-guardians.md`.
2. Decide the enforcement surfaces: instruction-only, git hook, Claude hook, Codex notify, Codex execpolicy, validation gate, or CI.
3. Add runtime enforcement in `references/runtime/hooks/check-guardian.ts` when applicable.
4. Update `references/runtime/validation/helpers.ts` for pattern-based checks.
5. Update task or milestone validation if the rule affects gate completion.
6. Update `references/hooks-guide.md`.
7. Update the level-activation matrix.
8. Add tests.

## Add a New Phase

1. Add the phase to the `Phase` union and phase-gate mapping.
2. Extend structural checks in `references/runtime/phase-structural.ts`.
3. Add readiness logic in `references/runtime/orchestrator/phase-readiness.ts`.
4. Add dispatch behavior in `references/runtime/orchestrator/dispatcher.ts`.
5. Update autoflow behavior in `references/runtime/orchestrator/autoflow.ts`.
6. Update phase validation in `references/runtime/validation/phase.ts`.
7. Update `SKILL.md` and the relevant references.
8. Add tests for planner and validation behavior.

## Add a New Ecosystem

1. Extend `SupportedEcosystem` in `references/harness-types.ts`.
2. Add detection in `references/runtime/toolchain-detect.ts`.
3. Add presets in `references/runtime/toolchain-registry.ts`.
4. Extend validation helpers for file discovery and blocked patterns if needed.
5. Add CI templates in `templates/.github/workflows/`.
6. Add scaffold/template wiring in `scripts/setup/core.ts`.
7. Update docs and tests.

## Add a New Template

1. Create `templates/{path}/{name}.template`.
2. Mirror the target project path under `templates/`.
3. Add generation wiring in `scripts/setup/core.ts`.
4. Add structural validation when the file is gate-critical.
5. Update template/reference docs and tests.

Use overwrite semantics only for files that must stay current, such as hook shims or managed local runtime files.

## Add a New Platform

1. Extend `AgentPlatform` in `references/harness-types.ts`.
2. Add platform detection in `references/runtime/orchestrator/context-builder.ts`.
3. Add platform-specific inline constraints and lifecycle hints in `material-policy.ts`.
4. Define how spawn, follow-up, wait, and close map for child agents.
5. Add platform hook/config integration if available.
6. Update `templates/AGENTS.md.template` and hook docs.
7. Add tests for detection and dispatch behavior.

Platform detection must be capability/config driven, not based on transient session files.

## Minimum Validation for Any Extension

- runtime tests added or updated
- docs updated where the extension changes workflow behavior
- command surface documented if new commands/flags are added
- generated project templates updated when the extension affects scaffold output
- PRD-facing reference docs kept in sync with the actual runtime contract
