# Maintainer Guide

## Purpose

This guide is for humans maintaining the `harness-engineer-cli` skill itself.

## Repo Structure

- `../index.md` — maintainer navigation entrypoint
- `../../SKILL.md` — skill loader contract and reference-file load order
- `../agent/` — agent-facing generation/runtime references
- `maintenance/skill-audit.md` — audit trail for version bumps and autofixes
- `../../scripts/maintenance/` — maintenance scripts for this repo

## Update Workflow

1. Change the relevant file under `../agent/` or `../../SKILL.md`.
2. If the change affects maintainer navigation, also update `../index.md` and `../../README.md`.
3. If the change affects generated project layout or downstream contracts, update the matching greenfield, retrofit, and artifact references together.
4. Run `pwsh scripts/maintenance/skill-maintenance.ps1`.
5. If needed, run `pwsh scripts/maintenance/skill-maintenance.ps1 -AutoFix`.
6. Review `maintenance/skill-audit.md` after any autofix or version bump.

## Boundaries

- `agent/` is for agent runtime references, not maintainer prose.
- `human/` is for maintainer-facing docs, not scaffold templates.
- `scripts/maintenance/` is for this skill repo only, not for generated project runtime files.
