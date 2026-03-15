import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { AIProvider, ProjectState, TeamSize } from "../types"
import { hasAgentSurface, projectTypeSummary, surfaceWorkspaceList } from "./surfaces"

type ManagedFileSpec = {
  content: string
  marker: string
  path: string
}

type ManagedWriteResult = {
  changed: boolean
  created: boolean
  path: string
}

type AutomationContext = {
  aiProviderLabel: string
  apiServices: string[]
  deliveryMode: string
  description: string
  displayName: string
  hasAgent: boolean
  projectName: string
  teamSizeLabel: string
  typeSummary: string
  workspaceList: string[]
}

const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI / Codex",
  anthropic: "Anthropic Claude",
  both: "OpenAI + Claude",
  "vercel-ai-sdk": "Vercel AI SDK",
  google: "Google Gemini",
  "open-source": "Open Source",
  multi: "Multi-Provider",
  none: "None",
}

const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  solo: "Solo",
  small: "Small team",
  large: "Large team",
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath)
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true })
}

function markerBounds(marker: string) {
  return {
    end: `<!-- END:${marker} -->`,
    start: `<!-- BEGIN:${marker} -->`,
  }
}

function renderManagedContent(marker: string, content: string): string {
  const { start, end } = markerBounds(marker)
  return `${start}\n${content.trim()}\n${end}\n`
}

function readPackageDescription(): string {
  if (!existsSync("package.json")) return "Harness-managed project scaffold."

  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
      description?: string
    }
    return pkg.description?.trim() || "Harness-managed project scaffold."
  } catch {
    return "Harness-managed project scaffold."
  }
}

export function listApiServices(): string[] {
  const apiDir = "packages/shared/api"
  if (!existsSync(apiDir)) return []

  return readdirSync(apiDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function buildContext(state: ProjectState): AutomationContext {
  return {
    aiProviderLabel: AI_PROVIDER_LABELS[state.projectInfo.aiProvider],
    apiServices: listApiServices(),
    deliveryMode: state.projectInfo.isGreenfield ? "Greenfield" : "Existing codebase",
    description: readPackageDescription(),
    displayName: state.projectInfo.displayName || state.projectInfo.name || "Project",
    hasAgent: hasAgentSurface(state.projectInfo.types),
    projectName: state.projectInfo.name || "project",
    teamSizeLabel: TEAM_SIZE_LABELS[state.projectInfo.teamSize],
    typeSummary: projectTypeSummary(state.projectInfo.types),
    workspaceList: surfaceWorkspaceList(state.projectInfo.types),
  }
}

function renderReadme(ctx: AutomationContext): string {
  const agentLine = ctx.hasAgent
    ? "- `SKILLS.md` + `skills/api-wrapper/SKILL.md`: project-local agent skill catalog and API wrapper contract"
    : ""

  return `# ${ctx.displayName}

${ctx.description}

## Start Here

- Quick start: [docs/public/quick-start.md](docs/public/quick-start.md)
- Documentation map: [docs/public/documentation-map.md](docs/public/documentation-map.md)
- Tech stack: [docs/public/tech-stack.md](docs/public/tech-stack.md)

## Core Docs

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Progress: [docs/PROGRESS.md](docs/PROGRESS.md)
- AI workflow: [AGENTS.md](AGENTS.md)
- GitBook: [docs/gitbook/README.md](docs/gitbook/README.md)

## Workflow

\`\`\`bash
bun install
bun harness:advance
bun harness:add-surface --type agent
bun harness:sync-docs
bun harness:audit
\`\`\`

This workspace is monorepo-first. Keep adding new surfaces inside the same repository as later milestones.
Do not bootstrap product frameworks such as Next.js, Tauri, or provider SDK stacks during scaffold setup. Introduce them only inside milestone tasks.

- \`apps/\`: current surfaces -> ${ctx.workspaceList.join(", ")}
- \`packages/shared/\`: shared contracts and utilities
- \`packages/shared/api/\`: agent-facing API wrappers
${agentLine}
`
}

function renderQuickStart(ctx: AutomationContext): string {
  const skillLine = ctx.hasAgent
    ? "\nIf this workspace includes agent surfaces, read `SKILLS.md` before adding new wrapper integrations.\n"
    : ""

  return `## Quick Start

\`\`\`bash
bun install
bun .harness/state.ts --show
bun harness:advance
bun harness:env
bun harness:validate --phase EXECUTING
bun harness:audit
\`\`\`

After these steps, continue from \`docs/PROGRESS.md\`, \`docs/progress/\`, and \`.harness/state.json\`.
\`.env.local\` is already scaffolded for local use, but framework-specific variables should be added only when the relevant milestone task introduces that framework.${skillLine}`
}

function renderDocumentationMap(ctx: AutomationContext): string {
  const skillLine = ctx.hasAgent
    ? "- `SKILLS.md` / `skills/`: agent skill catalog and API wrapper guidance"
    : ""

  return `## Documentation Map

- \`docs/PRD.md\` / \`docs/prd/\`: Requirements and milestones
- \`docs/ARCHITECTURE.md\` / \`docs/architecture/\`: Architecture and boundaries
- \`docs/PROGRESS.md\` / \`docs/progress/\`: Progress and session recovery
- \`docs/ai/\`: AI execution specifications
- \`docs/gitbook/\`: Public-facing documentation and changelog
- \`docs/adr/\`: Architecture decision records
${skillLine}
`
}

function renderTechStack(ctx: AutomationContext): string {
  return `## Tech Stack

| Area | Choice |
|------|--------|
| Package manager | Bun |
| Workflow | Harness Engineering |
| Project type | ${ctx.typeSummary} |
| Workspace model | Monorepo (Bun workspaces default) |
| Delivery mode | ${ctx.deliveryMode} |
| AI provider | ${ctx.aiProviderLabel} |
| Team size | ${ctx.teamSizeLabel} |
`
}

function renderGitbookReadme(ctx: AutomationContext): string {
  return `# ${ctx.displayName}

${ctx.description}

## What Is ${ctx.projectName}?

${ctx.description}

Runtime auto-dispatch currently covers \`project-discovery\`, \`MARKET_RESEARCH\`, \`TECH_STACK\`, \`prd-architect\`, \`scaffold-generator\`, the UI design loop, \`EXECUTING\`, \`VALIDATING\`, and \`context-compactor\`.
After an interactive phase is complete, advance the lifecycle with \`bun harness:advance\`.
\`bun harness:autoflow\` advances only after the current phase's required outputs exist; if scaffold artifacts are missing, it stops and surfaces the missing phase work instead of skipping ahead.
During scaffold setup, do not pre-install project frameworks such as Next.js or Tauri; add them later inside milestone tasks.

## Quick Start

\`\`\`bash
bun install
bun harness:advance
bun harness:env
bun harness:audit
\`\`\`
`
}

function renderPrdIndex(ctx: AutomationContext): string {
  return `# PRD — ${ctx.displayName}

> **Version**: v1.0
> **Status**: Draft
> **Reading order**: Start with this index, then read \`docs/prd/*.md\` in order

---

## Module Index

1. [01 Overview](./prd/01-overview.md)
2. [02 Users and Design](./prd/02-users-and-design.md)
3. [03 Requirements](./prd/03-requirements.md)
4. [04 Non-Functional Constraints](./prd/04-non-functional.md)
5. [05 Open Questions](./prd/05-open-questions.md)
6. [06 Changelog](./prd/06-changelog.md)
`
}

function renderArchitectureIndex(ctx: AutomationContext): string {
  return `# Architecture — ${ctx.displayName}

> **Version**: v1.0
> **Reading order**: Read this index first, then follow the modules in \`docs/architecture/*.md\` in order

---

## Module Index

1. [01 System Overview](./architecture/01-system-overview.md)
2. [02 Project Structure](./architecture/02-project-structure.md)
3. [03 Dependency Rules](./architecture/03-dependency-rules.md)
4. [04 State and Validation](./architecture/04-state-and-validation.md)
5. [05 Initial Decisions](./architecture/05-initial-decisions.md)
`
}

function renderSkillsCatalog(ctx: AutomationContext): string {
  const services =
    ctx.apiServices.length > 0
      ? ctx.apiServices.map(service => `- \`${service}\``).join("\n")
      : "- No registered API wrappers yet"

  return `# Harness Engineering and Orchestrator Skills

This workspace uses the Harness Engineering and Orchestrator monorepo-first delivery model. As new surfaces are added, extend the local skill catalog instead of scattering direct API logic across apps.

## Available Project-Local Skills

### \`api-wrapper\`

- Path: \`skills/api-wrapper/SKILL.md\`
- Purpose: provide one stable skill contract for wrapping internal and third-party APIs used by agent surfaces
- Current registered services:
${services}
`
}

function renderApiWrapperSkill(ctx: AutomationContext): string {
  const services =
    ctx.apiServices.length > 0
      ? ctx.apiServices.map(service => `- \`${service}\``).join("\n")
      : "- No registered wrappers yet"

  return `---
name: api-wrapper
description: >
  Wrap project and third-party APIs behind a stable agent-facing interface for ${ctx.displayName}.
  Use this skill when an agent surface needs typed, validated access to internal services or external APIs without scattering auth and retry logic.
---

# Harness Engineering and Orchestrator API Wrapper

## Purpose

This skill is the default API integration layer for agent work managed by Harness Engineering and Orchestrator in this monorepo.

## Registered Services

${services}

## Default Locations

- \`apps/agent/\` for agent orchestration and tool entry points
- \`packages/shared/api/\` for wrapper implementations
- \`packages/shared/\` for reusable contracts and helper code
`
}

export function getManagedDocSpecs(state: ProjectState): ManagedFileSpec[] {
  const ctx = buildContext(state)
  return [
    { path: "README.md", marker: "HARNESS:README", content: renderReadme(ctx) },
    { path: "docs/public/quick-start.md", marker: "HARNESS:PUBLIC:QUICKSTART", content: renderQuickStart(ctx) },
    { path: "docs/public/documentation-map.md", marker: "HARNESS:PUBLIC:DOCMAP", content: renderDocumentationMap(ctx) },
    { path: "docs/public/tech-stack.md", marker: "HARNESS:PUBLIC:TECHSTACK", content: renderTechStack(ctx) },
    { path: "docs/gitbook/README.md", marker: "HARNESS:GITBOOK:README", content: renderGitbookReadme(ctx) },
    { path: "docs/PRD.md", marker: "HARNESS:PRD:INDEX", content: renderPrdIndex(ctx) },
    { path: "docs/ARCHITECTURE.md", marker: "HARNESS:ARCH:INDEX", content: renderArchitectureIndex(ctx) },
  ]
}

export function getManagedSkillSpecs(state: ProjectState): ManagedFileSpec[] {
  const ctx = buildContext(state)
  if (!ctx.hasAgent) return []

  return [
    { path: "SKILLS.md", marker: "HARNESS:SKILLS:CATALOG", content: renderSkillsCatalog(ctx) },
    { path: "skills/api-wrapper/SKILL.md", marker: "HARNESS:SKILLS:API-WRAPPER", content: renderApiWrapperSkill(ctx) },
  ]
}

export function writeManagedFile(spec: ManagedFileSpec): ManagedWriteResult {
  ensureParentDir(spec.path)
  const nextText = renderManagedContent(spec.marker, spec.content)

  if (!existsSync(spec.path)) {
    writeFileSync(spec.path, nextText)
    return { path: spec.path, created: true, changed: true }
  }

  const current = readFileSync(spec.path, "utf-8")
  const { start, end } = markerBounds(spec.marker)
  let updated = current

  if (current.includes(start) && current.includes(end)) {
    updated = current.replace(new RegExp(`${start}[\\s\\S]*?${end}`, "m"), nextText.trimEnd())
    if (!updated.endsWith("\n")) updated += "\n"
  } else {
    updated = nextText
  }

  if (updated === current) {
    return { path: spec.path, created: false, changed: false }
  }

  writeFileSync(spec.path, updated)
  return { path: spec.path, created: false, changed: true }
}

export function syncManagedFiles(specs: ManagedFileSpec[]): ManagedWriteResult[] {
  return specs.map(writeManagedFile)
}

export function hasManagedDrift(spec: ManagedFileSpec): boolean {
  if (!existsSync(spec.path)) return true

  const current = readFileSync(spec.path, "utf-8")
  const rendered = renderManagedContent(spec.marker, spec.content)
  const { start, end } = markerBounds(spec.marker)

  if (current.includes(start) && current.includes(end)) {
    const currentBlock = current.match(new RegExp(`${start}[\\s\\S]*?${end}`, "m"))?.[0] ?? ""
    return currentBlock.trim() !== rendered.trim()
  }

  return current.trim() !== rendered.trim()
}
