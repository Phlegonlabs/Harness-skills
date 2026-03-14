# Hooks Guide — Automated Guardian Enforcement

## Overview

The harness hook system enforces Guardians G2-G10 automatically at the point of action, complementing the existing `bun harness:validate` for comprehensive checks.

The system uses a **tri-surface approach**:

- **Claude Code hooks** (`PreToolUse` / `PostToolUse`) — enforce rules when Claude writes or edits files and runs commands
- **Git hooks** (`pre-commit`, `commit-msg`, `pre-push`, `post-commit`) — enforce rules for manual git usage and any other toolchain
- **Codex CLI hooks** — execpolicy rules block dangerous commands at the CLI level; notification hooks run post-task validation asynchronously

All three surfaces call into the same central entry point: `.harness/runtime/hooks/check-guardian.ts`.

## Architecture

```text
Claude Code (.claude/settings.local.json)     Codex CLI (.codex/config.toml)
    ↓ stdin JSON (blocking)                       ↓ stdin JSON (non-blocking notify)
    ↓                                             ↓
.harness/runtime/hooks/check-guardian.ts   ←   central entry
    ↑ argv (blocking)                          ↑ command-level (blocking)
Git hooks (.git/hooks/*)              Codex execpolicy (.codex/rules/guardian.rules)
    ↓ imports
.harness/runtime/validation/helpers.ts (FORBIDDEN_PATTERN_RULES, countLines, fileHash)
```

## Guardian-to-Hook Mapping

| Guardian | Rule | Git Hook | Claude Hook | Codex CLI | Enforcement |
|----------|------|----------|-------------|-----------|-------------|
| G1 | PRD is source of truth | — | — | — | Instruction-level (AGENTS.md) |
| G2 | No feature code on main | pre-commit | PreToolUse(Bash) | execpolicy (`--no-verify`) | Block commit on main/master |
| G3 | Files ≤ 400 lines | pre-commit | PreToolUse(Write) | notify (warn) | Count lines in staged/written content |
| G4 | Banned patterns | pre-commit | PreToolUse(Write\|Edit) | notify (warn) | Scan against FORBIDDEN_PATTERN_RULES |
| G5 | Dependency direction | pre-push | — | — | `bun run check:deps` |
| G6 | Secrets blocked | pre-commit | PreToolUse(Write\|Edit) | notify (warn) | Subset of G4 patterns |
| G7 | UI design closed-loop | — | — | — | Instruction-level (AGENTS.md) |
| G8 | AGENTS.md = CLAUDE.md | post-commit | PostToolUse(Write\|Edit) | — | Auto-sync via sync-agents.ts |
| G9 | LEARNING.md not in repo | pre-commit | PreToolUse(Bash) | execpolicy | Block staging of LEARNING.md |
| G10 | Atomic commit format | commit-msg | PreToolUse(Bash) | — | Validate Task-ID in message |

## Claude Code Hook Protocol

Claude Code hooks communicate via stdin JSON. The hook reads the tool invocation payload and optionally outputs a block decision.

**Input** (stdin):
```json
{
  "tool": "Write",
  "input": {
    "file_path": "src/services/auth.ts",
    "content": "..."
  }
}
```

**Block output** (stdout):
```json
{"decision": "block", "reason": "G4/G6: forbidden pattern \"console.log\" found in src/services/auth.ts"}
```

**Allow**: No output (empty stdout).

### Hook events:
- `pre-write` — Scans Write/Edit content for G3 (line count) and G4/G6 (forbidden patterns)
- `pre-bash` — Blocks `git commit` on main (G2), `git add .`, `--no-verify`, LEARNING.md staging (G9)
- `post-write` — Auto-syncs AGENTS.md ↔ CLAUDE.md if either was modified (G8)
- `stop` — Prints reminder to run `bun harness:compact`

## Codex CLI Hook Protocol

Codex CLI notification hooks are **non-blocking** — they receive a JSON payload on stdin and run asynchronously after events occur. They can warn but cannot prevent actions.

**Input** (stdin):
```json
{
  "hook_event_name": "TaskComplete",
  "transcript_path": "/path/to/transcript",
  "cwd": "/path/to/project",
  "session_id": "abc123"
}
```

### Handled events:
- `TaskComplete` / `task_complete` — Runs post-task checks: branch validation (G2), oversized file scan (G3), forbidden pattern scan in `src/` (G4/G6). Outputs warnings to stderr.
- `TurnAborted` / `SessionEnd` — Prints reminder to run `bun harness:compact`.
- Unknown events — Silently ignored for forward compatibility.

## Codex CLI Execpolicy Rules

Execpolicy rules in `.codex/rules/guardian.rules` are **blocking** — they prevent commands from executing at the CLI level before they reach the shell.

Rules use a Starlark-style format evaluated top-down (first match wins):

```
forbidden("git commit --no-verify")   # G2: prevent hook bypass
forbidden("git add .")                # Dangerous staging
forbidden("git add -A")              # Dangerous staging
forbidden("git add LEARNING.md")     # G9: LEARNING.md must not be staged
```

These rules cover guardians that can be enforced at the command level:
- **G2** (partial): blocks `--no-verify` flag to prevent hook bypass
- **G9**: blocks staging of `LEARNING.md`
- **Staging safety**: blocks `git add .` and `git add -A`

## Git Hook Shim Architecture

Each git hook is a thin shell shim that delegates to the TypeScript entry point:

```sh
#!/bin/sh
bun .harness/runtime/hooks/check-guardian.ts --hook pre-commit
```

Git hooks are installed during scaffold setup and can be re-installed after cloning:

```bash
bun harness:hooks:install
```

## Emergency Bypass

To temporarily skip all hook enforcement:

```bash
HARNESS_HOOKS_SKIP=1 git commit -m "T001: emergency fix"
```

This sets an environment variable that causes the hook script to exit immediately with code 0. Use sparingly and document the reason in the commit message.

## Re-install After Cloning

Git hooks live in `.git/hooks/` which is not tracked by git. The Harness runtime files, agent specs, Claude Code settings, Codex CLI configs, and progress docs are also local-only. After cloning a harness project, restore the local Harness layer and re-install the hooks:

```bash
bun harness:hooks:install
```

This restores:
- local Harness files from `scripts/harness-local/manifest.json`
- `.harness/`, `AGENTS.md`, `CLAUDE.md`, `agents/`, `docs/ai/`, `docs/PROGRESS.md`, and `docs/progress/`
- `.claude/settings.local.json` — Claude Code hook configuration
- `.codex/config.toml` and `.codex/rules/guardian.rules` — Codex CLI hook configuration
- `.env.local` — local environment skeleton
- `.git/hooks/*` — git hook shims

The tracked restore entrypoint is:
- `scripts/harness-local/restore.ts`

This still regenerates:
- `.git/hooks/*` — git hook shims
- the same local file contents captured in `scripts/harness-local/manifest.json`

## Adding Custom Rules

To add a new guardian enforcement rule:

1. **For pattern-based rules**: Add to `FORBIDDEN_PATTERN_RULES` in `.harness/runtime/validation/helpers.ts`
2. **For git hook logic**: Add to the appropriate handler in `.harness/runtime/hooks/check-guardian.ts`
3. **For Claude-specific rules**: Add to the `claudePreWrite` or `claudePreBash` handler
4. **For Codex CLI execpolicy**: Add `forbidden()` / `prompt()` / `allow()` entries in `.codex/rules/guardian.rules`
5. **For Codex CLI notifications**: Add handling for new events in the `codexNotify()` function
6. Update the guardian-to-hook mapping table in this document
