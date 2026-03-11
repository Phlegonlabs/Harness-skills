## Retrofit Workflow

For existing projects. The goal is NOT to rewrite or re-scaffold the project. The goal
is to add the harness layer — the docs, scripts, hooks, configs, and conventions that
let agents work autonomously on future tasks.

### Retrofit Step 1: Analyze the Existing Project

Treat this intake as mandatory. Do NOT generate harness files until you have inspected the
available repo context and asked the missing clarifying questions needed to describe the
existing project correctly.

Ask the user to upload or describe their project. Key files to request:

- `package.json` / `pyproject.toml` / `go.mod` (to understand stack + deps)
- Source directory structure (`ls src/` or equivalent)
- Any existing README, docs, or config files
- `.gitignore` (to see what's already there)
- Any existing CI workflows (`.github/workflows/`)
- Any existing linter/formatter configs (eslint, prettier, tsconfig, etc.)

If the user has uploaded files, read them directly.
If the user describes verbally, ask clarifying questions about:

If your runtime does not provide `ask_user_input` (for example Codex in a plain terminal session),
ask the same questions in prose and continue from the user's answers.
Ask in short batches, not one giant form. If the repo already answers a question, skip it.

**ask_user_input:**
1. **Tech stack** (multi_select): What does this project use?
   - Adapt options based on what you can see from uploaded files
   - Example: `TypeScript`, `React`, `Next.js`, `Remix`, `Nuxt`, `Node.js API`, `Python`, `Go`

2. **Package manager** (single_select, JS/TS only):
   - Options: `pnpm`, `bun`, `npm`
   - Auto-detect from lockfile if uploaded

Then analyze:
- What framework and runtime? (detect from deps)
- What's the source directory structure? (detect module/domain boundaries)
- What tests exist? (detect test framework, test directory)
- What CI exists? (detect workflows)
- What linting/formatting exists? (detect configs)
- What's the dependency layer structure? (detect import patterns)

**Frontend UI capture (only if the project has a UI):**
- Detect the existing route/screen inventory from the codebase: routes, pages, tabs, sidebars,
  auth-gated screens, and any major shared layout shells.
- Detect the existing UI system if possible: component library, theme tokens, nav pattern,
  light/dark handling, and density.
- If those inputs are not obvious from the repo, ask a short **hybrid UI brief** in prose:
  - What UI or brand should be preserved, if any?
  - Should the interface feel `spacious`, `balanced`, or `dense`?
  - Should the project be `light-first`, `dark-first`, or support both themes?
- If the user wants the current UI preserved, record that explicitly in `docs/product/frontend-design.md`
  under `Reference Anchors`. If the user wants a refresh, record the target direction while still
  mapping the current routes/screens.

### Retrofit Step 2: Generate Harness Layer

Based on the analysis, generate ONLY the harness files. Do NOT touch existing source code,
tests, or configs unless they conflict with the harness.
Write the harness files directly into the target repo working tree so the user reviews the
real diff and browser-openable preview, not a hypothetical file list.

**Always generate core harness docs/config (regardless of runtime):**

```
Files to ADD to the existing project:
├── AGENTS.md                    ← dynamically generated from analysis
├── CLAUDE.md                    ← identical to AGENTS.md
├── ARCHITECTURE.md              ← generated from actual source structure
├── docs/
│   ├── index.md                 ← human navigation entrypoint for generated docs
│   ├── PRD.md                   ← lightweight — document what EXISTS, not what to build
│   ├── PLAN.md                  ← empty milestones section, ready for new work
│   ├── progress.json            ← initialized with project state
│   ├── learnings.md             ← empty, ready for agent learnings
│   ├── product/
│   │   ├── frontend-design.md   ← if project has frontend
│   │   ├── design.md            ← if project has frontend; derive from actual routes/screens
│   │   ├── design-preview.html  ← if project has frontend; mid-fi styled static preview for review
│   │   └── release.md           ← desktop-only release contract when applicable
│   ├── agent/
│   │   ├── agent-workflows.md   ← common agent workflows with this project
│   │   ├── api-guide.md         ← API reference when the project exposes one
│   │   ├── commands.md          ← CLI command reference when applicable
│   │   └── data-model.md        ← data entities agents will read/write
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   ├── tech-debt/
│   │   └── .gitkeep
│   └── gitbook/                 ← use this unless the repo already has a coherent docs root
│       ├── SUMMARY.md
│       ├── README.md
│       ├── product-overview.md
│       ├── target-users.md
│       ├── architecture.md
│       ├── quickstart.md
│       └── roadmap.md
├── schemas/
│   └── progress.schema.json
├── .claude/
│   └── settings.json
└── .codex/
    └── config.toml
```

**Runtime-specific harness files (pick ONE branch before generating files):**

- **JS/TS projects or non-JS projects that accept a Node root:** generate:
  - `scripts/harness.ts`
  - `scripts/maintenance/check-commit-msg.ts`
  - `scripts/harness/` CLI modules
- **Non-JS/TS projects with no Node.js:** generate the native shell runtime instead:
  - `scripts/harness.sh`
  - `scripts/check-commit-msg.sh`
  - `Makefile` targets for `validate`, `next`, `start`, `done`, `block`
  - `.pre-commit-config.yaml` (Python/Go) or `.githooks/` (Rust), per `harness-native.md`

Do NOT generate both runtimes for the same retrofit target. Decide the runtime branch first,
then generate only the files for that branch.

**Conditionally generate (only if not already present):**

| File | Generate if... | Skip if... |
|------|---------------|-----------|
| `.gitignore` | Missing or doesn't have .env patterns | Already comprehensive |
| `.env.example` | Missing | Already exists |
| `eslint.config.js` | No ESLint config exists | Already has ESLint (preserve theirs) |
| `.prettierrc` | No Prettier config exists | Already has Prettier (preserve theirs) |
| `tsconfig.json` | No tsconfig exists | Already has one (preserve theirs) |
| `.husky/` hooks | No husky setup exists | Already has hooks (merge, don't replace) |
| CI workflows | No CI exists | Already has CI (augment, don't replace) |
| `Dockerfile` | No Docker setup exists | Already has Docker (preserve theirs) |
| `docker-compose.yml` | No compose exists | Already has one (preserve theirs) |

**Rule: NEVER overwrite existing configs.** If the project already has ESLint, tsconfig,
Prettier, CI, Docker — keep theirs. Only add the harness-specific files that don't exist.

If an existing config conflicts with Iron Rules (e.g., ESLint is on `warn` instead of
`error` for `no-explicit-any`), note it in a `docs/tech-debt/harness-alignment.md` file
as a suggestion, but do NOT force the change.

### Retrofit Step 3: Adapt AGENTS.md / CLAUDE.md to the Existing Project

The Interaction Rules + Iron Rules templates are copied verbatim (same as greenfield).

Everything else is generated from what ACTUALLY exists:

- **Project overview** — describe what this project does based on README/package.json/source
- **Quick start** — the REAL commands this project uses (detect from existing scripts)
- **Repository map** — point to the actual directories and files that exist
- **Architecture rules** — derive from the actual import patterns and module structure
- **Dev environment tips** — based on the actual dev workflow (existing scripts, Docker, etc.)
- **Testing instructions** — whatever test framework and commands they already use
  + add the new harness scripts (`validate`, `stale-check`, etc.)
- **Session Init / Task Loop / Merge Gate / Stale Detection** — standard templates,
  with commands adapted to the existing package manager and test runner
- **Plan File Convention** — standard, pointing to `docs/exec-plans/active/`

### Retrofit Step 4: Generate Lightweight PRD

For a retrofit, the PRD is a **snapshot of what exists**, not a design document.
It's shorter than a greenfield PRD.

```markdown
# Product Requirements Document: <Project Name>

## 1. Overview
What this product currently does, based on analysis of the codebase.

## 2. Current State
- Tech stack: <detected>
- Key modules/domains: <detected from src/>
- Test coverage: <detected — what exists>
- CI/CD: <detected — what's set up>
- Deploy target: <detected or ask user>

## 3. Existing Features (as-is)
Brief inventory of what's already built, organized by module/domain.
Not a design doc — just a map of what exists for agent context.

| Module | Description | Has Tests? |
|--------|------------|-----------|
| auth   | JWT-based authentication | Yes (12 tests) |
| users  | User CRUD + profiles | Partial (3 tests) |
| ...    | ... | ... |

## 4. Tech Debt (detected)
Issues found during analysis:
- Files over 500 lines: <list>
- Missing test coverage: <modules without tests>
- Missing .env.example entries: <vars in code but not in example>
- Stale docs: <any detected>

## 5. Future Work
(Empty — to be filled via plan mode when user adds new work)

## 6. Tech Stack
| Layer | Choice | Detected From |
|-------|--------|--------------|
```

### Retrofit Step 5: Initialize progress.json

```json
{
  "project": "<detected project name>",
  "version": "1.0.0",
  "last_updated": "<now>",
  "last_agent": "human",
  "current_milestone": null,
  "current_task": null,
  "active_milestones": [],
  "completed_milestones": [],
  "agents": [],
  "finish_jobs": [],
  "blockers": [],
  "learnings": [],
  "dependency_graph": {},
  "synced_plans": [],
  "stale_checks": {
    "last_run": null,
    "issues": []
  }
}
```

No milestones, no tasks, no dependency graph — the project already exists.
All future work enters through plan mode → immediate plan sync into repo files → Task Execution Loop.

### Retrofit Step 6: Wire CLI into Existing package.json

**For JS/TS projects:** Add the harness CLI to the EXISTING package.json. Do NOT replace existing scripts.

```
Merge into existing "scripts":
  "harness": "tsx scripts/harness.ts"

Add to devDependencies:
  "tsx": "^4.0.0"

If "prepare" script exists → append husky to it
If "prepare" doesn't exist → add "prepare": "husky"
```

The CLI calls `<pkg-mgr> run test`, which runs whatever `test` script is defined in
your package.json. If your project uses `jest`, make sure `"test": "jest"` is in
package.json scripts. Same for `mocha`, `ava`, or any other runner. The harness CLI
delegates to your existing scripts — it doesn't auto-detect frameworks.

**For non-JS/TS projects (Python, Go, Rust):** Two options:

1. **Recommended:** Install Node.js alongside the project's toolchain. Add `scripts/harness.ts`
   + `scripts/harness/` as-is. Wire into the existing Makefile:
   ```makefile
   harness: npx tsx scripts/harness.ts $(ARGS)
   ```

2. **No Node.js:** Use `docs/agent/harness-native.md` to generate `scripts/harness.sh`.
   Ensure the existing Makefile has a `validate` target. Add pre-commit hooks using the
   language-appropriate framework (see harness-native.md). Note the feature tradeoffs in
   AGENTS.md / CLAUDE.md.

### Retrofit Step 7: Present and Review

Present to the user from the actual repo state:
1. File tree of what was ADDED or changed by the harness patch
2. List of existing configs that were PRESERVED (not overwritten)
3. Tech debt items detected
4. The generated AGENTS.md / CLAUDE.md for review
5. If the project has a frontend: `docs/product/frontend-design.md`, `docs/product/design.md`, and
   `docs/product/design-preview.html` for UI review
6. Point the user to `docs/index.md` so they can review the generated docs as a grouped set
6. Ask: "Does this look right? Should I adjust anything?"

For frontend retrofits, explicitly ask the user to open `docs/product/design-preview.html` and confirm:
- The route structure matches the current product
- The visual direction is right for the project
- The density/theme choice looks right for the next round of implementation

If the user requests changes, patch the written files in place, then re-present the diff and
UI preview. Do not switch to a second "apply" phase.

After confirmation, the files are already in the existing project. Then the user:
1. Reviews the diff in the target repo
2. Records the activation command from `AGENTS.md` / `docs/gitbook/quickstart.md`
3. By default, do NOT run `<pkg-mgr> install` immediately. Wait until the user is ready to start the first real milestone, or until they explicitly ask for the harness runtime to be activated right now.
4. If the user explicitly wants immediate activation:
   - TypeScript CLI: run `<pkg-mgr> install` (to pick up tsx + husky)
   - Native shell CLI: install `jq` / hooks exactly as documented in `docs/agent/harness-native.md`
5. Commits: `[scaffold] add harness framework`
6. Opens Claude Code / Codex → agent reads AGENTS.md / CLAUDE.md → ready

### After Retrofit: How It Works

The project now has the full harness layer but NO pending milestones.
The flow is entirely plan-mode-driven:

```
User opens Claude Code / Codex
  → Agent reads AGENTS.md / CLAUDE.md (Session Init)
  → Reads progress.json (no active milestones)
  → Runs stale-check (flags any issues)
  → Reports: "Harness active. No pending work. Ready for new tasks."

User enters plan mode
  → Describes new feature / fix / refactor
  → Discussion can happen first while the change is still being shaped
  → Once the user says to proceed, or prior planning content is already detailed enough to execute, treat it as execution-authorizing
  → Plan file written to docs/exec-plans/active/
  → BEFORE leaving planning, sync the plan into docs/PLAN.md + docs/progress.json

TypeScript CLI path:
  Agent runs `harness plan:apply` from main/root in the same planning flow
  → Parses plan into new Milestone(s) in PLAN.md
  → Updates progress.json with dependency graph
  → Verifies PLAN.md + progress.json now reflect the new work
  → Updates PRD only when the approved work changes product requirements or public scope
  → If the approved plan changes module boundaries, integrations, deployment topology, or core data flow, update ARCHITECTURE.md before leaving planning and sync docs/gitbook/architecture.md when present
  → If the new work clearly fits the active milestone, refine that milestone's task list and continue there instead of forcing a separate milestone
  → If one eligible milestone and no isolation need → `harness init` and continue serially from main/root
  → If 2+ independent milestones or explicit isolation is needed → `harness worktree:start M<next>`
  → Same iron rules, same testing, same atomic commits
  → Milestone done → merge gate → auto-finish → optional release tag or new plan → repeat

Native shell CLI path (no Node.js):
  Agent writes the plan file to docs/exec-plans/active/
  → Immediately mirrors the milestone tables into PLAN.md + progress.json
  → If the approved plan changes module boundaries, integrations, deployment topology, or core data flow, update ARCHITECTURE.md before leaving planning and sync docs/gitbook/architecture.md when present
  → If the new work clearly fits the active milestone, refine that milestone's task list and continue there instead of forcing a separate milestone
  → Runs `bash scripts/harness.sh init`
  → Enters the same task loop (`next` / `start` / `validate` / `done`)
  → No `plan:apply`, no `worktree:*`, no auto-finish queue

Fallback if plan mode already ended without sync:
  Paste the full approved plan output, planning transcript, or sufficiently detailed prior planning content back into the current session
  → Agent reads that pasted planning context
  → Recreates docs/exec-plans/active/<descriptive-name>.md (or mirrors directly for native shell)
  → Syncs PLAN.md + progress.json before any execution starts
  → Updates ARCHITECTURE.md / docs/gitbook/architecture.md too if the pasted plan changed system shape

Do not rely on a later `harness init` in a new session to ingest the plan. The repo itself
must already contain the synced plan state before handoff.

Once the repo is synced, either Claude Code or Codex can resume from that same state.
If worktree mode is active, the incoming agent opens the same milestone worktree; if serial
mode is active, the incoming agent opens main/root. Do not keep retrofit decisions only in chat.
Retrofit is only closed-loop when the repo files, runtime config, and resume path all agree.

Repeat.
```

No long-task bootstrap. No initial milestone grind. The project is already built.
The harness just gives agents the rails to do future work safely.

---

