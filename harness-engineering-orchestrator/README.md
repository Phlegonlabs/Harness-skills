# Harness Engineering and Orchestrator

[![Release](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml/badge.svg)](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
![Harness Level](https://img.shields.io/badge/Harness%20levels-Lite%20%7C%20Standard%20%7C%20Full-1f6feb)
![Delivery Model](https://img.shields.io/badge/Delivery-milestone--driven-0a7ea4)
![Workflow](https://img.shields.io/badge/Workflow-PRD--to--Code-111827)

> Repo-backed PRD-to-code orchestration for Claude and Codex.
>
> Use this skill when you want software delivery to move through explicit docs, runtime state, milestones, tasks, and validation instead of prompt-only execution.

Harness Engineering and Orchestrator is a repo-backed engineering delivery system for turning an idea or an existing repository into a controlled loop:

`PRD -> Architecture -> Scaffold -> Milestone -> Task -> Validation -> Release`

This README is the high-level map of the current system. The operating contract still lives in [SKILL.md](./SKILL.md) and [agents/orchestrator.md](./agents/orchestrator.md).

In practice, this skill gives Claude and Codex a shared operating model: discovery writes into planning docs, execution writes into runtime state, and validation decides whether the project is actually ready to move forward.

## 1-Minute Demo

```bash
# Install the skill
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator

# In a target repo, scaffold the workflow
bun <path-to-skill>/scripts/harness-setup.ts

# Launch the next agent
bun harness:orchestrate
```

Within about a minute, you should have a repo with:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `.harness/state.json`
- the next dispatched step visible from the orchestrator

## At a Glance

- Inputs: a project idea or an existing repository
- Outputs: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `.harness/state.json`, milestone/task backlog, scaffold, validation state
- Best for: greenfield bootstraps, existing repo hydration, milestone-driven delivery, staged `V1 -> deploy review -> V2` execution
- Control model: milestone-plan approval, phase/task gates, guardian checks, orchestrator-owned dispatch, repo-backed state

## Install in 30 Seconds

```bash
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator
```

Then run:

```bash
bun <path-to-skill>/scripts/harness-setup.ts
```

Or, for an existing repo:

```bash
bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

## Why This Project Exists

Most agent workflows fail in the same places:

- planning lives only in chat history
- scope expands without being written back into the repo
- execution starts before PRD and architecture are real
- milestone progress is hard to resume across sessions or across agents

Harness Engineering and Orchestrator makes the repository itself the working memory. The core idea is simple: if a planning decision matters, it must exist in repo artifacts before execution continues.

## Who This Is For

- Teams bootstrapping a new software project with explicit PRD, architecture, and milestone control
- Existing repos that need a stricter execution loop instead of ad-hoc AI prompting
- Human + agent collaborations where state must survive across sessions, handoffs, and model changes
- Projects that want versioned delivery like `V1 -> deploy review -> V2`, instead of one endless backlog

## Harness Levels

The skill operates at three levels of ceremony, auto-detected or user-specified:

| Level | Best For | Discovery | Approval Stops | Guardians |
|-------|----------|-----------|----------------|-----------|
| **Lite** | Small projects, prototypes | Batch 1-2 Qs/turn | Fast Path summary, execution phase completion, blockers | Core 7 (G1,G3,G4,G6,G8,G9,G11) |
| **Standard** | Most projects (default) | Groups 2-3 Qs/turn | Milestone plan approval, execution phase completion, blockers | 11 (G1-G11, G12 active) |
| **Full** | Enterprise / compliance | Sequential Q0-Q9 | Milestone plan approval, execution phase completion, blockers, deploy review | All 12 (G1-G12) |

Level is auto-detected or user-specified. Upgrade mid-project with backfill. See [SKILL.md](./SKILL.md#harness-levels) for the full approval-stop model and [references/level-upgrade-backfill.md](./references/level-upgrade-backfill.md) for upgrade protocol.

## Install

Install this skill from the public repository:

```bash
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator
```

Then use it inside a target repository:

```bash
# greenfield
bun <path-to-skill>/scripts/harness-setup.ts

# existing repo hydration
bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

## What You Get

- Repo-backed planning artifacts: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`
- Runtime state and orchestration under `.harness/`
- Explicit phase gates before the project can advance
- Milestone and task execution tied back to PRD refs
- Atomic-commit enforcement for task closeout
- Product-stage delivery with `V1 / V2 / V3`, deploy review, and explicit promotion
- Hooks and guardrails that keep agents from skipping process
- Three harness levels (Lite / Standard / Full) that scale ceremony to project size
- 12 guardians enforcing scope, quality, and safety constraints
- Metrics, entropy scanning, and observability built into the execution loop

## Open Source Project Shape

This skill is designed as an open workflow project, not as a one-off prompt pack.

- The skill contract lives in `SKILL.md`
- The runtime behavior lives in `references/`
- The role prompts live in `agents/`
- The generated project scaffold lives in `templates/`
- The open-source project metadata lives in `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md`

If you are evaluating the project from the outside, read this README first, then [SKILL.md](./SKILL.md), then [agents/orchestrator.md](./agents/orchestrator.md).

## System Model

The workflow has two layers:

- Runtime `phase`: `DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE`
- Product `stage`: `V1 / V2 / V3`, tracked inside `roadmap`, with exactly one `ACTIVE` stage at a time

The harness level controls which gates activate at each boundary and how much ceremony each phase requires.

Important invariants:

- Setup creates the full docs and runtime skeleton up front.
- Gates decide whether content is truly complete; file existence alone is not enough.
- Only the current `ACTIVE` stage is materialized into execution backlog.
- Future stages stay `DEFERRED` until explicit promotion.

## Agent Inventory

The orchestrator dispatches 13 specialized agents across workflow phases:

| Agent | Phase | Role |
|-------|-------|------|
| [project-discovery](agents/project-discovery.md) | DISCOVERY | Capture project metadata via questionnaire |
| [fast-path-bootstrap](agents/fast-path-bootstrap.md) | DISCOVERY (Lite) | 2-turn discovery-to-EXECUTING shortcut |
| [market-research](agents/market-research.md) | MARKET_RESEARCH | Competitor and market signal analysis |
| [tech-stack-advisor](agents/tech-stack-advisor.md) | TECH_STACK | Layer-by-layer stack negotiation |
| [prd-architect](agents/prd-architect.md) | PRD_ARCH | Generate PRD and Architecture docs |
| [scaffold-generator](agents/scaffold-generator.md) | SCAFFOLD | Produce runnable baseline |
| [frontend-designer](agents/frontend-designer.md) | EXECUTING | Design system and UI specs |
| [execution-engine](agents/execution-engine.md) | EXECUTING | Implement tasks, land atomic commits |
| [design-reviewer](agents/design-reviewer.md) | EXECUTING | Validate UI implementations |
| [code-reviewer](agents/code-reviewer.md) | EXECUTING | Validate code quality |
| [entropy-scanner](agents/entropy-scanner.md) | EXECUTING | Detect code entropy and AI slop |
| [harness-validator](agents/harness-validator.md) | VALIDATING | Final validation and scoring |
| [context-compactor](agents/context-compactor.md) | COMPLETE | Generate compact context snapshots |

The [orchestrator](agents/orchestrator.md) itself is the dispatcher — it reads state, selects the next agent, and enforces phase gates.

## End-to-End Flow

```mermaid
flowchart TD
    A[Setup / Hydration<br/>Generate .harness, agents, docs skeleton, hooks] --> LVL{Level?}
    LVL -->|Lite| FP[Fast Path Bootstrap<br/>2-turn discovery → scaffold]
    FP --> G
    LVL -->|Standard / Full| B[DISCOVERY]
    B -->|gate: validate MARKET_RESEARCH| C[MARKET_RESEARCH]
    C -->|gate: validate TECH_STACK| D[TECH_STACK]
    D -->|gate: validate PRD_ARCH| E[PRD_ARCH]
    E -->|real PRD + Architecture<br/>no placeholders<br/>dependency direction defined| F[SCAFFOLD]
    E -. planning incomplete .-> STOP[Stop and surface missing outputs<br/>Re-dispatch current phase agent]
    F -->|runtime + scaffold ready<br/>bun install<br/>deriveExecutionFromPrd| G[EXECUTING]
    F -. planning incomplete .-> E
    F -. scaffold outputs missing .-> STOP

    G --> H[Current ACTIVE product stage<br/>V1 / V2 / V3]
    H --> I[Current milestone]
    I --> J[Current task]
    J --> K{UI task?}
    K -->|Yes| L[Frontend Designer<br/>DESIGN_SYSTEM + mN-ui-spec]
    L --> M[Execution Engine]
    M --> N[Design Reviewer]
    K -->|No| O[Execution Engine]
    O --> P[Code Reviewer]
    N --> Q[completeTask<br/>exactly one atomic commit]
    P --> Q
    J -. blocked .-> BL[blockTask(reason)<br/>advance next executable task<br/>or wait for manual intervention]
    Q --> R{More tasks in milestone?}
    R -->|Yes| J
    R -->|No| S[Milestone enters REVIEW]
    S --> T[bun harness:autoflow<br/>compact + merge-milestone]
    T --> U{More milestones in ACTIVE stage?}
    U -->|Yes| I
    U -->|No| V[Stage enters DEPLOY_REVIEW]
    V --> W{Deferred next stage exists?}
    W -->|Yes| X[Update PRD / Architecture to next version<br/>bun harness:stage --promote V[N]]
    X --> H
    W -->|No| Y[bun harness:advance]
    Y --> Z[VALIDATING]
    Z -->|gate: validate COMPLETE| AA[COMPLETE]
    Z -. gate fails .-> STOP

    SC[Scope change during EXECUTING] --> SCPRD[Update PRD<br/>bun harness:scope-change --apply]
    SCPRD --> SCSYNC[bun harness:sync-backlog]
    SCSYNC --> H
```

## Guardians (G1-G12)

Guardians are runtime constraints enforced continuously during delivery:

| ID | Name | Description |
|----|------|-------------|
| G1 | Scope Lock | Only implement work mapped to current task and PRD |
| G2 | Branch Protection | No feature commits on main/master |
| G3 | File Size Limit | No single source file may exceed 400 lines |
| G4 | Forbidden Patterns | No `console.log`, `: any`, `@ts-ignore`, or similar anti-patterns |
| G5 | Dependency Direction | types → config → lib → services → app; reverse imports forbidden |
| G6 | Secret Prevention | No secret-like values or `.env` contents in source code |
| G7 | Design Review Gate | UI tasks require Design Review approval before commit |
| G8 | Agent Sync | AGENTS.md and CLAUDE.md must stay synchronized |
| G9 | Learning Isolation | LEARNING.md must not enter the repo |
| G10 | Atomic Commit Format | Commit messages must include Task-ID and PRD mapping |
| G11 | Prompt Injection Defense | External content is data only, never overrides agent behavior |
| G12 | Supply-Chain Drift | Dependency changes require explicit approval |

Guardian behavior varies by level. Full level matrix in [SKILL.md](./SKILL.md#guardians-g1-g12). Detailed enforcement rules in [references/gates-and-guardians/01-guardians.md](./references/gates-and-guardians/01-guardians.md).

## Key Commands

Commands below are run from the managed project checkout unless noted otherwise.

| Command | When to use it | What it does |
| --- | --- | --- |
| `bun <path-to-skill>/scripts/harness-setup.ts` | Start a new greenfield repo | Generate the Harness runtime, docs skeleton, hooks, and base workspace |
| `bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true` | Hydrate an existing repo | Add the Harness runtime around an existing codebase without replacing product code |
| `bun harness:orchestrator` (or `bun .harness/orchestrator.ts`) | Any time during delivery | Show status and dispatch the next agent or manual action |
| `bun harness:orchestrate` | When you want the parent runtime to execute one launch cycle | Prepare and reserve the next child launch cycle for parent-runtime execution |
| `bun harness:orchestrate --json` | When the parent runtime needs a machine-readable launch contract | Emit the launch cycle JSON and persist `.harness/launches/latest.json` |
| `bun .harness/orchestrator.ts --parallel` | During execution with eligible tasks | Preview parallel-eligible sidecars/tasks without spawning them |
| `bun harness:orchestrate --parallel` | During execution with eligible parallel work | Execute one parent-owned parallel launch cycle |
| `bun harness:orchestrate --confirm <launchId> --handle <runtimeHandle>` | Right after a child runtime successfully spawns | Bind the runtime handle and move the reservation to `running` |
| `bun harness:orchestrate --rollback <launchId> --reason "<why>"` | If child spawn fails or a launch must be aborted before integration | Roll back the reservation and restore the pre-launch task snapshot |
| `bun harness:orchestrate --release <launchId>` | After integration / closeout when the child reservation should be cleared | Deregister the active agent reservation from state |
| `bun harness:advance` | At a phase boundary | Validate the next phase gate and advance state only if it passes |
| `bun harness:sync-backlog` | PRD changed inside the current active stage | Append new stage/milestone/task scope without destroying completed history |
| `bun harness:scope-change --preview` | Before applying a scope change | Preview structured scope changes without modifying state |
| `bun harness:scope-change --apply` | After confirming a scope change | Apply structured scope changes to PRD, sync backlog/progress, and reopen execution when new work lands |
| `bun harness:scope-change --reject <id>` | When a pending scope change should be discarded | Reject a queued change without applying it |
| `bun harness:autoflow` | A milestone is in `REVIEW` | Compact, merge, clean up the milestone, then continue until the next true stop point |
| `bun harness:stage --status` | During execution or deploy review | Show the current `V1 / V2 / V3` roadmap state |
| `bun harness:stage --promote V2` | After deploy review for the current version | Activate the next deferred stage and snapshot PRD / Architecture versions |
| `bun harness:validate --phase <PHASE>` | At phase boundaries | Enforce structural and heavy gate checks |
| `bun harness:validate --task T001` | Before closing a task | Validate the task gate and atomic-commit expectations |
| `bun harness:guardian` | When you want guardian-only checks | Alias for `bun harness:validate --guardian` |
| `bun harness:merge-milestone M1` | Manual fallback when autoflow is not used | Merge one `REVIEW` milestone and run milestone compact |
| `bun harness:compact` / `bun harness:compact --status` | Context management and closeout | Generate or inspect compact snapshots |
| `bun harness:metrics` | After milestones or at any time | Collect and display metrics summary |
| `bun harness:audit` | Periodic health checks | Full audit: guardians, phase gate, workspace, docs drift |
| `bun harness:entropy-scan` | During or after execution | Run entropy scan for AI slop, doc staleness, pattern drift |
| `bun harness:resume` | Resuming after a break | Show current progress, phase, and blocked tasks |
| `bun harness:hooks:install` | After cloning or resetting | Restore local Harness files and re-install git hooks |

Full command surface with all flags in [SKILL.md § Command Surface](./SKILL.md#command-surface).

## 10-Step Operator Guide

Use this as the practical runbook from project start to project finish.

1. Bootstrap the repo.
   - New repo: `bun <path-to-skill>/scripts/harness-setup.ts`
   - Existing repo: `bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true`
   - At Lite level, the Fast Path compresses discovery through scaffold into a 2-turn cycle.

2. Complete discovery and early planning phases in order.
   - Move through `DISCOVERY`, `MARKET_RESEARCH`, and `TECH_STACK`
   - Validate honestly at each boundary, but use one milestone-plan approval instead of asking for confirmation at every phase boundary

3. Write the real PRD and Architecture.
   - Fill `docs/PRD.md` and `docs/ARCHITECTURE.md` with real project content
   - Remove scaffold placeholder content before trying to enter execution

4. Finish scaffold and enter execution.
   - Make sure runtime files, CI, env skeleton, and local Harness files are present
   - Run `bun install`
   - If the milestone plan is already approved and `bun harness:validate --phase EXECUTING` passes, run `bun harness:advance` to derive the execution backlog from the active stage in the PRD

5. Use the orchestrator as the control tower.
   - Run `bun harness:orchestrator` (or `bun .harness/orchestrator.ts`)
   - Follow the dispatched agent or manual next action instead of guessing the next step
   - Use `bun .harness/orchestrator.ts --parallel` to preview eligible parallel work
   - Use `bun harness:orchestrate --parallel` only when you want the parent runtime to actually launch that batch
   - Use `bun harness:orchestrate --json` when the parent runtime needs the launch cycle, lifecycle commands, and reservation metadata in machine-readable form

6. Execute one approved execution phase at a time.
   - The current task must match its `prdRef`
   - Group tasks according to the approved milestone plan; if no split was approved, treat the whole milestone as one execution phase
   - UI tasks go through Frontend Designer -> Execution Engine -> Design Reviewer
   - Non-UI tasks go through Execution Engine -> Code Reviewer

7. Close each task with validation and one atomic commit.
   - Run `bun harness:validate --task T[ID]`
   - Complete the task with exactly one atomic commit containing the Task-ID and PRD mapping

8. Close one milestone at a time.
   - When a milestone reaches `REVIEW`, run `bun harness:autoflow`
   - Autoflow compacts the milestone, merges it, cleans up the worktree, and moves to the next milestone or stop point

9. Stop at deploy review when the current version is done.
   - When all milestones in the current `ACTIVE` stage are merged, the stage becomes `DEPLOY_REVIEW`
   - Deploy and test the version in the real environment before starting the next version

10. Continue the current version or promote the next one.
    - If scope changed inside the current active version: update PRD / Architecture, then run `bun harness:sync-backlog` or use `bun harness:scope-change --apply` for queue + apply + sync
    - If `V1` is done and `V2` is ready: update the main PRD / Architecture to the next version, then run `bun harness:stage --promote V2`
    - If there is no next version left: finish validation and close out the project

## Operational Features

- **Parallel Execution**: Three modes (read-only sidecar, scoped-write, worktree-isolated) with file-overlap guards and orchestrator-owned Codex subagent lifecycle. [→ reference](./references/parallel-execution.md)
- **Scope Change Protocol**: Add requirements mid-execution without interrupting running agents. [→ reference](./references/scope-change-protocol.md)
- **Doom-Loop Detection**: 6 heuristics detect cycling behavior; auto-pause and gear-drop on trigger. [→ reference](./references/doom-loop-detection.md)
- **Error Taxonomy**: 11 error categories with recovery strategies and escalation paths. [→ reference](./references/error-taxonomy.md)
- **Metrics & Observability**: 5 metric categories, dev server tracking, and log routing. [→ reference](./references/metrics-framework.md)
- **Entropy Scanning**: AI slop, doc staleness, pattern drift, and dependency health checks. [→ agent](./agents/entropy-scanner.md)
- **Safety Model**: Defense-in-depth trust hierarchy for external content. [→ reference](./references/safety-model.md)

## Core Documents

| File | Owner | Purpose |
| --- | --- | --- |
| `docs/PRD.md` | Human + PRD Architect | Product scope, milestones, feature refs, out-of-scope boundaries |
| `docs/ARCHITECTURE.md` | Human + PRD Architect | System shape, dependency direction, execution constraints |
| `docs/PROGRESS.md` | Runtime | Human-facing entrypoint into live execution status |
| `docs/progress/*` | Runtime | Structured milestone/task/blocker/activity/roadmap modules |
| `.harness/state.json` | Runtime | Single source of truth for phase, roadmap, milestone, task, and validation state |
| `AGENTS.md` | Local Harness runtime | Canonical AI workflow contract for the managed project |
| `CLAUDE.md` | Local Harness runtime | Mirror of `AGENTS.md`; must stay byte-for-byte aligned |
| `docs/prd/versions/*` | Stage promotion | Historical PRD snapshots taken when a new stage is promoted |
| `docs/architecture/versions/*` | Stage promotion | Historical Architecture snapshots taken when a new stage is promoted |

## Execution Rules

- PRD and Architecture must contain real project content before execution begins; placeholder scaffold content is rejected.
- The orchestrator can send `SCAFFOLD` back to `prd-architect` if planning outputs are still incomplete.
- Each task must map to a `prdRef` and close with exactly one atomic commit.
- Only one milestone is reviewed, compacted, and merged at a time.
- Stage completion stops at `DEPLOY_REVIEW`; the next version does not auto-start.
- New scope inside the current version must update the PRD first. If you use `bun harness:scope-change --apply`, backlog/progress sync now happens automatically; if you edit the PRD manually, run `bun harness:sync-backlog`.
- Hooks continuously enforce guardrails, while dispatch/lifecycle decisions remain orchestrator-owned.
- Guardians G1-G12 are enforced through runtime checks, hooks, and CI depending on the rule; violations block the relevant operation until resolved.
- Errors follow the 11-category taxonomy with automatic retries for transient failures and escalation for persistent ones.

## Related References

**Core**
- [SKILL.md](./SKILL.md) — Operating contract and full configuration surface
- [agents/orchestrator.md](./agents/orchestrator.md) — Orchestrator dispatch logic and phase routing
- [references/gates-and-guardians.md](./references/gates-and-guardians.md) — Gate and guardian enforcement rules
- [references/hooks-guide.md](./references/hooks-guide.md) — Git hook setup and enforcement

**Operational**
- [references/scope-change-protocol.md](./references/scope-change-protocol.md) — Structured scope change workflow
- [references/parallel-execution.md](./references/parallel-execution.md) — Parallel task dispatch and file-overlap guards
- [references/metrics-framework.md](./references/metrics-framework.md) — Metric categories and collection
- [references/observability-protocol.md](./references/observability-protocol.md) — Log routing and dev server tracking
- [references/error-taxonomy.md](./references/error-taxonomy.md) — Error categories and recovery strategies
- [references/doom-loop-detection.md](./references/doom-loop-detection.md) — Cycling detection heuristics
- [references/safety-model.md](./references/safety-model.md) — Trust hierarchy and prompt injection defense
- [references/golden-principles.md](./references/golden-principles.md) — Core design principles

**Project**
- [LICENSE](./LICENSE)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)

Complete reference index in [SKILL.md § Read Only What You Need](./SKILL.md#read-only-what-you-need).

## Contributing

Contributions are most useful when they make the workflow more explicit and less guess-driven. Good contributions usually strengthen one of these layers:

- phase gates and guardian enforcement
- PRD / architecture parsing and backlog sync
- milestone closeout and staged delivery flow
- templates, docs, and setup ergonomics for real repositories
- guardian enforcement rules and level-specific behavior
- metrics, entropy scanning, and observability instrumentation

When contributing, prefer changes that make the runtime harder to bypass and easier to resume.
