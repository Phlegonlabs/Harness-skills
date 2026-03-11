# Harness Engineer CLI Docs Index

This is the maintainer-facing entrypoint for the `harness-engineer-cli` skill.

## Layout

- `../SKILL.md` — runtime entrypoint loaded by Claude Code / Codex skill discovery
- `human/maintainer-guide.md` — maintainer workflow, reading order, and update rules
- `human/maintenance/skill-audit.md` — append-only audit log for version bumps and autofixes
- `agent/` — agent runtime references used while generating or retrofitting projects
- `../scripts/maintenance/` — local maintenance scripts for this skill repo

## Reading Order

1. Read `human/maintainer-guide.md`.
2. Open `../SKILL.md` if you are changing the skill contract or load order.
3. Edit the relevant file under `agent/` for generation/runtime behavior.
4. Run `../scripts/maintenance/skill-maintenance.ps1` before closing the change.

## Closed Loop

- Human-facing structure changes must be reflected here and in `README.md`.
- Agent-facing structure changes must be reflected in `SKILL.md` and the affected `agent/` files.
- Script moves or contract changes must be reflected in `../scripts/maintenance/skill-maintenance.ps1`.
