# Add Surface Workflow

## Purpose

Document the process for adding a new product surface (web, iOS, CLI, agent, desktop, etc.) to an existing Harness monorepo project.

## Supported Surfaces

| Surface | Default Workspace | Surface | Default Workspace |
|---------|-------------------|---------|-------------------|
| `web-app` | `apps/web` | `cli` | `apps/cli` |
| `ios-app` | `apps/ios` | `agent` | `apps/agent` |
| `android-app` | `apps/android` | `desktop` | `apps/desktop` |
| `api` | `apps/api` | `mobile-cross-platform` | `apps/mobile` |

Defined in `SURFACE_WORKSPACE_MAP` in `runtime/surfaces.ts`.

## Invocation

```bash
bun .harness/add-surface.ts --type <surface> [--workspace <name>]
```

If `--workspace` is omitted, the default workspace name from the surface map is used. The workspace name is slugified via `slugify()` to ensure filesystem safety.

## What the Command Does

### 1. State Update

`addSurfaceToState()` in `runtime/automation.ts`:

- Adds the surface type to `state.projectInfo.types` via `normalizeProjectTypes()`, which ensures `monorepo` is always the first entry
- If the project is already in EXECUTING phase, appends a new milestone with a surface-onboarding task to `state.execution.milestones`

### 2. Workspace Scaffold

`ensureWorkspaceFiles()` creates `apps/{workspace}/package.json` and `apps/{workspace}/README.md`. The `agent` surface also creates `skills/api-wrapper/` and `packages/shared/api/`. UI surfaces (`web-app`, `ios-app`, `desktop`) ensure `docs/design/DESIGN_SYSTEM.md` exists.

### 3. Document Updates

- **PRD** — A managed section is appended to `docs/prd/03-requirements.md` with a new milestone heading and feature entry for surface onboarding
- **Architecture** — A managed section is appended to `docs/architecture/02-project-structure.md` describing the new workspace
- **ADR** — An Architecture Decision Record is written to `docs/adr/ADR-{NNN}-add-{workspace}-surface.md`

### 4. Validation

After state and files are written, `validatePhaseGate()` runs against the current phase. If any checks fail, the command exits with a non-zero code and lists the issues.

## Surface Detection Helpers

| Function | File | Role |
|----------|------|------|
| `surfaceWorkspaceList()` | `runtime/surfaces.ts` | Lists workspace directories; discovers from `apps/` if present, falls back to type map |
| `hasAgentSurface()` | `runtime/surfaces.ts` | Returns true if `types` includes `agent` |
| `isAddableSurface()` | `runtime/surfaces.ts` | Type guard for valid surface strings |
| `workspaceForSurface()` | `runtime/surfaces.ts` | Resolves workspace name from surface type and optional override |

## Agent Routing

Each agent targets specific surfaces or the whole project:

| Agent | Surface Scope |
|-------|---------------|
| `frontend-designer` | UI surfaces (`web-app`, `ios-app`, `desktop`) |
| `execution-engine` | All surfaces (task-level routing via `affectedFiles`) |
| `design-reviewer` | UI surfaces only (gated by `isUiProject()` in `runtime/shared.ts`) |
| `scaffold-generator` | All surfaces (workspace creation) |

## Monorepo Structure

After adding surfaces, key directories are: `apps/{workspace}/` for each surface, `packages/shared/` for cross-surface code, `packages/shared/api/` for agent API wrappers, `skills/` for agent skill definitions, and `docs/design/` for UI design specs.
