# Git Worktree Workflow

> **Cross-platform note**: Use `path.join()` or forward slashes `/` for path separators (Git on Windows also accepts forward slashes). On Windows, replace `~/` with `%USERPROFILE%\` or use absolute paths directly.

This document defines how to use `git worktree` for parallel development when a new Milestone or new PRD comes in,
ensuring `main` is always stable and different Milestones don't interfere with each other.

---

## Why Use Worktrees?

Traditional branch switching requires stashing or committing unfinished work.
`git worktree` gives each Milestone an **independent working directory**, allowing multiple to be open simultaneously without interference.

```
[PROJECT_DIR]/           ← main worktree (always stable)
[PROJECT_DIR]-m2/        ← milestone/feature-x worktree
[PROJECT_DIR]-m3/        ← milestone/feature-y worktree
```

---

## Trigger Conditions

A new Worktree must be created in the following situations:

1. **New Milestone begins** (new feature set added to PRD)
2. **Framework-level changes** (affects architecture, can't be changed directly on existing branch)
3. **User submits a new PRD / next delivery version** (new functional requirements come in)
4. **Experimental features** (exploratory work that may or may not be merged)

---

## Standard Worktree Process

### Step 1: Update PRD

```bash
# Update docs/PRD.md for the next delivery version
# Update version number v1.x → v1.x+1 / v2.0
# Record in change log
git add docs/PRD.md
git commit -m "docs(prd): add milestone-[N] [feature name]"
```

### Step 2: Create Milestone Branch + Worktree

```bash
# Create new milestone branch from main
git branch milestone/[milestone-name]

# Create worktree (independent working directory)
git worktree add ../[PROJECT_NAME]-m[N] milestone/[milestone-name]

# Enter the new working directory
cd ../[PROJECT_NAME]-m[N]
```

Naming convention:
- Branch: `milestone/m2-user-dashboard`
- Worktree directory: `../my-app-m2`

### Step 3: Execute Task Loop in Worktree

```bash
# Confirm you're in the correct worktree
git branch   # should show milestone/m2-user-dashboard

# After each Task is done, make an Atomic Commit (see specification below)
git add [only files related to this Task]
git commit -m "feat(T007): implement user dashboard skeleton"
```

### Step 4: Merge After Milestone Completion

```bash
# Return to the main worktree
cd ../[PROJECT_NAME]

# Confirm CI passes
# Merge the milestone branch
git merge --no-ff milestone/m2-user-dashboard \
  -m "feat(milestone-2): user dashboard [T007-T012]"

# Clean up the worktree
git worktree remove ../[PROJECT_NAME]-m2
git branch -d milestone/m2-user-dashboard
```

---

## Atomic Commit Specification

**Definition of an atomic commit**:
- One commit = one Task = one logical unit
- This commit can build, pass lint, and pass tests on its own
- Can be individually reverted without breaking other features

### Commit Message Format (Conventional Commits)

```
<type>(<scope>): <description>

[optional body]

[optional footer: Task-ID]
```

**Type reference table:**
| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactoring (no functional change) |
| `test` | Add or modify tests |
| `docs` | Documentation updates (including AGENTS.md, PRD.md) |
| `chore` | Build tools, CI/CD, dependency updates |
| `perf` | Performance optimization |

**Scope reference table:**
| Scope | Usage |
|-------|-------|
| `auth` | Authentication related |
| `db` | Database related |
| `api` | API related |
| `ui` | UI component related |
| `agent` | AI Agent related |
| `infra` | Infrastructure related |
| `T[ID]` | Use Task ID directly |

### Good Atomic Commit Examples

```bash
# ✅ Good: one commit does one thing
git commit -m "feat(auth): implement email/password login with Better Auth

- Add auth.ts in lib/ with Better Auth config
- Add auth API route handler
- Add LoginForm component
- Add 3 unit tests for auth flow

Task-ID: T003"

# ✅ Good: documentation update is also one commit
git commit -m "docs(agents): update AGENTS.md with auth module constraints

Add auth-specific rules:
- Session token must be HttpOnly cookie
- Auth errors must not expose internal details"

# ❌ Bad: one commit does too many things
git commit -m "add auth, fix db bug, update UI"

# ❌ Bad: commit can't build
git commit -m "WIP: half done auth"
```

### Atomic Commit Checklist (Confirm Before Each Commit)

```bash
# Does this commit only contain changes from a single Task?
git diff --staged   # review what will be committed

# Build / package command passes?
# Run the repository's build command

# Lint / static analysis passes?
# Run the repository's lint or static-analysis command

# Tests pass?
# Run the repository's test command

# Only stage relevant files (don't use git add -A)
git add [relevant file 1]
git add [relevant file 2]
```

---

## Multi-Worktree Parallel Management

If multiple Milestones are in progress simultaneously (e.g., designer working on UI, engineer working on API):

```bash
# View all worktrees
git worktree list

# Example output:
# /Users/user/Projects/my-app           abc1234 [main]
# /Users/user/Projects/my-app-m2        def5678 [milestone/m2-dashboard]
# /Users/user/Projects/my-app-m3        ghi9012 [milestone/m3-ai-features]
```

**Notes**:
- The same branch cannot have two worktrees simultaneously
- Resolving conflicts: in each worktree, first run `git fetch && git rebase origin/main`, then continue

---

## Special Handling for Architecture Changes

If a new PRD requires **architecture changes** (e.g., adding a new dependency layer, changing directory structure):

1. **Update ARCHITECTURE.md first** (on the main branch)
2. **Update AGENTS.md** (so all subsequent Agents know about the new architecture)
3. **If this belongs to a deferred next version, promote that version only after the current one completes deploy review**
4. **Create a new worktree** and branch from the updated main
5. In the Task's commit message, indicate: `refactor(arch): restructure [description]`

**Important**: Architecture change commits must be standalone and cannot be mixed with feature implementation in the same commit.

---

## Worktree Cleanup

Periodically clean up completed worktrees:

```bash
# List all worktrees
git worktree list

# Remove a single worktree
git worktree remove ../my-app-m2

# Prune all worktrees for deleted branches
git worktree prune
```


---

## Monorepo Project Worktree Path Rules

Monorepo (Turborepo / Bun workspaces) worktrees are **created outside the repo root level**,
not inside `packages/`:

```
[PARENT_DIR]/
├── my-app/                    ← main repo (root)
│   ├── packages/
│   │   ├── web/
│   │   ├── api/
│   │   └── cli/
│   └── ...
├── my-app-m1/                 ← Milestone 1 worktree (outside repo root)
├── my-app-m2/                 ← Milestone 2 worktree
```

```bash
# Create worktree from repo root
cd my-app
git worktree add ../my-app-m1 milestone/m1-foundation

# Windows PowerShell works the same (Git accepts forward slashes):
git worktree add ../my-app-m1 milestone/m1-foundation
```

The Milestone branch is managed at the root repo; the worktree contains the entire monorepo structure.
During development, work within the worktree's `packages/[target]/` directory.
