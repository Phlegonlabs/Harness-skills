# Scaffold Generator Agent

## Role

Complete the repo bootstrap and Harness Engineering and Orchestrator scaffold closeout required to enter `EXECUTING`, based on the confirmed PRD and Architecture documents.

## Trigger

Dispatched by the Orchestrator when `phase === "SCAFFOLD"`.

## Inputs

- `.harness/state.json`
- `docs/PRD.md` + `docs/prd/`
- `docs/ARCHITECTURE.md` + `docs/architecture/`
- `README.md`
- `AGENTS.md` / `CLAUDE.md`
- Harness level (`state.projectInfo.harnessLevel.level`)

## Tasks

### Level-Scoped File Counts

| Level | Target Files | Notes |
|-------|-------------|-------|
| Lite | ~5-8 files | No monorepo, no GitBook, no ADR directory. Minimal: state.json, orchestrator.ts, AGENTS.md, CLAUDE.md, PRD.md, ARCHITECTURE.md, package.json, .env.example |
| Standard | ~25-35 files | Monorepo optional. Full Harness runtime, CI, PR template, docs structure, biome config |
| Full | 60+ files | Full monorepo structure, GitBook, ADR directory, PR template, CI workflows, ecosystem-specific configs |

### Ecosystem-Specific Template Selection

Current setup wiring in `scripts/setup/core.ts` writes `templates/.github/workflows/ci.yml.template` and `templates/.github/workflows/release.yml.template` for the published workspace-first Bun / npm / pnpm flow. The language-specific CI templates under `templates/.github/workflows/` are reference material until setup is updated to select them automatically. Do not promise a different CI template path unless the same change also updates `scripts/setup/core.ts`.

### Group 1: Harness Runtime

The full list below matches the files copied by `copyHarnessRuntime` in `scripts/setup/core.ts` and validated by `phase-structural.ts`. All runtime files plus `state.json` are required before entering EXECUTING.

- [ ] `.harness/types.ts`
- [ ] `.harness/init.ts`
- [ ] `.harness/advance.ts`
- [ ] `.harness/state.ts`
- [ ] `.harness/validate.ts`
- [ ] `.harness/orchestrator.ts`
- [ ] `.harness/orchestrate.ts`
- [ ] `.harness/approve.ts`
- [ ] `.harness/stage.ts`
- [ ] `.harness/compact.ts`
- [ ] `.harness/add-surface.ts`
- [ ] `.harness/audit.ts`
- [ ] `.harness/sync-docs.ts`
- [ ] `.harness/sync-skills.ts`
- [ ] `.harness/api-add.ts`
- [ ] `.harness/merge-milestone.ts`
- [ ] `.harness/resume.ts`
- [ ] `.harness/learn.ts`
- [ ] `.harness/metrics.ts`
- [ ] `.harness/entropy-scan.ts`
- [ ] `.harness/scope-change.ts`
- [ ] `.harness/state.json` (persisted runtime state)

### Group 2: Agent Specs and Config

- [ ] `AGENTS.md` exists and matches `CLAUDE.md` exactly (G8)
- [ ] `CLAUDE.md` exists
- [ ] `.env.example` exists
- [ ] `biome.json` exists (Standard/Full)
- [ ] `tsconfig.json` exists (if TypeScript project)

### Group 3: Documentation Baseline

- [ ] `docs/PRD.md` or `docs/prd/` exists
- [ ] `docs/ARCHITECTURE.md` or `docs/architecture/` exists
- [ ] `docs/PROGRESS.md` or `docs/progress/` exists
- [ ] `docs/gitbook/SUMMARY.md` exists (Full only)
- [ ] `docs/adr/` exists (Full only)

### Group 4: Build Infrastructure

- [ ] `package.json` has `harness:advance`, `harness:approve`, `harness:validate`, `harness:compact` scripts
- [ ] `package.json` has `harness:orchestrate`
- [ ] `package.json` has `typecheck`, `format:check`, `build` scripts
- [ ] CI/CD pipeline files exist (`.github/workflows/`) (Standard/Full)
- [ ] PR template exists (`.github/PULL_REQUEST_TEMPLATE.md`) (Full only)
- [ ] Workspace structure matches Architecture doc

### Group 5: Verification

- [ ] the configured install command from `state.toolchain.commands` succeeds
- [ ] the configured typecheck command from `state.toolchain.commands` passes
- [ ] the configured build command from `state.toolchain.commands` passes
- [ ] `bun harness:validate --phase EXECUTING` passes

Complete each group in order. Verify each item exists before moving on.

Do NOT bootstrap product frameworks (Next.js, Tauri, Expo) during scaffold. Only prepare the Harness program, orchestration runtime, monorepo shape, and milestone/task flow.

### Phase Completion

After all groups are verified:

1. Present the **Scaffold Verification Checklist** with pass/fail for each item
2. Show the `bun harness:validate --phase EXECUTING` result
3. If approvals are still pending, stop and tell the operator to run:
   - `bun harness:approve --plan`
   - `bun harness:approve --phase V1`
4. Continue into `EXECUTING` only after the overall plan and `Phase 1` are explicitly approved
5. Stop only if scaffold output materially deviates from the approved plan or validation fails

## Outputs

- A complete Harness Engineering and Orchestrator scaffold
- A parseable milestone / task backlog
- The minimum repo structure required for `EXECUTING`

## Done-When

- `bun harness:validate --phase EXECUTING` passes
- The scaffold verification checklist is complete
- The next safe step is `bun harness:approve --plan`, `bun harness:approve --phase V1`, then `bun harness:advance`, unless scaffold drift or validation failure requires escalation

## Constraints

- At Lite level, generate only ~5-8 files — skip GitBook, ADR directory, monorepo structure, PR template
- At Standard level, generate ~25-35 files — monorepo optional, GitBook optional
- At Full level, generate 60+ files — full structure required
- Do NOT bootstrap product frameworks during scaffold
- Select CI workflow templates matching the project ecosystem
