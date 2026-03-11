## Phase 4: Execution Runtime

Everything from "artifacts generated" to "project complete" is driven by the
harness CLI. For agent guidelines (context budget, parallel coordination, quality gates),
see `docs/agent/execution-runtime.md`. For optional release automation, docs-site
workflows, and memory-system conventions, see `docs/agent/execution-advanced.md`.

### Execution Mode Selection

Before starting tasks, choose the runtime mode:

- **Serial-first (default):** use this when there is one eligible milestone, one active
  agent, and no explicit isolation requirement. Start from main/root with `harness init`.
- **Managed worktree mode:** use this when 2+ milestones are dependency-independent, the
  user explicitly wants isolation, or the agent expects concurrent work to pay off.
  Start with `harness worktree:start <M-id>`.

The project can switch from serial mode to worktree mode later. Do not create worktrees
preemptively for a linear plan.

### Scaffold Boundary Before First Milestone

Treat Phase 3 output as foundation only.

- The scaffold may already contain route shells, config, docs, schemas, test folders, provider
  stubs, and placeholder modules.
- Those files do NOT mean the milestone is already complete.
- A task is only done when its `Done When` criteria are actually satisfied in behavior,
  integration, and validation, not when a scaffold file happens to exist.
- If the scaffold created a shell for a feature, the milestone still owns the real implementation.

### The Agent's Entire Workflow (Auto-Cascading CLI)

The CLI auto-chains commands. The agent only needs to run 3 commands in a loop.

```bash
# ── First time setup: serial-first default ──────────────────────────────────
<pkg-mgr> run harness init
# → AUTO: syncs plans, stale-checks, recovers state, prints status
# → AUTO: if one eligible milestone should stay serial, resumes or starts its first task on main/root
# → AUTO: if parallel / isolation mode is warranted, tells you which `worktree:start` command to run

# ── First time setup: managed worktree mode (only when needed) ─────────────
<pkg-mgr> run harness worktree:start M1
# → AUTO: creates branch + worktree
# → AUTO: installs dependencies (with retry on Windows EBUSY)
# → AUTO: harness init (sync plans, recover, register agent)
# → AUTO: finds first task → starts it
# → prints: "Started: M1-001 — Create user model. Write code, then: harness validate"

# ── The agent's entire task loop (just 3 commands, repeat) ──────────────────

# 1. Write code for the current task

# 2. Validate + commit
<pkg-mgr> run harness validate
git add -A && git commit -m "[M1-001] create user model + migration"

# 3. Mark done — CLI auto-cascades everything:
<pkg-mgr> run harness done M1-001
# → AUTO: ✅ updates PLAN.md + progress.json
# → AUTO: verifies the worktree is clean; if not, warns and pauses instead of resetting files
# → AUTO: finds next task → starts it only when git state is clean
# → prints: "Started: M1-002 — Implement signup. Write code, then: harness validate"

# Agent writes code for M1-002... validate... commit... done M1-002...
# CLI auto-starts M1-003... and so on.

# ── When all tasks in the milestone are done (fully automatic): ────────────
<pkg-mgr> run harness done M1-007   # last task
# → AUTO: ✅ task complete
# → AUTO: no more tasks → triggers merge-gate
# → AUTO: validate:full + stale-check + changelog
# → AUTO: merge-gate passes → closes the milestone in the active execution mode
# → AUTO: if isolated mode is active, queues serialized root-side worktree:finish M1
# → AUTO: if serial mode is active, closes M1 on main/root and resumes with init when M2 is eligible
# → AUTO: detects next milestone M2 → continues in the active execution mode
# → prints: "Started: M2-001 — ..."
# Agent continues writing code. Zero manual steps between milestones.
# The only time this chain stops is if merge-gate, rebase, or push fails.

# ── Special cases (the agent handles these as needed): ──────────────────────

# Validate fails 3x:
<pkg-mgr> run harness block M1-003 "bcrypt build fails on Alpine"
<pkg-mgr> run harness learn dependency "bcrypt native fails on Alpine — use bcryptjs"
# → AUTO: block → finds next unblocked task → starts it

# Undo a start:
<pkg-mgr> run harness reset M1-003
# → AUTO: reset → finds next task → starts it

# Rebase (when parallel milestone merged):
<pkg-mgr> run harness worktree:rebase

# New session (resuming after context reset):
<pkg-mgr> run harness init
# → AUTO: detects state → resumes task or auto-starts next one
# → If pending plan files exist on main/root → auto plan:apply → inserts new milestones
# → If pending plan files exist inside a worktree → warns and defers plan:apply to main/root
```

**What the agent NEVER needs to manually run:**
- `harness next` — auto-called by `done`, `block`, `reset`, `init`
- `harness start <id>` — auto-called after `next` finds a task
- `harness merge-gate` — auto-called by `done` when milestone is complete
- `harness worktree:finish` — auto-queued in the serialized main-root finish queue after merge-gate passes
- `harness worktree:start` — only needed when entering managed worktree mode or when a later milestone should run isolated / in parallel
- `harness plan:apply` — use it during the planning handoff to materialize new work immediately; `init` only auto-applies leftover unsynced plans as recovery
- `harness recover` — auto-called by `init` to close milestones whose PLAN rows are already complete and merged

# If rebase conflicts during worktree:finish:
# → CLI aborts and shows conflicting files
# → Resolve inside the worktree, run validate:full, then re-run worktree:finish

# After the milestone is auto-finished and pushed, human decides whether to cut a release tag:
git tag v1.0.0
git push --tags

# ── Check overall status at any time from main repo root ──────────────────────
<pkg-mgr> run harness worktree:status
# → shows all worktrees, registered agents, heartbeat ages, merge readiness
```

### Agent Error Recovery Protocol

When a CLI command fails, the agent follows this decision tree — **do not retry the same
command blindly** and **do not skip validations**:

| Failure | Agent action |
|---------|-------------|
| `harness validate` fails (lint / type / test) | Fix the error, re-run validate. If same error after 3 attempts → `harness block <id> "<error summary>"` |
| `harness validate` fails (file-guard: 500-line limit) | Split the file, do NOT disable the check. Commit the split as a separate task. |
| `harness done` fails with ReferenceError / CLI crash | Confirm you are inside a milestone worktree (`git branch` shows `milestone/m<n>`). Run `harness init` to resync state, then retry `harness done`. |
| `harness done` pauses because the worktree is still dirty | Run `git status`, commit/stash/discard the leftover changes manually, then run `harness init` to resume the loop. Do NOT rely on the CLI to reset files for you. |
| `harness worktree:start` fails (branch conflict) | Run `harness worktree:status` to check if the worktree already exists. If so, `cd` into it and run `harness init` directly. |
| `harness merge-gate` fails (validate:full) | Fix the failing tests/lint — do NOT use `--no-verify` or skip the gate. The gate is the last quality checkpoint before merge. |
| `harness worktree:finish` fails (rebase conflict) | Resolve conflicts inside the worktree, run `harness validate:full`, re-run `harness worktree:finish`. |
| `harness plan:apply` produces duplicate milestones (Windows path bug pre-fix) | Run `harness schema` to inspect `progress.json`. Remove duplicate entries from `active_milestones[]` and deduplicate `synced_plans[]` manually, then `harness validate`. |
| Install fails (EBUSY / permissions) | `recovery.ts` auto-retries up to 3×. If all retries fail, run `<pkg-mgr> install --force` manually from inside the worktree. |
| `current_milestone` shows wrong milestone (parallel worktree state drift) | Do NOT edit `progress.json` to patch `current_milestone`. Instead verify the branch (`git branch`) and confirm task IDs match the branch's milestone prefix. The CLI reads milestone from branch, not from `current_milestone`. |
| `harness worktree:finish` always exits with "lock already held" | A previous finish subprocess crashed after writing the lock but before releasing it. From the main repo root, remove `.git/harness-finish.lock` manually (`del .git\\harness-finish.lock` on PowerShell/CMD, `rm .git/harness-finish.lock` on Bash), then re-run `harness worktree:finish <milestone-id>`. |
| Any command fails 3× with the same error | `harness block <id> "<error>"` → `harness learn <category> "<lesson>"` → continue with next unblocked task. |

**Never take these shortcuts:**
- `git commit --no-verify` — bypasses the pre-commit hook, which is how bad code gets in
- Editing `PLAN.md` status cells directly — use `harness start/done/block` to keep state consistent
- Deleting `progress.json` — restore it from git or rebuild the canonical shape; `harness recover` only closes milestones that are already complete and merged
- Hardcoding `current_milestone` in `progress.json` to fix parallel drift — the field is intentionally unreliable in parallel mode; commands derive milestone from branch

That's it. The CLI handles state management, dependency resolution, plan syncing,
stale detection, schema validation, and changelog generation. The agent never
manually edits progress.json or PLAN.md status fields.

### Database Migration Flow

Migrations are a common point of failure in the task loop. These rules apply
regardless of which ORM or migration tool the project uses.

**Universal migration rules for agents:**
- Schema changes always come BEFORE the code that uses them - run migration first
- If migration fails 3x, run `harness block <id> "migration fails: <e>"`
- Migration files are versioned - commit them with the task that created them
- Never skip migration history in CI or production
- Rolling back: write a new forward migration to undo (most tools cannot auto-rollback)
- In parallel worktrees: migrations may conflict on merge. Rebase and re-run before finish

**Prisma:**
```bash
npx prisma migrate dev --name <n>   # dev: create + apply
npx prisma migrate deploy           # CI/prod: apply only (idempotent)
npx prisma migrate reset            # dev only: drops data and re-applies
npx prisma migrate status           # check status
```

**Drizzle:**
```bash
npx drizzle-kit generate    # generate migration SQL from schema
npx drizzle-kit migrate     # apply pending migrations
npx drizzle-kit push        # dev only: push schema directly
```

**TypeORM:**
```bash
npx typeorm migration:generate -d src/data-source.ts src/migrations/AddUsers
npx typeorm migration:run -d src/data-source.ts
npx typeorm migration:revert -d src/data-source.ts
```

**Django (Python):**
```bash
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations
```

**SQLAlchemy + Alembic (Python — non-Django):**
```bash
alembic revision --autogenerate -m "add users table"   # generate from model diff
alembic upgrade head                                    # apply all pending
alembic downgrade -1                                    # revert last migration
alembic history                                         # show migration chain
alembic current                                         # show current revision
```
If using `uv`: prefix with `uv run alembic ...`
Config lives in `alembic.ini` + `alembic/env.py`. Models must be imported in `env.py`
for autogenerate to detect changes.

**golang-migrate (Go):**
```bash
migrate create -ext sql -dir migrations -seq add_users  # create up/down pair
migrate -path migrations -database "$DATABASE_URL" up    # apply all
migrate -path migrations -database "$DATABASE_URL" down 1 # revert one
migrate -path migrations -database "$DATABASE_URL" version # current version
```
Alternative: `goose` — same concept, slightly different CLI.

**Diesel (Rust):**
```bash
diesel migration generate add_users    # create up.sql + down.sql
diesel migration run                   # apply pending
diesel migration revert                # undo last
diesel migration list                  # show status
diesel print-schema > src/schema.rs    # regenerate schema (Diesel-specific)
```
Alternative: `sqlx` with `sqlx migrate run` — works without codegen.

**Raw SQL / custom:**
- Keep files in `migrations/` with timestamp prefixes, apply in order
- Track applied migrations in a `_migrations` table
- Commit with the task: `[M1-001] add user table migration`

### Conditional Worktree Mode

- Default to serial execution on main/root when there is one eligible milestone, one active agent, and no explicit isolation need
- When worktree mode is active: one agent, one worktree
- Independent milestones can run in parallel only while worktree mode is active
- progress.json `agents` array is the coordination point — agents self-register on `init`
- Agent heartbeat updated on every command (next/start/done) — stale after 2h
- Merge order follows dependency order — `worktree:finish` blocks if deps aren't merged
- After another milestone merges into main, rebase with `worktree:rebase`
- `worktree:status` shows all agents, heartbeats, auto-finish jobs, and merge readiness from main root

### Execution Context Discipline

- Serial mode: keep the active milestone on main/root until it is complete or you intentionally switch modes
- Managed worktree mode: run task commands from that milestone's worktree, not from another branch or repo root
- Do not split one active milestone across serial and worktree contexts at the same time
- If a later milestone becomes parallel-ready, create a worktree then; do not pre-create worktrees for a linear plan

### Non-Node Projects — Execution Differences

Projects using the native shell CLI (`scripts/harness.sh`) instead of the TypeScript CLI
follow the same conceptual loop but with different commands:

```bash
# ── Session init ───────────────────────────────────────────────────────────
bash scripts/harness.sh init

# ── Task loop (same 3-step pattern) ───────────────────────────────────────
# 1. Write code

# 2. Validate + commit
make validate   # or: bash scripts/harness.sh validate
git add -A && git commit -m "[M1-001] what you did"

# 3. Mark done — auto-starts next task
bash scripts/harness.sh done M1-001

# ── Block a task ──────────────────────────────────────────────────────────
bash scripts/harness.sh block M1-003 "reason"
bash scripts/harness.sh learn dependency "what went wrong"
```

**Key differences from the TypeScript CLI:**
- `make validate` delegates to the Makefile `validate` target (lint + type-check + test)
- No automatic worktree management — create/merge worktrees with raw git commands
- No automatic milestone transitions — run `bash scripts/harness.sh next` + `start` manually
  after finishing all tasks in a milestone
- No merge-gate auto-chain — run `make validate` + `bash scripts/harness.sh file-guard`
  manually before merging
- Pre-commit hooks use `.pre-commit-config.yaml` (Python/Go) or `.githooks/` (Rust)
  instead of husky

The AGENTS.md / CLAUDE.md generated for non-Node projects replaces all `<pkg-mgr> run harness`
references with the equivalent `bash scripts/harness.sh` and `make` commands.
See `docs/agent/harness-native.md` for the full shell CLI source, pre-commit hook templates,
and feature comparison with the TypeScript CLI.

### Context Budget

Use the canonical budget in `docs/agent/execution-runtime.md#Context Budget`.
Do not maintain a second copy here. The runtime guide is the source of truth for
AGENTS/PLAN/status, memory, PRD, source-file, and working-memory allocations.

### Quality Checkpoints

| Event | Mode |
|-------|------|
| Task passes validate | **Auto** → commit, done, next |
| Task failed 3x | **Human** → block, report |
| Milestone merge-gate passes | **Auto** → queue finish, merge, archive, push |
| Merge-gate fails | **Human** → report, wait |
| Security-sensitive change | **Human** → always review |
| Dependency conflict | **Auto** → delete + rebuild (Iron Rule 3) |

### Testing Tiers

| Tier | Runs when | CLI command |
|------|-----------|-------------|
| Unit | Every task | `harness validate` |
| Integration | Milestone merge | `harness validate:full` |
| E2E | Milestone merge | `harness validate:full` |
| File guard (500 lines) | Every commit + merge | `harness file-guard` |

### CI Integration

**ci.yml (every PR):** `harness validate` + `dependency-audit`
**deploy.yml (merge to main):** `harness validate:full` + build + deploy

### Production Readiness Checklist

Every milestone merge must meet production standards. These checks are part of the
merge-gate and are enforced by code review, not just automated tools.

**Code quality (enforced by validate + file-guard):**
- Zero lint errors, zero lint warnings
- Zero type errors
- All tests pass (unit + integration + e2e)
- No file exceeds 500 lines

**Error handling (agent responsibility — verify before merge-gate):**
- Every external call (API, DB, file I/O, network) wrapped in try/catch
- Every endpoint/command validates input before processing
- Error responses are structured: `{ error: { code, message, details? } }`
- No unhandled promise rejections (use async error boundaries)
- No bare `throw new Error('...')` — use typed error classes from `src/lib/errors.ts`

**Observability (agent responsibility — verify in code review):**
- Structured logger used everywhere (`src/lib/logger.ts`) — zero `console.log` in production paths
- Every error logged with context: request ID, operation, relevant IDs
- Health endpoint responds correctly (if applicable)
- Feature flags wrap all new user-facing features

**Code hygiene (agent responsibility — auto-checked where possible):**
- No `TODO`, `FIXME`, `HACK`, `XXX` comments in committed code
  - If something needs fixing, it's a task in PLAN.md, not a comment
- No hardcoded URLs, ports, credentials, or magic numbers
- No dead code (unused imports, unreachable branches, commented-out blocks)
- Build produces zero warnings (TypeScript `noEmit`, bundler warnings, etc.)

**Documentation (agent responsibility — tracked as milestone tasks):**
- README/docs accurately reflect current state of the code
- API endpoints documented (or auto-generated from OpenAPI/tRPC)
- ARCHITECTURE.md updated when module boundaries, integrations, deployment topology, or core data flow change
- `docs/gitbook/architecture.md` synced when public architecture docs exist and the system shape changed
- Changelog generated via `harness changelog`

**What "production ready" means for each project type:**
- Web App: page loads in <2s, errors show user-friendly messages, CSP headers set
- API: every endpoint returns correct HTTP status codes, rate limiting configured
- CLI: exit codes are correct (0/1/2), `--help` is accurate, errors go to stderr
- Agent/MCP: all tools return structured MCP errors, input schemas validate correctly
- Mobile: app doesn't crash on network loss, loading states shown, deep links work

### Versioning and Release Strategy

Every project must have an explicit version scheme. Generate this in `AGENTS.md` and
`docs/PLAN.md` from the start:

**Semantic versioning** (`MAJOR.MINOR.PATCH`):
- `PATCH` — bug fixes, no API changes → OTA update (mobile) or hotfix deploy
- `MINOR` — new features, backward-compatible → standard milestone release
- `MAJOR` — breaking changes → milestone with migration guide

**Version lives in `package.json`** (or `pyproject.toml` / `Cargo.toml`).
`harness changelog` reads commit messages tagged `[Mn-id]` to generate release notes.

**Git tagging convention** — tagging happens after the milestone is merged and the changelog is reviewed:
```
v1.0.0          ← production release
v1.0.0-rc.1     ← release candidate (staging)
v0.9.0          ← pre-1.0 development
```

**For mobile (Expo/EAS):**
- `version` in `package.json` = semantic version shown in stores
- `ios.buildNumber` / `android.versionCode` = auto-incremented by EAS (`"autoIncrement": true` in `eas.json`)
- Never manually increment build numbers — EAS manages this
- OTA updates via EAS Update do NOT change the version — they're transparent patches

**Tagging workflow in AGENTS.md:**
``` 
harness merge-gate           # validate:full + stale-check + changelog
git tag v<new-version>       # after human reviews changelog
git push --tags              # triggers deploy.yml
```

**Who decides the version number:** Human, not the agent.
The agent runs `harness changelog`, shows the generated notes, and asks:
> "Milestone M3 is complete. Based on the changes, I'd suggest version X.Y.Z.
> Please confirm or choose a different version before I create and push the release tag."

### Release Automation (optional — choose one if project needs CI-driven releases)

See `docs/agent/execution-advanced.md`, section `Release Automation`, if the
project needs CI-driven versioning and publishing.

---

## Phase 6: Documentation Site (Evolving)

See `docs/agent/execution-advanced.md`, section `Phase 6: Documentation Site`,
if the project needs a maintained documentation site workflow.

### GitBook Companion Track (mandatory — generated in Phase 3, maintained here)

> `docs/gitbook/` was generated during Phase 3 scaffold with 7 files. During execution,
> keep these files current whenever milestones change product positioning, architecture,
> or the quickstart flow. Do not regenerate from scratch — update the relevant file.

If the user wants GitBook-ready project-introduction content while execution is
happening, treat docs as a parallel deliverable rather than a final cleanup pass.

**Default location:** `docs/gitbook/` unless the repo already has an established
docs root. Keep GitBook pages derived from the repo's sources of truth:
`docs/PRD.md`, `ARCHITECTURE.md`, `docs/PLAN.md`, and the current code.

**Minimum page set:**
- `README.md` or landing page - what the project is and why it exists
- `product-overview.md` - users, problems, use cases, scope
- `target-users.md` - who the product serves, current personas, pains, success criteria
- `architecture.md` - system shape, core modules, integrations, data flow
- `quickstart.md` - install, env, run, validate
- `roadmap.md` - shipped milestones, current focus, next work
- `SUMMARY.md` - GitBook navigation linking the above pages

**Preferred starter skeleton:**
```text
docs/gitbook/
  README.md
  product-overview.md
  target-users.md
  architecture.md
  quickstart.md
  roadmap.md
  SUMMARY.md
```

**PLAN insertion rule:**
- During bootstrap or any later `plan:apply` flow, add explicit docs tasks when the
  milestone changes public-facing product understanding.
- For greenfield projects, create an early baseline task such as
  `Docs: create GitBook project-intro baseline`.
- For retrofits without coherent public docs, add a catch-up task or dedicated docs
  milestone before feature drift makes the project harder to explain.
- Example follow-up tasks:
  - `Docs: refresh GitBook architecture after auth and billing integration`
  - `Docs: update GitBook quickstart after local dev bootstrap changes`
  - `Docs: revise roadmap and product overview for milestone M3`

**Update rule:**
- If a milestone changes positioning, onboarding, architecture, integrations, or
  roadmap, update the affected GitBook pages in the same milestone or
  immediately after merge.
- Small wording syncs can be folded into the implementation task.
- Larger docs changes get explicit PLAN tasks with measurable "done when"
  conditions.

**GitBook writing workflow during execution:**
1. Identify which page changed before writing:
   - onboarding / local setup changes → `quickstart.md`
   - product positioning / scope changes → `README.md` or `product-overview.md`
   - audience / persona / use-case changes → `target-users.md`
   - module / integration / deployment shape changes → `architecture.md`
   - milestone sequencing / shipped-vs-next changes → `roadmap.md`
2. Re-read the relevant repo sources first:
   - `docs/PRD.md` for product language
   - `ARCHITECTURE.md` for system truth
   - `docs/PLAN.md` for roadmap truth
   - `AGENTS.md` / `CLAUDE.md` for quickstart commands
   - code/config when a page claims current behavior
3. Rewrite the affected GitBook page in external-facing language.
   Do not paste internal task tables, commit IDs, or raw execution notes.
4. If multiple GitBook pages changed, update `SUMMARY.md` only if titles or navigation changed.
5. Close the docs task only after the page matches current repo reality, not just current intent.

**Writing rule:**
- Prefer clear external-facing language over internal planning jargon.
- Do not invent claims, capabilities, or future scope that are not grounded in
  PRD, PLAN, architecture docs, or the code.
- When the user asks for "project introduction" content, synthesize it from the
  repo and current milestone status.

---

## Principles

1. **Map, not encyclopedia** — AGENTS.md / CLAUDE.md stay concise. Deep info in linked docs.
2. **Dual-agent identical** — Always generate BOTH files with identical content.
3. **Iron rules templated, everything else dynamic** — 6 iron rules are fixed. Everything else from the actual project.
4. **Everything in the repo** — If it matters, it's a versioned file. No tribal knowledge.
5. **Rules are code, not prose** — harness CLI + hooks + CI = 4-layer enforcement. Agent runs commands, not checklists.
6. **Secrets never touch git** — .env in .gitignore from day zero. `harness stale-check` detects drift.
7. **User value first** — Every requirement delivers clear user or business value.
8. **Testable & traceable** — Requirements → Epics → Stories → Tasks. Every task has "done when."
9. **Granular decomposition** — ≤ 4h per task. If bigger, split.
10. **Code is cheap** — Delete and rewrite. Assume infinite tokens. First principles only.
11. **Conditional milestone isolation** — Use a dedicated worktree when parallelism or risk isolation makes it worthwhile. Otherwise stay serial on main/root. Merge only when green.
12. **CLI handles state** — Agent never manually edits progress.json or PLAN.md status. `harness start/done/block` does it.
13. **Schema-validated** — progress.json has a JSON Schema. Hooks reject invalid writes.
14. **Commits are parseable** — [Mn-id] format enforced by hook. `harness changelog` auto-generates release notes.
15. **Errors are structured** — Unified error classes, JSON logging, global error boundary.
16. **Ship behind flags** — New user-facing features go behind a feature flag.
17. **Observe everything** — Analytics, error tracking, health checks, structured logs.
18. **Docs evolve with code** — Doc updates are milestone tasks, not afterthoughts.
19. **Context is finite** — ≤40% context utilization. Never load more than the current task needs.
20. **Learnings compound** — Problems + solutions logged. Future sessions inherit past wisdom.
21. **Staleness is a bug** — `harness stale-check` catches it. Don't wait for humans.
22. **Parallel when the graph justifies it** — Independent milestones can run in parallel. When parallel mode is active: one agent, one worktree.
23. **Modularize proactively, not reactively** — Don't wait for 500 lines. Split at ~250 if a file has multiple responsibilities. Every module = one purpose. The CLI itself models this: 1 entry point + 6 focused modules, none exceeding 350 lines. If the CLI follows its own rule, so does all project code.
24. **Frontend = frontend-design + design docs** — All frontend reads `docs/product/frontend-design.md` first, and reads `docs/product/design.md` before changing a specific page, screen, or overall app shell / navigation layout.
25. **UI artifacts stay in sync** — If a task changes navigation, page structure, theme, density, or component hierarchy, update the relevant UI docs and regenerate `docs/product/design-preview.html` before closing the task.
26. **Desktop release docs stay in sync** — If a desktop task changes packaging target, signing/notarization, updater channel, or release workflow, update `docs/product/release.md` before closing the task.
27. **Everything closes the loop** — planning, code, docs, and handoff work are only done when repo state, validation state, and the next resume path all line up.

## Closed-Loop Checklist

Before calling a step complete, confirm all three layers:

1. **Source of truth updated**
   - relevant repo files now reflect the decision or change
2. **Verification done**
   - validation, schema, or doc-specific checks are current enough for the step
3. **Next step resumable**
   - the next Claude Code or Codex session can continue from repo state without missing context

Use this checklist for:
- planning handoff
- task completion
- GitBook/doc updates
- cross-agent switching
27. **The loop is perpetual** — Bootstrap, execute, idle, add work, repeat forever.
28. **Production ready is the only standard** — Every milestone ships. No "it works locally." Error handling, input validation, structured logging, zero build warnings, no TODO/FIXME in committed code. If it's not production ready, the task is not done.

---

## Post-Generation

After creating all files:

1. Present the file tree overview
2. Show a concise summary of what was generated: stack, auth, environments, monorepo structure
3. Highlight the core files the user must review:
   - `docs/index.md` — human navigation entrypoint for the generated repo
   - `docs/PRD.md` — requirements and acceptance criteria
   - `docs/PLAN.md` — milestones, tasks, dependencies, "done when" conditions
   - `ARCHITECTURE.md` — system shape, module boundaries, integrations, and data flow
   - `AGENTS.md` / `CLAUDE.md` — agent rules and iron rules (including Production Ready Standard)
   - `docs/progress.json` — dependency graph and task order
   - For frontend projects: `docs/product/frontend-design.md`, `docs/product/design.md`, and `docs/product/design-preview.html`
4. Call out `docs/PLAN.md` as the first file to spot-check if the user wants to adjust
   milestone order, task granularity (≤ 4h per task), measurable "done when" conditions,
   or task dependencies before execution starts
5. Remind the user: **"Every milestone is built to production standards. Iron Rule 7
   (Production Ready Standard) means every merge includes error handling, input validation,
   structured logging, zero build warnings, and no TODO/FIXME in committed code.
   The agent enforces this at every merge-gate."**
6. For greenfield projects, the Design Preview Review Gate in `docs/agent/skill-greenfield.md`
   is the canonical approval step. Do NOT ask for a second "approved" message here.
7. If this file is being used from a non-greenfield entrypoint and no upstream scaffold-review
   gate has happened yet, return to that upstream workflow and complete its approval step there
   instead of inventing a new gate here.

After the upstream approval gate has already passed, provide the Step-by-step handoff
instructions (git init, install deps, open in agent). Make clear that once the user
opens the project in Claude Code / Codex and says "begin", the agent will execute
autonomously until a Human quality checkpoint is triggered.

---

## Handoff to Claude Code / Codex

### What is the skill vs what is the project

```
harness-engineer-cli/                <← THIS IS THE SKILL (stays in claude.ai)
├── SKILL.md                    ← Instructions for generating the project
└── docs/agent/                 ← Templates used DURING generation
    ├── harness-cli.md          ← CLI source + schema + hooks → becomes scripts/harness.ts
    ├── eslint-configs.md       ← ESLint templates → becomes eslint.config.js
    ├── project-configs.md      ← tsconfig/prettier/vitest/Docker templates → becomes real files
    ├── gitignore-templates.md  ← .gitignore templates → becomes .gitignore
    ├── execution-runtime.md    ← Agent guidelines (context budget, parallel, quality gates)
    └── execution-advanced.md   ← Optional release automation, docs site, memory system

my-project/                     ← THIS IS THE OUTPUT (goes to the agent)
├── AGENTS.md                   ← Codex reads this — has EVERYTHING it needs
├── CLAUDE.md                   ← Claude Code reads this — identical to AGENTS.md
├── docs/index.md               ← Human entrypoint into grouped project docs
├── docs/product/               ← Human-facing product/design docs
├── docs/agent/                 ← Companion agent-reference docs
├── docs/PLAN.md + progress.json← Runtime state contract
├── scripts/harness.*           ← Runtime commands
└── ...all other generated files
```

The docs/agent/ folder is the "mold." The generated project is the "cast."
Once generated, the mold is not needed. All templates have been materialized into
real config files. All protocols have been written into AGENTS.md and CLAUDE.md.

### What the user does after generation

**Step 1: Review in claude.ai**
- Review PRD.md — are requirements correct?
- Review PLAN.md — are tasks granular enough? Dependencies correct?
- Review AGENTS.md / CLAUDE.md — do the commands match your environment?
- Review progress.json — is the dependency graph accurate?
- Request changes until satisfied.

**Step 2: Set up the project**
```bash
# Option A: Init new repo
mkdir my-project && cd my-project
git init
# Copy all generated files here
git add -A
git commit -m "scaffold: initial project setup from harness bootstrapper"

# Option B: Push to GitHub first
gh repo create my-project --private
# Copy files, push
git add -A && git commit -m "scaffold: initial project setup" && git push
```

**Step 3: Install dependencies**
```bash
# JS/TS projects:
<package-manager> install

# Python projects:
uv sync

# Go projects:
go mod download

# Rust projects:
cargo build
```

**Step 4: Verify scaffold works**
```bash
# JS/TS projects:
<package-manager> run harness validate

# Non-Node projects (native CLI):
make validate
# or: bash scripts/harness.sh validate
```

**Step 5: Open in your agent**
```bash
# Claude Code
claude .
# Automatically reads CLAUDE.md on startup

# Codex
codex .
# Automatically reads AGENTS.md on startup
```

Both agents read the same content. The only difference is which filename they look for.

**Step 6: Start execution**

Tell the agent:
> "Read the Session Init section and begin working on the first milestone."

Or for parallel execution:
> "Read Session Init. If one milestone is ready, start it normally. If you need isolation now, start milestone M1 in a worktree."

The agent will:
1. Read AGENTS.md / CLAUDE.md (already done at startup)
2. Read docs/progress.json → see M1 is first, all tasks ⬜
3. Choose the execution context:
   - Serial mode: stay on main/root and start the only eligible milestone
   - Worktree mode: create worktree: `git worktree add ../my-project-m1 -b milestone/m1`
4. Pick the first unblocked task (M1-001)
5. Begin the Task Execution Loop autonomously

**Step 7: Monitor**

You can check progress at any time:
- `cat docs/progress.json` — machine-readable status
- `cat docs/PLAN.md` — human-readable task board
- `git log --oneline` — commit history with [M1-001] prefixes
- `cat docs/learnings.md` — what the agent learned along the way

The agent will pause and ask for your input at Quality Checkpoints marked **Human**
(security changes, architecture decisions, merge gate failures).

### Switching agents midstream

Use this when work moves from Claude Code to Codex, or from Codex back to Claude Code.

1. Finish the current planning handoff first. If a new plan exists, sync it into
   `docs/PLAN.md` + `docs/progress.json` before switching agents.
2. Sync every repo-backed artifact that changed in the current session:
   - Always: `docs/PLAN.md` + `docs/progress.json`
   - Architecture changes: `ARCHITECTURE.md` and `docs/gitbook/architecture.md` when present
   - UI direction / page-structure changes: `docs/product/frontend-design.md`, `docs/product/design.md`, and
     `docs/product/design-preview.html`
   - Product/onboarding/roadmap doc changes: the relevant `docs/gitbook/*` pages
3. Choose the resume location:
   - Serial mode: the incoming agent opens the repo root and runs `harness init`
   - Managed worktree mode: the incoming agent opens the same milestone worktree and runs
     `harness init` there, not on main/root
4. The incoming agent resumes from repo state, not from chat memory. `AGENTS.md` / `CLAUDE.md`,
   `ARCHITECTURE.md`, `docs/PLAN.md`, `docs/progress.json`, and the current doc chain are the
   only required handoff inputs.
5. External skill sources or claude.ai-only context do not matter after generation. Once the
   repo copies exist, they are the source of truth for the next agent.

### What the agent does NOT need

- `docs/agent/` folder — templates already materialized into real files
- `SKILL.md` — that's the generation recipe, not the execution instructions
- Any claude.ai conversation history — everything is in the repo files
- External docs or wikis — all knowledge is in the repo (harness principle #4)

---

## Agent Memory System

See `docs/agent/execution-advanced.md`, section `Agent Memory System`, if the
project needs persistent memory conventions beyond `docs/learnings.md`.

---

## Ongoing Development — Adding New Work

The initial bootstrap creates Milestones M1, M2, M3... from the PRD. But a project
doesn't end there. New features, bugs, tech debt, and pivots happen continuously.

The execution loop is designed to be **perpetual** — it doesn't care whether a milestone
was generated during bootstrap or added 6 months later. Same flow, same rules.

### Two paths to add new work

**Path A: Directly in Claude Code or Codex (recommended for most new work)**

The flow uses **plan mode** as entry → CLI handles insertion:

1. Open Claude Code or Codex in the project
2. Enter plan mode:
   - Claude Code: `Shift+Tab`
   - Codex: enter plan mode per its current UI
3. Before planning, run: `<pkg-mgr> run harness plan:status`
   → Shows current milestones, progress %, what's active, next M number
   → This gives the agent context to write the plan correctly
4. Discuss with the user: requirements, architecture impact, where this fits
   - It is normal to discuss first while the request is still being shaped.
   - Once the user says to proceed, update, or follow a plan, or once the conversation already
     contains a sufficiently detailed change plan, that content must stop living only in chat.
   - Narrow asks still count: style tweaks, content edits, one-page adjustments, and
     "follow this plan" instructions must all become tracked work instead of chat-only intent.
   - If the ask fits an active milestone, refine that milestone's task list and continue there.
   - If it does not fit, create a small follow-up plan or micro-milestone.
5. Agent generates the plan → saved to `docs/exec-plans/active/`
   - Plan uses PLAN.md format: `### M1: Feature Name` + task table
   - Milestone numbering can be anything — `plan:apply` auto-renumbers
   - Claude Code: plansDirectory auto-routes here
   - Codex: AGENTS.md instructs to write plans here
6. User reviews the plan, edits if needed, approves
7. Agent immediately syncs the plan into repo state before leaving planning:
   - TypeScript CLI: run `<pkg-mgr> run harness plan:apply` from main/root
   - Native shell CLI: manually mirror the milestone tables into `docs/PLAN.md` + `docs/progress.json`
   → The sync step reads the plan, analyzes current state, inserts milestones:
   - Auto-renumbers to avoid conflicts (M1 in plan → M5 if M4 exists)
   - Wires dependencies (new milestones depend on latest active/completed)
   - Appends to PLAN.md with correct headers
   - Updates progress.json (active_milestones + dependency_graph)
   - Marks plan as synced
8. Agent verifies `docs/PLAN.md` + `docs/progress.json` now reflect the new work. Do not rely on a future `harness init` to ingest chat-only planning output.
9. Fallback when planning already happened elsewhere:
   - Paste the full approved plan output, planning transcript, or sufficiently detailed prior planning content back into the current session
   - Agent reads that pasted planning context, reconstructs `docs/exec-plans/active/<descriptive-name>.md`, then performs the same sync into `docs/PLAN.md` + `docs/progress.json`
   - Do not continue execution from a chat-only summary, old plan-mode memory, or pasted checklist alone; repo files must be updated first
10. If the approved plan changes module boundaries, integrations, deployment topology, or core data flow:
   - Update `ARCHITECTURE.md` before leaving planning
   - If `docs/gitbook/architecture.md` exists, sync it now when the wording is stable; otherwise add an explicit docs task in the new milestone
11. Agent chooses execution start:
   - Serial-first default: `<pkg-mgr> run harness init`
   - Managed worktree mode: `<pkg-mgr> run harness worktree:start M<next>`
   → Enters Task Execution Loop automatically

For tiny changes (1-2 files, obvious diff, no plan needed):
> "Add a dark mode toggle to the settings page. Create a task for it."

**Path B: Back to claude.ai (large changes, multiple milestones, pivots)**

Come back to this skill and say:
> "Here's my existing project [upload key files]. I want to add [requirements]."

If planning already happened in another session, also paste the approved plan output or the relevant planning transcript so the agent can reconcile it into repo state instead of relying on chat memory.

Upload these files for context:
- `AGENTS.md` / `CLAUDE.md` — current project rules (either one, they're identical)
- `docs/PRD.md` — current requirements
- `docs/PLAN.md` — current plan + completed milestones
- `docs/progress.json` — current state
- `ARCHITECTURE.md` — current architecture

The skill will:
1. Skip Phase 1 Steps 1-2 (project type + vision already known)
2. Run a mini Product Deep Dive focused on the NEW requirements
3. Optionally do web search for the new feature area
4. Generate updated PRD.md with new FRs, Epics, Stories appended
5. Generate new Milestones in PLAN.md (preserving completed ones)
6. Update progress.json with new dependency graph
7. User copies updated files back to project, commits them
8. The agent picks up the changes on next session init

**Path C: Cross-project harness / CI / workflow change**

Use this path when the change affects more than one repo: shared harness docs, CI templates,
hook behavior, plan insertion rules, or any workflow contract another project depends on.

Required flow:
1. Treat the upstream change as normal work in the source repo: plan, milestone, worktree, validation.
2. Before calling it complete, identify at least one downstream repo or fixture that represents the consumer side.
3. Create a replay milestone or replay checklist in that downstream repo if the rollout is more than a trivial edit.
4. Apply the upstream delta there and run the same closed loop: `harness init` → sync planning state → choose serial or worktree execution as appropriate → `validate:full`.
5. Capture the replay result in the upstream handoff notes: downstream repo, commit SHA, pass/fail, migration notes.
6. If replay fails, the upstream change is not closed. Either fix the upstream contract or create an explicit downstream follow-up milestone.

This is the missing hardening layer for multi-project continuity: no shared workflow change
ships with only single-repo proof.

Use [replay-protocol.md](replay-protocol.md) as the minimal operator SOP.

### What the agent does when all milestones are complete

The agent's Session Init reads progress.json. If ALL milestones are in
`completed_milestones` and there are no active milestones:

Keep the generated `AGENTS.md` / `CLAUDE.md` idle-state instructions short and standalone:
final green pass from main/root, report completion, wait for user input, and do not invent
new tasks. The full release-and-idle procedure is defined once below in
`Idle Protocol — All Initial Milestones Complete`.

### New work types

The same milestone/task structure handles all types of work:

| Type | How to add | Priority |
|------|-----------|----------|
| **New feature** | New Epic in PRD → New Milestone in PLAN | MoSCoW from PRD |
| **Bug fix** | Add FR with "Bug:" prefix → Task in nearest milestone or new milestone | Must (if user-facing) |
| **UI / content / style tweak** | Discuss first if needed; once the user says proceed, add a tracked task to the active milestone or create a micro-milestone, then sync `PLAN.md` + `progress.json` | Must (if user-requested) |
| **Tech debt** | Add to docs/tech-debt/ → Create milestone when prioritized | Should/Could |
| **Refactor** | Add FR or tech debt item → Tasks with "Refactor:" prefix | Should |
| **Dependency update** | Task in current or new milestone | Must (if security) |
| **Performance** | Add NFR → Tasks with benchmarks as "Done When" | Based on impact |
| **Agent / MCP layer** | `harness scaffold mcp` + `harness scaffold milestone:agent` | Should |
| **SKILL.md for project** | `harness scaffold skill` | Should |
| **llms.txt for LLM index** | `harness scaffold llms-txt` | Should (for agent projects) |
| **A2A agent discovery** | `harness scaffold agent-card` | Should (for multi-agent) |
| **Tool observability** | `harness scaffold agent-observe` | Should (for production) |
| **Agent auth + rate limit** | `harness scaffold agent-auth` | Must (for remote SSE) |
| **Agent payments** | `harness scaffold agent-pay` | Could (x402 + Stripe) |
| **MCP protocol tests** | `harness scaffold agent-test` | Should |
| **Schema drift CI** | `harness scaffold agent-schema-ci` | Should |
| **Tool versioning** | `harness scaffold agent-version` | Should (if tools evolve) |
| **Multi-agent client** | `harness scaffold agent-client` | Could (if calling others) |
| **MCP Prompts** | `harness scaffold agent-prompts` | Could |
| **Long-running tasks** | `harness scaffold agent-webhook` | Could (if tools >30s) |
| **Cost tracking** | `harness scaffold agent-cost` | Should (if paid APIs) |
| **Cloudflare config** | `harness scaffold cloudflare` | Varies |

### Adding Capabilities Mid-Project (scaffold command)

When the user says "let's add agent tools" or "make this an MCP server" or "deploy on Cloudflare":

```
# The agent runs these — no web search needed, templates are built into the CLI:

# Core
<pkg-mgr> run harness scaffold mcp              # → src/tools/, src/server.ts, tests
<pkg-mgr> run harness scaffold skill             # → SKILL.md at project root
<pkg-mgr> run harness scaffold llms-txt          # → llms.txt (auto-scans project files)
<pkg-mgr> run harness scaffold milestone:agent   # → appends 11-task MCP milestone to PLAN.md

# Infrastructure
<pkg-mgr> run harness scaffold agent-card        # → /.well-known/agent.json (A2A protocol)
<pkg-mgr> run harness scaffold agent-observe     # → src/lib/tool-metrics.ts (observability)
<pkg-mgr> run harness scaffold agent-auth        # → src/middleware/auth.ts (auth + rate limit)
<pkg-mgr> run harness scaffold agent-pay         # → x402 + Stripe payment middleware

# Quality
<pkg-mgr> run harness scaffold agent-test        # → MCP protocol compliance tests
<pkg-mgr> run harness scaffold agent-schema-ci   # → CI script: SKILL.md vs code drift check
<pkg-mgr> run harness scaffold agent-version     # → docs/tool-versioning.md

# Advanced
<pkg-mgr> run harness scaffold agent-client      # → src/lib/agent-client.ts (call remote agents)
<pkg-mgr> run harness scaffold agent-prompts     # → src/prompts/index.ts (MCP prompt templates)
<pkg-mgr> run harness scaffold agent-webhook     # → src/lib/task-queue.ts (async + callback)
<pkg-mgr> run harness scaffold agent-cost        # → src/lib/cost-tracker.ts (per-call costing)

# Deploy
<pkg-mgr> run harness scaffold cloudflare        # → wrangler.toml, .dev.vars

# Then continue normal flow:
<pkg-mgr> run harness init                        # default serial start
# or: <pkg-mgr> run harness worktree:start M<next>   # if isolated / parallel execution is needed
```

The scaffold command generates starter files adapted to the current project name.
The agent then customizes the generated files (wire tools to existing services, etc.)
through the normal Task Execution Loop.

### Continuous project lifecycle

```
Bootstrap (claude.ai)
  → Phase 1-3: Generate everything
  → Handoff to Claude Code / Codex

Sprint 1 (Claude Code / Codex)
  → Phase 4: Execute M1, M2, M3...
  → Phase 5: Test continuously
  → Phase 6: Update docs

All initial milestones done
  → Idle Protocol: report green, wait

User adds new work (Claude Code / Codex or claude.ai)
  → Update PLAN + progress.json, and PRD/docs only when the new work changes them
  → New milestone(s) created

Sprint 2 (Claude Code / Codex)
  → Same Phase 4-6 loop on new milestones
  → Same iron rules, same testing, same worktree flow

Repeat forever.
```

### Idle Protocol — All Initial Milestones Complete

When `harness worktree:finish` for the last planned milestone exits cleanly and
`harness status` shows no ⬜ or 🟡 tasks remaining:

```bash
# From main repo root (not inside any worktree):

<pkg-mgr> run harness worktree:status   # confirm: no active worktrees, no pending finish jobs
<pkg-mgr> run harness validate:full     # final green-pass on main branch
<pkg-mgr> run harness changelog         # generate release notes from [M<n>-id] commits
<pkg-mgr> run harness schema            # confirm progress.json is valid
```

> **Note — first release:** If no git tag exists yet, `harness changelog` uses the full
> commit history as the range (there is no prior tag to anchor from). The output will
> include scaffold and all task commits since project start. This is expected on a
> first release; present it to the user as "full project changelog" rather than "sprint
> changelog".

Then report to the user:
> "All milestones are complete. Here's the generated changelog for this sprint.
> `docs/progress.json` shows N milestones completed. Suggest releasing as vX.Y.Z —
> confirm and I'll tag it, or choose a different version."

**Human decides the version number.** The agent does not pick or push the tag.
Once the user confirms:

```bash
git tag v<version>     # after human confirms version
git push --tags        # triggers deploy.yml / CI release pipeline
```

**Post-release archival:**
```bash
# Archive the current exec-plans (already done by worktree:finish per milestone,
# but run this to catch any stragglers):
mv docs/exec-plans/active/*.md docs/exec-plans/completed/
git add -A && git commit -m "chore: archive exec-plans for v<version>"
```

After tagging and archiving, the project enters **Idle**. The agent waits.
New work enters via plan mode, followed by immediate repo sync (`harness plan:apply` or native mirroring),
or via the pasted-plan recovery path when planning happened elsewhere.
Do not invent tasks or start new milestones without an explicit user request.

The repo is the single source of truth. The execution loop doesn't know or care
whether it's running for the first time or the hundredth time. As long as there's
a milestone with ⬜ tasks in PLAN.md and a matching entry in progress.json,
the agent knows what to do.

### What if the user wants to re-generate or modify?

Come back to claude.ai with this skill. You can:
- "Update my PRD with these new requirements" → re-generate PRD.md + PLAN.md
- "Add a new milestone for X" → update PLAN.md + progress.json dependency graph
- "Change the tech stack from X to Y" → regenerate scaffold + configs
- "My AGENTS.md / CLAUDE.md is out of date" → re-generate from current project state

After re-generation, copy the updated files into the project repo and commit them.
Then run `<pkg-mgr> run harness migrate` from main/root once to refresh harness-managed runtime files and schema.
The agent will pick up the changes on next session init.

### Undoing a merged milestone

If a merged milestone must be backed out:

1. Use `git revert` on the merge commit from main.
2. Repair `docs/PLAN.md`, `docs/progress.json`, and any archived exec-plan file placement so they
   match the reverted state.
3. Treat follow-up repair work as a new plan/milestone instead of editing status cells ad hoc.

## Self-Iteration and Self-Correction

> **SAFETY GUARD:** This section applies ONLY when your current working directory IS
> the `harness-engineer-cli` skill repo itself. If you are executing this skill ON a
> user's project, **skip this section entirely** — do not run `skill-maintenance.ps1`
> in the project directory. Running maintenance scripts in the wrong directory will
> corrupt the skill's reference files.

When the user reports a process-level issue (command drift, duplicated docs, wrong mode framing,
or template confusion), run a short maintenance loop before continuing execution work:

1. From this skill repo root, run `pwsh scripts/maintenance/skill-maintenance.ps1`.
2. Read failures, fix the minimal set of docs manually.
3. Re-run with `-AutoFix` for safe corrections.
4. Re-run check and only proceed when green.

This is the default entry point when the agent notices repeated confusion in the
skill's own generated workflow surfaces.

