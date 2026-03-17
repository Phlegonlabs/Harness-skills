# PROGRESS.md Template

`PROGRESS.md` is the main-thread recovery entry point. It is automatically updated after each Task is completed,
so that reopening a Claude / Codex main thread at any time can resume from the last stopping point without re-explaining the state.

**Actual structure**:

- `docs/PROGRESS.md`: entry point and summary
- `docs/progress/*.md`: summary, current state, backlog, blockers, worktrees, next session

---

```markdown
# PROGRESS.md — [PROJECT_NAME]

> **⚠️ For the next session's Agent**: Please read `docs/PROGRESS.md` and `docs/progress/` first, then read `AGENTS.md` and the relevant user-level LEARNING file (`~/.codex/LEARNING.md` or `~/.claude/LEARNING.md`), then continue with the Current Task indicated below.

---

## 🎯 Current State

**Current Milestone**: M[N] — [Milestone Name]
**Current Worktree**: `../[PROJECT_NAME]-m[N]` (`milestone/m[N]-[name]` branch)
**Current Task**: T[ID] — [Task Name] (**In Progress / Pending / Blocked**)
**Overall Progress**: [████████░░] [X]/[Y] Tasks ([Z]%)
**Last Updated**: [DATETIME]

---

## 📋 Task Backlog Status

### Milestone 1: [Name] ✅ Completed
- [x] T001: [Name] — commit `[hash]`
- [x] T002: [Name] — commit `[hash]`
- [x] T003: [Name] — commit `[hash]`

### Milestone 2: [Name] 🔄 In Progress
- [x] T004: [Name] — commit `[hash]`
- [x] T005: [Name] — commit `[hash]`
- [ ] T006: [Name] — **← Next Task**
- [ ] T007: [Name]
- [ ] T008: [Name]

### Milestone 3: [Name] ⏳ Pending
- [ ] T009: [Name]
- [ ] T010: [Name]

---

## 🚧 Blocked Tasks

| Task | Reason | What's Needed | Created |
|------|--------|---------------|---------|
| T[ID] | [Why it's Blocked] | [What the user needs to provide / what we're waiting for] | [DATE] |

If Blocked, skip to the next executable Task and record it here.

---

## 🌿 Worktree Status

```bash
# Current worktree list (run git worktree list to confirm)
~/Projects/[PROJECT_NAME]          main (stable)
~/Projects/[PROJECT_NAME]-m[N]     milestone/m[N]-[name] (in progress)
```

---

## ⚡ Resume Development Commands

### Using Claude Code
```bash
cd ~/Projects/[PROJECT_NAME]-m[N]
claude "Read docs/PROGRESS.md, docs/progress/, AGENTS.md, ~/.claude/LEARNING.md, then continue T[ID]: [Task Name]"
```

### Using Codex CLI (main-thread)
```bash
cd ~/Projects/[PROJECT_NAME]-m[N]
codex "Read docs/PROGRESS.md, docs/progress/, AGENTS.md, ~/.codex/LEARNING.md, then continue T[ID]: [Task Name]"
```

### Codex Child Subagent (orchestrator-dispatched)
```text
Do not run full resume. Use only the orchestrator-provided task packet, scoped refs, and ownership boundaries.
```

---

## 📝 Recent Decision Records

[Last 3 important decisions or resolved issues; full records in the user-level LEARNING.md]

- [DATE] T[ID]: [Decision summary]
- [DATE] T[ID]: [Decision summary]

```

---

## Update Rules

After each Task is completed, the Execution Engine automatically updates:
1. Update `docs/PROGRESS.md` summary
2. Update the corresponding module in `docs/progress/`
3. Mark the current Task as `[x]` and add the commit hash
4. Update "Current Task" to the next one
5. Update overall progress percentage
6. If there are new Blocked tasks, add them to the Blocked table

```bash
git add docs/PROGRESS.md
git commit -m "docs(progress): T[ID] done, next T[ID+1]"
```

## Blocked Task Handling Process

When a Task encounters external dependencies that prevent it from continuing (not a problem solvable by a Debug Loop):

1. Record the reason and what's needed in the Blocked table in PROGRESS.md
2. **Do not stop execution** — find the next Task without this dependency and continue
3. Inform the user: "T[ID] is currently Blocked, reason: [X], need you to provide [Y]. Continuing with T[Z] in the meantime."
4. After the user provides what's needed, remove the Blocked status and add it back to the queue
