# Deployment Workflow

## DEPLOY_REVIEW Checklist

When a product stage enters `DEPLOY_REVIEW`, verify all 7 items before promoting the next deferred stage or closing out the final release:

| # | Check | Verification Method |
|---|-------|-------------------|
| 1 | Build verification | Run the configured build command from the active toolchain on the main branch with all stage milestones merged |
| 2 | Full test suite | Run the configured test command from the active toolchain on the main branch |
| 3 | Environment configuration | `.env.example` is current; all required variables documented |
| 4 | Migration readiness | Database migrations (if any) are reversible and tested |
| 5 | Dependency audit | No known critical vulnerabilities in dependencies |
| 6 | Documentation review | `docs/gitbook/` is current; CHANGELOG includes all milestone summaries |
| 7 | Performance verification | Lighthouse / bundle size within budget (web projects) |

## Release Notes Template

```
## [V{N}] - {date}

### Milestones
{for each milestone in stage}
- **{milestone.name}** — {task count} tasks completed
  {for each task} - {task.name} ({task.prdRef}) {end}
{end}

### Technical Changes
- Dependencies: {added/removed/updated count}
- Files changed: {count across all milestone branches}

### Known Issues
- {any tasks with status SKIPPED, with blockedReason}
```

## Deployment Verification Protocol

| Step | Action |
|------|--------|
| 1 | Smoke test confirmation — user confirms deployed app is accessible |
| 2 | Health check — API project: health endpoint returns 200 |
| 3 | Rollback readiness — confirm rollback procedure exists |
| 4 | Stage completion — promote with `bun harness:stage --promote V[N+1]` if another stage exists; otherwise proceed to final closeout |

## Stage Rollback Procedure

| Step | Action |
|------|--------|
| 1 | Revert deployment to previous known-good state |
| 2 | Create remediation tasks in current stage (do not promote) |
| 3 | Re-run milestone validation after fixes |
| 4 | Re-enter DEPLOY_REVIEW when all remediation tasks complete |

See also: [version-history.md](./version-history.md), `harness-stage.ts`
