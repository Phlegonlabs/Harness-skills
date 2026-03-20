# Agent Interaction Model

## Purpose

Define durable agent-to-agent dependencies, dispatch routing, stage handoffs, and concurrent child-agent behavior. Logical agents never call each other directly; the Orchestrator owns all runtime-native child dispatch.

## Dependency Graph

```text
project-discovery -> market-research -> tech-stack-advisor -> prd-architect -> scaffold-generator -> execution-engine
fast-path-bootstrap ---------------------------------------> execution-engine

UI execution:
frontend-designer -> execution-engine -> design-reviewer

Non-UI execution:
execution-engine -> code-reviewer

Milestone boundary:
entropy-scanner -> orchestrator merge decision

Closeout:
execution-engine -> harness-validator -> context-compactor
```

## Per-Agent I/O

| Agent | Reads | Produces | Durable write channel |
|-------|------|----------|-----------------------|
| `project-discovery` | User answers, questionnaire, state | `projectInfo` fields | `state.json` |
| `market-research` | `projectInfo`, user guidance | research summary, competitors, tech signals | `state.json`, optional ADR context |
| `tech-stack-advisor` | `projectInfo`, `marketResearch` | confirmed stack decisions, ADRs | `state.json`, `docs/adr/` |
| `prd-architect` | stack decisions, ADRs, project goals | PRD, Architecture, supporting planning docs | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/gitbook/` |
| `scaffold-generator` | PRD, Architecture, toolchain | Harness runtime, hooks/config, docs baseline | filesystem, `state.json` |
| `fast-path-bootstrap` | concept description, ecosystem signals | minimal PRD, Architecture, scaffold | filesystem, `state.json` |
| `frontend-designer` | PRD/Architecture design context, current milestone | design system, milestone UI spec, prototypes | `docs/design/` |
| `execution-engine` | current task packet, PRD refs, Architecture refs, design refs for UI tasks | code, validation results, atomic commit | codebase, git history, `state.json`, `docs/PROGRESS.md` |
| `design-reviewer` | design artifacts, implemented UI | review verdict | commit message/checklist |
| `code-reviewer` | PRD/Architecture constraints, changed code | review verdict | commit message/checklist |
| `entropy-scanner` | codebase, previous scan, milestone context | entropy report | `.harness/reports/` |
| `harness-validator` | state plus all required artifacts | validation report and score | `state.json` |
| `context-compactor` | state, progress docs, recent workflow history | context snapshot | `docs/progress/CONTEXT_SNAPSHOT.md` |

## Shared Channels

Durable handoff is limited to three channels:

- `state.json`
- Filesystem artifacts
- Git history and commit metadata

Transient parent-to-child follow-ups are allowed, but they are coordination mechanics, not durable workflow state.

## Dispatch Tree

### Phase Routing

```text
DISCOVERY      -> fast-path-bootstrap (Lite) | project-discovery
MARKET_RESEARCH-> market-research until ready, then manual advance
TECH_STACK     -> tech-stack-advisor until ready, then manual advance
PRD_ARCH       -> prd-architect until ready, then manual advance
SCAFFOLD       -> prd-architect if planning is incomplete | scaffold-generator otherwise
EXECUTING      -> see task routing below
VALIDATING     -> harness-validator until gate passes
COMPLETE       -> stage promotion guidance or context-compactor
```

### EXECUTING Routing

```text
1. DEPLOY_REVIEW? -> manual deploy/test/promotion guidance
2. Backlog behind PRD? -> manual sync-backlog
3. No current milestone and milestone in REVIEW? -> manual autoflow / merge-milestone
4. Current milestone is REVIEW? -> manual merge/closeout guidance
5. Pending scope changes? -> surface them before dispatch
6. UI task missing design artifacts? -> frontend-designer
7. BLOCKED task? -> surface next executable task or manual intervention
8. retryCount >= 3? -> escalate for manual intervention
9. UI task ready? -> execution-engine, then --review
10. Non-UI task ready? -> execution-engine, then --code-review
```

## Task-Type Data Flow

### UI Tasks

```text
Orchestrator
  -> Frontend Designer
  -> Execution Engine
  -> Design Reviewer
  -> completeTask()
```

Rules:

- `docs/design/DESIGN_SYSTEM.md` is project-wide and created once.
- `docs/design/{milestone-id-lowercase}-ui-spec.md` is milestone-scoped.
- UI implementation never starts without both files.
- Completion requires `Design Review: ✅` in the atomic commit message.

### Non-UI Tasks

```text
Orchestrator
  -> Execution Engine
  -> Code Reviewer
  -> completeTask()
```

Completion requires `Code Review: ✅` in the atomic commit message.

### Spike Tasks

```text
Orchestrator
  -> Execution Engine spike workflow
  -> spike gate validation
```

Required outputs are evaluation notes plus an ADR or equivalent decision record. `LEARNING.md` stays in the user-level knowledge base, not the repo.

## Stage Boundary Handoffs

When a delivery stage changes state:

- `DEFERRED -> ACTIVE`: promote with `bun harness:stage --promote V[N]`, snapshot PRD/Architecture versions, then materialize the next stage backlog
- `ACTIVE -> DEPLOY_REVIEW`: stop execution, surface deployment checklist, wait for human validation
- milestone `REVIEW -> MERGED`: run entropy scan, compact, validate, merge in order

## Approval Model

- The default human approval stop is the current milestone plan, not each task or runtime phase boundary.
- A milestone plan review should include acceptance criteria, task breakdown, and any user-requested execution-phase split.
- After that approval, execution phases run autonomously until the phase completes or a blocker requires a decision.
- Deploy review, scope change, architecture change, and risky dependency changes still require human confirmation.

## Level Impact

| Phase area | Lite | Standard | Full |
|------------|------|----------|------|
| Discovery pacing | Fast Path or 1-2 questions/turn | 2-3 questions/turn | 1 question/turn |
| Market research | skipped | optional | required |
| Stack negotiation | infer + confirm | batch | sequential by layer |
| PRD / Architecture | minimal single-file | full single-file | modular |
| Scaffold size | ~5-8 files | ~25-35 files | 60+ files |
| Final validation | 8 critical items, score reported | 15 critical items, score reported | 19 critical items, score threshold enforced |

## Concurrent Child-Agent Flow

When parallel execution is enabled:

- The Orchestrator maintains `execution.activeAgents[]`, `ownershipScope`, runtime handle, and state version.
- Children still communicate durably only through state/filesystem/git.
- Scoped-write batches require disjoint `affectedFiles`.
- Worktree-isolated writes use separate milestone worktrees.
- `dispatchParallel()` is planning-only; `bun harness:orchestrate --parallel` owns actual spawn/wait/close behavior.
- Each launch cycle is persisted under `.harness/launches/`, and the parent runtime must drive `--confirm`, `--rollback`, or `--release` to keep child lifecycle state aligned.

## Core Invariants

- The Orchestrator is the only hub.
- PRD-first scope control applies before any new execution work.
- Hooks are guardrails, not lifecycle control.
- Parallelism may change child count, but not routing invariants or review requirements.
