# Execution Advanced

Optional extensions for projects that need more than the default closed-loop execution path.
Load this file only when the project needs CI-driven release automation, a maintained docs-site
workflow, or persistent file-based memory conventions.

---

## Release Automation (optional — choose one if project needs CI-driven releases)

The harness CLI generates changelogs from commit messages. For projects that need
automated version bumping and publishing, add one of these tools:

**Changesets (recommended for JS/TS monorepos):**
```bash
<pkg-mgr> add -D @changesets/cli @changesets/changelog-github
npx changeset init
```
Workflow: agent runs `npx changeset` after each milestone → human reviews → `npx changeset version`
bumps package.json + generates CHANGELOG.md → `npx changeset publish` publishes to npm.
CI: add `.github/workflows/release.yml` using `changesets/action@v1`.

**release-please (recommended for single-package repos):**
Add `.github/workflows/release-please.yml`:
```yaml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node  # or: python, go, rust, simple
```
Workflow: conventional commit messages → release-please opens a release PR →
human merges → GitHub Release + tag created automatically.
Supports: Node.js, Python, Go, Rust, and generic repos.

**semantic-release (fully automated — no human in the loop):**
Only use if the team wants zero-touch releases. Every merge to main auto-publishes.
```bash
<pkg-mgr> add -D semantic-release @semantic-release/changelog @semantic-release/git
```
Config in `package.json` or `.releaserc`. Reads conventional commits to determine
MAJOR/MINOR/PATCH automatically. Less control than changesets or release-please.

**For non-JS projects:**
- Python: `python-semantic-release` or release-please with `release-type: python`
- Go: release-please with `release-type: go` + GoReleaser for binary builds
- Rust: release-please with `release-type: rust` or `cargo-release`

**Which to choose:**
| Situation | Tool |
|-----------|------|
| Monorepo with multiple publishable packages | Changesets |
| Single package, want PR-based releases | release-please |
| Single package, want fully automated releases | semantic-release |
| Non-JS project | release-please (broadest language support) |
| Team prefers manual control over every release | None — use `harness changelog` + manual `git tag` |

---

## Phase 6: Documentation Site (Evolving)

> Note: `docs/gitbook/` is scaffolded in Phase 3 (not here). Phase 6 work means
> *updating existing files* as the product evolves — not initial generation.
> If `docs/gitbook/` is missing, that is a Phase 3 scaffold defect, not a Phase 6 task.

The `docs/gitbook/` directory (generated in Phase 3) evolves with the project. Documentation updates are
milestone tasks, not afterthoughts.

### When to update

- **Every milestone**: quickstart.md if setup changed, architecture.md if new modules
- **Every new feature**: product-overview.md or target-users.md if user-facing positioning changes
- **Every deploy change**: add a deployment page to docs/gitbook/ if not already present

### Documentation tasks in PLAN.md

Every milestone includes doc tasks:

| Task ID | Story | Task | Done When |
|---------|-------|------|-----------|
| M1-008 | — | Update getting-started.md | Doc covers auth setup |
| M1-009 | — | Update SUMMARY.md | New sections linked, no dead links |

### Compatible with

GitBook, Docusaurus, VitePress, or plain GitHub markdown.
SUMMARY.md is the universal sidebar. Choose publishing platform later.

---

## Agent Memory System

Projects generate a persistent, file-based memory system inspired by OpenClaw's architecture.
The core philosophy: **files are the source of truth** — the agent only retains what gets
written to disk. No reliance on context window for cross-session continuity.

### Memory Directory Structure

```
docs/
├── memory/
│   ├── MEMORY.md              ← Curated long-term memory (strategies, patterns, decisions)
│   ├── YYYY-MM-DD.md          ← Daily session logs (auto-generated per work session)
│   └── sessions/              ← Archived session transcripts (optional)
├── learnings.md               ← Technical learnings from harness learn (existing)
└── progress.json              ← Machine-readable state (existing)
```

### Memory Tiers

| Tier | File | Loaded When | Purpose |
|------|------|-------------|---------|
| **Identity** | `AGENTS.md` / `CLAUDE.md` | Every session | Iron rules, project context, coding conventions |
| **Long-term** | `docs/memory/MEMORY.md` | Every `harness init` | Curated insights: architecture decisions, API quirks, performance findings, user preferences |
| **Daily log** | `docs/memory/YYYY-MM-DD.md` | Current + yesterday | Running context: what happened today, blockers, discoveries, WIP state |
| **Learnings** | `docs/learnings.md` | On-demand (harness commands) | Structured category-tagged learnings from `harness learn` |
| **State** | `docs/progress.json` | Every harness command | Machine-readable task state, milestone progress, dependency graph |

### Memory Lifecycle

**Writing memory — when the agent should persist to disk:**

1. **After every `harness done`** — append to today's daily log:
   what was done, files changed, any gotchas discovered.
   The CLI already writes commit hash; the agent should add a 2-3 line note.

2. **When learning something reusable** — `harness learn <cat> <msg>` writes to
   `docs/learnings.md` + `progress.json`. But if it's a strategic insight
   (not just a one-off fix), also add it to `MEMORY.md`.

3. **Before session end** — when context is getting large or the agent is about
   to stop, write durable notes to today's daily log. Include:
   - What tasks were completed
   - What's in progress and where it left off
   - Any decisions made and why
   - Blockers or questions for next session

4. **Architecture decisions** — always go to `MEMORY.md`, not daily logs.
   Format: `## [date] Decision: <title>` + rationale + alternatives considered.

**Reading memory — what the agent loads:**

- `harness init` prints status + reads `MEMORY.md` + today's daily log
- `harness next` / `harness start` → agent should scan relevant learnings
- Beginning of a new session → agent reads `MEMORY.md` + yesterday + today

**Pruning — memory doesn't grow forever:**

- Daily logs older than 14 days: summarize into `MEMORY.md`, then archive or delete
- `MEMORY.md` should stay under 200 lines — if approaching, distill and remove stale entries
- `harness learn` entries that have been incorporated into `MEMORY.md` can be marked `[archived]`

### MEMORY.md Template

```markdown
# Project Memory

## Architecture Decisions

### [2025-01-15] Use Hono over Express for API
Hono is 10x faster on Cloudflare Workers, zero-dep, and types are better.
Considered: Express (too heavy for edge), Fastify (no Workers support).

### [2025-01-18] D1 over Neon for database
D1 is co-located at the edge, no TCP connection needed.
Trade-off: no joins across databases, 10GB limit per DB.

## API & Integration Notes

- GitHub API: rate limit is 5000/hr with auth, 60/hr without
- Stripe webhooks: must verify signature before processing, use raw body
- Auth: Better Auth session cookies expire in 7 days, refresh token in 30

## Patterns & Conventions

- Error codes: use `APP_` prefix for our errors, `EXT_` for external service errors
- All API responses: `{ data, error, meta }` shape, never raw arrays
- DB migrations: always add a down migration, even if it's destructive

## User Preferences

- Prefers concise commit messages (no body, just title)
- Wants all API endpoints documented in api-reference.md
- Testing: prefers integration tests over unit tests for API routes

## Known Gotchas

- `bcrypt` native module fails on Alpine — use `bcryptjs` instead
- Cloudflare D1 doesn't support `RETURNING *` — use separate SELECT after INSERT
- Vitest: must set `pool: 'forks'` for tests that use native modules
```

### Daily Log Template

```markdown
# 2025-01-20 — Session Log

## Tasks Completed
- M2-004: Implement search endpoint (commit: `a3f2b1c`)
  - Used FTS5 for full-text search on D1
  - Had to work around D1's lack of trigram indexes — used LIKE fallback

## In Progress
- M2-005: Add pagination to search results
  - Started, cursor-based pagination skeleton in place
  - Left off at: response envelope with `next_cursor` field

## Decisions Made
- Chose cursor-based over offset-based pagination (offset is O(n) on large tables)

## Blockers / Questions
- None currently

## Learnings
- D1 FTS5: must create virtual table with `content=''` for external content tables
```

### Integration with Harness CLI

The existing `harness learn` command already writes to `docs/learnings.md`.
The memory system extends this with two conventions:

1. **Agent writes daily log entries after `harness done`** — this is a convention
   documented in AGENTS.md / CLAUDE.md, not enforced by CLI. The agent should
   append a brief note to `docs/memory/YYYY-MM-DD.md` after completing each task.

2. **Agent reads MEMORY.md at session start** — documented in AGENTS.md / CLAUDE.md
   as part of the Session Init checklist.

The CLI doesn't need new commands for this. The agent uses standard file I/O.
The `harness init` command should print a reminder if `docs/memory/MEMORY.md` exists, and warn
when daily logs older than 14 days should be summarized:

```
ℹ Memory loaded: docs/memory/MEMORY.md (42 lines)
ℹ Today's log: docs/memory/2025-01-20.md (exists, 15 lines)
⚠ 3 daily log(s) are older than 14 days. Summarize them into docs/memory/MEMORY.md and archive/delete the stale logs.
```
