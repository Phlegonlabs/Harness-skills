# Extension Guide

How to extend the Harness Engineering Orchestrator with new agents, guardians, phases, ecosystems, templates, and platforms.

## Adding a New Agent

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Write agent specification | `agents/{agent-id}.md` |
| 2 | Add agent ID to type union | `references/harness-types.ts` → `AgentId` |
| 3 | Register agent entry | `references/runtime/orchestrator/agent-registry.ts` |
| 4 | Define material policy | `references/runtime/orchestrator/material-policy.ts` |
| 5 | Add dispatch logic | `references/runtime/orchestrator/dispatcher.ts` |
| 6 | Add after-completion guidance | `references/runtime/orchestrator/context-builder.ts` |
| 7 | Update AGENTS.md template | `templates/AGENTS.md.template` |
| 8 | Write tests | `references/runtime/orchestrator/*.test.ts` |
| 9 | Update PRD | Module 05 (agent spec), Module 13 (interaction model) |

## Adding a New Guardian

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Define the guardian rule | `references/gates-and-guardians/01-guardians.md` |
| 2 | Determine enforcement surfaces | Git hooks, Claude hooks, Codex hooks, instruction-only |
| 3 | Add hook logic (if applicable) | `references/runtime/hooks/check-guardian.ts` |
| 4 | Add forbidden patterns (if applicable) | `references/runtime/validation/helpers.ts` |
| 5 | Add to Claude Code settings | `.claude/settings.local.json` (via setup) |
| 6 | Add to Codex execpolicy (if applicable) | `.codex/rules/guardian.rules` |
| 7 | Add to validation gate | `references/runtime/validation/task.ts` or `milestone-score.ts` |
| 8 | Update guardian-to-hook mapping | `references/hooks-guide.md` |
| 9 | Update level activation matrix | `references/gates-and-guardians/01-guardians.md` |
| 10 | Update PRD | Module 11 (QG-01), Module 08 (HK-03) |

## Adding a New Phase

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Add phase to type union | `references/harness-types.ts` → `Phase` |
| 2 | Add phase gate conditions | `references/harness-types.ts` → `PHASE_GATES` |
| 3 | Add structural checks | `references/runtime/phase-structural.ts` |
| 4 | Add phase handler in dispatcher | `references/runtime/orchestrator/dispatcher.ts` |
| 5 | Add phase readiness checks | `references/runtime/orchestrator/phase-readiness.ts` |
| 6 | Add autoflow behavior | `references/runtime/orchestrator/autoflow.ts` |
| 7 | Update phase transition table | `references/harness-advance.ts` |
| 8 | Add validation | `references/runtime/validation/phase.ts` |
| 9 | Update SKILL.md phase list | SKILL.md |
| 10 | Update PRD | Module 03, Module 04 |

## Adding a New Toolchain Ecosystem

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Add ecosystem to type union | `references/harness-types.ts` → `SupportedEcosystem` |
| 2 | Add detection logic | `references/runtime/toolchain-detect.ts` |
| 3 | Add preset definition | `references/runtime/toolchain-registry.ts` |
| 4 | Define source extensions | `sourceExtensions`, `sourceRoot`, `manifestFile`, `lockFile` |
| 5 | Define forbidden patterns (if needed) | `references/runtime/validation/helpers.ts` |
| 6 | Add CI template (if needed) | `templates/.github/workflows/ci-{ecosystem}.yml.template` |
| 7 | Update validation for new extensions | `references/runtime/validation/helpers.ts` |
| 8 | Update PRD | Module 06, Module 09 |

## Adding a New Template

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Create template file | `templates/{path}/{name}.template` |
| 2 | Add to scaffold generation | `scripts/setup/core.ts` |
| 3 | Add to file manifest (if local-only) | `scripts/harness-local/manifest.json` |
| 4 | Add to structural checks (if gate-required) | `references/runtime/phase-structural.ts` |
| 5 | Update PRD | Module 07, Module 10 |

## Adding a New Platform

| Step | Action | Files Affected |
|------|--------|---------------|
| 1 | Add platform to type union | `references/harness-types.ts` → `AgentPlatform` |
| 2 | Add detection logic | `references/runtime/orchestrator/context-builder.ts` |
| 3 | Add platform-specific constraints | `references/runtime/orchestrator/material-policy.ts` |
| 4 | Add hook configuration (if applicable) | New config file for the platform |
| 5 | Add compact output path (if applicable) | Context compactor platform-specific output |
| 6 | Update PRD | Module 08, Module 10 |
