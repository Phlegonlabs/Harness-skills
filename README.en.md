# Harness Engineering Skills

[![Release](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml/badge.svg)](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Published Skills](https://img.shields.io/badge/Published%20skills-1-1f6feb)
![Agents](https://img.shields.io/badge/Agents-Claude%20%2B%20Codex-0a7ea4)
![Workflow](https://img.shields.io/badge/Workflow-PRD--to--Code-111827)

> AI-native engineering workflow skills for Claude and Codex.
>
> Install `harness-engineering-orchestrator` to run software projects through a repo-backed delivery loop:
> `PRD -> Architecture -> Scaffold -> Milestone -> Task -> Validation`

Harness Engineering is built around one idea: planning and execution should survive chat sessions. Instead of keeping important decisions inside prompt history, the workflow writes them back into versioned repository artifacts such as `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `AGENTS.md`, `CLAUDE.md`, and `.harness/state.json`. That makes delivery stateful, resumable, and auditable across humans, Claude, and Codex.

## 1-Minute Demo

```bash
# 1. Install the skill
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator

# 2. Enter a target repository
cd my-project

# 3. Generate the Harness workflow
bun <path-to-installed-skill>/scripts/harness-setup.ts

# 4. Start orchestration
bun harness:orchestrate
```

In about a minute you should have:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `.harness/state.json`
- a runnable orchestrator entrypoint for the next step

For an existing repository, swap step 3 to:

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

## Start Here

- Install: `npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator`
- Best for: teams that want AI coding agents to work inside a controlled PRD-to-code delivery system instead of free-form prompt chains
- Main package: `harness-engineering-orchestrator` for discovery, stack selection, PRD, architecture, milestone/task execution, and validation
- Read next: [harness-engineering-orchestrator/README.md](./harness-engineering-orchestrator/README.md)

## Featured Skill

| Skill | What it does | Best for |
|---|---|---|
| `harness-engineering-orchestrator` | Turns an idea or existing repo into a repo-backed delivery workflow with docs, runtime state, backlog, execution, and validation | Greenfield bootstraps, existing repo hydration, milestone-driven agent delivery |

## Why Teams Install It

Harness Engineering is for teams that want AI coding agents to operate inside a controlled delivery system instead of free-form prompt chains.

- PRD-first planning instead of chat-only planning
- milestone and task execution tied back to repo state
- explicit phase gates before implementation advances
- staged delivery (`V1 -> deploy review -> V2`) instead of one drifting backlog
- resumable collaboration across sessions, agents, and humans

The repository is intentionally shaped to support multiple domain skill packages over time. `harness-engineering-orchestrator` is the first published package, and future packages can sit beside it under the same root.

## What this repository contains

- `README.md`: this entry page and high-level usage guide.
- `README.en.md`: English documentation.
- `README.zh-CN.md`: Chinese documentation.
- `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`: repository-level open source metadata and contribution policy.
- `harness-engineering-orchestrator/`: the published skill package.
  - `SKILL.md`: the runtime contract the skill executes.
  - `agents/`: role prompts and operating guides.
  - `references/`: templates and helper docs.
  - `scripts/`: optional automation helpers.
  - `templates/`: scaffold files and example structure.

## Language

- English: [README.en.md](README.en.md)
- Chinese: [README.zh-CN.md](README.zh-CN.md)

## Install

### Prerequisites

- `git`
- `bun`
- a client that supports `skills add`

### Install the skill package

```bash
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator
```

### Use it in a target repository

For a new repository:

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts
```

For an existing repository:

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

After setup or hydration, continue from inside the target repository with:

```bash
bun .harness/orchestrator.ts
bun harness:orchestrate
bun harness:advance
```

For the full skill-level operator flow, see [harness-engineering-orchestrator/README.md](./harness-engineering-orchestrator/README.md).

## When to use this skill

Use the orchestrator when you want AI assistants to operate through a structured, file-backed project loop rather than ad-hoc prompts.

- New project launches (greenfield): idea → discovery → stack selection → PRD → architecture → scaffold → execution → validation.
- Existing projects: bring legacy or partially structured repos into a consistent Harness workflow.
- Team handoff: make task state inspectable by agents and humans from the repository alone.

Typical prompts:

- `Bootstrap a new TypeScript monorepo with Harness Engineering.`
- `Turn this existing repo into a repo-backed workflow with PRD, architecture, and progress tracking.`
- `Set up Harness validation gates and execution loop for this codebase.`

## What it can generate

- `docs/PRD.md`: requirements, scope, milestones, acceptance criteria.
- `docs/ARCHITECTURE.md`: system structure, data flow, constraints, and decisions.
- `docs/PROGRESS.md`: milestone/task progress and completion state.
- `.harness/state.json`: canonical runtime state for orchestration.
- `AGENTS.md` + `CLAUDE.md`: machine-readable and human-readable collaboration contracts.
- `docs/adr/`, `docs/gitbook/`: supporting documentation structures used during execution.
- Validation and scaffold artifacts for repeatable build/test checks.

## What makes it different

- The repository becomes the working memory, not the chat transcript.
- Scope changes must flow back through the PRD before implementation resumes.
- Execution is milestone-driven and review-gated, not a single uninterrupted agent run.
- Validation writes back into runtime state so the next session can resume from facts, not recollection.

## Workflow in brief

```text
DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE
```

The key principle is that planning is not "done" until repo artifacts are updated, and execution is not "done" until code, validation, and task state are aligned.

### Pacing discipline

The orchestrator enforces strict step-by-step execution:

- **Level-aware Discovery pacing** — Lite batches 1-2 questions or uses Fast Path, Standard groups 2-3 questions, Full asks one question per turn.
- **One phase per response** — work from two phases is never combined in a single message.
- **Mandatory checkpoints** at every phase boundary — the orchestrator summarizes, validates, and asks for confirmation before advancing.
- **Granular scaffold verification** — every `.harness/` runtime file, config, doc, and build script is individually checked before entering EXECUTING.

This prevents the common failure mode where the LLM rushes through phases, skips validation, or enters execution with an incomplete scaffold.

## Quick verification after install

After installing the skill in a target repo, verify these files exist or are created:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `.harness/state.json`

If these are present and readable, your repo is likely on the right track for the Harness loop.

## Contributing

This repo is intentionally small and focused. If you use the orchestrator in new ways, you can contribute by adding missing reference templates, strengthening gates, or improving execution playbooks. PRs and issue-based suggestions are welcome.

## References

- [Chinese documentation](./README.zh-CN.md)
- [English documentation](./README.en.md)
- [License](./LICENSE)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Skill contract](./harness-engineering-orchestrator/SKILL.md)
