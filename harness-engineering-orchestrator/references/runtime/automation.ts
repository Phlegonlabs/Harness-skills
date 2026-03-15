import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import type { Milestone, ProjectState, Task } from "../types"
import { createEmptyTaskChecklist } from "./task-checklist"
import { writeManagedFile } from "./generated-files"
import { isUiProject } from "./shared"
import {
  type AddableSurface,
  hasAgentSurface,
  isAddableSurface,
  normalizeProjectTypes,
  slugify,
  surfaceLabel,
  workspaceForSurface,
} from "./surfaces"

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : ""
}

function highestMatch(content: string, pattern: RegExp): number {
  return Math.max(
    0,
    ...Array.from(content.matchAll(pattern)).map(match => Number(match[1] ?? 0)),
  )
}

function nextMilestoneNumber(): number {
  const content = readIfExists("docs/prd/03-requirements.md")
  return highestMatch(content, /^###\s+Milestone\s+(\d+)/gm) + 1
}

function nextFeatureNumber(): number {
  const content = readIfExists("docs/prd/03-requirements.md")
  return highestMatch(content, /^####\s+F(\d{3})/gm) + 1
}

function nextAdrNumber(): number {
  if (!existsSync("docs/adr")) return 1
  const max = readdirSync("docs/adr")
    .map(file => file.match(/^ADR-(\d{3})/i)?.[1] ?? "0")
    .map(value => Number(value))
    .reduce((current, value) => Math.max(current, value), 0)
  return max + 1
}

function pad3(value: number): string {
  return String(value).padStart(3, "0")
}

function ensureWorkspaceFiles(
  state: ProjectState,
  surface: AddableSurface,
  workspace: string,
): void {
  const workspaceDir = join("apps", workspace)
  mkdirSync(workspaceDir, { recursive: true })

  const packagePath = join(workspaceDir, "package.json")
  if (!existsSync(packagePath)) {
    writeFileSync(
      packagePath,
      `${JSON.stringify(
        {
          name: `@${state.projectInfo.name || "project"}/${workspace}`,
          version: "0.1.0",
          private: true,
          type: "module",
          description: `${state.projectInfo.displayName || state.projectInfo.name || "Project"} ${workspace} workspace.`,
        },
        null,
        2,
      )}\n`,
    )
  }

  const readmePath = join(workspaceDir, "README.md")
  if (!existsSync(readmePath)) {
    writeFileSync(
      readmePath,
      `# ${state.projectInfo.displayName || state.projectInfo.name || "Project"} — ${workspace}\n\nWorkspace for the ${surfaceLabel(surface)} surface inside this monorepo.\n`,
    )
  }

  if (surface === "agent") {
    mkdirSync("skills/api-wrapper", { recursive: true })
    mkdirSync("packages/shared/api", { recursive: true })
    const apiReadmePath = "packages/shared/api/README.md"
    if (!existsSync(apiReadmePath)) {
      writeFileSync(
        apiReadmePath,
        `# Shared API wrappers\n\nAdd agent-facing service wrappers under this directory.\n`,
      )
    }
  }

  if (["web-app", "ios-app", "desktop"].includes(surface) && !existsSync("docs/design/DESIGN_SYSTEM.md")) {
    mkdirSync("docs/design", { recursive: true })
    writeFileSync(
      "docs/design/DESIGN_SYSTEM.md",
      "# DESIGN_SYSTEM\n\nGenerated placeholder. Add UI tokens, layouts, and review criteria before the first UI task is implemented.\n",
    )
  }
}

function ensurePrdSurfaceSection(
  surface: AddableSurface,
  workspace: string,
  milestoneNumber: number,
  featureNumber: number,
): void {
  writeManagedFile({
    path: "docs/prd/03-requirements.md",
    marker: `HARNESS:SURFACE:PRD:${workspace}`,
    content: `### Milestone ${milestoneNumber}: ${surfaceLabel(surface)} Expansion

#### F${pad3(featureNumber)}: ${surfaceLabel(surface)} Surface Onboarding
- **Description**: Add the \`${workspace}\` workspace inside the monorepo and prepare it for incremental delivery.
- **User story**: As the product grows, I want to add the ${surfaceLabel(surface)} surface in the same monorepo so all surfaces share one execution contract.
- **Acceptance criteria**:
  - [ ] \`apps/${workspace}/package.json\` exists
  - [ ] Architecture documents the \`${workspace}\` workspace
  - [ ] Progress/backlog includes the surface onboarding milestone
  - [ ] Follow-up milestones can build on the same monorepo instead of creating a new repo
- **Priority**: P1
- **Dependencies**: F001`,
  })
}

function ensureArchitectureSurfaceSection(surface: AddableSurface, workspace: string): void {
  writeManagedFile({
    path: "docs/architecture/02-project-structure.md",
    marker: `HARNESS:SURFACE:ARCH:${workspace}`,
    content: `### ${surfaceLabel(surface)} Workspace

- **Workspace**: \`apps/${workspace}\`
- **Purpose**: Host the ${surfaceLabel(surface)} surface inside the existing monorepo.
- **Expansion rule**: New surfaces are added as later milestones in the same monorepo, not as separate repos.`,
  })
}

function ensureAdrForSurface(surface: AddableSurface, workspace: string): void {
  if (!existsSync("docs/adr")) mkdirSync("docs/adr", { recursive: true })

  const slug = `${workspace}-surface`
  const existing = existsSync("docs/adr")
    ? readdirSync("docs/adr").find(file => file.includes(slug))
    : undefined

  if (existing) return

  const adrNumber = pad3(nextAdrNumber())
  const path = join("docs/adr", `ADR-${adrNumber}-add-${slug}.md`)
  writeFileSync(
    path,
    `# ADR-${adrNumber}: Add ${surfaceLabel(surface)} surface\n\n` +
      `- Status: Accepted\n` +
      `- Decision: Add \`apps/${workspace}\` inside the existing monorepo.\n` +
      `- Rationale: Keep all product surfaces under one execution contract, shared docs, and shared runtime.\n`,
  )
}

function nextTaskId(state: ProjectState): string {
  const current = state.execution.milestones
    .flatMap(milestone => milestone.tasks)
    .map(task => Number(task.id.replace(/^T/, "")))
    .reduce((max, value) => Math.max(max, value), 0)

  return `T${String(current + 1).padStart(3, "0")}`
}

function nextMilestoneId(state: ProjectState): string {
  const current = state.execution.milestones
    .map(milestone => Number(milestone.id.replace(/^M/, "")))
    .reduce((max, value) => Math.max(max, value), 0)

  return `M${current + 1}`
}

function taskForSurface(state: ProjectState, surface: AddableSurface, workspace: string, milestoneId: string): Task {
  return {
    affectedFiles: [`apps/${workspace}`, "docs/prd/03-requirements.md", "docs/architecture/02-project-structure.md"],
    checklist: createEmptyTaskChecklist(),
    dod: [
      `Create apps/${workspace} workspace scaffold`,
      "Document the new surface in PRD and Architecture",
      "Keep the work inside the same monorepo",
    ],
    id: nextTaskId(state),
    isUI: isUiProject([surface]),
    milestoneId,
    name: `${surfaceLabel(surface)} surface onboarding`,
    prdRef: "PRD#SurfaceExpansion",
    retryCount: 0,
    status: "PENDING",
    type: "TASK",
  }
}

function ensureExecutionMilestone(state: ProjectState, surface: AddableSurface, workspace: string): void {
  if (state.phase !== "EXECUTING" && state.execution.milestones.length === 0) return

  const branchSlug = slugify(`${workspace}-surface`)
  const productStageId = state.roadmap.currentStageId || "V1"
  const existing = state.execution.milestones.find(
    milestone => milestone.branch === `milestone/${branchSlug}`,
  )
  if (existing) return

  const milestoneId = nextMilestoneId(state)
  const milestone: Milestone = {
    branch: `milestone/${branchSlug}`,
    id: milestoneId,
    name: `${surfaceLabel(surface)} Expansion`,
    productStageId,
    status: "PENDING",
    tasks: [taskForSurface(state, surface, workspace, milestoneId)],
    worktreePath: `../${state.projectInfo.name || "project"}-${branchSlug}`,
  }

  state.execution.milestones.push(milestone)
  state.execution.allMilestonesComplete = false
}

export function addSurfaceToState(
  state: ProjectState,
  surfaceInput: string,
  preferredWorkspace?: string,
): { changed: boolean; state: ProjectState; surface: AddableSurface; workspace: string } {
  if (!isAddableSurface(surfaceInput)) {
    throw new Error(`Unsupported surface "${surfaceInput}". Use one of: web-app, ios-app, cli, agent, desktop.`)
  }

  const surface = surfaceInput
  const alreadyPresent = state.projectInfo.types.includes(surface)
  const defaultWorkspace = workspaceForSurface(surface)
  const workspace =
    alreadyPresent && preferredWorkspace && existsSync(join("apps", slugify(preferredWorkspace)))
      ? slugify(preferredWorkspace)
      : alreadyPresent && existsSync(join("apps", defaultWorkspace))
        ? defaultWorkspace
        : workspaceForSurface(surface, preferredWorkspace)

  const types = normalizeProjectTypes([...state.projectInfo.types, surface])

  ensureWorkspaceFiles(state, surface, workspace)
  ensureAdrForSurface(surface, workspace)
  ensurePrdSurfaceSection(surface, workspace, nextMilestoneNumber(), nextFeatureNumber())
  ensureArchitectureSurfaceSection(surface, workspace)

  state.projectInfo.types = types
  ensureExecutionMilestone(state, surface, workspace)

  return {
    changed: !alreadyPresent,
    state,
    surface,
    workspace,
  }
}

export function createApiWrapperService(
  state: ProjectState,
  serviceName: string,
  source: "manual" | "openapi",
  specPath?: string,
): { created: boolean; path: string } {
  if (!hasAgentSurface(state.projectInfo.types)) {
    throw new Error("This project does not include an agent surface yet. Add one with bun harness:add-surface --type agent.")
  }

  const service = slugify(serviceName)
  if (!service) {
    throw new Error("Please provide a non-empty service name.")
  }

  if (source === "openapi" && !specPath) {
    throw new Error("When --source=openapi is used, provide --spec <path>.")
  }

  const serviceDir = join("packages/shared/api", service)
  mkdirSync(serviceDir, { recursive: true })

  const files = [
    {
      path: join(serviceDir, "README.md"),
      content:
        `# ${service}\n\n` +
        `Source: ${source}\n` +
        `${specPath ? `Spec: ${specPath}\n` : ""}\n` +
        `This wrapper centralizes auth, retries, and payload shaping for the ${service} service.\n`,
    },
    {
      path: join(serviceDir, "index.ts"),
      content:
        `export type ${service.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}Request = Record<string, unknown>\n` +
        `export type ${service.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}Response = Record<string, unknown>\n\n` +
        `export async function call${service.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}(\n` +
        `  request: ${service.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}Request,\n` +
        `): Promise<${service.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}Response> {\n` +
        `  void request\n` +
        `  throw new Error("Wrapper not implemented yet.")\n` +
        `}\n`,
    },
    {
      path: join(serviceDir, "schema.ts"),
      content:
        `export const ${service.replace(/-/g, "_")}_schema = {\n` +
        `  source: "${source}",\n` +
        `  spec: ${specPath ? `"${specPath.replace(/\\/g, "/")}"` : "null"},\n` +
        `}\n`,
    },
  ]

  let created = false
  for (const file of files) {
    if (!existsSync(file.path)) {
      writeFileSync(file.path, file.content)
      created = true
    }
  }

  return { created, path: serviceDir.replace(/\\/g, "/") }
}
