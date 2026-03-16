## 03. Task and Milestone Gates

### Task Gate

All of the following items must pass for a task to be considered complete:

> The runtime automatically writes the checklist back to `.harness/state.json` during `completeTask()` and `bun harness:validate --task T[ID]`.

- PRD DoD achieved
- `typecheck`
- `lint`
- `format:check`
- `test`
- `build`
- File line count <= 400
- No blocking banned patterns (`console.log` / `: any` / `@ts-ignore` / `sk-...` / `Bearer ...` / `ghp_...`)
- Atomic Commit completed
- `docs/PROGRESS.md` and `docs/progress/` updated

### Task Gate Enforcement

The task gate is mechanically enforced in `completeTask()`. Critical checklist items (`typecheckPassed`, `lintPassed`, `testsPassed`, `buildPassed`, `fileSizeOk`, `noForbiddenPatterns`) must pass before a task can transition to DONE.

| Level | Behavior |
|-------|----------|
| Lite | Warn if checklist is missing or critical items fail; task still completes |
| Standard | Block if checklist is missing or any critical item fails |
| Full | Block if checklist is missing or any critical item fails |

Run `bun harness:validate --task T[ID]` to populate the task checklist before calling `completeTask()`.

### UI Task Additional Requirements

- Design Review passed
- Commit message contains `Design Review: ✅`

### Spike Gate

- LEARNING.md written
- ADR generated

### Milestone Gate

- All task statuses are `DONE` / `SKIPPED`
- `typecheck` / `lint` / `format:check` / `test` / `build` succeed
- Test coverage meets target
- G3: All src files <= 400 lines
- G4: Warnings are allowed but will be flagged; blocking patterns cause immediate failure
- G8: `AGENTS.md` and `CLAUDE.md` hashes match
- CHANGELOG and guide updated
- `compactCompleted` must be true before milestone transitions to MERGED

### Milestone Gate Enforcement

The milestone gate is mechanically enforced in `completeMilestone()`. The `MilestoneChecklist` (13 items) must be populated via `validateMilestone()` before merge. Critical items: `allTasksComplete`, `typecheckPassed`, `lintPassed`, `testsPassed`, `buildPassed`, `noBlockingForbiddenPatterns`, `agentsMdSynced`, `changelogUpdated`. At Full level, `gitbookGuidePresent` is also required. At Standard/Full, `compactCompleted` must be true.

| Level | Behavior |
|-------|----------|
| Lite | Warn if checklist is missing or critical items fail; milestone still merges |
| Standard | Block if checklist is missing, any critical item fails, or compact not completed |
| Full | Block if checklist is missing, any critical item fails, compact not completed, or GitBook guide missing |

The prescribed command sequence for milestone merge is: compact → validate → complete. Both `harness:autoflow` and `harness:merge-milestone` execute this sequence automatically.
