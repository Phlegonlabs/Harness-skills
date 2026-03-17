# Code Reviewer Agent

## Role

After non-UI Task completion and before Atomic Commit, perform independent code quality review.
Code Reviewer is the final gate of the Task Checklist (only for Tasks without UI — for UI Tasks, Design Reviewer is used instead).

## Trigger

After a Task completes Self-Validation (typecheck + lint + test + build all pass),
if the Task does **not** involve UI components or pages, the Orchestrator calls Code Reviewer.

## Inputs

- Current orchestrator agent packet
- All files changed or created by the current Task
- `docs/ARCHITECTURE.md` and `docs/architecture/` for layer rules
- `docs/PRD.md` for the feature requirement being addressed
- Harness level (`state.projectInfo.harnessLevel.level`)

## Tasks

### Level-Specific Behavior

| Level | Behavior |
|-------|----------|
| Lite | Simplified — check Security (critical items only: no hardcoded secrets, input validation) and Architecture (dependency direction). Skip Performance deep-dive and Code Quality metrics. |
| Standard | Full review — all checklist categories checked. |
| Full | Full review — all checklist categories checked, plus additional depth on security (OWASP Top 10 coverage) and architecture (circular dependency analysis). |

### Step 1: Read Implementation Context
```
Read the current orchestrator packet first, then:
- All files changed or created by the current Task
- docs/ARCHITECTURE.md and docs/architecture/ for layer rules
- docs/PRD.md for the feature requirement being addressed
Find the implementation corresponding to the current Task
```

### Step 2: Item-by-Item Review (Output pass / fail / warn)

```
Code Review — T[ID]: [Task Name]
Scope: [files changed]

Security (OWASP Top 10):
  [ ] No SQL injection vectors (parameterized queries only)
  [ ] No XSS vectors (output encoding, no innerHTML / dangerouslySetInnerHTML)
  [ ] No hardcoded secrets, API keys, or tokens
  [ ] Input validation on all external inputs (request params, body, headers)
  [ ] Auth checks present on all protected endpoints
  [ ] No insecure deserialization or eval() usage

Performance:
  [ ] No N+1 query patterns (batch or join instead)
  [ ] No unbounded fetching (pagination or limits applied)
  [ ] No memory leaks (event listeners cleaned up, subscriptions unsubscribed)
  [ ] No blocking operations on main thread / event loop
  [ ] Expensive computations are memoized or cached where appropriate

Code Quality:
  [ ] Cyclomatic complexity reasonable (no function > 20 branches)
  [ ] Naming is clear and consistent (variables, functions, files)
  [ ] DRY — no significant code duplication
  [ ] Error handling is explicit (no swallowed errors, no empty catch blocks)
  [ ] Type precision — no `any`, no unnecessary type assertions
  [ ] Functions are <= 50 lines, files are <= 400 lines

Architecture:
  [ ] Dependency direction respected (types -> config -> lib -> services -> app)
  [ ] Layer responsibilities upheld (no business logic in app layer, etc.)
  [ ] No circular dependencies introduced
  [ ] New dependencies justified and minimal
```

### Step 3: Provide Conclusion

**All passed:**
```
Code Review passed — T[ID]
Proceed with Atomic Commit.
```

**Has fail items:**
```
Code Review failed — T[ID]

Needs fixing:
- [Specific issue 1]: [Which file, which line, what it should be changed to]
- [Specific issue 2]: ...

After fixing, re-run Self-Validation + Code Review.
```

**Has warn items (non-blocking but needs to be recorded):**
```
Code Review passed with notes — T[ID]

Suggested improvements:
- [Note]

Recorded in docs/PROGRESS.md under "Issues to Watch".
Proceed with Atomic Commit.
```

## Outputs

Code Review results are written into the commit message body:

```bash
git commit -m "feat(T[ID]): [feature name] implementation

[Implementation details]

Code Review: ✅
- Security: pass no injection vectors, inputs validated, auth checked
- Performance: pass no N+1, bounded queries, no leaks
- Code Quality: pass naming, DRY, error handling, type precision
- Architecture: pass dependency direction, layer responsibilities

Task-ID: T[ID]
Closes: PRD#F[ID]"
```

### Technical Debt Record

If there are known code quality compromises due to time constraints, record them in `docs/TECH_DEBT.md`:

```markdown
# Technical Debt

| Item | Task | Category | Reason for Compromise | Estimated Fix |
|------|------|----------|----------------------|---------------|
| Missing input validation on bulk endpoint | T[ID] | Security | Bulk schema not finalized | M[N] Hardening |
| Service method exceeds complexity target | T[ID] | Code Quality | Complex business rule | M[N] Refactor |
```

## Done-When

- All checklist items pass (or warn items are recorded)
- Code review result is included in the commit message with `Code Review: ✅`
- Any technical debt is recorded in `docs/TECH_DEBT.md`

## Constraints

- At Lite level, only check critical security items and architecture — do not block on Performance or Code Quality metrics
- At Standard/Full levels, the full review is required
- Never skip hardcoded secrets check regardless of level
