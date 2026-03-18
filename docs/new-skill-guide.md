# New Skill Guide

This guide covers everything needed to add a new skill to this catalog.

## Required Directory Structure

```
my-skill-name/
  SKILL.md              # Required: runtime contract and public description
  openai.yaml           # Required: OpenAI-compatible skill manifest
  agents/               # Agent role prompts (at least one entry agent)
  references/           # Helper docs, templates, type definitions
  scripts/              # Setup and validation scripts (optional but recommended)
  templates/            # Scaffold file templates (optional)
  __tests__/            # Tests for any scripts (required if scripts/ exists)
```

## SKILL.md Requirements

Every `SKILL.md` must have valid YAML frontmatter:

```yaml
---
name: my-skill-name
description: >
  One to three sentences. First sentence: what it does.
  Second sentence: when to use it.
  Third sentence: what it supports (optional).
---
```

Rules:
- `name` must match the directory name exactly
- `description` must start with a verb or noun phrase — not "This skill..."
- No trailing whitespace in frontmatter

## openai.yaml Requirements

Follow the OpenAI plugin manifest schema. The `name_for_human` field must match `SKILL.md`'s `name`.

## Testing Conventions

- Test files live in `my-skill-name/__tests__/`
- Use Bun's built-in test runner (`import { test, expect } from "bun:test"`)
- Run with: `bun test my-skill-name`
- All scripts in `scripts/` must have corresponding tests

## Skill Contract Check

Run the contract checker before opening a PR:

```bash
node my-skill-name/scripts/check-skill-contract.mjs
```

If your skill does not have a contract checker, copy the one from `harness-engineering-orchestrator/scripts/check-skill-contract.mjs` and adapt it.

## PR Checklist

Before submitting a PR to add a new skill:

- [ ] `SKILL.md` frontmatter is valid and `name` matches directory
- [ ] `openai.yaml` is present and valid
- [ ] At least one agent spec exists in `agents/`
- [ ] All scripts have tests in `__tests__/`
- [ ] `bun test <skill-name>` passes locally
- [ ] `node <skill-name>/scripts/check-skill-contract.mjs` passes
- [ ] Skill is added to `SKILLS.md` catalog table
- [ ] `CONTRIBUTING.md` guidelines are followed

## Dependency Rules

- Skills must be self-contained — no imports from sibling skill directories
- Shared utilities go in a top-level `lib/` directory (create one if needed)
- Do not add root-level `package.json` dependencies for a single skill
