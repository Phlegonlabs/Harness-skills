# Execution Runtime — Agent Guidelines

Conceptual guidelines that complement the harness CLI.
The CLI handles mechanics (state, validation, task picking). This doc handles
judgment calls that can't be automated: context management, parallel coordination,
quality gates, and when to ask humans.

---

## Execution Mode

Default to serial-first. If there is only one eligible milestone, one active agent,
and no explicit isolation need, stay on main/root and run the task loop there.

Switch into managed worktree mode only when:
1. 2+ milestones are dependency-independent and worth running in parallel
2. The user explicitly asks for milestone isolation or separate diffs
3. The agent judges isolated execution is beneficial (risky refactor, dependency churn, or concurrent review)

A project can start serially and switch to worktree mode later. Do not create worktrees
preemptively when the dependency graph is still linear.

## Scaffold Boundary

Treat the scaffold as foundation only, especially at the start of M1.

- Placeholder files, page shells, docs, schemas, config, stubs, and empty integrations are not
  evidence that a milestone is already done.
- Judge completion from the PLAN row's `Done When` outcome, plus working code and validation,
  not from the mere existence of scaffolded files.
- If the scaffold created a shell for the task, the execution milestone still owns the real
  behavior, integration, and production-hardening work.

## Ad Hoc Instruction Tracking

Treat narrow user instructions as trackable work, not disposable chat context.

- Discussion can stay in chat while the user is still shaping the request.
- If the user says "change this style", "update this content", "follow this plan", or gives
  another partial instruction that causes real work, and they have clearly moved from discussion
  into "go do it" mode, mirror it into repo state immediately.
- If a prior plan-mode conversation, pasted checklist, or copied change plan is detailed enough to
  execute, treat that as execution-authorizing planning content and sync it to repo state now.
- If the request fits the active milestone, add/refine the task in `docs/PLAN.md` and keep
  `docs/progress.json` aligned before or at task start, then continue active execution there.
- If the request does not fit an active milestone, create a lightweight follow-up plan,
  task, or micro-milestone, then sync `docs/PLAN.md` + `docs/progress.json` before execution.
- UI, copy, and design-detail tweaks still count as tracked work. Update the relevant UI docs
  and keep the task board accurate instead of treating them as invisible side notes.
- Never execute meaningful repo changes from chat-only intent or plan-mode memory with no
  PLAN/progress trace.

---

## Parallel Worktree Protocol

Use this protocol only when managed worktree mode is active.

**Rules:**
1. **When parallel mode is active: one agent, one worktree** — CLI enforces this via `agents` array in progress.json
2. **Only milestones with no dependencies run in parallel** (check PLAN.md `Depends on`)
3. **progress.json is the coordination point** — agents self-register via `harness init`
4. **Merge order follows dependency order** — `worktree:finish` blocks if deps aren't merged
5. **Stale heartbeat (>2h) = reclaimable** — another agent can take the milestone
6. **Root-side finish is serialized** — only one `worktree:finish` mutates main at a time; other ready milestones remain queued in `finish_jobs`
7. **Rebase after upstream merge** — when a parallel milestone merges, others rebase

Example parallel setup:
```
Agent 1: harness worktree:start M1  → working on M1
Agent 2: harness worktree:start M3  → working on M3 (no dep on M1)

# Agent 1 finishes M1:
harness done M1-last  → merge-gate queues root-side finish → M1 merges into main

# Agent 2 rebases M3 onto updated main (inside M3 worktree):
harness worktree:rebase  → git rebase main
# resolve any conflicts, then continue working

# Agent 2 finishes M3:
harness done M3-last  → merge-gate queues root-side finish → auto-rebases, merges M3

# Check status from main:
harness worktree:status  → shows agents, heartbeats, auto-finish jobs, merge readiness
```

**Agent registration lifecycle:**
- `harness init` (in worktree) → registers agent with id, milestone, heartbeat
- `harness next/start/done` → updates heartbeat timestamp
- `harness worktree:finish` → root-side rebase, merge, plan archive, push, deregister, remove worktree
- `finish_jobs` in `docs/progress.json` → visible queued/running/failed/succeeded state for the serialized root-side finish queue
- Heartbeat >2h old → shown as STALE in `worktree:status`, reclaimable by other agents

If a stale milestone needs to be taken over immediately, run:
`harness worktree:reclaim <M-id>`

---

## Context Budget

Performance degrades beyond ~40% context utilization. Budget:

| Zone | Budget |
|------|--------|
| System prompt + AGENTS.md / CLAUDE.md | ≤ 15% |
| `harness status` output + current PLAN section | ≤ 10% |
| Memory (`MEMORY.md` + today's daily log) | ≤ 5% |
| PRD section for current story | ≤ 5% |
| Source files for current task | ≤ 25% |
| Working memory (code + reasoning) | ≤ 40% |

**Progressive disclosure:**
- Never load entire codebase, entire PLAN, or entire PRD
- Load only files relevant to the current task
- Load `docs/product/frontend-design.md` before any frontend task
- Load `docs/product/design.md` before changing a specific page, screen, route, tab, navigation flow, or overall app shell / wireframe structure
- Treat `docs/product/design-preview.html` as a human-review / drift-check artifact, not as the implementation source of truth; open it only when validating visual direction with a human or checking UI drift
- If a task changes navigation, page structure, theme, density, or component hierarchy, update the relevant UI docs and regenerate `docs/product/design-preview.html` before closing the task
- Load `docs/memory/MEMORY.md` at session start — if >200 lines, load only recent entries
- Load today + yesterday daily log; skip older logs unless searching for specific info
- Files >200 lines → load only the relevant section
- Context overloaded? → write notes to daily log, `harness done`, commit, start fresh session

**Signs of overload:** repeating itself, forgetting rules, conflicting patterns, re-asking answered questions.

---

## Quality Checkpoints

| Event | Mode | Action |
|-------|------|--------|
| Task passes `harness validate` | **Auto** | `harness done`, continue |
| Task failed 3x | **Human** | `harness block`, report, wait |
| Milestone all done | **Auto** | `harness merge-gate` |
| Merge gate fails | **Human** | Report, wait |
| Integration tests fail | **Human** | Report, suggest fix, wait |
| New module created | **Human** | Review ARCHITECTURE.md update |
| Security-sensitive change | **Human** | Always request review |
| Dependency conflict | **Auto** | Delete and rebuild (Iron Rule 3) |
| Shared harness / CI / template change | **Auto** | Trigger downstream replay validation and record the result |
| File approaching 500 lines | **Auto** | Split (Iron Rule 1) |
| Stale doc detected | **Auto** | Fix, commit, continue |
| TODO/FIXME found in code | **Auto** | Convert to task in PLAN.md, remove comment (Iron Rule 7) |
| console.log in production code | **Auto** | Replace with structured logger (Iron Rule 7) |
| Unhandled error path detected | **Auto** | Add try/catch + error logging (Iron Rule 7) |
| Build warning | **Auto** | Fix before commit — zero warnings policy (Iron Rule 7) |

**How to request human review:**
1. `harness block <id> "needs human review: <reason>"`
2. Commit current work with `[WIP: Mn-id]` prefix
3. Pick next unblocked task via `harness next`, or pause if none

---

## Integration Testing

Three test tiers:

| Tier | Scope | Trigger | Command |
|------|-------|---------|---------|
| Unit | Per-module | Every task | `harness validate` |
| Integration | Cross-module | Milestone merge | `harness validate:full` |
| E2E | Full user journey | Milestone merge | `harness validate:full` |
| Replay | Cross-project workflow compatibility | Shared harness / template / CI change | Downstream repo: `harness validate:full` |

Test directory structure:
```
tests/
├── unit/              ← run per-task
├── integration/       ← run at milestone merge
└── e2e/               ← run at milestone merge
```

## Multi-Project Replay Protocol

When a repo changes shared harness assets (`SKILL.md`, `docs/agent/harness-cli.md`,
CI/hook templates, progress schema, or plan insertion rules), local green is not enough.
The change is only closed when at least one downstream project or fixture repo replays it.

Required upstream handoff packet:
- changed files / contracts
- migration steps for downstream repos
- expected CLI behavior deltas (`plan:apply`, `worktree:start`, `validate:full`, finish flow)
- rollback note if replay fails

Replay flow:
1. Choose a representative downstream repo or fixture project.
2. Apply the upstream delta there via scaffold update, plan insertion, or manual migration.
3. If the replay spans multiple tasks, create a replay milestone so the downstream run still uses normal worktree flow.
4. Run the normal loop: `harness init` → sync `PLAN.md` / `progress.json` → choose serial or worktree execution as appropriate → `validate:full`.
5. Record pass/fail with repo name, commit SHA, and handoff notes.

Hard rules:
- No shared harness / CI / template change ships with only single-repo proof.
- If project A changes a workflow that project B depends on, project B gets an explicit replay or follow-up milestone — never assume the handoff is implicit.

For the short executable version, see [replay-protocol.md](replay-protocol.md).

---

## Learnings Format

When `harness learn` logs an entry, it uses this structure in progress.json:

```json
{
  "date": "2026-03-05",
  "context": "M1-003",
  "category": "dependency",
  "problem": "bcrypt native bindings fail on Alpine Docker",
  "solution": "Use bcryptjs (pure JS) instead",
  "affected_files": ["package.json", "src/lib/auth/hash.ts"],
  "prevention": "Prefer pure-JS packages for Docker compatibility"
}
```

Categories: `dependency`, `config`, `architecture`, `testing`, `deploy`, `performance`, `security`, `tooling`

During session init (`harness init`), scan learnings relevant to the current task.
Load those. Skip irrelevant history — don't waste context budget.

