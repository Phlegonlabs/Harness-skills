# Hooks Guide — Automated Guardian Enforcement

## Overview

The harness hook system enforces Guardians G2-G12 automatically at the point of action, complementing the existing `bun harness:validate` for comprehensive checks.

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
| G10 | Atomic commit format | commit-msg | PreToolUse(Bash) | — | Validate the current Task-ID and PRD mapping in feature-branch commit messages |

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

Rules use `prefix_rule()` entries. Codex compares the command's argv tokens against the configured prefix and applies the most restrictive matching decision:

```python
prefix_rule(
    pattern = ["git", "commit", "--no-verify"],
    decision = "forbidden",
    justification = "Do not bypass git hooks. Run git commit without --no-verify.",
)
prefix_rule(
    pattern = ["git", "add", "."],
    decision = "forbidden",
    justification = "Stage only the files you intend to change instead of using git add .",
)
prefix_rule(
    pattern = ["git", "add", "LEARNING.md"],
    decision = "forbidden",
    justification = "Do not stage LEARNING.md. Move the notes to the user-level knowledge base instead.",
)
```

Because `prefix_rule()` matches a command prefix rather than an arbitrary argument anywhere in the command, keep the git hooks in place as the final enforcement layer for variants like `git commit -m "..." --no-verify`.

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

## Level-Aware Hook Activation

Hook enforcement varies by harness level:

| Guardian | Lite | Standard | Full |
|----------|------|----------|------|
| G2 (No feature on main) | Active | Active | Active |
| G3 (File size limit) | Warn | Active | Active |
| G4 (Banned patterns) | Warn | Active | Active |
| G5 (Dependency direction) | Skip | Active | Active |
| G6 (Secrets blocked) | Active | Active | Active |
| G8 (AGENTS.md = CLAUDE.md) | Active | Active | Active |
| G9 (No LEARNING.md) | Active | Active | Active |
| G10 (Atomic commit) | Warn | Active | Active |
| G11 (Prompt injection) | Active | Active | Active |
| G12 (Supply-chain drift) | Warn | Block | Block |

## G11 and G12 Hook Mappings

### G11 — Prompt Injection Defense

G11 is enforced at the instruction level through AGENTS.md and agent spec files. There is no hook — agents are trained to treat external content as data only.

### G12 — Supply-Chain Drift

| Surface | Behavior |
|---------|----------|
| Git pre-commit | Scans `git diff --cached` for changes to manifest files and lockfiles. At Lite level, prints a warning. At Standard/Full, blocks the commit until the user confirms. |
| Claude PreToolUse(Bash) | Checks if the command modifies manifest/lockfile (e.g., `bun add`, `npm install <pkg>`, `cargo add`). Surfaces the change for approval. |
| Codex notify | Non-blocking: logs dependency change events for audit trail. |

## Execution Policy Blocks

The following additional commands are blocked by Codex execpolicy rules:

```python
prefix_rule(
    pattern = ["sudo"],
    decision = "forbidden",
    justification = "No privilege escalation in project context.",
)
prefix_rule(
    pattern = ["chmod", "777"],
    decision = "forbidden",
    justification = "Overly permissive file permissions.",
)
prefix_rule(
    pattern = ["npm", "install", "-g"],
    decision = "forbidden",
    justification = "Global package installation modifies system state.",
)
prefix_rule(
    pattern = ["bun", "add", "-g"],
    decision = "forbidden",
    justification = "Global package installation modifies system state.",
)
```

Pipe-to-shell patterns (`curl|sh`, `wget|sh`) are blocked at the instruction level through agent specs rather than execpolicy, since execpolicy matches command prefixes and cannot detect piped commands.

## Hook Portability

The primary hook runtime targets **Bun** (`bun .harness/runtime/hooks/check-guardian.ts`). For environments where Bun is not available:

1. **Node fallback**: Replace the shim command with `npx tsx .harness/runtime/hooks/check-guardian.ts`
2. **Toolchain detection**: The hook entry point reads `state.toolchain.ecosystem` to determine the correct command runner
3. **Cross-platform**: All hooks use `node:path` and `node:fs` for filesystem operations; no shell-specific constructs

## Adding Custom Rules

To add a new guardian enforcement rule:

1. **For pattern-based rules**: Add to `FORBIDDEN_PATTERN_RULES` in `.harness/runtime/validation/helpers.ts`
2. **For git hook logic**: Add to the appropriate handler in `.harness/runtime/hooks/check-guardian.ts`
3. **For Claude-specific rules**: Add to the `claudePreWrite` or `claudePreBash` handler
4. **For Codex CLI execpolicy**: Add `prefix_rule()` entries in `.codex/rules/guardian.rules` with `decision = "forbidden" | "prompt" | "allow"`
5. **For Codex CLI notifications**: Add handling for new events in the `codexNotify()` function
6. Update the guardian-to-hook mapping table in this document

## Phase-Aware Enforcement

Guardians are enforced differently depending on the current Harness phase. Some guardians only activate after the project reaches EXECUTING, while others are always active.

### Phase-Gated Guardians

These guardians are only enforced when `state.phase` is at or past a specific phase:

| Guardian | Active From | Reason |
|----------|-------------|--------|
| G2 (No feature on main) | EXECUTING | Feature branches don't exist before scaffold |
| G5 (Dependency direction) | EXECUTING | Architecture must be defined first |
| G10 (Atomic commit format) | EXECUTING | Task IDs don't exist before backlog creation |

### Always-Active Guardians

These guardians are enforced regardless of phase:

| Guardian | Reason |
|----------|--------|
| G3 (File size limit) | Prevents entropy from the start |
| G4 (Banned patterns) | Security baseline, always relevant |
| G6 (Secrets blocked) | Security critical, no exceptions |
| G8 (AGENTS.md = CLAUDE.md) | Sync integrity, always relevant |
| G9 (No LEARNING.md in repo) | Privacy, always relevant |

### Design Rationale

Phase-gating prevents false positives during early phases when the project structure is still being established. For example, during SCAFFOLD phase, code may be committed directly to main as part of initial setup — G2 enforcement at this point would block legitimate scaffold work. Once EXECUTING begins, the full guardian suite activates.

The hook entry point reads `state.phase` from `.harness/state.json` to determine which guardians to enforce. If the state file is missing (pre-initialization), only always-active guardians run.

## Guardian Enforcement Parity Matrix

The following matrix shows how each guardian is enforced across the three execution surfaces:

| Guardian | Claude Code | Git Hooks | Codex CLI | Notes |
|----------|-------------|-----------|-----------|-------|
| G1 (PRD source of truth) | Instruction | — | Instruction | Agent-level, no hook |
| G2 (No feature on main) | PreToolUse(Bash) | pre-commit | execpolicy | Blocks commit/push on main |
| G3 (Files ≤ 400 lines) | PreToolUse(Write) | pre-commit | notify (warn) | Claude blocks write; Git blocks commit; Codex warns |
| G4 (Banned patterns) | PreToolUse(Write\|Edit) | pre-commit | notify (warn) | Claude blocks write; Git blocks commit; Codex warns |
| G5 (Dependency direction) | — | pre-push | — | Only enforced at push time |
| G6 (Secrets blocked) | PreToolUse(Write\|Edit) | pre-commit | notify (warn) | Subset of G4, always block severity |
| G7 (UI design closed-loop) | Instruction | — | Instruction | Agent-level, no hook |
| G8 (AGENTS.md = CLAUDE.md) | PostToolUse(Write) | post-commit | — | Auto-sync, not blocking |
| G9 (No LEARNING.md) | PreToolUse(Bash) | pre-commit | execpolicy | Blocks staging LEARNING.md |
| G10 (Atomic commit format) | PreToolUse(Bash) | commit-msg | — | Validates commit message format |
| G11 (Prompt injection) | Instruction | — | Instruction | Agent-level training |
| G12 (Supply-chain drift) | PreToolUse(Bash) | pre-commit | notify | Scans manifest/lockfile changes |

### Non-Symmetric Design Rationale

The three surfaces have fundamentally different execution models:

- **Claude Code** — Blocking, real-time. `PreToolUse` hooks intercept before the action occurs. This is the strongest enforcement point because violations are prevented, not detected.
- **Git hooks** — Blocking, batch. Hooks run at commit/push time, catching violations that may have been introduced during a session. This is the **final guardrail** before code enters version control.
- **Codex CLI** — Non-blocking, asynchronous. Notification hooks run after actions complete. They cannot prevent violations but provide audit logging and user warnings. Execpolicy rules are the exception — they block specific commands before execution.

This asymmetry is intentional: Claude gets the strictest enforcement (prevent at write time), Git provides the safety net (prevent at commit time), and Codex provides visibility (warn after action).

## G8 and G10 Codex Gap Assessment

### G8 — AGENTS.md / CLAUDE.md Sync

**Current state:** Not enforced in Codex CLI. After a Codex task modifies AGENTS.md or CLAUDE.md, the files may diverge.

**Recommendation:** Add a hash comparison check in the `TaskComplete` notification handler:

1. On `TaskComplete`, compute SHA-256 of both files
2. If hashes differ, run `sync-agents.ts` to reconcile
3. Log the sync action to stderr as a warning

**Impact:** Low risk — sync is idempotent and the handler already exists. The `openai.yaml` sandbox spec does not need modification since the handler runs as a notification hook (non-blocking).

### G10 — Atomic Commit Format

**Current state:** Not enforced in Codex CLI. Commit messages may lack Task-ID or PRD mapping when commits are made through Codex.

**Recommendation:** Add commit message format validation in the `TaskComplete` notification handler:

1. On `TaskComplete`, read the most recent commit message via `git log -1 --format=%s`
2. Validate it matches the expected format: `T{nnn}: description (PRD#{ref})`
3. If invalid, emit a warning to stderr with the expected format

**Impact:** Non-blocking warning only. Codex does not support blocking commit hooks, so this serves as a notification. The git `commit-msg` hook remains the enforcement point for commits made through git directly.

**openai.yaml status:** The existing Codex sandbox configuration is complete and does not require modifications for G8 or G10. The notification handler in `.harness/runtime/hooks/check-guardian.ts` handles both cases through the existing `codexNotify()` function path.

## Doom-Loop Detection Integration

The hook system monitors for doom-loop indicators during execution:
- **Repeated file edits** (H1): Same file edited ≥ 3 times without intermediate commit → warn; ≥ 5 times → auto-pause
- **Duplicate validation** (H4): Same `bun harness:validate` command run 3+ times with same failure → escalate

When a doom-loop is detected, the hook system can trigger gear-drop protocol (planning-only mode, task decomposition, or escalation). See [references/doom-loop-detection.md](./doom-loop-detection.md) for the full heuristic set.
