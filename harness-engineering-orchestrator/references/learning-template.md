# LEARNING.md Template

## Description

`LEARNING.md` is the project-specific **user-level knowledge base**, recording things learned during execution.
The Execution Engine automatically updates it at the following times:
- Each time a Debug Loop resolves an issue
- Each time a Spike Task is completed
- Each time a technical choice is made (including ADR)
- Each time a review after Milestone completion discovers issues

**Install location**: `~/.codex/LEARNING.md` (Codex CLI global) and `~/.claude/LEARNING.md` (Claude Code global). These are machine-level global files, not repository files.

The tool reads them automatically on startup. Keep the two files synchronized after updates using a cross-platform file copy method appropriate to the current shell/runtime.

**Purpose**: Before starting a new Task, the Agent reads the relevant user-level LEARNING file first to avoid known pitfalls.

---

```markdown
# LEARNING.md — [PROJECT_NAME]

> This is the project's living knowledge base. Records all pitfalls encountered, choices made, and lessons learned.
> **Must read this document before starting each new Task.**
> Updated: [LAST_UPDATED]

---

## Resolved Issues (Debug Loop Records)

### [Issue Title] — T[ID] [DATE]

**Issue description**: [What happened]

**Root cause**: [Why it happened]

**Attempted but ineffective approaches**:
- [Approach 1]: [Why it didn't work]
- [Approach 2]: [Why it didn't work]

**Final solution**: [How it was resolved]

**Principle learned**: [How to handle similar situations next time]

**Affected constraints** (if AGENTS.md needs updating): [Yes/No, if yes explain what rule was added]

---

## Spike Conclusions

### [Spike Title] — T[ID] [DATE]

**Investigation question**: [What was being evaluated]

**Evaluated options**:
| Option | Pros | Cons | Adopted |
|--------|------|------|---------|
| [A] | ... | ... | ✅/❌ |
| [B] | ... | ... | ✅/❌ |

**Conclusion**: [What was adopted and why]

**Follow-up tasks**: [What tasks did this Spike produce]

---

## Technical Decision Records (ADR Summary)

> Full ADRs are in the `docs/adr/` directory. Only summaries and conclusions are recorded here.

| ADR | Decision | Choice | Excluded Options | Date |
|-----|----------|--------|------------------|------|
| [ADR-001] | [Decision content] | [Choice] | [Excluded A, B] | [DATE] |

---

## Known Issues with Environment and Configuration

[Record any environment-specific issues, e.g.: a package has a bug on macOS ARM, an API has a rate limit, etc.]

---

## Deprecated Approaches (Do Not Try Again)

| Approach | Reason for Deprecation | Deprecated On |
|----------|------------------------|---------------|
| [Approach description] | [Why it doesn't work] | [DATE] |

---

## Issues to Watch (Not yet resolved but not blocking)

- [ ] [Issue description] — discovered in T[ID], can be addressed in [Milestone X]

```

---

## Initialization Command

Create the user-level LEARNING file during scaffold setup if it does not already exist. Use a cross-platform file creation command for the current environment.

Initial contents:

```markdown
# LEARNING.md — [PROJECT_NAME]

> Knowledge base of lessons learned during execution. Must read before starting a new Task.
> Updated: [DATE]

## Resolved Issues
(Auto-populated during execution)

## Spike Conclusions
(Auto-populated after Spike Tasks complete)

## Technical Decision Records
(Auto-populated from Tech Stack and ADR decisions)

## Deprecated Approaches
(Auto-populated from approaches excluded during Debug Loops)
```

## Update Rules

After each update to LEARNING.md:
1. Sync the content to both user-level locations.
2. Do not commit it to the repo.
3. If the learning affects repo workflow, reflect the relevant consequence in `docs/PROGRESS.md`, ADRs, or `AGENTS.md` / `CLAUDE.md`.
