import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import type { ProjectState, ProjectType } from "../types"

export const STATE_PATH = ".harness/state.json"
export const PRD_PATH = "docs/PRD.md"
export const PRD_DIR = "docs/prd"
export const ARCHITECTURE_PATH = "docs/ARCHITECTURE.md"
export const ARCHITECTURE_DIR = "docs/architecture"
export const PROGRESS_PATH = "docs/PROGRESS.md"
export const PROGRESS_DIR = "docs/progress"
export const DEFAULT_DEPENDENCY_LAYERS = ["types", "config", "lib", "services", "app"]
export const UI_PROJECT_TYPES = ["web-app", "ios-app", "android-app", "mobile-cross-platform", "desktop"]
export const HARNESS_CRITICAL_TOTAL = 19

export function isUiProject(types: ProjectType[]): boolean {
  return types.some(type => UI_PROJECT_TYPES.includes(type))
}

export function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.toLowerCase().endsWith(".md"))
    .sort()
    .map(file => join(dir, file))
}

export function hasModularDocument(dir: string): boolean {
  return listMarkdownFiles(dir).length > 0
}

export function documentExists(indexPath: string, dir: string): boolean {
  return existsSync(indexPath) || hasModularDocument(dir)
}

export function readDocument(indexPath: string, dir: string): string {
  const modularFiles = listMarkdownFiles(dir)
  if (modularFiles.length > 0) {
    return modularFiles
      .map(path => readFileSync(path, "utf-8").trim())
      .filter(Boolean)
      .join("\n\n")
  }

  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8")
  }

  return ""
}

function parseDocumentVersion(content: string): string | undefined {
  if (!content) return undefined
  const match = content.match(/^\s*>\s*\*\*Version\*\*:\s*(v[0-9][^\r\n]*)$/im)
  return match?.[1]?.trim()
}

type StageHeading = {
  id: string
  line: number
  status: string
}

function parseStageHeadings(content: string): StageHeading[] {
  return content
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(
        /^##\s+Product Stage\s+(V\d+)\s*:\s*(.+?)(?:\s+\[(ACTIVE|DEFERRED|DEPLOY_REVIEW|COMPLETED)\])?\s*$/i,
      )
      if (!match) return []
      return [
        {
          id: match[1]!.trim(),
          line: index,
          status: (match[3] ?? "").trim().toUpperCase(),
        },
      ]
    })
}

export function countMilestonesFromPrd(): number {
  const content = readDocument(PRD_PATH, PRD_DIR)
  if (!content) return 0

  const stageHeadings = parseStageHeadings(content)
  if (stageHeadings.length === 0) {
    return Array.from(content.matchAll(/^###\s+Milestone\b/gm)).length
  }

  const lines = content.split(/\r?\n/)
  const activeStage =
    stageHeadings.find(stage => stage.status === "ACTIVE")
    ?? stageHeadings[0]
  if (!activeStage) return 0

  const nextStageLine =
    stageHeadings.find(stage => stage.line > activeStage.line)?.line
    ?? lines.length

  return lines
    .slice(activeStage.line + 1, nextStageLine)
    .filter(line => /^###\s+Milestone\b/.test(line))
    .length
}

export function collectDesignSpecs(): string[] {
  const dir = "docs/design"
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => /^m\d+(-[a-z0-9]+)*-ui-spec\.md$/i.test(file))
    .sort()
    .map(file => join(dir, file).replace(/\\/g, "/"))
}

export function collectAdrFiles(): string[] {
  const dir = "docs/adr"
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => /^ADR-\d{3}.*\.md$/i.test(file))
    .sort()
    .map(file => join(dir, file).replace(/\\/g, "/"))
}

function packageJsonHasScript(scriptName: string): boolean {
  if (!existsSync("package.json")) return false

  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
      scripts?: Record<string, string>
    }
    return Boolean(pkg.scripts?.[scriptName])
  } catch {
    return false
  }
}

function dependencyCruiserConfigured(): boolean {
  return existsSync(".dependency-cruiser.cjs") || existsSync(".dependency-cruiser.js")
}

function dependencyCruiserValidatedInCi(): boolean {
  if (!dependencyCruiserConfigured()) return false
  if (!existsSync(".github/workflows/ci.yml")) return false
  return (
    readFileSync(".github/workflows/ci.yml", "utf-8").includes("bun run check:deps") &&
    packageJsonHasScript("check:deps")
  )
}

export function deriveStateFromFilesystem(
  state: ProjectState,
  options: { updateProgressTimestamp?: boolean; updateValidationTimestamp?: boolean } = {},
): ProjectState {
  const next: ProjectState = JSON.parse(JSON.stringify(state)) as ProjectState
  const now = new Date().toISOString()
  const prdContent = readDocument(PRD_PATH, PRD_DIR)
  const architectureContent = readDocument(ARCHITECTURE_PATH, ARCHITECTURE_DIR)
  const currentStage =
    next.roadmap.stages.find(stage => stage.id === next.roadmap.currentStageId)
    ?? next.roadmap.stages.find(stage => stage.status === "ACTIVE")
    ?? next.roadmap.stages.find(stage => stage.status === "DEPLOY_REVIEW")

  next.updatedAt = now
  next.docs.prd.exists = documentExists(PRD_PATH, PRD_DIR)
  next.docs.prd.version = parseDocumentVersion(prdContent) ?? next.docs.prd.version
  next.docs.prd.milestoneCount =
    currentStage?.milestoneIds.length
    ?? countMilestonesFromPrd()

  next.docs.architecture.exists = documentExists(ARCHITECTURE_PATH, ARCHITECTURE_DIR)
  next.docs.architecture.version = parseDocumentVersion(architectureContent) ?? next.docs.architecture.version
  next.docs.architecture.dependencyLayers =
    next.docs.architecture.dependencyLayers.length > 0
      ? next.docs.architecture.dependencyLayers
      : [...DEFAULT_DEPENDENCY_LAYERS]
  next.docs.architecture.ciValidated = dependencyCruiserValidatedInCi()

  next.docs.progress.exists =
    documentExists(PROGRESS_PATH, PROGRESS_DIR) || next.execution.milestones.length > 0
  if (options.updateProgressTimestamp ?? true) {
    next.docs.progress.lastUpdated = now
  }

  next.docs.gitbook.initialized = existsSync("docs/gitbook/SUMMARY.md")
  next.docs.gitbook.summaryExists = existsSync("docs/gitbook/SUMMARY.md")
  next.docs.readme.exists = existsSync("README.md")
  next.docs.adrs = collectAdrFiles()

  next.scaffold.agentsMdExists = existsSync("AGENTS.md")
  next.scaffold.claudeMdExists = existsSync("CLAUDE.md")
  next.scaffold.envExampleExists = existsSync(".env.example")
  next.scaffold.ciExists = existsSync(".github/workflows/ci.yml")
  next.scaffold.cdExists = existsSync(".github/workflows/release.yml")
  next.scaffold.prTemplateExists = existsSync(".github/PULL_REQUEST_TEMPLATE.md")
  next.scaffold.depCheckConfigured = dependencyCruiserConfigured()
  next.scaffold.linterConfigured = existsSync("biome.json") || existsSync(".eslintrc.json") || existsSync(".eslintrc.js") || existsSync("ruff.toml") || existsSync("pyproject.toml")
  next.scaffold.manifestExists = existsSync(next.toolchain?.manifestFile ?? "package.json")
  next.scaffold.githubSetup = next.scaffold.githubSetup || next.github?.repoCreated === true

  if (isUiProject(next.projectInfo.types)) {
    next.docs.design = {
      systemPath: "docs/design/DESIGN_SYSTEM.md",
      exists: existsSync("docs/design/DESIGN_SYSTEM.md"),
      milestoneSpecs: collectDesignSpecs(),
    }
  } else {
    delete next.docs.design
  }

  next.execution.allMilestonesComplete =
    next.execution.milestones.length > 0 &&
    next.execution.milestones.every(milestone =>
      milestone.status === "COMPLETE" || milestone.status === "MERGED",
    )

  next.validation.criticalTotal = HARNESS_CRITICAL_TOTAL
  if (options.updateValidationTimestamp) {
    next.validation.lastRun = now
  }

  return next
}
