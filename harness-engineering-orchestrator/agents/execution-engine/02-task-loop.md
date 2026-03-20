## 02. Task Loop

### Purpose

Execute a standard functional Task and ensure each Task concludes with an Atomic Commit.

### Standard Flow

1. Pre-check
2. Implementation
3. Self-validation — Run `bun harness:validate --task T[ID]` before completing. At Standard/Full levels, `completeTask()` will reject tasks with failing critical checklist items (typecheck, lint, tests, build, file size, forbidden patterns).
4. Atomic Commit
5. Update `.harness/state.json`
6. Update `docs/PROGRESS.md` + `docs/progress/`
7. Switch to the next Task or mark the Milestone as entering Review

### Implementation Rules

- Only implement the current Task. If the user adds new scope that is not covered by the current Task / `prdRef`, stop and return to PRD update + `bun harness:sync-backlog` first.
- If the request belongs to a future delivery version (`V2` or later), keep it deferred until the next version is explicitly promoted.
- If the current milestone has an approved execution-phase split, continue through all tasks in the current phase without pausing for implementation-level approval.
- Dependency direction is fixed: `types -> config -> lib -> services -> app`
- Split files immediately when they exceed 400 lines
- Prohibited: `console.log`, `: any`, `@ts-ignore`
- No workarounds, no unnecessary compatibility layers
- Async logic must have error handling
- Status updates are progress reports only unless a blocker, scope change, or risky dependency decision requires escalation

### Doom-Loop Detection

If the same task fails repeatedly, follow this escalation:

1. **Attempt 1-3** — Fix the error and retry with incremental changes
2. **After 3 failures** — Try a fundamentally different approach (different algorithm, different library, different architecture). Document the approach change.
3. **After different approach fails** — Escalate to the user with:
   - Summary of all attempts and their failure modes
   - Root cause analysis
   - Proposed alternatives that require user input

Reference `references/error-taxonomy.md` for known error categories and suggested remediation paths.

Do not loop indefinitely. The 3-retry limit is hard — after exhausting retries and an alternative approach, the task must be escalated or blocked.

### Scope Change Awareness

Before dispatching into the implementation step, check `state.execution.pendingScopeChanges`:
- If any scope changes have `status: "pending"`, do not start — return to orchestrator
- This prevents implementing work that is about to be invalidated by pending scope changes

### G12 Dependency Approval Check

Before adding or updating any dependency:
1. Check if the dependency change is already approved in the current task's scope
2. If adding a new dependency not in the original task scope, flag it for review
3. At Standard/Full levels, manifest/lockfile changes are scanned by the pre-commit hook
4. At Lite level, dependency changes produce a warning but do not block

### Task Output Format

```text
Executing T[ID]: [TASK_NAME]
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

### Parallel Context

When running as a parallel agent (dispatched via `--parallel`), observe these additional rules:

**OCC Writes:**
- All state mutations must use `withStateTransaction()` from `runtime/state-io.ts`
- On `ConcurrencyConflictError`, the runtime retries automatically (up to 3 times)
- Do not cache state between operations — always re-read before mutating

**Affected Files Scope:**
- The orchestrator provides an `affectedFiles` scope constraint in `inlineConstraints`
- Only modify files listed in the current task's `affectedFiles`
- If you discover a needed change outside scope, stop and report it as a blocker

**No Auto-Advance:**
- After completing a task, do not call `activateNextTask()` directly
- The orchestrator re-evaluates eligible tasks on the next dispatch cycle
- Simply call `completeTask()` — the orchestrator handles sequencing
