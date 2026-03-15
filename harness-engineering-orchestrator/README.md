# Harness Engineering and Orchestrator

Harness Engineering and Orchestrator is a runtime-managed delivery workflow for turning an idea or an existing repository into a controlled loop:

`PRD -> Architecture -> Scaffold -> Milestone -> Task -> Validation -> Release`

This README is the high-level map of the current system. The operating contract still lives in [SKILL.md](./SKILL.md) and [agents/orchestrator.md](./agents/orchestrator.md).

## System Model

The workflow has two layers:

- Runtime `phase`: `DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE`
- Product `stage`: `V1 / V2 / V3`, tracked inside `roadmap`, with exactly one `ACTIVE` stage at a time

Important invariants:

- Setup creates the full docs and runtime skeleton up front.
- Gates decide whether content is truly complete; file existence alone is not enough.
- Only the current `ACTIVE` stage is materialized into execution backlog.
- Future stages stay `DEFERRED` until explicit promotion.

## End-to-End Flow

```mermaid
flowchart TD
    A[Setup / Hydration<br/>Generate .harness, agents, docs skeleton, hooks] --> B[DISCOVERY]
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

    PRDCHANGE[PRD scope changes inside current ACTIVE stage] --> PRDSYNC[bun harness:sync-backlog]
    PRDSYNC --> H
```

## Key Commands

Commands below are run from the managed project checkout unless noted otherwise.

| Command | When to use it | What it does |
| --- | --- | --- |
| `bun <path-to-skill>/scripts/harness-setup.ts` | Start a new greenfield repo | Generate the Harness runtime, docs skeleton, hooks, and base workspace |
| `bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true` | Hydrate an existing repo | Add the Harness runtime around an existing codebase without replacing product code |
| `bun .harness/orchestrator.ts` | Any time during delivery | Show status and dispatch the next agent or manual action |
| `bun harness:advance` | At a phase boundary | Validate the next phase gate and advance state only if it passes |
| `bun harness:sync-backlog` | PRD changed inside the current active stage | Append new stage/milestone/task scope without destroying completed history |
| `bun harness:autoflow` | A milestone is in `REVIEW` | Compact, merge, clean up the milestone, then continue until the next true stop point |
| `bun harness:stage --status` | During execution or deploy review | Show the current `V1 / V2 / V3` roadmap state |
| `bun harness:stage --promote V2` | After deploy review for the current version | Activate the next deferred stage and snapshot PRD / Architecture versions |
| `bun harness:validate --phase <PHASE>` | At phase boundaries | Enforce structural and heavy gate checks |
| `bun harness:validate --task T001` | Before closing a task | Validate the task gate and atomic-commit expectations |
| `bun harness:merge-milestone M1` | Manual fallback when autoflow is not used | Merge one `REVIEW` milestone and run milestone compact |
| `bun harness:compact` / `bun harness:compact --status` | Context management and closeout | Generate or inspect compact snapshots |

## 10-Step Operator Guide

Use this as the practical runbook from project start to project finish.

1. Bootstrap the repo.
   - New repo: `bun <path-to-skill>/scripts/harness-setup.ts`
   - Existing repo: `bun <path-to-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true`

2. Complete discovery and early planning phases in order.
   - Move through `DISCOVERY`, `MARKET_RESEARCH`, and `TECH_STACK`
   - At each boundary, run `bun harness:validate --phase <NEXT_PHASE>` and then `bun harness:advance`

3. Write the real PRD and Architecture.
   - Fill `docs/PRD.md` and `docs/ARCHITECTURE.md` with real project content
   - Remove scaffold placeholder content before trying to enter execution

4. Finish scaffold and enter execution.
   - Make sure runtime files, CI, env skeleton, and local Harness files are present
   - Run `bun install`
   - Run `bun harness:advance` to derive the execution backlog from the active stage in the PRD

5. Use the orchestrator as the control tower.
   - Run `bun .harness/orchestrator.ts`
   - Follow the dispatched agent or manual next action instead of guessing the next step

6. Execute one task at a time.
   - The current task must match its `prdRef`
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
   - If scope changed inside the current active version: update PRD / Architecture, then run `bun harness:sync-backlog`
   - If `V1` is done and `V2` is ready: update the main PRD / Architecture to the next version, then run `bun harness:stage --promote V2`
   - If there is no next version left: finish validation and close out the project

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
- New scope inside the current version must update the PRD first, then run `bun harness:sync-backlog`.
- Hooks continuously enforce the guardrails, while phase gates enforce boundary checks.

## Related References

- [SKILL.md](./SKILL.md)
- [agents/orchestrator.md](./agents/orchestrator.md)
- [references/gates-and-guardians.md](./references/gates-and-guardians.md)
- [references/hooks-guide.md](./references/hooks-guide.md)
