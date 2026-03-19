# Autoflow Algorithm

## Overview

The autoflow loop (`bun harness:autoflow`, backed by `bun .harness/orchestrator.ts --auto`) is conservative. It advances only when the current phase outputs already exist on disk, and it stops as soon as a human or agent decision is required.

It does **not** execute phase agents for you. Its job is to:

- advance phases whose gates are already satisfied
- run scaffold closeout commands once scaffold outputs exist
- auto-close `REVIEW` milestones during `EXECUTING`
- stop at real boundaries such as missing artifacts, deploy review, or unfinished execution

The loop caps at 12 iterations (`AUTOFLOW_MAX_STEPS = 12`).

## Per-Phase Behavior

| Phase | Behavior |
|-------|----------|
| `DISCOVERY`, `MARKET_RESEARCH`, `TECH_STACK`, `PRD_ARCH` | If phase readiness is satisfied, run `bun harness:advance` and continue. Otherwise stop and surface the missing outputs / next agent. |
| `SCAFFOLD` | If scaffold readiness is satisfied, run `bun install`, `bun harness:env`, `bun .harness/init.ts --from-prd`, and `bun harness:validate --phase EXECUTING`, then stop at the boundary. |
| `EXECUTING` | If a milestone is already in `REVIEW`, run `bun harness:merge-milestone M[N]` and continue. Otherwise stop at unfinished execution, deploy review, or deferred-stage boundaries. |
| `VALIDATING` | Try `bun harness:advance`; stop and surface the boundary if it fails. |
| `COMPLETE` | Run `bun harness:compact`, then `bun harness:compact:status`, then stop. |

## Stop Conditions

Autoflow stops when:

- required outputs for the current phase are missing
- execution still needs an agent dispatch or human action
- the active product stage is in `DEPLOY_REVIEW`
- deferred stages remain after execution
- the loop reaches the 12-step safety cap

When autoflow stops, it prints the current phase, missing outputs if any, and the next agent or manual action from the dispatcher.

## Invocation

```bash
bun harness:autoflow
```
