# Contributing to Harness Skills

Thanks for contributing. This repository is meant to grow into a multi-skill catalog, so contributions should improve either the shared repository shape or a specific skill package without making the workflow harder to reason about.

## Repository Structure

Each installable skill should live in its own top-level directory. Today the main published package is:

- `harness-engineering-orchestrator/`

Over time, this repository may include additional domain-specific skills such as engineering, marketing, research, or other repo-backed workflows.

## What Good Contributions Look Like

Good pull requests usually do one of these:

- add or improve a skill package
- improve installability or documentation at the repository level
- strengthen runtime gates, hooks, or validation behavior
- improve templates, references, or onboarding docs
- clarify operator workflows so the documented behavior matches the real implementation

Prefer small, decision-clear pull requests over broad refactors.

## Before Opening a PR

1. Keep the change scoped.
2. Update docs if behavior changes.
3. From the repo root, run the same validation chain used by the PR CI:

```bash
node scripts/validate-repo.mjs
```

4. If you changed workflow logic, setup scaffolding, or cross-platform behavior, also run the Windows matrix manually when practical:

```powershell
pwsh -File harness-engineering-orchestrator/scripts/e2e/run-matrix.ps1
```

For a faster local loop inside `harness-engineering-orchestrator/`, run focused tests from the repo root:

```bash
bun test harness-engineering-orchestrator/references/runtime/backlog.test.ts
bun test harness-engineering-orchestrator/references/runtime/stage.test.ts
bun test harness-engineering-orchestrator/references/runtime/orchestrator/milestone-closeout.test.ts
bun test harness-engineering-orchestrator/references/runtime/orchestrator/phase-readiness.test.ts
bun test harness-engineering-orchestrator/references/runtime/progress.test.ts
bun test harness-engineering-orchestrator/references/runtime/public-docs.test.ts
bun test harness-engineering-orchestrator/references/runtime/toolchain-detect.test.ts
bun test harness-engineering-orchestrator/references/runtime/execution.parallel.test.ts
bun test harness-engineering-orchestrator/references/runtime/orchestrator/parallel-dispatch.test.ts
bun test harness-engineering-orchestrator/references/runtime/hooks/check-guardian.test.ts
bun test harness-engineering-orchestrator/references/runtime/hooks/install-git-hooks.test.ts
bun test harness-engineering-orchestrator/scripts/setup/core.test.ts
```

## PR Expectations

- Explain what problem existed before.
- Explain what changed.
- State how the change was validated.
- Avoid documenting behavior that the runtime does not actually implement.
- Do not weaken guardrails without making the tradeoff explicit.

## Adding a New Skill

See [docs/new-skill-guide.md](./docs/new-skill-guide.md) for the complete process of adding a new skill package to this repository.

## Security

For security reports, do not open a public issue first. Use the process in [SECURITY.md](./SECURITY.md).
