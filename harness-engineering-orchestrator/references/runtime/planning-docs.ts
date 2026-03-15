import { existsSync, readFileSync } from "fs"
import {
  ARCHITECTURE_DIR,
  ARCHITECTURE_PATH,
  listMarkdownFiles,
  PRD_DIR,
  PRD_PATH,
  readDocument,
} from "./shared"

export type PlanningDocArea = "PRD" | "ARCHITECTURE"

export type PlanningDocIssue = {
  area: PlanningDocArea
  hint: string
  path: string
  reason: string
}

const UNRESOLVED_TEMPLATE_TOKENS = [
  "PROJECT_NAME",
  "PROJECT_DISPLAY_NAME",
  "PROJECT_TYPE",
  "PROJECT_TYPES",
  "PROJECT_DESCRIPTION",
  "PROJECT_CONCEPT",
  "PROJECT_PROBLEM",
  "PROJECT_GOAL",
  "AI_PROVIDER",
  "TEAM_SIZE",
  "GREENFIELD_MODE",
  "DESIGN_STYLE",
  "DESIGN_REFERENCE",
  "YOUR_NAME",
  "USER_NAME",
  "ORG",
  "REPO",
  "PROJECT_URL",
  "GITBOOK_URL",
  "DATE",
  "DATETIME",
  "YEAR",
  "SECURITY_EMAIL",
  "AUTHOR",
  "VISUAL_DESIGN_CONTENT",
  "DIRECTORY_STRUCTURE",
  "CURRENT_PHASE",
  "CURRENT_MILESTONE",
  "CURRENT_WORKTREE",
  "CURRENT_TASK",
  "PROGRESS_BAR",
  "DONE_TASKS",
  "TOTAL_TASKS",
  "PROGRESS_PERCENT",
  "SURFACE_EVOLUTION_NOTE",
  "AGENT_SKILLS_CONTEXT",
  "AGENT_SKILLS_AGENTS",
  "AGENT_SKILLS_DOC_MAP",
  "AGENT_SKILLS_QUICKSTART",
  "AGENT_SKILLS_REQUIREMENTS",
  "EXISTING_REPO_SUMMARY",
  "EXISTING_DEPENDENCY_SUMMARY",
  "EXISTING_SCRIPT_SUMMARY",
  "EXISTING_DIRECTORY_SUMMARY",
] as const

const STOCK_PRD_FINGERPRINTS = [
  {
    hint: "Replace the stock F001 scaffold scope with the real first milestone for this project.",
    label: 'stock scaffold feature "F001: Harness Base Scaffold"',
    pattern: /^####\s+F001:\s+Harness Base Scaffold\b/im,
  },
  {
    hint: "Replace the stock F002 scaffold scope with the real execution-loop requirements for this project.",
    label: 'stock scaffold feature "F002: Backlog and Validation Closed Loop"',
    pattern: /^####\s+F002:\s+Backlog and Validation Closed Loop\b/im,
  },
  {
    hint: "Replace the stock deferred placeholder with the real follow-up version scope, or remove it until it exists.",
    label: 'stock scaffold feature "F003: Next Version Placeholder"',
    pattern: /^####\s+F003:\s+Next Version Placeholder\b/im,
  },
] as const

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const TEMPLATE_TOKEN_PATTERN = new RegExp(
  `\\[(${UNRESOLVED_TEMPLATE_TOKENS.map(escapeRegex).join("|")})\\]`,
  "g",
)

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/")
}

function getProjectDocPaths(indexPath: string, dir: string): string[] {
  const modularFiles = listMarkdownFiles(dir)
  if (modularFiles.length > 0) {
    return modularFiles.map(normalizePath)
  }

  return existsSync(indexPath) ? [normalizePath(indexPath)] : []
}

function scanTemplateTokens(area: PlanningDocArea, path: string, content: string): PlanningDocIssue[] {
  const tokens = Array.from(
    new Set(Array.from(content.matchAll(TEMPLATE_TOKEN_PATTERN)).map(match => match[1] ?? "")),
  ).filter(Boolean)

  return tokens.map(token => ({
    area,
    hint: `Replace [${token}] with project-specific content in ${path}.`,
    path,
    reason: `${path} still contains unresolved template token [${token}]`,
  }))
}

function scanStockPrdFingerprints(path: string, content: string): PlanningDocIssue[] {
  return STOCK_PRD_FINGERPRINTS.flatMap(fingerprint => {
    if (!fingerprint.pattern.test(content)) return []
    fingerprint.pattern.lastIndex = 0

    return [
      {
        area: "PRD" as const,
        hint: fingerprint.hint,
        path,
        reason: `${path} still contains ${fingerprint.label}`,
      },
    ]
  })
}

function dedupeIssues(issues: PlanningDocIssue[]): PlanningDocIssue[] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.path}::${issue.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function architectureDefinesDependencyDirection(): boolean {
  const architecture = readDocument(ARCHITECTURE_PATH, ARCHITECTURE_DIR)
  if (!architecture) return false

  const normalized = architecture
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return (
    normalized.includes("types → config → lib → services → app") ||
    normalized.includes("types -> config -> lib -> services -> app")
  )
}

export function getPlanningDocumentIssues(): PlanningDocIssue[] {
  const issues: PlanningDocIssue[] = []

  for (const path of getProjectDocPaths(PRD_PATH, PRD_DIR)) {
    const content = readFileSync(path, "utf-8")
    issues.push(...scanTemplateTokens("PRD", path, content))
    issues.push(...scanStockPrdFingerprints(path, content))
  }

  for (const path of getProjectDocPaths(ARCHITECTURE_PATH, ARCHITECTURE_DIR)) {
    const content = readFileSync(path, "utf-8")
    issues.push(...scanTemplateTokens("ARCHITECTURE", path, content))
  }

  return dedupeIssues(issues)
}

export function planningDocumentsAreReady(): boolean {
  return getPlanningDocumentIssues().length === 0
}

export function formatPlanningDocumentIssues(issues: PlanningDocIssue[], maxIssues = 3): string {
  if (issues.length === 0) return ""

  const visible = issues.slice(0, maxIssues).map(issue => `- ${issue.reason}`)
  const remaining = issues.length - visible.length

  if (remaining > 0) {
    visible.push(`- +${remaining} more planning document issue(s)`)
  }

  return visible.join("\n")
}

export function assertPlanningDocumentsReady(): void {
  const issues = getPlanningDocumentIssues()
  if (issues.length === 0) return

  throw new Error(
    "Planning docs are still using scaffold placeholder content. Fix PRD / Architecture before generating or syncing the execution backlog:\n" +
    formatPlanningDocumentIssues(issues),
  )
}
