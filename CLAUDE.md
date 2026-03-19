# Harness Engineering Skills — Contributor Agent Instructions

This file is loaded automatically by Claude Code and Codex when working inside this repository.

## Project Identity

Multi-skill catalog for AI-native engineering workflows. The published skill is `harness-engineering-orchestrator` — a PRD-to-code orchestration system for Claude and Codex.

## Repo Structure

```
harness-engineering-orchestrator/   # Published skill package
  SKILL.md                          # Runtime contract (the source of truth)
  agents/                           # Role prompts and agent specs
  references/                       # Helper docs, templates, type definitions
  scripts/                          # Setup and validation automation
  templates/                        # Scaffold file templates
harness-engineering-orchestrator-prd/  # Internal design documentation (not a skill)
docs/                               # Contributor guides and catalog
```

## Key Commands

```bash
bun test <path>                                   # Run tests for specific files
node harness-engineering-orchestrator/scripts/check-skill-contract.mjs  # Validate skill contract
git diff --check                                  # Check for whitespace errors
```

## Prerequisites

- `bun` (runtime + test runner)
- `git`

## Conventions

- `SKILL.md` frontmatter (`name`, `description`) is the skill's public contract — keep it accurate
- Agent specs in `agents/` follow the structure in `references/agents-md-template.md`
- Template variables use `[UPPER_SNAKE_CASE]` syntax
- Type definitions live in `references/harness-types.ts` — import from there, do not redeclare

## Dependency Direction

Skills are self-contained packages. Cross-skill imports are not allowed. Each skill directory must be independently installable.

## Prohibited Operations

- Do not weaken or disable guardrails (G1–G12) without an explicit plan change
- Do not document behavior that is not yet implemented
- Do not commit directly to `main` — all changes go through PRs

## PR Guidelines

See `CONTRIBUTING.md` for the full contribution process. In short: fork → branch → PR → review → merge.
