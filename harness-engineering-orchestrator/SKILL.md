---
name: harness-engineering-orchestrator
description: >
  Scaffold or continue a software project with a Harness-style workflow.
  Use when the user wants a new app or repo, a structured bootstrap, or milestone-driven execution from PRD through implementation.
  Supports greenfield and existing codebases across web, iOS, CLI, agent, and desktop projects.
---

# Harness Engineering and Orchestrator

## Overview

Harness Engineering and Orchestrator is an orchestration skill, not just a repo generator.

Its job is to turn an idea or an existing codebase into a controlled delivery loop with:
1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. a milestone and task plan in `docs/PROGRESS.md`
4. a runnable scaffold with Harness runtime files
5. validated implementation until the project reaches `COMPLETE`

### Changes in v1.3.0

- Reduced `SKILL.md` to the operating contract instead of a full manual
- Centered the workflow on `PRD -> Architecture -> Milestone -> Task -> Validation`
- Moved detailed prompts and appendix material into `references/`
- Added `agents/openai.yaml` so the skill has explicit UI metadata

## Primary Review Surface

Keep user review focused on these artifacts unless the user asks for more:

- `docs/PRD.md` for scope, outcomes, and milestone definition
- `docs/ARCHITECTURE.md` for system shape, constraints, and dependency direction
- `docs/PROGRESS.md` for milestone and task status

Everything else is supporting or machine-owned:

- `.harness/state.json` and `.harness/*.ts`
- `docs/adr/`
- `docs/gitbook/`
- `AGENTS.md` and `CLAUDE.md`
- CI/CD, templates, README, and generated scaffolding files

Detailed secondary artifact notes live in [references/skill-appendix.md](./references/skill-appendix.md).

## Orchestrator Contract

When this skill runs, act as the **Orchestrator**.

- Ask one question at a time during discovery
- Keep runtime state, documents, backlog, and gates synchronized
- Treat `docs/PRD.md` and `docs/ARCHITECTURE.md` as the only planning source of truth
- Advance phases through the runtime (`bun harness:advance` or the underlying `.harness/*` scripts); do not fake completion
- Read only the agent or reference file needed for the current step
- Default the conversation to milestone and task progress, not long file inventories

For the runtime state model and phase gate discipline, see [agents/orchestrator.md](./agents/orchestrator.md).

## Runtime Path

```text
DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE
```

Use the standard path unless the project starts from an existing codebase.

### Existing Codebase Hydration

For existing repos, run from inside the target directory:

```bash
bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

The setup script infers project metadata from `package.json`, `README.md`, and `docs/`, then generates all harness runtime files while preserving existing files. The project typically enters at `SCAFFOLD` phase.

After hydration, adapt `package.json` scripts if needed — the gate checks expect `typecheck`, `format:check`, and `build` scripts to exist and pass.

Regardless of the starting point, the project must end up with:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- Harness runtime files
- `.harness/state.json`
- passing phase gates

## Phase 0: Discovery

Goal: capture just enough product, delivery, and design context to enter the research or stack phase cleanly.

Ask one question at a time and persist each answer immediately.

Capture at minimum:

- starting point: greenfield or existing codebase
- project name and concept
- target users and problem
- goals, time frame, and success metrics
- project type or combination of types
- AI needs, if any
- feature modules relevant to the selected project type
- team size
- visual design language for UI projects

The detailed question script lives in [references/discovery-questionnaire.md](./references/discovery-questionnaire.md).

## Phase 1: Market Research

Use this phase for greenfield projects or when the user wants current market input.

Deliver:

- a short competitor and market summary
- current technology signals that affect stack choice
- useful open-source references
- a brief statement of market differentiation

If the user explicitly skips research, record the skip in state instead of blocking the workflow.

For execution details, see [agents/market-research.md](./agents/market-research.md).

## Phase 2: Tech Stack

Negotiate the stack one layer at a time.

Rules:

- recommend first, then explain
- present the main alternative(s)
- wait for confirmation before moving to the next layer
- record every confirmed decision
- generate ADRs when a material architecture choice is locked in

End this phase with a confirmed stack table or structured object.

Use:

- [agents/tech-stack-advisor.md](./agents/tech-stack-advisor.md)
- [references/stacks.md](./references/stacks.md)
- `references/stacks/` for variant-specific stack notes

## Phase 3: PRD and Architecture

This phase creates the planning contract for the rest of the project.

Required outputs:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`

Support outputs may also be initialized here if needed by the scaffold:

- `AGENTS.md` and synchronized `CLAUDE.md`
- `docs/adr/`
- `docs/gitbook/`

Rules:

- the PRD defines milestones, requirements, acceptance criteria, and out-of-scope items
- the Architecture document defines structure, dependency direction, data flow, error handling, testing strategy, and worktree strategy
- if the milestone count is too large, reduce to a clear MVP cut before execution starts

The user review surface here is the PRD, the Architecture, and the resulting milestone shape.

Use:

- [agents/prd-architect.md](./agents/prd-architect.md)
- [references/prd-template.md](./references/prd-template.md)
- [references/architecture-template.md](./references/architecture-template.md)

## Phase 4: Scaffold

Goal: produce a clean, runnable baseline that matches the confirmed stack and documents.

The scaffold should include, as required by the project type:

- monorepo workspace placeholders and Harness program files
- Harness runtime files
- `AGENTS.md` and `CLAUDE.md`
- docs skeletons
- CI/CD
- baseline Harness program and test structure
- scripts needed to enter `EXECUTING`

Do not bootstrap product frameworks such as Next.js, Tauri, or platform SDKs during Phase 4. Those are implemented later inside milestone tasks. What matters here is that the Harness program, orchestration runtime, monorepo shape, and milestone/task flow are ready.

Use:

- [agents/scaffold-generator.md](./agents/scaffold-generator.md)
- [agents/execution-engine.md](./agents/execution-engine.md) for stack-specific scaffold details
- [scripts/harness-setup.ts](./scripts/harness-setup.ts)

## Phase 5: Execution

All real delivery happens here.

### Milestone Contract

- Each PRD milestone becomes one execution milestone
- Each execution milestone gets its own branch and worktree
- Milestone completion requires code, docs, and gate validation to agree
- The user should mainly see milestone status, risk, and MVP progress

### Task Contract

- Each task maps back to PRD acceptance criteria
- Each task has a clear Definition of Done
- Target size: usually completable within 4 hours and about 5 touched files or fewer
- Each task lands as exactly one Atomic Commit

Task types:

| Type | Purpose | Required output |
|------|---------|-----------------|
| `TASK` | Standard implementation work | Code + validation + Atomic Commit |
| `SPIKE` | Time-boxed investigation | Decision record in ADR / LEARNING |

### Execution Loop

1. Read the current `PRD`, `ARCHITECTURE`, `PROGRESS`, and runtime state
2. Confirm the current milestone and task
3. Run `bun .harness/orchestrator.ts` to determine which agent to dispatch next
4. **UI task routing**:
   - Frontend Designer produces `docs/design/{milestone-id-lowercase}-ui-spec.md` (e.g. `m1-ui-spec.md`)
   - Execution Engine implements the task
   - Design Reviewer validates: `bun .harness/orchestrator.ts --review`
   - Commit message includes `Design Review: ✅`
5. **Non-UI task routing**:
   - Execution Engine implements the task
   - Code Reviewer validates: `bun .harness/orchestrator.ts --code-review`
   - Commit message includes `Code Review: ✅`
6. Run the task checklist and `bun harness:validate --task`
7. Create one Atomic Commit
8. Update `docs/PROGRESS.md` and runtime state
9. Continue only when the task gate passes

### Progress Reporting

Report progress using:

- current milestone
- current task
- checklist result
- percentage or task count complete
- next task
- blocker, if any

Keep these reports concise. The default report is milestone and task progress, not a full file changelog.

For the deeper execution rules, read:

- [agents/execution-engine.md](./agents/execution-engine.md)
- [agents/frontend-designer.md](./agents/frontend-designer.md)
- [agents/design-reviewer.md](./agents/design-reviewer.md)
- [references/worktree-workflow.md](./references/worktree-workflow.md)

## Phase 6: Validation and Closeout

Run final validation only after the milestone ledger is actually complete.

Required outcomes:

- all required milestone gates pass
- final phase validation passes
- the PRD and shipped scope still match
- public-facing closeout artifacts are generated as needed

The final user-facing completion report should summarize:

- completed milestones
- remaining backlog or deferred scope
- validation result / Harness score
- recommended next work

Use [agents/harness-validator.md](./agents/harness-validator.md) and [agents/context-compactor.md](./agents/context-compactor.md).

## Minimum Guardrails

These are the non-negotiable rules that stay active throughout the workflow:

- `docs/PRD.md` is the source of truth for implementation scope
- feature work does not land directly on `main` or `master`
- dependency direction is `types -> config -> lib -> services -> app`
- no secrets or `.env` material enter the repo
- blocking forbidden patterns must be removed before milestone completion
- UI tasks must go through the design loop
- `AGENTS.md` and `CLAUDE.md` stay identical
- files that exceed the project size limit should be split or rewritten quickly

Full gate and guardian details live in [references/gates-and-guardians.md](./references/gates-and-guardians.md).
- Guardians G2-G10 are automatically enforced by git hooks, Claude Code hooks, and Codex CLI hooks installed during scaffold. See [references/hooks-guide.md](./references/hooks-guide.md)

## Read Only What You Need

Prefer progressive disclosure:

- Discovery prompts: [references/discovery-questionnaire.md](./references/discovery-questionnaire.md)
- State model and phase orchestration: [agents/orchestrator.md](./agents/orchestrator.md)
- Market research workflow: [agents/market-research.md](./agents/market-research.md)
- Stack negotiation: [agents/tech-stack-advisor.md](./agents/tech-stack-advisor.md)
- PRD / Architecture generation: [agents/prd-architect.md](./agents/prd-architect.md)
- Scaffold completion: [agents/scaffold-generator.md](./agents/scaffold-generator.md)
- Execution details: [agents/execution-engine.md](./agents/execution-engine.md)
- Validation and score: [agents/harness-validator.md](./agents/harness-validator.md)
- Code quality review: [agents/code-reviewer.md](./agents/code-reviewer.md)
- Supporting artifacts and repo inventory: [references/skill-appendix.md](./references/skill-appendix.md)
- HTML prototype guide: [references/html-prototype-guide.md](./references/html-prototype-guide.md)
- Hooks guide: [references/hooks-guide.md](./references/hooks-guide.md)

## Expected User Interaction

Keep checkpoints simple and predictable:

1. confirm the discovery answers
2. confirm the stack
3. review the PRD
4. review the Architecture
5. confirm the milestone and task breakdown or the MVP cutoff
6. review milestone-level progress or blockers

If the user only wants to review milestone, task, architecture, and PRD, default to exactly that.

## Command Surface

Common runtime commands:

```bash
bun harness:advance                         # Advance to the next phase (runs gate checks)
bun harness:validate --phase <PHASE>        # Validate a specific phase gate
bun harness:validate --task T[ID]           # Validate a specific task
bun harness:validate --milestone M[N]       # Validate a specific milestone
bun harness:guardian                        # Run guardian scan
bun harness:compact                         # Generate context snapshot
bun .harness/orchestrator.ts                # Dispatch the next agent (status/next also work)
bun .harness/orchestrator.ts --review       # Dispatch Design Reviewer (UI tasks)
bun .harness/orchestrator.ts --code-review  # Dispatch Code Reviewer (non-UI tasks)
bun harness:hooks:install                   # Restore local Harness files, then re-install git hooks, Claude Code settings, and Codex CLI config
bun harness:add-surface --type=<TYPE>       # Add a new project surface (e.g. api, android-app)
bun harness:audit                           # Full audit: guardians, phase gate, workspace, docs drift
bun harness:sync-docs                       # Synchronize managed documentation files
```
