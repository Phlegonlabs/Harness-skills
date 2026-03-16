# Learning Lifecycle — LEARNING.md

## Overview

LEARNING.md is a local-only knowledge base that captures lessons learned, debugging insights, and project-specific patterns discovered during development. It is explicitly excluded from the git repository (Guardian G9) and stored in the user's home directory.

## Storage Paths

| Platform | Claude Code Path | Codex CLI Path |
|----------|-----------------|----------------|
| All | `~/.claude/LEARNING.md` | `~/.codex/LEARNING.md` |

Both paths are kept in sync by the `bun harness:learn` command and the hook system.

## Creation

Learning entries are created in three ways:

1. **CLI command**: `bun harness:learn "lesson text"`
2. **Stdin pipe**: `echo "lesson" | bun harness:learn`
3. **Agent output**: Agents append entries when they discover notable patterns

## Entry Format

Each entry is timestamped with ISO 8601:

```markdown
## 2024-03-15T10:30:00.000Z

The auth middleware requires the session token in a specific cookie format.
Using `httpOnly: true` prevents XSS but requires server-side session validation.
```

## Consumption

Learning entries are consumed by:

1. **Agent context** — Agents reference `~/.claude/LEARNING.md` or `~/.codex/LEARNING.md` for project-specific knowledge
2. **Entropy scanner** — Checks if documented patterns are actually followed in code
3. **Context compactor** — Summarizes key learnings in the final project report

## Sync Behavior

The `bun harness:learn` command writes to both Claude and Codex paths simultaneously:

1. Read lesson text from args or stdin
2. Format as timestamped markdown entry
3. Append to `~/.claude/LEARNING.md`
4. Append to `~/.codex/LEARNING.md`
5. Report success/failure for each path

## Guardian G9 Enforcement

LEARNING.md must never be committed to the repository:

| Surface | Enforcement |
|---------|------------|
| Git pre-commit | Blocks `git add LEARNING.md` |
| Claude PreToolUse | Blocks Bash commands that stage LEARNING.md |
| Codex execpolicy | `prefix_rule(["git", "add", "LEARNING.md"], "forbidden")` |

If LEARNING.md is accidentally created in the project root, the pre-commit hook will block the commit and warn the user to move it to the home directory path.

## Size Management

- No hard size limit is enforced
- The context compactor may summarize and truncate old entries during milestone compaction
- Recommended practice: keep entries concise (1-3 paragraphs each)
- Entries older than the current product stage may be archived to `~/.claude/LEARNING.archive.md`

## Relationship to Other Knowledge

| Source | Scope | Persisted |
|--------|-------|-----------|
| LEARNING.md | Project-specific discoveries | User home dir |
| AGENTS.md / CLAUDE.md | Agent instructions | Project (gitignored) |
| docs/PROGRESS.md | Execution state summary | Repository |
| ADRs | Architectural decisions | Repository |
