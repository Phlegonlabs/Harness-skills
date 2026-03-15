## 02. Task Loop

### Purpose

Execute a standard functional Task and ensure each Task concludes with an Atomic Commit.

### Standard Flow

1. Pre-check
2. Implementation
3. Self-validation
4. Atomic Commit
5. Update `.harness/state.json`
6. Update `docs/PROGRESS.md` + `docs/progress/`
7. Switch to the next Task or mark the Milestone as entering Review

### Implementation Rules

- Only implement the current Task. If the user adds new scope that is not covered by the current Task / `prdRef`, stop and return to PRD update + `bun harness:sync-backlog` first.
- If the request belongs to a future delivery version (`V2` or later), keep it deferred until the next version is explicitly promoted.
- Dependency direction is fixed: `types → config → lib → services → app`
- Split files immediately when they exceed 400 lines
- Prohibited: `console.log`, `: any`, `@ts-ignore`
- No workarounds, no unnecessary compatibility layers
- Async logic must have error handling

### Task Output Format

```text
⚙️ Executing T[ID]: [TASK_NAME]
Goal: [What this Task should accomplish]
PRD Reference: [PRD#F00X]
Impact Scope: [Up to 5 files]

Validation Results:
- typecheck
- lint
- test
- build
- PRD DoD

Atomic Commit:
- Task-ID
- Closes: PRD#F[ID]
- Exactly one HEAD commit for the current Task before `completeTask()`
```

### Completion Contract

After completing a Task, the following two locations must be kept in sync:

- `.harness/state.json`
- `docs/PROGRESS.md` + `docs/progress/`

### Milestone Review Phase Checklist

When the last Task in a Milestone is complete and the Milestone enters the Review phase:

1. **Update GitBook guide** — ensure the user-facing documentation in `docs/guide/` reflects all features delivered in this Milestone
2. **Add CHANGELOG entry** — append a summary of changes to `CHANGELOG.md` under the current version/milestone heading
3. **Update API reference** — if the Milestone introduced or modified API endpoints, update `docs/api/` or the relevant API reference documentation
4. **Merge milestone** — Return to the main worktree and run `bun harness:autoflow` to auto-compact and merge the REVIEW milestone. If more milestones remain in the same delivery version, execution continues there. If the current delivery version is fully merged, the workflow stops at deploy review until the next version is promoted. Manual fallback: `bun harness:merge-milestone M[N]`
