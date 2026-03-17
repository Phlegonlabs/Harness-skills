# Contributing to Harness Engineering and Orchestrator

Thanks for contributing. This project is most useful when the workflow becomes more explicit, more resumable, and harder for agents to bypass.

## What Good Contributions Look Like

Good pull requests usually improve one of these areas:

- phase gates and guardian enforcement
- PRD / Architecture parsing and backlog synchronization
- milestone closeout, compact, and staged delivery flow
- setup and hydration for real repositories
- templates and docs that make the workflow easier to adopt

Prefer changes that tighten the runtime contract instead of weakening it.

## Local Development

Clone the repository and work from the repo root:

```bash
git clone <repository-url>
cd Harness-Engineering-skills
```

Most changes to this skill live under:

- `harness-engineering-orchestrator/agents/`
- `harness-engineering-orchestrator/references/`
- `harness-engineering-orchestrator/scripts/`
- `harness-engineering-orchestrator/templates/`

## Before Opening a PR

For runtime or orchestrator changes, run the focused test suite from the repo root:

```bash
bun test harness-engineering-orchestrator/references/runtime/backlog.test.ts
bun test harness-engineering-orchestrator/references/runtime/stage.test.ts
bun test harness-engineering-orchestrator/references/runtime/orchestrator/milestone-closeout.test.ts
bun test harness-engineering-orchestrator/references/runtime/orchestrator/phase-readiness.test.ts
bun test harness-engineering-orchestrator/references/runtime/progress.test.ts
```

Then check patch hygiene:

```bash
git diff --check
```

If your change only touches docs, call that out clearly in the PR.

## PR Expectations

- Keep changes scoped to one behavioral improvement where possible.
- Update docs when runtime behavior changes.
- Add or adjust tests for gate changes, backlog parsing changes, or orchestration changes.
- Do not loosen guardrails without making the tradeoff explicit in the PR description.
- Do not describe behavior in docs that the runtime does not actually implement.

## Review Standard

Changes are easier to review when the PR explains:

- what operator problem or failure mode existed before
- what changed in the runtime or docs
- how the new behavior is validated
- what constraints or assumptions remain

## Security and Reporting

For security issues, do not open a public issue first. Follow [SECURITY.md](./SECURITY.md).
