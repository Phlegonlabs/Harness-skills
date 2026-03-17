# Hooks Guide

## Purpose

Document the tri-surface guardian enforcement model used by Harness:

- Claude Code hooks
- Git hooks
- Codex CLI hooks (`notify` plus `execpolicy`)

These surfaces are guardrails only. They never replace Orchestrator routing, child lifecycle ownership, or PRD-first scope control.

## Tri-Surface Architecture

```text
Claude Code hooks (.claude/settings.local.json)
Git hooks (.git/hooks/*)
Codex CLI hooks (.codex/config.toml + .codex/rules/guardian.rules)
        -> .harness/runtime/hooks/check-guardian.ts
        -> runtime validation helpers
```

## Surface Characteristics

| Surface | Timing | Can block? | Typical use |
|---------|--------|------------|-------------|
| Claude `PreToolUse` / `PostToolUse` | before/after tool use | yes for pre-hooks | block bad writes and risky commands |
| Git hooks | commit/push time | yes | final universal guardrail |
| Codex `notify` | after runtime events | no | warnings, reminders, best-effort sync |
| Codex `execpolicy` | before command execution | yes | block known-bad command prefixes |

## Guardian Mapping

| Guardian | Enforcement |
|----------|-------------|
| G1 | instruction-level only |
| G2 | git `pre-commit`, Claude pre-bash, Codex `execpolicy` against hook bypass |
| G3 | git `pre-commit`, Claude pre-write/edit, Codex notify warning |
| G4 | git `pre-commit`, Claude pre-write/edit, Codex notify warning |
| G5 | git `pre-push` |
| G6 | git `pre-commit`, Claude pre-write/edit, Codex notify warning |
| G7 | instruction-level only |
| G8 | git `post-commit`, Claude post-write/edit, Codex best-effort sync through notify handler |
| G9 | git `pre-commit`, Claude pre-bash, Codex `execpolicy` |
| G10 | git `commit-msg`, Claude pre-bash, git remains the blocking source of truth |
| G11 | instruction-level only |
| G12 | validation + manifest/lockfile checks; Git/Claude can surface or block depending on level |

## Claude Hook Contract

Handled events:

- `pre-write`
- `pre-bash`
- `post-write`
- `stop`

Typical behavior:

- block oversized or forbidden writes
- block dangerous git patterns such as `--no-verify` or broad staging
- auto-sync `AGENTS.md` and `CLAUDE.md` after edits
- remind the user to compact context on stop

## Git Hook Contract

Installed shims:

- `pre-commit`
- `commit-msg`
- `pre-push`
- `post-commit`

Git hooks are the universal fallback because they protect any tool that uses Git, regardless of which AI platform produced the changes.

## Codex Hook Contract

### `notify`

`notify` is non-blocking. It handles:

- `TaskComplete` / `task_complete`
- `TurnAborted` / `turn_aborted`
- `SessionEnd` / `session_end`

Current responsibilities include:

- branch warnings
- file-size and forbidden-pattern warnings
- best-effort `AGENTS.md` / `CLAUDE.md` sync
- compact reminders

### `execpolicy`

`execpolicy` blocks specific bad command prefixes, such as:

- `git commit --no-verify`
- `git push --no-verify`
- `git add .`
- `git add -A`
- `git add LEARNING.md`

Remember that prefix matching cannot catch every argument ordering variant. Git hooks remain the final enforcement layer.

## Phase-Aware Enforcement

Some guardians activate only from `EXECUTING` onward:

- G2
- G5
- G10

Always-active or near-always-active guardrails include:

- G3
- G4
- G6
- G8
- G9
- G11
- G12

Lite / Standard / Full still determine whether a given rule warns or blocks.

## Parallel Execution Note

When multiple child agents run in parallel:

- each child is still checked against its owned files or worktree
- hook surfaces remain local guardrails
- OCC-aware runtime validation remains responsible for state integrity

Hooks never become the child lifecycle manager.

## Install and Restore

Initial setup writes:

- git hook shims
- `.claude/settings.local.json`
- `.codex/config.toml`
- `.codex/rules/guardian.rules`

After cloning, restore with:

```bash
bun harness:hooks:install
```

This restores the local Harness layer and reinstalls the hook/config surfaces.

## Emergency Bypass

```bash
HARNESS_HOOKS_SKIP=1 git commit -m "T001: emergency fix"
```

Use only when absolutely necessary and document the reason.

## Add New Rules

When extending hook behavior:

1. Update `check-guardian.ts`.
2. Update validation helpers if the rule scans content.
3. Update Claude/Codex config constants when required.
4. Update the guardian mapping table here.
5. Add tests.
