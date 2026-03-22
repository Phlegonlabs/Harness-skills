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

The generated CI workflow lives at `.github/workflows/ci.yml`. `scripts/setup/core.ts` currently writes the default workspace-first template from `templates/.github/workflows/ci.yml.template`, and `deriveStateFromFilesystem()` records its presence in `scaffold.ciExists`.

The default workspace-first CI template runs these steps in order:

1. **Install dependencies** — `bun install --frozen-lockfile`
2. **Dependency direction** — `bun run check:deps`
3. **Type check** — `bun run typecheck`
4. **Lint** — `bun run lint`
5. **Format check** — `bun run format:check`
6. **Test** — `bun run test`
7. **Build** — `bun run build`
8. **Audit line counts** — the template blocks oversized TypeScript source files in `apps/`, `packages/`, and `src/`

Language-specific CI templates also exist under `templates/.github/workflows/`, but selecting them is not yet wired into `scripts/setup/core.ts`. Treat them as reference templates unless the setup wiring changes in the same update.

## Config Files

The scaffold generator produces these GitHub-specific files:

- **`.github/workflows/ci.yml`** — CI pipeline triggered on push and pull request
- **`.github/PULL_REQUEST_TEMPLATE.md`** — PR template tracked by `scaffold.prTemplateExists`
- **`.env.example`** — Environment variable template tracked by `scaffold.envExampleExists`

## Hook Installation

Scaffold setup installs four git hook shims into `.git/hooks/`, and the runtime helper `install-git-hooks.ts` reuses the same shim content when invoked directly:

- `pre-commit` — Runs guardian checks before each commit
- `commit-msg` — Validates commit message format
- `pre-push` — Runs guardian checks before push
- `post-commit` — Runs post-commit guardian notifications

Each shim delegates to `bun .harness/runtime/hooks/check-guardian.ts` with the appropriate `--hook` flag. On Unix systems, `ensureExecutable()` sets the `0o755` permission bit. On Windows, it verifies the shebang line exists.

Setup writes `.claude/settings.local.json`, `.codex/config.toml`, and `.codex/rules/guardian.rules` directly. Post-clone recovery restores those files from the local bootstrap manifest, and the runtime helper merges the same managed defaults when it is invoked directly.

## Scaffold Validation

`deriveStateFromFilesystem()` assembles the full scaffold state by checking the filesystem for each expected artifact. The `getPhaseStructuralChecks("SCAFFOLD", state)` call in the dispatcher verifies that planning docs are complete before scaffold work begins. If structural checks fail, the dispatcher falls back to the `prd-architect` agent instead of `scaffold-generator`.
