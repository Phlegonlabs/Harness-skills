## Artifact Generation Rules

### AGENTS.md + CLAUDE.md (Identical Content)

These two files have **the same content**. Generate one, copy to the other.
AGENTS.md is for Codex. CLAUDE.md is for Claude Code. Same rules, no divergence.

#### What is TEMPLATED (copy verbatim into every project):

The Interaction Rules and Iron Rules sections are fixed:

```
## Interaction Rules

These rules define the default interaction style for this project. Follow them unless the user gives a more specific instruction.

- Language: communicate in Chinese.
- Code comments: always write them in English.
- Before writing code or editing files, address the user as `Yo Rich Guy`.
- Taste standard: pursue high-quality, non-mediocre code with a direct, Linus-style engineering tone.
- Avoid filler openers such as `I will...`, `Here is...`, or `Let me...`.
- Do not add wrap-up summaries unless the user explicitly asks for one.
- Default to concise, code-first responses during edit flows. If the user explicitly wants code/diff-only output, respond with code/diff and end with `Done.`
- Fix straightforward issues silently; do not narrate every small recovery step.

## Iron Rules — Non-Negotiable

These rules are absolute. No exceptions. No workarounds. No "just this once."

### 1. 500-Line Hard Ceiling + Proactive Modularization
No single **source code file** may exceed 500 lines. But don't wait until 500 — split
proactively. If a file is approaching ~250 lines and has more than one responsibility,
extract a module NOW. Every file should have a single, clear purpose.

**Proactive split triggers (act on ANY of these):**
- File has 2+ unrelated sections → extract to separate modules
- File has functions used by multiple other files → move to a shared module
- A single function exceeds ~80 lines → extract helpers or decompose
- You're adding a new feature to an existing file and it'll push past ~300 lines → new module
- A component renders AND fetches data AND handles state → split by concern
- The harness CLI itself follows this rule: entry point ~50 lines, 6 focused modules, each <350 lines

**How to decompose:**
- Group by domain/responsibility, not by file type (don't put all types in one file)
- Each module exports a clear, minimal API — internal helpers stay private
- Prefer deep module trees (modules/auth/service.ts, modules/auth/routes.ts) over flat ones
- Re-export from index.ts barrel files when the module API is stable

**Documentation files are exempt from the 500-line limit.** These files may
(and often will) exceed 500 lines — do NOT split them:
- `docs/PRD.md` — grows with the project
- `docs/PLAN.md` — grows with each sprint
- `AGENTS.md` / `CLAUDE.md` — must stay in one file (agents read them whole)
- `ARCHITECTURE.md`, `docs/gitbook/*.md`, `docs/learnings.md`, any file under `docs/`

If `PLAN.md` grows past ~1000 lines, archive completed execution plan files to
`docs/exec-plans/completed/` rather than splitting the file. The CLI handles this
automatically via `worktree:finish` when a milestone completes.
When upgrading an older project to a newer harness runtime, run `harness migrate`
once from main/root to backfill the exec-plan folders and schema.
`harness migrate` does not rewrite AGENTS.md / CLAUDE.md or workflow prose.

### 2. Zero Compatibility Code
No polyfills. No shims. No backward-compat wrappers.
Write for the target runtime and version in project config. Period.
If a dependency requires compat hacks, replace the dependency.

### 3. Conflict = Delete and Rebuild
If a module conflicts with existing code — type mismatches, circular deps, API surface
disagreements — do NOT patch around it. Delete and rebuild from scratch.
Code is cheap. Tokens are infinite. Architectural clarity is priceless.

### 4. First Principles Programming
Every function, module, and abstraction must justify its existence from first principles.
Ask: What is this actually trying to do? What is the simplest correct way?
If you can't explain the WHY in one sentence, the code shouldn't exist.

### 5. Frontend = Always Use frontend-design Skill
When generating any frontend code (components, pages, layouts, styles), ALWAYS read
and follow `docs/product/frontend-design.md` first. This file is bundled in the project.
No exceptions. Even for "small" UI changes.

When generating or editing a **specific page or screen**, also read the corresponding
entry in `docs/product/design.md` (generated in Phase 3 for Web App / Mobile / Desktop projects).
`docs/product/design.md` contains the authoritative product wireframe: overall app shell, global layout
regions, navigation structure, page contracts, and auth gates. Do not add pages, major layout
shifts, or shell changes not captured there without updating `docs/product/design.md` first.

When a task changes UI structure or visual direction:
- Route, navigation, or screen-state changes → update `docs/product/design.md`
- Theme, density, component hierarchy, or stylistic changes → update `docs/product/frontend-design.md`
- Any change that would alter human review of the UI → regenerate `docs/product/design-preview.html`

### 6. Secrets Never Touch Git
.env files are NEVER committed. Not even "example" values that look like real keys.
- `.env` is in .gitignore from day zero — non-negotiable
- `.env.example` contains only KEY_NAME=placeholder pairs, never real values
- All secrets load from environment variables at runtime, never hardcoded
- If you see a string that looks like a key/token/password in source code, extract it to env immediately

### 7. Production Ready Standard
Every milestone must be shippable. Code that "works on my machine" is not done.
- Error handling: every external call (API, DB, file I/O) has try/catch or error boundary
- Input validation: every endpoint/command validates input before processing
- Logging: every error is logged with context (request ID, user, operation)
- No console.log in production code — use structured logger
- No hardcoded URLs, ports, or credentials — all from env/config
- No TODO/FIXME/HACK comments — if it's not fixed, it's a task in PLAN.md
- Tests cover the happy path AND at least one error path per function
- Build produces zero warnings (not just zero errors)
- README/docs accurately describe what the code actually does right now
```

#### What is DYNAMICALLY GENERATED (unique to each project):

Everything else must be written fresh from the user's actual project context.
DO NOT use generic placeholders. DO NOT copy from the template — write it.

Dynamically generate these sections:

- **Project overview** — What THIS project does, its stack, its purpose. From the PRD.
- **Quick start** — Real commands for THIS project's package manager and stack.
  Separate activation from running the app. Prefer phrasing like:
  `When you're ready to start milestone 1: bun install`
  then `bun dev`, instead of collapsing everything into `bun install && bun dev`.
  Include `docker-compose up -d` if Docker is configured.
- **Scaffold boundary** — State explicitly that Phase 3 created the foundation only.
  Placeholder routes, stubs, schemas, docs, hooks, and config files do NOT satisfy PLAN tasks.
  A milestone is only complete when its `Done When` outcome is true in real code/runtime behavior.
- **Progress tracking conventions** — Every meaningful user instruction must land in repo state.
  Discussion can stay conversational at first, but once the user gives explicit go-ahead or a
  sufficiently detailed change plan exists, small style/content/layout tweaks become tracked
  tasks and larger asks become a new plan file or milestone. Never keep actionable work only in
  chat or only in old plan-mode transcripts.
- **Closed-loop execution rule** — Every generated project must teach the agent to finish each
  workflow completely:
  - planning → exec-plan file + `docs/PLAN.md` + `docs/progress.json`
  - implementation → validation + task-state update + docs sync when needed
  - docs work → repo doc update + source-of-truth re-check
  - handoff → repo synced enough that the next Claude Code or Codex session can resume cleanly
- **Repository map** — Pointers to the actual docs in THIS project.
- **Architecture rules** — Dependency layers, module boundaries, import restrictions
  specific to THIS project's domain. Derived from ARCHITECTURE.md.
- **Error handling conventions** — Point to `src/lib/errors.ts`, explain the error
  class hierarchy. "All errors thrown in application code must extend AppError."
- **Logging conventions** — "Use the structured logger from `src/lib/logger.ts`.
  Never use console.log in production code."
- **Feature flag conventions** — "Every new user-facing feature ships behind a flag.
  Check `src/lib/feature-flags.ts`. Remove flag when feature is stable."
- **Analytics conventions** — "Use `trackEvent()` from `src/lib/analytics.ts`.
  Never call GA/Posthog directly."
- **Dev environment tips** — Real tips for THIS stack. pnpm project gets pnpm commands.
  Go project gets Go tips. Include Docker commands if applicable.
- **Testing instructions** — The full testing loop for THIS project. Include:
  - The exact `lint:fix`, `lint`, `type-check`, `test`, `validate` commands
  - How to run a single test file or test case
  - The rule: run `validate` before EVERY commit, no exceptions
- **Deploy instructions** — How to deploy THIS project to the chosen target.
  Actual commands, not generic advice.
- **PR conventions** — Scope names from THIS project's actual modules/domains.

- **Plan File Convention** — Where plan files go (critical for Codex compatibility):

```
## Plan Files

All plan files MUST be written to `docs/exec-plans/active/`.

For Claude Code: this is handled automatically via .claude/settings.json (plansDirectory).
For Codex: when creating a plan, ALWAYS write it to `docs/exec-plans/active/<descriptive-name>.md`.
  Do NOT write plans to ~/.codex/ or any other location outside the project.

Naming convention: `YYYY-MM-DD-<short-description>.md`
Example: `2026-03-08-add-user-profile-editing.md`

### Adding New Work — Full Flow

1. Enter plan mode (Shift+Tab) → discuss requirements with the user
2. Before writing the plan:
   - TypeScript CLI: run `<pkg-mgr> run harness plan:status`
   - Native shell CLI: inspect `docs/PLAN.md` + `docs/progress.json` directly
   This gives the agent the current milestones, what's done/active, and the next available M number.
   - It is fine to discuss first. Once the user says to proceed, or the pasted / prior plan-mode
     content is detailed enough to execute, use this flow immediately.
   - A small style tweak, copy update, or pasted checklist can become a one-task plan or a
     micro-milestone; do NOT skip tracking just because the request sounds narrow.
3. Write the plan to docs/exec-plans/active/ using PLAN.md milestone format:

   ### M1: Feature Name
   **Status:** ⬜ Not Started
   | Task ID | Story | Task | Done When | Status | Commit |
   |---------|-------|------|-----------|--------|--------|
   | M1-001  | —     | ...  | ...       | ⬜     | —      |

   Use any milestone numbering (M1, M2...) — plan:apply auto-renumbers to avoid conflicts.
   If the plan needs architecture changes, document them in the plan file as prose above the tables.

4. Materialize the plan before leaving planning:
   - **TypeScript CLI (`scripts/harness.ts`)**: run `<pkg-mgr> run harness plan:apply` from main/root
     - Reads all unsynced plan files
     - Analyzes current project state (completed, active, pending milestones)
     - Renumbers milestones to avoid conflicts (M1 in plan → M5 in project if M4 exists)
     - Resolves dependencies (same apply batch auto-chains in order unless explicit deps override it)
     - Appends milestones to PLAN.md with correct headers (Status, Branch, Worktree, Depends on)
     - Updates progress.json (active_milestones, per-task mirrors, dependency_graph, synced_plans, finish_jobs)
     - Marks plan file as synced
   - **Native shell CLI (`scripts/harness.sh` with no Node.js)**:
     - Still write the plan file to `docs/exec-plans/active/`
     - Manually copy the milestone tables into `docs/PLAN.md`
     - Manually update `docs/progress.json` (`active_milestones`, task mirrors, `dependency_graph`)
     - Do NOT instruct the agent to run `plan:apply`, `worktree:*`, or expect auto-archive

5. Verify `docs/PLAN.md` + `docs/progress.json` now reflect the new work. Do not rely on a later
   `harness init` in another session to ingest chat-only planning output.

   **Fallback if planning already ended elsewhere:**
   - Paste the full approved plan output, relevant planning transcript, or any sufficiently detailed prior planning content back into the current session
   - Read the pasted planning context before rewriting anything; do not reconstruct milestones from a one-line summary
   - Recreate `docs/exec-plans/active/<descriptive-name>.md` from that pasted context
   - Then run the same materialization step above so `docs/PLAN.md` + `docs/progress.json` become the source of truth again

6. If the new plan changes module boundaries, cross-service integrations, deployment topology,
   or core data flow:
   - Update `ARCHITECTURE.md` before leaving planning
   - If `docs/gitbook/architecture.md` exists, sync it in the same handoff when the wording is stable;
     otherwise add an explicit docs task in the new milestone
   - Do not leave architecture-impacting decisions only in chat or only in exec-plan prose

7. Choose execution start:
   - **Serial-first default:** run `<pkg-mgr> run harness init` when there is one eligible milestone,
     one active agent, and no explicit isolation need
   - **Managed worktree mode:** run `<pkg-mgr> run harness worktree:start M<next>` only when
     2+ milestones can run in parallel, the user requests isolation, or the agent judges
     isolated execution is beneficial

After a TypeScript CLI plan is applied, the file stays in exec-plans/active/ as reference.
When every milestone defined in that file is completed, `worktree:finish` auto-moves it to
`exec-plans/completed/`. The native shell CLI does not automate that archive step.
```

- **Cross-agent continuation** — State explicitly that Claude Code and Codex can hand work off
  through the repo only. Generated `AGENTS.md` / `CLAUDE.md` should instruct agents to:
  - Always sync `docs/PLAN.md` + `docs/progress.json` before switching agents
  - Sync `ARCHITECTURE.md` and `docs/gitbook/architecture.md` when system shape changed
  - Sync `docs/product/frontend-design.md`, `docs/product/design.md`, and regenerate `docs/product/design-preview.html`
    when UI direction or page structure changed
  - Resume from `harness init` on repo root in serial mode, or from the same milestone worktree
    in managed worktree mode
  - Ignore chat-only memory once the repo is synced; the repo files become authoritative

- **Scaffold Templates (CLI)** — When adding new capabilities mid-project, use the
  harness CLI to inject templates. DO NOT search the web blindly:

```
## Scaffold Templates — harness scaffold <type>

When the project needs to add a new capability layer (agent tools, skills, deployment config),
the CLI has built-in templates. These are production-ready patterns, not generic boilerplate.

DO NOT search the web for "how to build MCP server" or "SKILL.md format".
Run the CLI command — it generates the right files adapted to this project.

| Need | Command | What it generates |
|------|---------|-------------------|
| Expose API as agent tools | `harness scaffold mcp` | `src/tools/`, `src/server.ts`, transport config, test skeleton |
| Make project discoverable | `harness scaffold skill` | `SKILL.md` at project root (OpenClaw / claude.ai compatible) |
| Generate LLM index | `harness scaffold llms-txt` | `llms.txt` (llmstxt.org spec) — auto-scans project files |
| A2A agent-to-agent discovery | `harness scaffold agent-card` | `/.well-known/agent.json` (Google A2A protocol) |
| Tool observability | `harness scaffold agent-observe` | `src/lib/tool-metrics.ts` — call count, latency, errors |
| Auth + rate limiting | `harness scaffold agent-auth` | `src/middleware/auth.ts` — Bearer token + per-key rate limit |
| Payment layer | `harness scaffold agent-pay` | x402 (HTTP 402 micropayments) + Stripe metered billing |
| MCP protocol tests | `harness scaffold agent-test` | Integration tests for full MCP lifecycle + error handling |
| Schema drift CI | `harness scaffold agent-schema-ci` | CI script comparing SKILL.md tools vs code registry |
| Tool versioning docs | `harness scaffold agent-version` | `docs/tool-versioning.md` — v1/v2, deprecation flow |
| Multi-agent client | `harness scaffold agent-client` | `src/lib/agent-client.ts` — discover + call remote agents |
| MCP Prompts | `harness scaffold agent-prompts` | `src/prompts/index.ts` — pre-built prompt templates |
| Webhook / long tasks | `harness scaffold agent-webhook` | `src/lib/task-queue.ts` — async tasks + callback pattern |
| Cost tracking | `harness scaffold agent-cost` | `src/lib/cost-tracker.ts` — per-call cost + audit log |
| Pre-built agent milestone | `harness scaffold milestone:agent` | Appends 11-task MCP milestone to PLAN.md + progress.json |
| Cloudflare Workers config | `harness scaffold cloudflare` | `wrangler.toml` (D1/KV/R2), `.dev.vars`, CI deploy |

How to use:
1. Enter plan mode → discuss what you want to add
2. Run: <pkg-mgr> run harness scaffold <type>
3. CLI generates files → you review + adapt to project specifics
4. Create a plan/milestone for the remaining work (wire up routes, implement tools, etc.)
5. Resume normal Task Execution Loop

Multiple scaffolds can be combined:
  <pkg-mgr> run harness scaffold mcp
  <pkg-mgr> run harness scaffold skill
  <pkg-mgr> run harness scaffold milestone:agent
```

- **Session Init Protocol** — What the agent does FIRST when starting:

```
## Session Init — Do This First, Every Time

Run: <pkg-mgr> run harness init

This automatically cascades through the full startup sequence:
1. Syncs any new plan files from docs/exec-plans/active/
2. If running on main/root and unsynced plans remain → auto plan:apply as recovery (not as the primary planning handoff)
3. If running inside a worktree and new plans exist → warns and defers plan:apply to main/root
4. Runs stale detection + milestone closeout recovery
5. Prints current status (milestone, task, blockers, progress)
6. If in a worktree with no current task → auto next → auto start (claims first available)
7. If NOT in a worktree and one eligible milestone should stay serial → resume or start it on main/root
8. If NOT in a worktree and isolation / parallel mode is warranted → prints the `worktree:start` command to use

After init, the CLI tells the agent exactly what to do:
  "Started: M3-004 — Add chart components. Write code, then run: harness validate"

Then load memory (agent does this, not the CLI):
- Read docs/memory/MEMORY.md — long-term project memory
- Read docs/memory/YYYY-MM-DD.md (today + yesterday) — recent session context
- If resuming a task: check the daily log for "In Progress" section

Context budget:
- Use the canonical budget in `docs/agent/execution-runtime.md#Context Budget`
- Do not maintain a second budget table here
- Overloaded? → write notes to daily log, commit what works, start fresh session.

After init, proceed DIRECTLY to writing code. Do not wait for user confirmation.
```

- **Task Execution Loop** — The agent only does 3 things in a loop:
  1. Write code
  2. `harness validate` + `git commit`
  3. `harness done <id>`
  
  Everything else is auto-cascaded by the CLI. Do NOT manually run `next` or `start`.

```
## Task Execution Loop

The CLI auto-chains commands. The agent's loop is simple:

Run the loop in the chosen execution context:
- Serial-first: main/root
- Managed worktree mode: the milestone worktree

  # 1. Write code for the current task (init already started it)

  # 2. Validate + commit
  <pkg-mgr> run harness validate
  git add -A && git commit -m "[M1-003] <what you did>"

  # 3. Mark done — CLI auto-cascades:
  <pkg-mgr> run harness done M1-003
  #   → ✅ PLAN.md + progress.json updated (including tasks[] array)
  #   → verify worktree is clean; if not, pause and warn instead of resetting files
  #   → auto next (find next unblocked task) only when git state is clean
  #   → auto start (claim it → 🟡) only when git state is clean
  #   → prints: "Started: M1-004 — Implement login. Write code, then run: harness validate"
  #
  # If no more tasks → full auto-chain:
  #   → auto merge-gate (validate:full + stale-check + changelog)
  #   → if green → close the milestone in the active execution mode
  #   → if isolated mode is active, queue root-side worktree:finish (rebase → merge → archive → push → cleanup)
  #   → continue the next eligible milestone in the chosen execution mode
  #   → prints: "Started: M2-001 — ..."
  #   → Agent continues writing code. Zero manual steps between milestones.
  #
  # If all tasks blocked → prints blockers, waits for human

  # Write a brief note to docs/memory/YYYY-MM-DD.md after each task
  # (1-2 lines: what was done, any gotchas)

  # 4. Repeat — write code for the next task (already started by done's auto-cascade)

If validate fails 3x:
  <pkg-mgr> run harness block M1-003 "reason"
  <pkg-mgr> run harness learn <category> "what went wrong"
  # block auto-cascades: → auto next → auto start next unblocked task
  # Agent continues with the next task without manual intervention.

## Milestone Transition

When the last task is done, the CLI auto-runs merge-gate and, on success, queues a
root-side `worktree:finish` from the main repo when managed worktree mode is active:

  # done M1-007 auto-triggers this chain after merge-gate passes:
  #   → if isolated mode is active: root-side serialized worktree:finish queue receives M1
  #   → if isolated mode is active: rebase + merge + archive completed exec plan + push + remove worktree
  #   → AUTO: continue M2 in the chosen execution mode
  #   → "Started: M2-001 — ..."

The agent does not need to manually close a milestone under the normal flow.

If the agent forgets to merge and starts a new session:
  harness init  ← detects: all tasks ✅ but milestone not merged
  #   → auto-finish from main root
  #   → does NOT auto-start new tasks — forces merge first

## What the agent NEVER needs to manually run:
  - harness next              ← auto-called by done
  - harness start <id>        ← auto-called by done (and by init)
  - harness merge-gate        ← auto-called by done when milestone complete
  - harness worktree:finish   ← auto-queued by merge-gate after milestone completion
  - harness worktree:start    ← only when entering managed worktree mode or parallel execution
  - harness plan:apply        ← run during planning handoff; init only auto-applies leftover unsynced plans as recovery
  - harness recover           ← auto-called by init
```

- **Merge Gate** — When all tasks in a milestone are ✅:

```
## Milestone Merge Gate

<pkg-mgr> run harness merge-gate

This runs: validate:full + stale-check + changelog.
If green inside a worktree, the CLI queues root-side finish automatically.
Tagging, if needed, is a separate post-merge release action.
```

- **Stale Detection** — Run anytime, or automatic via `harness init`:

```
## Stale Detection

<pkg-mgr> run harness stale-check

Automatically checks: .env.example sync, PLAN vs progress.json,
new modules not in ARCHITECTURE.md, unsynced plan files, dead doc links.
```

- **Idle Protocol** — What to do when all milestones are complete:

```
## Idle Protocol (all milestones complete)

When progress.json shows no active milestone and no remaining tasks:

1. Run: <pkg-mgr> run harness worktree:status  — confirm no active worktrees or pending finish jobs
2. Run: <pkg-mgr> run harness validate:full    — final green-pass on main branch
3. Run: <pkg-mgr> run harness changelog        — generate release notes from [Mn-id] commits
4. Run: <pkg-mgr> run harness schema           — confirm progress.json is valid

Report to the user:
  "All milestones are complete. Here's the changelog for this sprint.
  Based on the changes I'd suggest version X.Y.Z — please confirm or pick a different version."

WAIT for user to confirm the version. Do NOT create or push the tag yourself.

After confirmation:
  git tag v<version>
  git push --tags

Then archive any remaining exec-plans:
  mv docs/exec-plans/active/*.md docs/exec-plans/completed/
  git add -A && git commit -m "chore: archive exec-plans for v<version>"

After tagging and archiving, enter IDLE state:
- Do NOT invent new tasks or milestones
- Do NOT start new work without an explicit user request
- Wait for the user to add new work via plan mode
```

- **Adding New Work** — Plan mode → CLI handles the rest:

```
## Adding New Work

To add new work, the user enters plan mode:
- Claude Code: press Shift+Tab to enter plan mode
- Codex: switch to plan mode via the Codex UI

Describe what to build. The plan file saves to docs/exec-plans/active/.
Before leaving planning, materialize it into repo state:

- TypeScript CLI: run `<pkg-mgr> run harness plan:apply` from main/root
- Native shell CLI: mirror the milestone tables into `docs/PLAN.md` + `docs/progress.json`

If planning already happened in another chat or the session exited before sync:

- Paste the full approved plan output, relevant planning transcript, or sufficiently detailed prior planning content back into the current session
- Recreate `docs/exec-plans/active/<descriptive-name>.md` from that context
- Then run the same materialization step so the repo becomes the source of truth again

If the approved plan changes module boundaries, integrations, deployment topology, or core data flow:

- Update `ARCHITECTURE.md` before execution resumes
- If `docs/gitbook/architecture.md` exists, sync it too when the wording is stable
- Otherwise add an explicit docs task in the new milestone

Then choose the execution start:

- Serial-first default: `<pkg-mgr> run harness init`
- Managed worktree mode: `<pkg-mgr> run harness worktree:start M<next>`

Do not rely on a future session to remember the plan-mode conversation. Do not continue from a one-line summary. The repo files are the source of truth.

For tiny changes: just tell the agent to create a task directly.
```

- **Git Workflow** — Worktree per milestone rules (the workflow is standard but
  project name, branch names, and commands should use the real project name):

```
## Git Workflow — Conditional Worktree by Milestone

### Branch Strategy
Default to serial execution on main/root when there is one eligible milestone,
one active agent, and no explicit isolation need.

When isolation or parallel execution is beneficial, give that milestone its own
git worktree and branch.

Serial-first path:
<pkg-mgr> run harness init
# → resumes or starts the only eligible milestone on main/root

Managed worktree path:

<pkg-mgr> run harness worktree:start M<n>
# → creates worktree, installs deps, runs init, auto-starts first task when possible

# All work for that isolated milestone happens here with atomic commits

# Periodically rebase onto main (especially after other milestones merge):
<pkg-mgr> run harness worktree:rebase

# When complete and all tests pass:
<pkg-mgr> run harness done M<n-last-task>
# → auto-runs merge-gate
# → queues root-side worktree:finish
# → checks dependency order (blocks if deps not merged)
# → rebases onto main (reports conflicts if any)
# → merges, archives completed exec plans, pushes, cleans up worktree

### Atomic Commits
Every task follows this exact loop. No shortcuts. No skipping steps.

1. Write or modify code for ONE task
2. Run lint with auto-fix: <lint-fix-command>
3. If lint auto-fix changed files → review changes, stage them
4. Run lint check (no fix): <lint-check-command>
5. If lint errors remain → fix manually, go to step 4
6. Run type-check: <type-check-command>
7. If type errors → fix, go to step 4
8. Run relevant test(s): <test-command>
9. If tests fail → fix code, go to step 2 (full loop restart)
10. ALL green → commit immediately
11. Move to next task

Commit format: [M<n>-<task_id>] <what changed>

NEVER commit with lint warnings, type errors, or failing tests.
The loop restarts from step 2 on ANY failure — no partial fixes.

### Parallel Milestones
When managed worktree mode is active, independent milestones can run in parallel
(one agent per worktree). The CLI coordinates via progress.json agents array:
- worktree:start checks no other active agent has claimed the milestone
- init registers the agent with a heartbeat (updated on every command)
- worktree:status shows all agents, heartbeats, serialized auto-finish jobs, and merge readiness
- Stale agents (heartbeat >2h) are reclaimable
- Only one root-side `worktree:finish` mutates main at a time; other ready milestones remain queued in `finish_jobs`

After another milestone merges into main, rebase your worktree:
  <pkg-mgr> run harness worktree:rebase

### Milestone Completion Checklist
Before merging back to main, run the FULL gate — every check must pass:

<lint-fix-command>              # auto-fix what it can
<lint-check-command>            # must be zero errors, zero warnings
<type-check-command>            # must be zero errors
<full-test-command>             # entire test suite must pass
<file-line-count-check>         # no file exceeds 500 lines

If ANY check fails → fix in the worktree, commit the fix, re-run ALL checks.
Only merge when every gate is green.

- [ ] Lint: zero errors, zero warnings
- [ ] Types: zero errors
- [ ] Tests: full suite passes
- [ ] No file exceeds 500 lines
- [ ] PLAN.md updated (tasks marked done, milestone status updated)
- [ ] Acceptance criteria from PRD verified for each completed story
- [ ] Completed exec plan auto-archived from `exec-plans/active/` to `exec-plans/completed/`
- [ ] Production ready: no TODO/FIXME/HACK in committed code
- [ ] Production ready: all errors handled (no unhandled promise rejections, no bare throws)
- [ ] Production ready: build produces zero warnings
- [ ] Production ready: no console.log in production paths (use logger)
```

### ARCHITECTURE.md (Dynamically Generated)

This file is the technical blueprint. Generate it entirely from the project's actual
domain structure, tech stack, and patterns. Include:

```markdown
# Architecture: <Project Name>

## Domain Map
Visual or text representation of the project's domains and how they relate.
For a web app this might be: Auth, Users, Products, Orders, Payments, Notifications.
For a CLI tool: Parser, Commands, Config, Output.
For an Agent / MCP server: Server, Tools, Resources, Prompts, API Client.
For a Desktop app: Main Process, Renderer, Preload, IPC, Shared Types.

## Dependency Layers
Strict ordering — each layer can only import from layers to its left:

Web App / API:
  Types → Config → Lib → Service → Controller/Handler → UI/CLI

CLI Tool:
  Types → Config → Lib → Commands → Entry Point

Agent / MCP:
  Types → Config → Lib → API Client → Tools/Resources → Server

Desktop (Electron):
  Shared → Preload → Main (IPC, lifecycle) | Renderer (UI)

Enforced by ESLint import rules (JS/TS) or equivalent linter. Violations fail lint.

## Package / Module Structure
Map of src/ directories to domains. Adapt to project type:

**Web App / API:**
src/
├── lib/          ← shared utilities (errors, logger, feature-flags, analytics, env)
├── modules/
│   ├── auth/     ← Auth domain (routes, service, model, tests)
│   ├── users/    ← Users domain
│   └── ...
├── middleware/    ← cross-cutting (error handler, auth guard, request logger)
└── config/       ← app config, env validation

**CLI Tool:**
src/
├── commands/     ← one file per command (init, deploy, config, etc.)
├── lib/          ← shared utilities (errors, logger, config loader, output formatters)
├── prompts/      ← interactive prompts (if applicable)
└── index.ts      ← entry point: parse args, dispatch

**Agent / MCP Server:**
src/
├── tools/        ← one file per MCP tool
├── resources/    ← MCP resources
├── prompts/      ← MCP prompt templates
├── lib/          ← shared utilities + external API clients
└── server.ts     ← MCP server entry (stdio/SSE transport)

**Desktop App (Electron):**
src/
├── main/         ← main process (Node.js — lifecycle, IPC, menus)
├── renderer/     ← renderer process (React/Vue — UI)
├── preload/      ← preload scripts (context bridge)
└── shared/       ← types shared between main and renderer

## Error Handling Pattern
- All application errors extend `AppError` from `src/lib/errors.ts`
- HTTP layer catches errors via global error middleware
- Error responses: `{ error: { code: "MACHINE_READABLE", message: "Human readable", details? } }`
- Log all errors with structured logger, never swallow silently

## Logging Pattern
- Use `src/lib/logger.ts` everywhere. Never `console.log` in production code.
- Request middleware injects `requestId` into every log entry
- Levels: debug (dev only), info (business events), warn (recoverable), error (failures)

## Feature Flag Pattern
- `src/lib/feature-flags.ts` — all new user-facing features ship behind a flag
- Flag lifecycle: create → enable for % → monitor → remove when stable
- Dead flags (enabled for 100% for >2 weeks) get cleaned up

## Analytics Pattern
- `src/lib/analytics.ts` — provider-agnostic interface
- Core events defined in a central events file
- Never call tracking provider directly — always go through the service

## Deploy Architecture
- Target: <chosen deploy target — e.g. Vercel, Cloudflare Pages, VPS (Hetzner), Fly.io, etc.>
- Method: <deployment method — e.g. Git push auto-deploy, Docker Compose + SSH, Kamal, Wrangler CLI, etc.>
- Build: <build command and output — e.g. `pnpm run build` → `.next/` or `dist/`>
- CI/CD: <pipeline provider — GitHub Actions / GitLab CI / platform auto-deploy>
- Config file: <platform config — vercel.json / wrangler.toml / fly.toml / docker-compose.yml / deploy.yml>
- Environment: <how env vars are injected — platform dashboard, .env files, Docker env, secrets manager>
- Health: /health and /health/ready endpoints
- Preview: <preview/staging deploy strategy — Vercel preview deploys / Fly.io staging app / Docker staging compose>

## Key Decisions
Link to docs/design-docs/ for detailed ADRs (Architecture Decision Records).
```

### PLAN.md — Granular Decomposition

The plan must be broken down as finely as possible. Each task should be a single
atomic unit of work — something one agent can complete in one session.

**Decomposition rules:**
- Each Epic from the PRD becomes a Milestone (or split further if the epic is large)
- Each User Story becomes a group of tasks within that milestone
- Each task must be completable in ≤ 4 hours of work
- If a task feels bigger than 4h, split it further
- Tasks must reference their parent story ID for traceability
- Every task must have a clear "done when" (from story acceptance criteria)

**Milestone granularity guidelines:**
- Prefer 5–15 tasks per milestone. More than 15 → split the milestone.
- Each milestone must be independently shippable (tests pass, lint clean)
- Dependencies between milestones must be explicit

```markdown
# Project Plan: <Project Name>

## Traceability
Requirements (PRD §4) → Epics (PRD §9) → Stories (PRD §9) → Tasks (below)

## Current Phase: <Phase Name>

## Milestones

### M1: <Name from Epic E1> (Target: <timeframe>)
**Status:** ⬜ Not Started
**Branch:** `milestone/m1`
**Worktree:** `../<project>-M1`
**Covers:** Epic E1 (FR-001, FR-002)
**Depends on:** None

| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| M1-001 | E1-S01 | Create user model + migration | Schema matches PRD data model, migration runs clean | ⬜ | — |
| M1-002 | E1-S01 | Implement signup endpoint | POST /auth/signup returns 201, validates email format | ⬜ | — |
| M1-003 | E1-S01 | Add password hashing | Passwords stored as bcrypt hash, never plaintext | ⬜ | — |
| M1-004 | E1-S01 | Write signup integration test | Test covers valid signup, duplicate email, weak password | ⬜ | — |
| M1-005 | E1-S02 | Implement email confirmation flow | Clicking link activates account, expired link returns 410 | ⬜ | — |
| M1-006 | E1-S02 | Write confirmation integration test | Test covers valid confirm, expired link, already confirmed | ⬜ | — |
| M1-007 | — | Setup CI for auth module | CI runs tests + lint on PR to milestone/m1 | ⬜ | — |

### M2: <Name from Epic E2> (Target: <timeframe>)
**Status:** ⬜ Not Started
**Branch:** `milestone/m2`
**Worktree:** `../<project>-M2`
**Covers:** Epic E2 (FR-003, FR-004)
**Depends on:** M1

| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| M2-001 | E2-S01 | ... | ... | ⬜ | — |
...

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|

## Known Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
```

**Example tasks for other project types (adapt to actual PRD):**

CLI Tool example milestones:
```markdown
### M1: Core CLI Scaffold + First Command
| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| M1-001 | E1-S01 | Set up argument parser (Commander/Yargs) | `<cli> --help` prints usage, `<cli> --version` prints version | ⬜ | — |
| M1-002 | E1-S01 | Implement config loader | Reads ~/.myapp/config.json, falls back to defaults, validates schema | ⬜ | — |
| M1-003 | E1-S01 | Implement `init` command | Creates config file, prints confirmation, errors if already exists | ⬜ | — |
| M1-004 | E1-S01 | Add output formatters (table/JSON/plain) | `--format json` returns valid JSON, `--format table` prints aligned table | ⬜ | — |
| M1-005 | E1-S01 | Add error handling + exit codes | Errors print to stderr, exit 1 on failure, exit 0 on success | ⬜ | — |
| M1-006 | — | Write unit tests for init + config | Tests cover: first run, existing config, invalid config, permissions | ⬜ | — |
```

Agent / MCP Server example milestones:
```markdown
### M1: MCP Server Scaffold + First Tool
| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| M1-001 | E1-S01 | Set up MCP server with stdio transport | Server starts, responds to `initialize` request | ⬜ | — |
| M1-002 | E1-S01 | Implement tool registry + schema validation | Tools listed in `tools/list`, input schemas validated | ⬜ | — |
| M1-003 | E1-S01 | Implement first tool: `search` | Tool accepts query, returns results, handles empty/error states | ⬜ | — |
| M1-004 | E1-S01 | Add structured error responses | Tool errors return proper MCP error codes, not raw exceptions | ⬜ | — |
| M1-005 | — | Write integration test (tool call lifecycle) | Test: initialize → tools/list → tools/call → validate response | ⬜ | — |
| M1-006 | — | Generate SKILL.md + docs/api-reference.md | SKILL.md has all tool names, descriptions, connection methods; api-reference.md has full schemas | ⬜ | — |
| M1-007 | — | Add SSE transport (if remote deployment) | Server accepts HTTP SSE connections, CORS configured, /health returns 200 | ⬜ | — |
```

### SKILL.md — Agent Discovery File

For **Agent Tool / MCP Server** projects, SKILL.md is always generated and describes MCP tools,
resources, and connection methods (stdio/SSE). See template below.

For **all other project types** with COMPANION_SKILL=true, a different SKILL.md template is
used — one that describes how agents can *operate* the project (API calls, CLI commands,
workflows). See `skill-greenfield.md → "Companion Skill Scaffold"`.

The YAML frontmatter format and OpenClaw compatibility rules below apply to both.

**Always generate SKILL.md at the project root for Agent Tool / MCP Server projects.**

This file is the discovery contract — it tells LLM agents (Claude, Codex, etc.) what this
tool does and how to use it. Without SKILL.md, agents can't discover the tool.

Structure follows the same YAML frontmatter + markdown body pattern used by claude.ai skills:

```markdown
---
name: <server-name>
description: >
  <One paragraph: what this tool does, what data/APIs it accesses, what problems it solves.
  This is what agents read to decide whether to use the tool. Be specific — not "manages data"
  but "searches and creates GitHub issues via the GitHub API".>
---

# <Server Name>

## Overview

<2-3 sentences: what this MCP server does and who/what it's for.>

## Connection

### stdio (local — Claude Desktop, Claude Code)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["<package-name>"],
      "env": {
        "API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### SSE (remote — claude.ai, web integrations)

```
URL: https://<your-domain>/sse
```

Or add as a claude.ai connector via Settings → Connectors → Add MCP Server.

## Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | API key for <service> | Yes |
| `API_BASE_URL` | Custom API endpoint (default: <default-url>) | No |

## Available Tools

### `<tool-name-1>`

<One sentence: what this tool does.>

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `limit` | number | No | Max results (default: 10) |

**Output:** Array of `{ id, title, url, snippet }`

**Example:**
```json
{ "query": "login bug", "limit": 5 }
```

### `<tool-name-2>`

<One sentence: what this tool does.>

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Title of the record |
| `body` | string | No | Optional description |

**Output:** `{ id, title, created_at, url }`

<Repeat for each tool. Every tool must be listed here.>

## Available Resources (if any)

| URI Pattern | Description |
|-------------|-------------|
| `<server>://items/{id}` | Individual item by ID |
| `<server>://items` | List of all items |

## Error Handling

All tools return structured MCP errors:

| Code | Meaning |
|------|---------|
| `INVALID_PARAMS` | Missing or invalid input parameters |
| `NOT_FOUND` | Requested resource not found |
| `AUTH_ERROR` | API key missing or invalid |
| `RATE_LIMITED` | External API rate limit hit — retry after delay |
| `INTERNAL_ERROR` | Unexpected server error |

## Detailed API Reference

See [docs/api-reference.md](./docs/api-reference.md) for full JSON Schemas,
response examples, and edge case documentation.
```

**SKILL.md generation rules:**
- **Format is OpenClaw-compatible** — uses the same YAML frontmatter + markdown body pattern
  as OpenClaw's AgentSkills system. This means the generated SKILL.md works with:
  - claude.ai custom skills (upload as skill folder)
  - OpenClaw (place in `~/.openclaw/skills/` or workspace `skills/`)
  - Claude Code (place in project root — Claude Code reads it at startup)
  - Codex-friendly discoverability: keep it in project root for compatible agent ecosystems, but
    do not describe it as Codex's primary execution entrypoint — Codex execution still begins from `AGENTS.md`
  - Any agent framework that follows the AgentSkills convention
- **Every tool must appear** in the "Available Tools" section with input/output tables
- **Connection section** must include both stdio and SSE if the server supports both
- **Environment variables** section must list ALL required env vars — agents need this
  to configure the connection. For OpenClaw, these map to `skills.entries.<key>.env`
- **Error codes** must match the actual error codes in `src/lib/errors.ts`
- **Keep it under 200 lines** — this is a discovery file, not full documentation.
  Point to `docs/api-reference.md` for the complete reference
- **Update SKILL.md whenever tools change** — add a task to the milestone whenever
  a tool is added, renamed, or has its schema changed

**docs/api-reference.md** should contain:
- Full JSON Schema for every tool's input and output
- Example request/response pairs for each tool
- Edge cases and error scenarios
- Rate limiting details (if calling external APIs)
- Authentication flow details

### Scaffold Generation

Generate actual source files appropriate to the chosen stack. Not empty dirs.

**BEFORE generating any config file, read the reference templates:**
- `docs/agent/gitignore-templates.md` — .gitignore assembled per stack
- `docs/agent/eslint-configs.md` — ESLint flat configs per framework
- `docs/agent/project-configs.md` — tsconfig, prettier, vitest, Docker, CI, Python configs
- `docs/agent/harness-cli.md` — the harness CLI, JSON Schema, git hooks, lint-staged, assembly checklist
- `docs/agent/execution-runtime.md` — agent guidelines: parallel protocol, context budget, quality gates

Never write configs or scripts from memory. Always reference these files and adapt.
The templates use the strictest settings — never downgrade. If strict rules cause errors,
fix the code, not the config.

**Mandatory test & lint infrastructure (every project, no exceptions):**

For JS/TS projects, always generate:
- `eslint.config.js` (flat config) with strict rules appropriate to the framework
- `.prettierrc` + `.prettierignore`
- `tsconfig.json` with `strict: true` if TypeScript
- Test framework config (vitest.config.ts, jest.config.ts, etc.)
- NPM scripts in package.json:
  ```json
  {
    "scripts": {
      "harness": "tsx scripts/harness.ts",
      "lint": "eslint . --report-unused-disable-directives --max-warnings 0",
      "lint:fix": "eslint . --fix",
      "type-check": "tsc --noEmit",
      "test": "vitest run",
      "test:integration": "vitest run tests/integration --passWithNoTests",
      "test:e2e": "vitest run tests/e2e --passWithNoTests",
      "prepare": "husky"
    }
  }
  ```
  (Adapt command prefix to chosen package manager: `pnpm`, `bun`, or `npm run`)

**E2E testing framework (if project has a UI):**

Choose based on project type:
- **Web App (any framework):** Playwright (recommended). Faster, multi-browser, better CI support.
  Install: `<pkg-mgr> add -D @playwright/test` then `npx playwright install`
  Config: `playwright.config.ts` at project root
  Scripts: `"test:e2e": "playwright test"` in package.json
- **Mobile (Expo):** Maestro or Detox. Maestro for flow-level tests, Detox for native interaction.
  Maestro: `.maestro/` directory with YAML flows. No JS dependency.
  Detox: `<pkg-mgr> add -D detox` + device config in `.detoxrc.js`
- **Desktop (Electron):** Playwright with Electron support (`_electron.launch()`).
  Same `@playwright/test` package, test against the packaged app.
- **Desktop (Tauri):** WebDriver-based testing via `tauri-driver` + WebdriverIO.
- **CLI Tool / API / MCP Server:** No E2E framework needed — use integration tests instead.
  API projects: `supertest` or direct HTTP calls in vitest/pytest.

Playwright config template (web apps):
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: '<pkg-mgr> run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

For Python web apps (FastAPI/Django): use `playwright` Python package (`pip install playwright`)
or `pytest-playwright`. Same multi-browser support, Python test syntax.

For Go web apps: use Playwright via `playwright-go` or run Playwright JS tests alongside
the Go backend (start server in CI, run `npx playwright test` against it).

**Harness CLI (every project — see `docs/agent/harness-cli.md`):**

Add `tsx` as a dev dependency: `<pkg-mgr> add -D tsx`

Generate the modular CLI structure: `scripts/harness.ts` (thin router, ~50 lines) +
`scripts/harness/` directory with 6 focused modules (config, types, state, worktree,
tasks, validate, quality — each under 350 lines). See `docs/agent/harness-cli.md` for
the exact file-by-file implementation. The CLI handles:
- `harness init` → session boot (sync plans, stale check, register agent, print status)
- `harness next` → find next unblocked task (scoped to current worktree's milestone)
- `harness start <id>` → claim task, auto-update progress.json + PLAN.md
- `harness validate` → lint:fix → lint → type-check → test
- `harness validate:full` → + integration/e2e when matching test files exist + file-guard
- `harness done <id>` → complete task, auto-update progress.json + PLAN.md + commit hash
- `harness block <id> <reason>` → mark blocked → 🚫
- `harness reset <id>` → revert task to ⬜ (undo start or unblock)
- `harness learn <cat> <msg>` → log a learning to progress.json + learnings.md
- `harness merge-gate` → full validation + changelog
- `harness worktree:start/finish/rebase/status` → worktree lifecycle + push to remote
- `harness stale-check` / `file-guard` / `schema` / `changelog`
- Any shared harness / CI / template change must be replayed in at least one downstream repo or fixture before it is considered closed

Plus `scripts/maintenance/check-commit-msg.ts` (needs file path arg, kept separate for hooks).

The CLI uses only `node:` built-in modules — zero external deps beyond `tsx`.
Agent never touches progress.json or PLAN.md manually — the CLI handles all state.

**Non-JS/TS projects (Python, Go, Rust):**
The harness CLI is written in TypeScript and requires `tsx` (Node.js). For non-JS projects:

1. **Recommended:** Install Node.js as a dev dependency (most dev machines already have it).
   Add `scripts/harness.ts` + `scripts/harness/` as-is. The harness CLI manages docs and
   git workflow — it doesn't need to understand the project's source language.
   - Python: `pip install nodeenv && nodeenv .node_env` or just have Node installed globally
   - Go / Rust: Node.js installed alongside Go/Rust toolchain

2. **Alternative (no Node.js):** Use `docs/agent/harness-native.md` to generate:
   - `scripts/harness.sh` — shell-based CLI covering init, status, validate, next, start,
     done, block, file-guard, schema, learn. Requires `jq`.
   - `scripts/check-commit-msg.sh` — commit message validator (replaces check-commit-msg.ts)
   - `.pre-commit-config.yaml` (Python/Go) or `.githooks/` (Rust) — replaces husky
   - `.claude/settings.json` adapted for `Bash(bash scripts/harness.sh *)` and
     `Bash(make *)` instead of `Bash(npx tsx scripts/harness.ts *)`
   
   Tradeoff: the native CLI does NOT include worktree management, agent registration,
   plan:apply, merge-gate auto-chain, or scaffold commands. Note this tradeoff in
   AGENTS.md / CLAUDE.md. For the full feature set, use option 1.

3. **Validate commands** must be adapted in `scripts/harness/validate.ts` (option 1) or
   the project's Makefile (option 2):
   - Python: `ruff check .` → `ruff check --fix .` → `mypy src/` → `pytest`
   - Go: `golangci-lint run ./...` → `go vet ./...` → `go test -race ./...`
   - Rust: `cargo clippy -- -D warnings` → `cargo check` → `cargo test`
   The TypeScript `validate.ts` module runs `${PKG} run lint`, `${PKG} run test`, etc. — it
   delegates to whatever scripts are defined in package.json (JS) or Makefile (non-JS). Make
   sure the project's lint/test/type-check commands are wired up correctly.

**Schemas (included in `docs/agent/harness-cli.md`):**

Generate `schemas/progress.schema.json` — validated by `harness schema` command
and by the pre-commit hook.

For Python projects, always generate:
- `ruff.toml` or `pyproject.toml [tool.ruff]` config
- `pyproject.toml [tool.mypy]` with strict mode
- pytest config
- Scripts or Makefile: `lint`, `lint-fix`, `type-check`, `test`, `validate`

For Go projects: `golangci-lint` config, `go vet`, `go test ./...`
For Rust projects: `clippy.toml`, `cargo clippy`, `cargo test`

**The `validate` script is the single gate command.** It runs lint + type-check + tests
in sequence. Agents run this before every commit. CI runs this on every PR.

**Pre-commit hooks (every JS/TS project):**

Generate husky with THREE hooks (see `docs/agent/harness-cli.md` for details):

- `.husky/pre-commit` — runs lint-staged + `harness file-guard --staged` + `harness schema`
- `.husky/commit-msg` — runs `scripts/maintenance/check-commit-msg.ts` (rejects non-conforming commits)
- `.husky/pre-push` — runs `harness validate`

`lint-staged` config in package.json:
  ```json
  {
    "lint-staged": {
      "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
      "*.{json,md,yml,yaml}": ["prettier --write"]
    }
  }
  ```
- Setup: `"prepare": "husky"`
- **4-layer enforcement**: pre-commit → commit-msg → pre-push → CI

For Python: use `pre-commit` framework with ruff + mypy hooks.
See `docs/agent/harness-native.md` for the `.pre-commit-config.yaml` template.
Install: `uv run pre-commit install` (or `pip install pre-commit && pre-commit install`).

For Go: use `pre-commit` framework with golangci-lint + go-fmt hooks.
See `docs/agent/harness-native.md` for the `.pre-commit-config.yaml` template.

For Rust: use git hooks directly (`.githooks/pre-commit` + `.githooks/commit-msg`).
See `docs/agent/harness-native.md` for the hook scripts.
Configure: `git config core.hooksPath .githooks`

**Claude Code + Codex configuration (every project):**

Generate BOTH config files to enable **autonomous execution** — the agent loops
through tasks without asking permission for routine commands:

Config templates: see `docs/agent/project-configs.md` →
- `Claude Code — .claude/settings.json`
- `Codex — .codex/config.toml`

**What this enables:**

- **Claude Code:** The `allowedTools` list pre-approves ALL harness commands, git,
  and the package manager. Commands not on the list still require approval.
- **Codex:** `approval_policy = "never"` + `sandbox_mode = "workspace-write"` lets
  Codex run all commands within the workspace without prompts.
- **Both:** The agent loops through tasks autonomously. It only pauses at Human
  quality checkpoints (security changes, merge failures, blocked tasks).

**Secret-handling note:** Claude Code's config can deny `.env` reads directly. Codex does not
expose the same per-path control here, so both agents still rely on the repo contract to keep
secrets out of versioned state and out of generated docs.

The Task Execution Loop runs ~8 shell commands per task. Without pre-approval,
you'd press Y/Enter ~8 times per task. With this config, the agent loops autonomously.

**The user's actual experience:**
```
You:    "Begin working on M1"
Agent:  runs harness init → harness next → harness start → writes code →
        harness validate → git commit → harness done → harness next → ...
        (loops automatically, no permission prompts)
You:    check back whenever you want:
        - <pkg-mgr> run harness status    (cross-platform, recommended)
        - git log --oneline
Agent:  pauses ONLY at Human quality checkpoints:
        - security-sensitive changes
        - merge gate failures
        - blocked tasks (3 validate failures)
        - new module architecture decisions
```

**Why two configs (same outcome, different mechanism):**
- **Claude Code:** uses `allowedTools` whitelist (per-command granularity) + native
  `plansDirectory` for plan mode output
- **Codex:** uses `approval_policy = "never"` (blanket autonomy within sandbox) +
  AGENTS.md instruction for plan file location
- **Windows:** both configs work identically on Windows. All harness commands run
  through `npx tsx` (Node.js) — no bash dependency.

**Non-Node projects using the native shell CLI — `.claude/settings.json`:**
Config template: see `docs/agent/project-configs.md` →
`Non-Node variant — .claude/settings.json`.
Add language-specific tools from that section for Python, Go, or Rust projects.

Both agents end up with plan files in the same location → harness init detects and
syncs them identically.

**Environment management (every project):**

Generate one `.env.example` per environment if the user selected multiple environments
(development / staging / production) in Step 4. Each file contains ALL required keys
as placeholder-only values — never real secrets:

```
.env.example              ← base template (always generated)
.env.development.example  ← dev-specific keys (if staging selected)
.env.staging.example      ← staging-specific keys (if staging selected)
.env.production.example   ← production-specific keys (always)
```

Each `.env.example` must comment each variable with where to get it:

```env
# ── Database ─────────────────────────────────────────────────────
# Local: postgresql://postgres:password@localhost:5432/myapp_dev
# Production: get from Railway / Supabase / PlanetScale dashboard
DATABASE_URL=

# ── Auth (Better Auth) ────────────────────────────────────────────
# Generate: openssl rand -base64 32
BETTER_AUTH_SECRET=
# Your server's public URL — used for OAuth callbacks
BETTER_AUTH_URL=http://localhost:3000

# ── OAuth Providers ───────────────────────────────────────────────
# Google: console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Error tracking ────────────────────────────────────────────────
# Sentry: sentry.io → Project Settings → Client Keys (DSN)
SENTRY_DSN=

# ── Feature flags ─────────────────────────────────────────────────
FEATURE_FLAG_KEY=
```

Rules:
- `.gitignore` MUST include `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.staging`, `.env.production` from line one
- `src/lib/env.ts` — typed env loader that validates ALL required vars at startup. Never use `process.env.X` directly in application code — always go through the typed loader
- For mobile (Expo): client-side vars use `EXPO_PUBLIC_` prefix (inlined at build time). Document which vars are public vs server-only in `.env.example`
- Where to set vars in production: document in `docs/PRD.md` or `docs/deployment.md` with links to the relevant platform dashboards (Vercel env → settings page, EAS → eas.json env field or EAS dashboard)

**Env validation implementation by stack:**

JS/TS — use `@t3-oss/env-nextjs` (Next.js) or `@t3-oss/env-core` (other frameworks) + zod:
```typescript
// src/lib/env.ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  },
  client: {
    // NEXT_PUBLIC_* or EXPO_PUBLIC_* vars
  },
  runtimeEnv: process.env,
});
```
Install: `<pkg-mgr> add @t3-oss/env-core zod`
Alternative (no framework dependency): plain zod schema + `z.parse(process.env)` at startup.

Python — use `pydantic-settings`:
```python
# src/<package>/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    better_auth_secret: str
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

settings = Settings()  # Validates on import — crashes early if vars missing
```
Install: `uv add pydantic-settings`

Go — use `envconfig` or `env`:
```go
// internal/config/config.go
import "github.com/kelseyhightower/envconfig"

type Config struct {
    DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
    Port        int    `envconfig:"PORT" default:"3000"`
    Debug       bool   `envconfig:"DEBUG" default:"false"`
}

func Load() (*Config, error) {
    var cfg Config
    return &cfg, envconfig.Process("", &cfg)
}
```

Rust — use `envy` or `config`:
```rust
// src/config.rs
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    #[serde(default = "default_false")]
    pub debug: bool,
}
fn default_false() -> bool { false }

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        dotenvy::dotenv().ok();
        envy::from_env()
    }
}
```

**Rule:** The app must crash at startup if required env vars are missing or malformed.
Never silently default a required secret to an empty string.

---

### Security Hardening Checklist

Generate `docs/security.md` for every project that has a backend, API, or user-facing UI.
The agent should verify these items at every merge-gate. Mark as Human checkpoint if any
are missing.

**Web Application / API — mandatory items:**

Input validation:
- Validate and sanitize ALL user input at the boundary (API route handlers, form handlers)
- Use schema validation (zod, joi, pydantic, etc.) — never trust raw request bodies
- Parameterized queries only — never string-concatenate user input into SQL/NoSQL queries
- File uploads: validate MIME type, enforce size limits, scan if possible

HTTP security headers (generate `src/middleware/security.ts` or equivalent):
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (unless embedding is intended)
- `Content-Security-Policy` — at minimum `default-src 'self'`; tighten per project needs
- `Referrer-Policy: strict-origin-when-cross-origin`
- For JS/TS: use `helmet` middleware (Express/Fastify) — it sets sensible defaults

Authentication & authorization:
- Never store passwords in plaintext — use bcrypt/argon2 with cost factor ≥ 10
- Session tokens: HttpOnly, Secure, SameSite=Lax (or Strict)
- Implement rate limiting on auth endpoints (login, signup, password reset)
- CSRF protection for cookie-based auth (SameSite + CSRF token for non-GET mutations)
- JWT: validate signature, check expiry, use short-lived access tokens + refresh rotation

API security:
- CORS: whitelist specific origins — never use `*` in production
- Rate limiting: per-IP and per-user, at minimum on write endpoints
- Request size limits: reject oversized payloads before parsing
- Error responses: never leak stack traces, internal paths, or database details to clients

Secrets management:
- All secrets in env vars — never in code, config files, or logs (Iron Rule 6)
- Rotate secrets: document rotation procedure in `docs/security.md`
- Audit: log access to sensitive operations (auth events, admin actions, data exports)

**Desktop apps (Electron/Tauri) — additional items:**
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Validate all IPC payloads — treat renderer as untrusted
- Auto-updater: verify signatures, use HTTPS-only update feeds
- CSP in renderer: `script-src 'self'` — no inline scripts

**Mobile apps — additional items:**
- Never store secrets in app bundle (`EXPO_PUBLIC_*` is visible to decompilers)
- Use platform secure storage (iOS Keychain / Android Keystore via `expo-secure-store`)
- Certificate pinning for production API calls (optional but recommended for financial apps)
- Deep link validation: verify incoming deep link parameters before navigation

**Python/Go/Rust APIs — same principles apply:**
- Python: use `python-multipart` for safe file uploads, `slowapi` or `limits` for rate limiting
- Go: use `net/http` middleware for headers, `golang.org/x/time/rate` for rate limiting
- Rust: use `tower` middleware (Axum) or `actix-web` guards for header injection and rate limiting

The generated `docs/security.md` should include this checklist with checkboxes so the agent
and human can track completion. The agent marks items done during implementation; human reviews
security-sensitive changes at merge-gate.

---

### progress.json Structure

Always generate `docs/progress.json` with this annotated structure so agents can
read and debug it without guessing:

```json
{
  "_comment": "Machine-readable state. Managed by harness CLI — never edit manually.",
  "project": "my-project",
  "version": "1.0.0",
  "last_updated": "2025-01-15T10:00:00Z",
  "last_agent": "claude-code",
  "current_milestone": null,
  "current_task": null,
  "agents": [
    {
      "id": "agent-macbook-12345",
      "milestone": "M1",
      "worktree": "../my-project-m1",
      "branch": "milestone/m1",
      "started_at": "2025-01-15T10:00:00Z",
      "heartbeat": "2025-01-15T12:30:00Z"
    }
  ],
  "finish_jobs": [
    {
      "milestone": "M1",
      "status": "running",
      "requested_at": "2025-01-15T12:31:00Z",
      "started_at": "2025-01-15T12:31:03Z",
      "finished_at": null,
      "requested_by": "agent-macbook-12345",
      "error": null,
      "last_update": "2025-01-15T12:31:03Z"
    }
  ],
  "active_milestones": [
    {
      "id": "M1",
      "title": "Core Authentication",
      "status": "in_progress",
      "branch": "milestone/m1",
      "worktree": "../my-project-m1",
      "depends_on": [],
      "started_at": "2025-01-15T10:00:00Z",
      "completed_at": null,
      "tasks_total": 2,
      "tasks_done": 1,
      "tasks_in_progress": 1,
      "tasks_blocked": 0,
      "tasks_remaining": 1,
      "tasks": [
        {
          "id": "M1-001",
          "story": "E1-S01",
          "title": "Set up Better Auth with Prisma adapter",
          "status": "✅",
          "done_when": "Auth tables migrated, /api/auth/* routes respond 200",
          "started_at": "2025-01-15T10:00:00Z",
          "completed_at": "2025-01-15T12:30:00Z",
          "commit": "a3f91bc",
          "blocked_reason": null
        },
        {
          "id": "M1-002",
          "story": "E1-S02",
          "title": "Build sign-in and sign-up screens",
          "status": "🟡",
          "done_when": "Both screens render, email/password auth flow works end-to-end",
          "started_at": "2025-01-15T12:31:00Z",
          "completed_at": null,
          "commit": null,
          "blocked_reason": null,
          "depends_on": ["M1-001"]
        }
      ]
    }
  ],
  "completed_milestones": [],
  "blockers": [],
  "learnings": [],
  "dependency_graph": {
    "M1-002": { "depends_on": ["M1-001"], "blocks": [] }
  },
  "synced_plans": [],
  "stale_checks": {
    "last_run": null,
    "issues": []
  }
}
```

Field meanings for agents:
- `last_updated`: ISO timestamp, auto-set by CLI on every saveProgress
- `last_agent`: who last modified — `"claude-code"`, `"codex"`, or `"human"`
- `current_milestone`: deprecated singleton snapshot with milestone counters. Keep the field for compatibility, but in parallel-worktree mode the CLI derives the active milestone from the branch instead of trusting this object.
- `current_task`: object for the task currently being worked on, or null
- `status` on a task: `⬜` = not started, `🟡` = in progress (claimed by agent), `✅` = done, `🚫` = blocked
- `depends_on` (task): task IDs that must be ✅ before this task can be started. `harness next` respects this
- `depends_on` (milestone): milestone IDs that must be merged before this milestone can merge. `harness worktree:finish` enforces this
- `worktree`: relative path to the git worktree for this milestone
- `agents`: array of currently active agents — each agent registers on `harness init`, heartbeat updates on every command, stale after 2h
- `finish_jobs`: serialized root-side auto-finish queue state — queued/running/failed/succeeded closeout jobs written by `merge-gate` and `worktree:finish`
- `blockers`: array of blocked tasks with reasons
- `learnings`: array of logged learnings (via `harness learn`)
- `dependency_graph`: task-level dependency map — keys are task IDs, values have `depends_on` and `blocks` arrays
- `synced_plans`: filenames of exec-plans already parsed into PLAN.md



**Docker (for web app / API projects):**

- `Dockerfile` — multi-stage build (build stage + production stage), minimal image
- `docker-compose.yml` — one-command local dev environment:
  ```yaml
  services:
    app:
      build: .
      ports: ["3000:3000"]
      env_file: .env
      volumes: ["./src:/app/src"]  # hot reload
    db:
      image: postgres:16-alpine    # or whatever DB was chosen
      env_file: .env
      ports: ["5432:5432"]
      volumes: ["db_data:/var/lib/postgresql/data"]
  volumes:
    db_data:
  ```
- Include `docker-compose up -d` in the Quick Start section of AGENTS.md / CLAUDE.md
- Skip Docker for CLI tools and simple libraries unless user requests it

**Error handling infrastructure:**

Generate these files with patterns appropriate to the chosen stack:

- `src/lib/errors.ts` — Unified error class hierarchy:
  - Base `AppError` class with `statusCode`, `code`, `message`, `isOperational`
  - Subclasses: `ValidationError`, `NotFoundError`, `AuthError`, `ConflictError`
  - Error factory function: `createError(code, message, details?)`
  - Every error has a machine-readable `code` (e.g., `AUTH_EXPIRED_TOKEN`)

- `src/lib/logger.ts` — Structured JSON logging:
  - Fields: `timestamp`, `level`, `message`, `requestId`, `context`
  - Levels: `debug`, `info`, `warn`, `error`, `fatal`
  - In dev: pretty-print. In prod: JSON to stdout.
  - Never log sensitive data (passwords, tokens, PII)

- `src/middleware/error-handler.ts` — Global error boundary:
  - Catches all unhandled errors
  - Maps AppError subclasses to HTTP status codes
  - Returns consistent error response format:
    `{ error: { code, message, details? } }`
  - Logs error with full context (requestId, stack, user)
  - In dev: includes stack trace. In prod: hides internals.

**Analytics (GA / Posthog — for web apps):**

- `src/lib/analytics.ts` — Analytics service abstraction:
  - `trackEvent(name, properties?)`, `trackPageView(path)`, `identifyUser(id, traits?)`
  - Provider-agnostic interface — swap GA for Posthog without touching app code
  - Loads measurement ID from env (`GA_MEASUREMENT_ID` or `POSTHOG_KEY`)
  - Respects Do Not Track / cookie consent
  - For SSR frameworks (Next.js): handle client-side only initialization
- Include GA/Posthog script setup in the root layout/template

**Health checks & monitoring (for web apps / APIs):**

- `GET /health` endpoint — returns `{ status: "ok", timestamp, version, uptime }`
- `GET /health/ready` — checks DB connection, external service availability
- Sentry integration:
  - `src/lib/sentry.ts` — init from env `SENTRY_DSN`
  - Wraps error handler to auto-report unhandled errors
  - Source maps uploaded in CI (add to deploy workflow)
- These endpoints are the first thing monitoring services hit

**Feature flags:**

- `src/lib/feature-flags.ts` — Feature flag service:
  - Simple local flags for v1: `flags.json` or env-based
  - Interface: `isEnabled(flagName, context?)` → boolean
  - Designed to swap in a remote provider later (LaunchDarkly, Flagsmith, Unleash)
  - Every new user-facing feature gets a flag
  - Flags are the mechanism for gradual rollout — ship to main behind a flag,
    enable for % of users, monitor, then remove flag when stable

**API documentation (for backend projects):**

- OpenAPI/Swagger:
  - Generate `openapi.yaml` or use code-first annotations (e.g., zod-to-openapi)
  - Serve Swagger UI at `/docs` in development
  - Auto-generate from route definitions — never manually maintain the spec
- Storybook (for frontend projects with component libraries):
  - `.storybook/` config
  - One example story for the first component
  - `storybook` script in package.json

**Project documentation site (docs/gitbook/):**

Generate a GitBook-compatible documentation structure with exactly these 7 files.
Build each file from the specific sources listed — do NOT leave placeholder text:

- `docs/gitbook/SUMMARY.md` — table of contents linking all 6 other files:
  ```markdown
  # Summary

  - [Introduction](README.md)
  - [Product Overview](product-overview.md)
  - [Target Users](target-users.md)
  - [Architecture](architecture.md)
  - [Quickstart](quickstart.md)
  - [Roadmap](roadmap.md)
  ```
- `docs/gitbook/README.md` ← project name + one-line tagline from Phase 1 vision;
  "what it does" paragraph from PRD problem statement
- `docs/gitbook/product-overview.md` ← PRD: problem definition, solution, value
  proposition, MoSCoW priorities; must-have FRs summarized in plain language
- `docs/gitbook/target-users.md` ← Phase 1 user deep dive: user types, #1
  job-to-be-done per user, current alternative, pain points; align with PRD user journeys
- `docs/gitbook/architecture.md` ← tech stack, deploy target, system component list
  from ARCHITECTURE.md; describe data flow in 1-2 paragraphs
- `docs/gitbook/quickstart.md` ← AGENTS.md quick-start section: activation/install command
  framed as "when you're ready to start milestone 1", env setup, first-run step, first
  meaningful action the user can take
- `docs/gitbook/roadmap.md` ← docs/PLAN.md: milestone list in plain language, grouped
  by phase (MVP / v2 / backlog); no internal task IDs, user-facing feature names only

**GitBook writing workflow (do this, not just file creation):**
1. Start from repo sources of truth only: `docs/PRD.md`, `ARCHITECTURE.md`, `docs/PLAN.md`,
   `AGENTS.md` / `CLAUDE.md`, and current code.
2. Extract concrete bullets per page before drafting prose:
   - `README.md`: tagline, problem, outcome, who it is for
   - `product-overview.md`: problem, solution, core capabilities, scope boundaries
   - `target-users.md`: user types, jobs-to-be-done, current alternatives, pain points
   - `architecture.md`: system pieces, integrations, runtime/deploy shape, data flow
   - `quickstart.md`: activation/install, env setup, first run, first visible result
   - `roadmap.md`: shipped, current, next milestones in user language
3. Turn those bullets into external-facing prose. Do not copy internal milestone jargon,
   raw task tables, or implementation-only notes directly into GitBook pages.
4. Write `SUMMARY.md` last, after page titles and filenames are stable.

**Per-page minimum writing contract:**
- `README.md`: explain what the project is, why it exists, and who should care
- `product-overview.md`: explain the user problem, the proposed solution, and the v1 scope
- `target-users.md`: explain who the users are, what they need done, and what hurts today
- `architecture.md`: explain the system shape in plain language before diving into components
- `quickstart.md`: get a new reader from zero to first meaningful output without agent-only assumptions
- `roadmap.md`: explain current and next milestones as product outcomes, not internal task IDs

**Exit quality check — each file must meet minimum structure:**
- `README.md`: ≥ 3 sections (name+tagline / what-it-does / who-it's-for)
- `product-overview.md`: ≥ problem statement + solution + 3+ must-have features
- `quickstart.md`: ≥ activation/install step + one runnable command that produces visible output
- Files that contain only headings or TODO placeholders fail the Phase 3 exit gate.

This structure is compatible with GitBook, Docusaurus, VitePress, or plain markdown
reading. The SUMMARY.md acts as a universal sidebar. Update pages as the project evolves.

**Also include at minimum:**
- `docs/index.md` — the human navigation entrypoint for generated repos. It must link:
  `docs/PRD.md`, `docs/PLAN.md`, `docs/progress.json`, `docs/product/`, `docs/agent/`,
  `docs/gitbook/`, and any debt / design-doc folders that exist.
- Entry point file with a working starter (hello world level)
- One example test that passes
- `.gitignore` — generate from `docs/agent/gitignore-templates.md`. Assemble by combining
  the Universal block + the stack-specific block(s). This must be the FIRST file committed
  to the repo, before any code. Verify `.env` patterns are present.
- CI workflows that run `validate` on every PR and `validate:full` + deploy on merge
- `docs/product/frontend-design.md` — **MUST be generated for every project that has a frontend**.
  Claude Code and Codex cannot access claude.ai skill paths, so the content must be
  bundled into the project repo. Generation strategy — try in order:
  1. Read from the `frontend-design` skill already active in this claude.ai session as a base template (preferred).
  2. Read from a local copy: `~/.agents/skills/frontend-design/SKILL.md` (Linux/macOS) or
     `C:\Users\<user>\.agents\skills\frontend-design\SKILL.md` (Windows) as a base template.
  3. If neither is reachable, generate `docs/product/frontend-design.md` directly from the Phase 1
     call 5 answers. Do NOT use a generic minimal fallback.
  In all cases, the generated file must reflect:
  - Q11 in a "Component System" section
  - Q12 in a "Visual Language" section
  - Q13 in a "Layout Patterns" section
  - Q14 in a "Reference Anchors" section
  - Q15/Q16 in a "Preview Rendering Rules" section
  Write the project-specific result to `docs/product/frontend-design.md`. Iron Rule 5 in AGENTS.md /
  CLAUDE.md points to this file. Log the strategy used in `docs/learnings.md`.
- `docs/product/design.md` — **MUST be generated for every project that has a frontend**.
  It is the product wireframe + route/screen authority for execution agents and must include:
  the overall app shell, global layout regions, navigation model, design-direction summary,
  and each page's purpose, primary action, key elements, critical states (`loading`, `empty`,
  `error`), and layout notes.
- `docs/product/design-preview.html` — **MUST be generated for every project that has a frontend**.
  This is the human review artifact: a self-contained, mid-fi styled static preview derived
  from `docs/product/frontend-design.md` + `docs/product/design.md`. It should show layout, typography,
  density, CTA hierarchy, and at least one representative non-happy-path state.
- `docs/product/release.md` — **Desktop App only**. This is the desktop release contract and must
  document packaging target, signing/notarization expectations, updater channel, and a
  manual smoke checklist.
- `docs/agent/agent-workflows.md` — generate for every project so agent operations are grouped
  under one folder instead of scattering project-specific references at the repo root.
- `docs/agent/api-guide.md` — generate when the project exposes an API.
- `docs/agent/commands.md` — generate when the project is a CLI / operator-heavy tool.
- `docs/agent/data-model.md` — generate when the project has a persistent data model.

For monorepos, generate workspace config (pnpm-workspace.yaml / turbo.json / etc.)
with at least one package or app entry.

---

