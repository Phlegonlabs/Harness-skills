# GitHub Setup

## Overview

During the SCAFFOLD phase, the harness configures GitHub infrastructure for the project: repository creation, CI workflow generation, hook installation, and PR template scaffolding. The `GitHubState` type in `harness-types.ts` tracks each step so the orchestrator knows what has been completed.

## GitHubState Tracking

The `GitHubState` interface records the following fields:

| Field | Type | Purpose |
|-------|------|---------|
| `repoCreated` | `boolean` | `gh repo create` succeeded or repo already existed |
| `remoteAdded` | `boolean` | `git remote add origin` completed |
| `pushed` | `boolean` | Initial push to remote done |
| `remoteUrl` | `string` | Full HTTPS URL of the repository |
| `visibility` | `"public" \| "private"` | Repository visibility setting |
| `branchProtection` | `boolean` | Branch protection rules configured |
| `labelsCreated` | `boolean` | Issue labels created |
| `issueTemplatesCreated` | `boolean` | Issue templates scaffolded |

The scaffold phase gate in `PHASE_GATES.EXECUTING` requires `scaffold.ciExists` and `scaffold.agentsMdExists` before execution can begin. The `deriveStateFromFilesystem()` function in `runtime/shared.ts` sets `scaffold.githubSetup` to true when `github.repoCreated` is true.

## CI Workflow

The generated CI workflow lives at `.github/workflows/ci.yml`. The `deriveStateFromFilesystem()` function checks for its existence and records it in `scaffold.ciExists`.

The standard CI pipeline runs four stages in order:

1. **Lint** — `scaffold.linterConfigured` is true when `biome.json`, `.eslintrc.json`, `.eslintrc.js`, `ruff.toml`, or `pyproject.toml` exists
2. **Test** — Uses the toolchain command from `toolchain.commands.test`
3. **Build** — Uses the toolchain command from `toolchain.commands.build`
4. **Dependency check** — Runs `bun run check:deps` when dependency-cruiser is configured; `dependencyCruiserValidatedInCi()` in `runtime/shared.ts` verifies both the config file and the CI workflow reference

## Config Files

The scaffold generator produces these GitHub-specific files:

- **`.github/workflows/ci.yml`** — CI pipeline triggered on push and pull request
- **`.github/PULL_REQUEST_TEMPLATE.md`** — PR template tracked by `scaffold.prTemplateExists`
- **`.env.example`** — Environment variable template tracked by `scaffold.envExampleExists`

## Hook Installation

`install-git-hooks.ts` runs during scaffold setup and installs four git hook shims into `.git/hooks/`:

- `pre-commit` — Runs guardian checks before each commit
- `commit-msg` — Validates commit message format
- `pre-push` — Runs guardian checks before push
- `post-commit` — Runs post-commit guardian notifications

Each shim delegates to `bun .harness/runtime/hooks/check-guardian.ts` with the appropriate `--hook` flag. On Unix systems, `ensureExecutable()` sets the `0o755` permission bit. On Windows, it verifies the shebang line exists.

The installer also merges Claude Code hooks into `.claude/settings.local.json` and Codex CLI config into `.codex/config.toml`.

## Scaffold Validation

`deriveStateFromFilesystem()` assembles the full scaffold state by checking the filesystem for each expected artifact. The `getPhaseStructuralChecks("SCAFFOLD", state)` call in the dispatcher verifies that planning docs are complete before scaffold work begins. If structural checks fail, the dispatcher falls back to the `prd-architect` agent instead of `scaffold-generator`.
