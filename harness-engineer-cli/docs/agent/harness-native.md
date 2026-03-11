# Native Harness CLI — Shell-Based Alternative

Use this reference when generating a project where the primary language is **not** JavaScript/TypeScript
and the team does not want a Node.js dev dependency. This provides a self-contained `scripts/harness.sh`
that covers the core task loop using only POSIX shell + `jq`.

**Tradeoff:** This native CLI covers the essential task loop (init, status, validate, next, start,
done, block, file-guard, schema). It does NOT include worktree management, agent registration,
stale-check, plan:apply, merge-gate auto-chain, or scaffold commands. For the full feature set,
use the TypeScript CLI with Node.js installed alongside your language toolchain.

**Windows:** prefer the TypeScript CLI for native Windows usage. The shell CLI assumes POSIX shell
utilities such as `bash` and `date`, so on Windows it should run under Git Bash or WSL.

**Dependency:** `jq` (JSON processor) — available on all major platforms:
- macOS: `brew install jq`
- Ubuntu/Debian: `apt install jq`
- Alpine: `apk add jq`
- Windows: `choco install jq` or `scoop install jq`

---

## When to generate this

Generate `scripts/harness.sh` instead of the TypeScript CLI when ALL of these are true:
1. Primary language is Python, Go, or Rust
2. No JavaScript/TypeScript apps in the repo
3. The user explicitly does not want Node.js as a dev dependency
4. The project does not need parallel worktree management or multi-agent coordination

If ANY JavaScript/TypeScript exists in the repo (even a frontend in a mixed monorepo),
use the TypeScript CLI — it already works regardless of the backend language.

---

## scripts/harness.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

# ─── Native Harness CLI ──────────────────────────────────────────────────────
# Shell-based task loop for non-Node projects.
# Requires: jq, git, make (for validate)
# Covers: init, status, validate, next, start, done, block, file-guard, schema
# Does NOT cover: worktree management, agent lifecycle, plan:apply, merge-gate
#
# Usage: bash scripts/harness.sh <command> [args...]
# ─────────────────────────────────────────────────────────────────────────────

PROGRESS_FILE="docs/progress.json"
PLAN_FILE="docs/PLAN.md"
SCHEMA_FILE="schemas/progress.schema.json"
FILE_LIMIT=500

# ─── Colors ──────────────────────────────────────────────────────────────────
R='\033[31m' G='\033[32m' Y='\033[33m' B='\033[34m' D='\033[2m' N='\033[0m'
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*" >&2; }
fail() { printf "${R}✗${N} %s\n" "$*" >&2; exit 1; }
step() { printf "${Y}▶${N} %s\n" "$*"; }
info() { printf "${B}ℹ${N} %s\n" "$*"; }

# ─── Helpers ─────────────────────────────────────────────────────────────────
require_jq() {
  command -v jq >/dev/null 2>&1 || fail "jq is required. Install: brew install jq / apt install jq"
}

load_progress() {
  [ -f "$PROGRESS_FILE" ] || fail "Missing $PROGRESS_FILE — run init first"
  cat "$PROGRESS_FILE"
}

save_progress() {
  local tmp
  tmp=$(mktemp)
  # Update last_updated timestamp (Git Bash / WSL provides POSIX `date` on Windows)
  echo "$1" | jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.last_updated = $ts' > "$tmp"
  mv "$tmp" "$PROGRESS_FILE"
}

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ─── init ────────────────────────────────────────────────────────────────────
cmd_init() {
  require_jq
  [ -f "$PROGRESS_FILE" ] || fail "Missing $PROGRESS_FILE"
  [ -f "$PLAN_FILE" ] || fail "Missing $PLAN_FILE"

  local p
  p=$(load_progress)

  local cm ct
  cm=$(echo "$p" | jq -r '.current_milestone.id // empty')
  ct=$(echo "$p" | jq -r '.current_task.id // empty')

  ok "Session init"
  if [ -n "$ct" ]; then
    local story
    story=$(echo "$p" | jq -r '.current_task.story // .current_task.description // "no description"')
    info "Current task: $ct — $story"
    info "Write code, then run: make validate"
  elif [ -n "$cm" ]; then
    info "Milestone $cm active, no current task"
    info "Run: bash scripts/harness.sh next"
  else
    info "No active milestone. Use plan mode to add work."
  fi

  # Stale file detection (lightweight)
  local stale_count=0
  if [ -f ".env.example" ]; then
    local env_vars example_vars
    env_vars=$(grep -roh 'process\.env\.\w\+\|os\.environ\[.\+\]\|os\.getenv(.\+)' src/ 2>/dev/null | sort -u | wc -l)
    example_vars=$(grep -c '=' .env.example 2>/dev/null || echo 0)
    if [ "$env_vars" -gt "$example_vars" ]; then
      warn "Possible missing .env.example entries ($env_vars in code vs $example_vars in example)"
      stale_count=$((stale_count + 1))
    fi
  fi
  [ "$stale_count" -eq 0 ] && ok "No stale files detected"
}

# ─── status ──────────────────────────────────────────────────────────────────
cmd_status() {
  require_jq
  local p
  p=$(load_progress)

  local project cm ct blockers
  project=$(echo "$p" | jq -r '.project')
  cm=$(echo "$p" | jq -r '.current_milestone.id // "none"')
  ct=$(echo "$p" | jq -r '.current_task.id // "none"')
  blockers=$(echo "$p" | jq '.blockers | length')

  local done_count total_count
  done_count=$(echo "$p" | jq '.current_milestone.tasks_done // 0')
  total_count=$(echo "$p" | jq '.current_milestone.tasks_total // 0')

  echo ""
  info "Project:   $project"
  info "Milestone: $cm ($done_count/$total_count tasks done)"
  info "Task:      $ct"
  [ "$blockers" -gt 0 ] && warn "Blockers:  $blockers"
  echo ""
}

# ─── validate ────────────────────────────────────────────────────────────────
cmd_validate() {
  step "Running validate (lint → type-check → test)"

  # Delegate to Makefile — the project's Makefile defines lint, type-check, test
  if [ -f "Makefile" ] || [ -f "makefile" ] || [ -f "GNUmakefile" ]; then
    make validate
    ok "Validate passed"
  elif [ -f "justfile" ]; then
    just validate
    ok "Validate passed"
  else
    fail "No Makefile or justfile found. Create a 'validate' target that runs lint + type-check + test."
  fi
}

cmd_validate_full() {
  step "Running validate:full (validate + integration + e2e + file-guard)"
  cmd_validate

  # Integration tests
  if [ -d "tests/integration" ]; then
    step "Running integration tests"
    make test-integration 2>/dev/null || warn "No test-integration target in Makefile"
  fi

  # E2E tests
  if [ -d "tests/e2e" ]; then
    step "Running e2e tests"
    make test-e2e 2>/dev/null || warn "No test-e2e target in Makefile"
  fi

  cmd_file_guard
  ok "validate:full passed"
}

# ─── next ────────────────────────────────────────────────────────────────────
cmd_next() {
  require_jq
  local p
  p=$(load_progress)

  local cm
  cm=$(echo "$p" | jq -r '.current_milestone.id // empty')
  [ -z "$cm" ] && fail "No active milestone"

  # Find first available task (⬜) from PLAN.md using the active_milestones tasks array
  local next_id next_story
  next_id=$(echo "$p" | jq -r '
    .active_milestones[]
    | select(.id == "'"$cm"'")
    | .tasks[]?
    | select(.status == "⬜" or .status == "pending" or .status == "todo")
    | .id
  ' 2>/dev/null | head -1)

  if [ -z "$next_id" ]; then
    # Fallback: parse PLAN.md directly for ⬜ rows
    next_id=$(grep -E "^\|.*$cm-[0-9]+" "$PLAN_FILE" | grep "⬜" | head -1 | sed 's/|/\n/g' | sed -n '2p' | xargs)
  fi

  if [ -z "$next_id" ]; then
    ok "No more tasks in $cm — milestone may be complete"
    return 0
  fi

  next_story=$(grep -E "^\|.*$next_id" "$PLAN_FILE" | sed 's/|/\n/g' | sed -n '4p' | xargs 2>/dev/null || echo "")
  info "Next: $next_id — $next_story"
  echo "$next_id"
}

# ─── start ───────────────────────────────────────────────────────────────────
cmd_start() {
  local task_id="${1:-}"
  [ -z "$task_id" ] && fail "Usage: harness.sh start <task-id>"
  require_jq

  local p
  p=$(load_progress)

  # Update current_task
  local story
  story=$(grep -E "^\|.*$task_id" "$PLAN_FILE" | sed 's/|/\n/g' | sed -n '4p' | xargs 2>/dev/null || echo "")

  p=$(echo "$p" | jq --arg id "$task_id" --arg story "$story" --arg ts "$(now_iso)" '
    .current_task = {
      id: $id,
      story: $story,
      description: $story,
      status: "in_progress",
      started_at: $ts,
      files_touched: [],
      notes: ""
    }
  ')

  # Update PLAN.md: change ⬜ to 🟡 for this task
  if grep -q "$task_id" "$PLAN_FILE"; then
    sed -i.bak "s/\(|.*${task_id}.*\)⬜/\1🟡/" "$PLAN_FILE" && rm -f "${PLAN_FILE}.bak"
  fi

  save_progress "$p"
  ok "Started: $task_id — $story"
  info "Write code, then run: make validate"
}

# ─── done ────────────────────────────────────────────────────────────────────
cmd_done() {
  local task_id="${1:-}"
  [ -z "$task_id" ] && fail "Usage: harness.sh done <task-id>"
  require_jq

  local p
  p=$(load_progress)

  local ct
  ct=$(echo "$p" | jq -r '.current_task.id // empty')
  [ "$ct" != "$task_id" ] && warn "Current task is $ct, completing $task_id anyway"

  # Get commit hash
  local commit_hash
  commit_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

  # Update progress.json
  p=$(echo "$p" | jq --arg id "$task_id" --arg ts "$(now_iso)" --arg hash "$commit_hash" '
    .current_task = null
    | .current_milestone.tasks_done = ((.current_milestone.tasks_done // 0) + 1)
    | .current_milestone.tasks_remaining = ((.current_milestone.tasks_remaining // 0) - 1)
    | .current_milestone.tasks_in_progress = ((.current_milestone.tasks_in_progress // 0) - 1)
  ')

  # Update PLAN.md: change 🟡 to ✅ for this task
  if grep -q "$task_id" "$PLAN_FILE"; then
    sed -i.bak "s/\(|.*${task_id}.*\)🟡/\1✅/" "$PLAN_FILE" && rm -f "${PLAN_FILE}.bak"
  fi

  # Only auto-chain when the worktree is already clean
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "Working tree still has uncommitted changes. Commit, stash, or discard them before continuing."
    info "Auto-chain paused. Run: bash scripts/harness.sh init after the worktree is clean."
    save_progress "$p"
    return 0
  fi

  save_progress "$p"
  ok "Done: $task_id (commit: $commit_hash)"

  # Auto-chain: find and start next task
  # cmd_next prints a human-readable line then the bare task-id on its own line;
  # grep for a task-id pattern (M<n>-<nnn>) to avoid empty-line / "No more tasks" ambiguity.
  local next_id
  next_id=$(cmd_next 2>/dev/null | grep -E '^M[0-9]+-[0-9]+$' | head -1)
  case "$next_id" in
    M[0-9]*-[0-9]*)
      cmd_start "$next_id"
      ;;
    *)
      local tasks_remaining
      tasks_remaining=$(echo "$p" | jq '.current_milestone.tasks_remaining // 0')
      if [ "$tasks_remaining" -le 0 ]; then
        ok "All tasks complete in milestone. Run validate:full before merging."
      fi
      ;;
  esac
}

# ─── block ───────────────────────────────────────────────────────────────────
cmd_block() {
  local task_id="${1:-}"
  local reason="${2:-no reason given}"
  [ -z "$task_id" ] && fail "Usage: harness.sh block <task-id> <reason>"
  require_jq

  local p
  p=$(load_progress)

  # Add blocker
  p=$(echo "$p" | jq --arg id "$task_id" --arg msg "$reason" --arg ts "$(now_iso)" '
    .blockers += [{ task_id: $id, description: $msg, added_at: $ts }]
    | .current_task = null
    | .current_milestone.tasks_blocked = ((.current_milestone.tasks_blocked // 0) + 1)
    | .current_milestone.tasks_in_progress = ((.current_milestone.tasks_in_progress // 0) - 1)
  ')

  # Update PLAN.md: change 🟡 to 🚫
  if grep -q "$task_id" "$PLAN_FILE"; then
    sed -i.bak "s/\(|.*${task_id}.*\)🟡/\1🚫/" "$PLAN_FILE" && rm -f "${PLAN_FILE}.bak"
  fi

  save_progress "$p"
  warn "Blocked: $task_id — $reason"

  # Auto-chain: find next unblocked task
  local next_id
  next_id=$(cmd_next 2>/dev/null | tail -1)
  if [ -n "$next_id" ] && [ "$next_id" != "No more tasks"* ]; then
    cmd_start "$next_id"
  fi
}

# ─── file-guard ──────────────────────────────────────────────────────────────
cmd_file_guard() {
  step "Checking file length limits (${FILE_LIMIT} lines)"
  local violations=0

  # Source file extensions to check
  local exts="py go rs ts tsx js jsx vue svelte"

  for ext in $exts; do
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      local lines
      lines=$(wc -l < "$f")
      if [ "$lines" -gt "$FILE_LIMIT" ]; then
        warn "$f: $lines lines (limit: $FILE_LIMIT)"
        violations=$((violations + 1))
      fi
    done < <(find . -name "*.${ext}" \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -path "*/.git/*" \
      -not -path "*/target/*" \
      -not -path "*/__pycache__/*" \
      -not -path "*/vendor/*" \
      2>/dev/null)
  done

  [ "$violations" -gt 0 ] && fail "$violations file(s) exceed $FILE_LIMIT lines"
  ok "All source files within limit"
}

# ─── schema ──────────────────────────────────────────────────────────────────
cmd_schema() {
  require_jq
  [ -f "$SCHEMA_FILE" ] || { warn "No schema file at $SCHEMA_FILE — skipping"; return 0; }
  [ -f "$PROGRESS_FILE" ] || fail "Missing $PROGRESS_FILE"

  # Basic structural validation using jq (not full JSON Schema, but catches major issues)
  local required_fields="project last_updated current_milestone"
  local p
  p=$(load_progress)

  for field in $required_fields; do
    local val
    val=$(echo "$p" | jq -r --arg f "$field" '.[$f] // empty')
    [ -z "$val" ] && { fail "progress.json missing required field: $field"; }
  done

  ok "progress.json structure valid"
}

# ─── learn ───────────────────────────────────────────────────────────────────
cmd_learn() {
  local category="${1:-}"
  local message="${2:-}"
  [ -z "$category" ] || [ -z "$message" ] && fail "Usage: harness.sh learn <category> <message>"
  require_jq

  local p
  p=$(load_progress)

  local ct
  ct=$(echo "$p" | jq -r '.current_task.id // "general"')

  p=$(echo "$p" | jq --arg cat "$category" --arg msg "$message" --arg ctx "$ct" --arg ts "$(date -u +%Y-%m-%d)" '
    .learnings += [{
      date: $ts,
      context: $ctx,
      category: $cat,
      problem: $msg,
      solution: "",
      affected_files: [],
      prevention: ""
    }]
  ')

  save_progress "$p"

  # Append to learnings.md
  local learnings_file="docs/learnings.md"
  if [ -f "$learnings_file" ]; then
    printf "\n- **%s** [%s] (%s): %s\n" "$(date -u +%Y-%m-%d)" "$ct" "$category" "$message" >> "$learnings_file"
  fi

  ok "Learning logged: [$category] $message"
}

# ─── Command Router ──────────────────────────────────────────────────────────
cmd="${1:-help}"
shift || true

case "$cmd" in
  init)           cmd_init ;;
  status)         cmd_status ;;
  validate)       cmd_validate ;;
  validate:full)  cmd_validate_full ;;
  next)           cmd_next ;;
  start)          cmd_start "$@" ;;
  done)           cmd_done "$@" ;;
  block)          cmd_block "$@" ;;
  file-guard)     cmd_file_guard ;;
  schema)         cmd_schema ;;
  learn)          cmd_learn "$@" ;;
  help|--help|-h)
    echo "Usage: bash scripts/harness.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init              Session boot: check state, print status"
    echo "  status            Print current milestone, task, progress"
    echo "  validate          Run lint → type-check → test (delegates to Makefile)"
    echo "  validate:full     validate + integration + e2e + file-guard"
    echo "  next              Find next unblocked task"
    echo "  start <id>        Claim a task"
    echo "  done <id>         Complete a task → auto-starts next"
    echo "  block <id> <msg>  Mark task blocked"
    echo "  file-guard        Check 500-line limit on source files"
    echo "  schema            Validate progress.json structure"
    echo "  learn <cat> <msg> Log a learning"
    echo ""
    echo "Not available in native CLI (use TypeScript CLI for these):"
    echo "  worktree:start/finish/reclaim/status, merge-gate, stale-check,"
    echo "  plan:apply, scaffold, changelog, recover, agent registration"
    ;;
  *)
    fail "Unknown command: $cmd (run: bash scripts/harness.sh help)"
    ;;
esac
```

---

## Makefile integration

The native CLI delegates `validate` to the project's Makefile. The Makefile MUST have
a `validate` target. See `project-configs.md` for per-language Makefile templates.

**Minimum required Makefile targets:**

```makefile
.PHONY: lint lint-fix type-check test validate

# These are defined per-language in project-configs.md
validate: lint type-check test
```

**package.json equivalent mapping:**

| Node.js (package.json) | Native (Makefile) |
|------------------------|-------------------|
| `pnpm run harness init` | `bash scripts/harness.sh init` |
| `pnpm run harness validate` | `make validate` (or `bash scripts/harness.sh validate`) |
| `pnpm run harness done M1-001` | `bash scripts/harness.sh done M1-001` |
| `pnpm run harness status` | `bash scripts/harness.sh status` |

---

## .claude/settings.json for native CLI projects

```json
{
  "plansDirectory": "./docs/exec-plans/active",
  "permissions": {
    "allowedTools": [
      "Read", "Write",
      "Bash(git *)",
      "Bash(make *)",
      "Bash(bash scripts/harness.sh *)"
    ],
    "deny": ["Read(./.env)", "Read(./.env.*)"]
  }
}
```

Add language-specific tools as needed:
- Python: `"Bash(uv *)"`, `"Bash(python *)"`, `"Bash(ruff *)"`
- Go: `"Bash(go *)"`, `"Bash(golangci-lint *)"`
- Rust: `"Bash(cargo *)"`, `"Bash(rustup *)"`

---

## Pre-commit hooks for non-Node projects

### Python — `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        additional_dependencies: []
        args: [--strict]

  - repo: local
    hooks:
      - id: file-guard
        name: file-guard (500-line limit)
        entry: bash scripts/harness.sh file-guard
        language: system
        pass_filenames: false

      - id: schema-check
        name: progress.json schema
        entry: bash scripts/harness.sh schema
        language: system
        pass_filenames: false
```

Install: `uv run pre-commit install`

### Go — `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/golangci/golangci-lint
    rev: v1.62.0
    hooks:
      - id: golangci-lint

  - repo: https://github.com/dnephin/pre-commit-golang
    rev: v0.5.1
    hooks:
      - id: go-fmt
      - id: go-vet

  - repo: local
    hooks:
      - id: file-guard
        name: file-guard (500-line limit)
        entry: bash scripts/harness.sh file-guard
        language: system
        pass_filenames: false

      - id: schema-check
        name: progress.json schema
        entry: bash scripts/harness.sh schema
        language: system
        pass_filenames: false
```

Install: `pip install pre-commit && pre-commit install`

### Rust — git hooks (no pre-commit framework)

Rust projects typically use git hooks directly. Generate `.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cargo fmt --all -- --check
bash scripts/harness.sh file-guard
bash scripts/harness.sh schema
```

Configure: `git config core.hooksPath .githooks`

---

## Commit message hook (non-Node)

Generate `scripts/check-commit-msg.sh`:

```bash
#!/usr/bin/env bash
# Validates commit message format: [Mn-NNN] description
# or: scaffold:, chore:, docs:, fix:, feat:, refactor:, test:, ci:
set -euo pipefail

msg_file="${1:-}"
[ -z "$msg_file" ] && { echo "Usage: check-commit-msg.sh <msg-file>"; exit 1; }

msg=$(head -1 "$msg_file")

# Allow conventional prefixes
if echo "$msg" | grep -qE '^(scaffold|chore|docs|fix|feat|refactor|test|ci|merge|revert|Merge):'; then
  exit 0
fi

# Allow [Mn-NNN] task prefix
if echo "$msg" | grep -qE '^\[M[0-9]+-[0-9]+\]'; then
  exit 0
fi

# Allow [WIP: Mn-NNN] prefix
if echo "$msg" | grep -qE '^\[WIP: M[0-9]+-[0-9]+\]'; then
  exit 0
fi

echo "✗ Commit message must start with [M1-001] or a conventional prefix (fix:, feat:, etc.)"
echo "  Got: $msg"
exit 1
```

Wire into git hooks:
- Python/Go: `.pre-commit-config.yaml` local hook with `entry: bash scripts/check-commit-msg.sh`
  and `stages: [commit-msg]`
- Rust: `.githooks/commit-msg` → `bash scripts/check-commit-msg.sh "$1"`

---

## Limitations vs TypeScript CLI

| Feature | TypeScript CLI | Native Shell CLI |
|---------|---------------|-----------------|
| init, status, validate | ✅ | ✅ |
| next, start, done, block | ✅ (auto-chained) | ✅ (auto-chained) |
| file-guard, schema, learn | ✅ | ✅ |
| Worktree management | ✅ | ❌ (use git worktree manually) |
| Agent registration + heartbeat | ✅ | ❌ |
| Stale-check | ✅ (full) | ⚠️ (basic env check only) |
| plan:apply (parse plan → insert milestones) | ✅ | ❌ (manual PLAN.md editing) |
| merge-gate (auto validate:full + changelog) | ✅ | ❌ (run validate:full manually) |
| scaffold commands | ✅ (16 templates) | ❌ |
| Auto-cascade done → next milestone | ✅ | ❌ (manual worktree:start) |
| Windows support | ✅ (Node.js) | ⚠️ (requires Git Bash or WSL) |
| PLAN.md table parsing | ✅ (robust regex) | ⚠️ (basic sed/grep) |

**Recommendation:** If the project will grow beyond a single milestone or needs parallel
agents, install Node.js and use the TypeScript CLI. The native CLI is best for small-to-medium
single-agent projects where Node.js is genuinely unwanted.
