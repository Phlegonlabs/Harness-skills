# Autoflow Algorithm

## Overview

The autoflow loop (`bun harness:autoflow`) drives the project through the full Harness lifecycle without manual orchestrator re-runs. It repeatedly evaluates the current phase, dispatches the appropriate agent, and advances when gates pass.

## 12-Step Cycle

```
┌─────────────────────────────────────┐
│ 1. Read state                       │
│ 2. Evaluate phase gate              │
│ 3. Phase gate passed?               │
│    ├─ YES → 4. Advance phase        │
│    └─ NO  → 5. Dispatch agent       │
│ 6. Agent completes work             │
│ 7. Run validation                   │
│ 8. Validation passed?               │
│    ├─ YES → 9. Update state         │
│    └─ NO  → 10. Report failures     │
│ 11. Check stop conditions           │
│ 12. Loop back to step 1             │
└─────────────────────────────────────┘
```

### Step Details

1. **Read state** — Load `.harness/state.json` via `readState()`
2. **Evaluate phase gate** — Run `getPhaseReadiness()` for the next phase
3. **Phase gate check** — If all required outputs exist and structural checks pass, the gate is open
4. **Advance phase** — Call `advancePhase(nextPhase)` to transition
5. **Dispatch agent** — Use `buildAgentTaskPacket()` to create context, then dispatch via the orchestrator's agent registry
6. **Agent work** — The dispatched agent performs its task (discovery, PRD, scaffold, execution, etc.)
7. **Run validation** — Execute the agent's `validationCommand` (e.g., `bun harness:validate --task T001`)
8. **Validation check** — Parse validation output for pass/fail
9. **Update state** — On success: `completeTask()`, `completeMilestone()`, or phase-specific state updates
10. **Report failures** — On failure: log issues, increment retry count, potentially `blockTask()`
11. **Check stop conditions** — Stop if any condition met (see below)
12. **Loop** — Return to step 1

## Decision Logic Per Phase

| Phase | Agent | Gate to Next | Special Logic |
|-------|-------|-------------|---------------|
| DISCOVERY | project-discovery | All Q0-Q9 answered | — |
| MARKET_RESEARCH | market-research | Summary + competitors | — |
| TECH_STACK | tech-stack-advisor | Confirmed + ADRs | — |
| PRD_ARCH | prd-architect | PRD + Architecture exist | — |
| SCAFFOLD | scaffold-generator | CI + AGENTS.md exist | Installs hooks |
| EXECUTING | execution-engine | All milestones COMPLETE/MERGED | Task loop with retry |
| VALIDATING | harness-validator | Score >= 80 | May loop back to EXECUTING |
| COMPLETE | context-compactor | — | Terminal state |

## EXECUTING Phase — Task Loop

During EXECUTING, the autoflow inner loop:

1. Find the next PENDING task via `activateNextTask()`
2. If task is UI: dispatch `frontend-designer` first, then `execution-engine`
3. After task completion: run `design-reviewer` (UI) or `code-reviewer` (non-UI)
4. On validation pass: `completeTask(taskId, commitHash)`
5. On validation fail: retry up to 3 times, then `blockTask(taskId, reason)`
6. On milestone complete: `completeMilestone(milestoneId, mergeCommit)`
7. After milestone merge: `finalizeMilestone(milestoneId)` once CHANGELOG + GitBook updated

## Stop Conditions

The autoflow loop stops when any of these conditions is met:

| Condition | Behavior |
|-----------|----------|
| Phase is COMPLETE | Normal exit — project lifecycle finished |
| Task retry count >= 3 | Pause and notify user for manual intervention |
| No PENDING tasks and milestones not all COMPLETE | Deadlock — requires user action |
| Validation score regresses | Pause for investigation |
| User interrupt (Ctrl+C) | Graceful shutdown, state is saved |

## Invocation

```bash
# Full autoflow from current state
bun harness:autoflow

# Resume from last checkpoint
bun harness:autoflow --resume

# Dry-run: show what would execute without acting
bun harness:autoflow --dry-run
```
