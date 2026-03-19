import { existsSync, readFileSync } from "node:fs"
import type { Phase, ProjectState } from "../types"
import { getAllAgentEntries } from "./orchestrator/agent-registry"
import { architectureDefinesDependencyDirection, getPlanningDocumentIssues } from "./planning-docs"
import {
  ARCHITECTURE_DIR,
  ARCHITECTURE_PATH,
  documentExists,
  isUiProject,
  PROGRESS_DIR,
  PROGRESS_PATH,
  PRD_DIR,
  PRD_PATH,
  STATE_PATH,
} from "./shared"
import { hasAgentSurface, surfaceWorkspaceList } from "./surfaces"
import { filesShareHash } from "./validation/helpers"

export type StructuralCheck = {
  hint?: string
  label: string
  level?: "standard" | "full"
  ok: boolean
}

function check(ok: boolean, label: string, hint?: string, level?: "standard" | "full"): StructuralCheck {
  return { hint, label, level, ok }
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

function packageJsonHasWorkspace(workspace: string): boolean {
  if (!existsSync("package.json")) return false

  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
      workspaces?: string[]
    }
    return Boolean(pkg.workspaces?.includes(workspace))
  } catch {
    return false
  }
}

function requiredAgentPaths(): string[] {
  return getAllAgentEntries()
    .flatMap(entry => [entry.specPath, ...(entry.subSpecs ?? [])])
    .filter((value, index, all) => all.indexOf(value) === index)
}

function planningDocumentChecks(): StructuralCheck[] {
  return getPlanningDocumentIssues().map(issue =>
    check(false, issue.reason, issue.hint),
  )
}

function scaffoldPlanningChecks(state: ProjectState): StructuralCheck[] {
  return [
    check(documentExists(PRD_PATH, PRD_DIR), "docs/PRD.md or docs/prd/ is present"),
    check(
      documentExists(ARCHITECTURE_PATH, ARCHITECTURE_DIR),
      "docs/ARCHITECTURE.md or docs/architecture/ is present",
    ),
    check(state.docs.gitbook.initialized, "docs/gitbook/ is initialized", undefined, "full"),
    check(existsSync("docs/gitbook/SUMMARY.md"), "docs/gitbook/SUMMARY.md is present", undefined, "full"),
    check(
      architectureDefinesDependencyDirection(),
      "ARCHITECTURE defines dependency direction (types → config → lib → services → app)",
      "Add the dependency direction to docs/ARCHITECTURE.md or docs/architecture/03-dependency-rules.md",
    ),
    check(state.docs.prd.milestoneCount > 0, "the PRD includes at least 1 milestone"),
    ...planningDocumentChecks(),
  ]
}

function executingStructuralChecks(state: ProjectState): StructuralCheck[] {
  const checks: StructuralCheck[] = [
    ...scaffoldPlanningChecks(state),
    check(existsSync("AGENTS.md"), "AGENTS.md is present"),
    check(existsSync("CLAUDE.md"), "CLAUDE.md is present"),
    check(filesShareHash("AGENTS.md", "CLAUDE.md"), "AGENTS.md == CLAUDE.md (same hash) [G8]"),
    check(existsSync(STATE_PATH), ".harness/state.json is present"),
    check(existsSync(".github/workflows/ci.yml"), "CI workflow is present"),
    check(documentExists(PROGRESS_PATH, PROGRESS_DIR), "docs/PROGRESS.md or docs/progress/ is present"),
    check(existsSync(".env.example"), ".env.example is present"),
    check(existsSync(".env.local"), ".env.local skeleton is present"),
    check(existsSync("biome.json"), "biome.json is present [linter]"),
    check(existsSync(".harness/types.ts"), ".harness/types.ts is present"),
    check(existsSync(".harness/init.ts"), ".harness/init.ts is present"),
    check(existsSync(".harness/advance.ts"), ".harness/advance.ts is present"),
    check(existsSync(".harness/state.ts"), ".harness/state.ts is present"),
    check(existsSync(".harness/validate.ts"), ".harness/validate.ts is present"),
    check(existsSync(".harness/orchestrator.ts"), ".harness/orchestrator.ts is present"),
    check(existsSync(".harness/orchestrate.ts"), ".harness/orchestrate.ts is present"),
    check(existsSync(".harness/stage.ts"), ".harness/stage.ts is present"),
    check(existsSync(".harness/compact.ts"), ".harness/compact.ts is present"),
    check(existsSync(".harness/add-surface.ts"), ".harness/add-surface.ts is present"),
    check(existsSync(".harness/audit.ts"), ".harness/audit.ts is present"),
    check(existsSync(".harness/sync-docs.ts"), ".harness/sync-docs.ts is present"),
    check(existsSync(".harness/sync-skills.ts"), ".harness/sync-skills.ts is present"),
    check(existsSync(".harness/api-add.ts"), ".harness/api-add.ts is present"),
    check(existsSync(".harness/merge-milestone.ts"), ".harness/merge-milestone.ts is present"),
    check(existsSync(".harness/resume.ts"), ".harness/resume.ts is present"),
    check(existsSync(".harness/learn.ts"), ".harness/learn.ts is present"),
    check(existsSync(".harness/metrics.ts"), ".harness/metrics.ts is present"),
    check(existsSync(".harness/entropy-scan.ts"), ".harness/entropy-scan.ts is present"),
    check(existsSync(".harness/scope-change.ts"), ".harness/scope-change.ts is present"),
    check(packageJsonHasScript("harness:merge-milestone"), "package.json includes harness:merge-milestone"),
    check(existsSync("scripts/harness-local/restore.ts"), "scripts/harness-local/restore.ts is present"),
    check(existsSync("scripts/harness-local/manifest.json"), "scripts/harness-local/manifest.json is present"),
    check(packageJsonHasScript("harness:init"), "package.json includes harness:init"),
    check(packageJsonHasScript("harness:init:prd"), "package.json includes harness:init:prd"),
    check(packageJsonHasScript("harness:advance"), "package.json includes harness:advance"),
    check(packageJsonHasScript("harness:stage"), "package.json includes harness:stage"),
    check(packageJsonHasScript("harness:state"), "package.json includes harness:state"),
    check(packageJsonHasScript("harness:env"), "package.json includes harness:env"),
    check(packageJsonHasScript("harness:validate"), "package.json includes harness:validate"),
    check(packageJsonHasScript("harness:validate:phase"), "package.json includes harness:validate:phase"),
    check(packageJsonHasScript("harness:validate:task"), "package.json includes harness:validate:task"),
    check(packageJsonHasScript("harness:validate:milestone"), "package.json includes harness:validate:milestone"),
    check(packageJsonHasScript("harness:guardian"), "package.json includes harness:guardian"),
    check(packageJsonHasScript("harness:sync-backlog"), "package.json includes harness:sync-backlog"),
    check(packageJsonHasScript("harness:add-surface"), "package.json includes harness:add-surface"),
    check(packageJsonHasScript("harness:autoflow"), "package.json includes harness:autoflow"),
    check(packageJsonHasScript("harness:audit"), "package.json includes harness:audit"),
    check(packageJsonHasScript("harness:hooks:install"), "package.json includes harness:hooks:install"),
    check(packageJsonHasScript("harness:sync-docs"), "package.json includes harness:sync-docs"),
    check(packageJsonHasScript("harness:sync-skills"), "package.json includes harness:sync-skills"),
    check(packageJsonHasScript("harness:api:add"), "package.json includes harness:api:add"),
    check(packageJsonHasScript("harness:resume"), "package.json includes harness:resume"),
    check(packageJsonHasScript("harness:learn"), "package.json includes harness:learn"),
    check(packageJsonHasScript("harness:metrics"), "package.json includes harness:metrics"),
    check(packageJsonHasScript("harness:entropy-scan"), "package.json includes harness:entropy-scan"),
    check(packageJsonHasScript("harness:scope-change"), "package.json includes harness:scope-change"),
    check(packageJsonHasScript("harness:orchestrator"), "package.json includes harness:orchestrator"),
    check(packageJsonHasScript("harness:orchestrate"), "package.json includes harness:orchestrate"),
    check(packageJsonHasScript("harness:compact"), "package.json includes harness:compact"),
    check(packageJsonHasScript("harness:compact:milestone"), "package.json includes harness:compact:milestone"),
    check(packageJsonHasScript("harness:compact:status"), "package.json includes harness:compact:status"),
    check(packageJsonHasWorkspace("apps/*"), "package.json includes apps/* workspace", undefined, "standard"),
    check(packageJsonHasWorkspace("packages/*"), "package.json includes packages/* workspace", undefined, "standard"),
    check(existsSync("packages/shared/package.json"), "packages/shared/package.json is present", undefined, "standard"),
  ]

  for (const workspace of surfaceWorkspaceList(state.projectInfo.types)) {
    checks.push(check(existsSync(`apps/${workspace}/package.json`), `apps/${workspace}/package.json is present`))
  }

  if (hasAgentSurface(state.projectInfo.types)) {
    checks.push(check(existsSync("SKILLS.md"), "SKILLS.md is present"))
    checks.push(check(existsSync("skills/api-wrapper/SKILL.md"), "skills/api-wrapper/SKILL.md is present"))
    checks.push(check(existsSync("packages/shared/api/README.md"), "packages/shared/api/README.md is present"))
  }

  const missingAgentPaths = requiredAgentPaths().filter(path => !existsSync(path))
  checks.push(
    check(
      missingAgentPaths.length === 0,
      "orchestrator-dependent agents/* specs are present",
      missingAgentPaths.length > 0 ? missingAgentPaths[0] : undefined,
    ),
  )

  if (existsSync(".gitignore")) {
    const gitignore = readFileSync(".gitignore", "utf-8")
    checks.push(check(gitignore.includes(".env"), ".gitignore includes .env [G6]"))
    checks.push(check(gitignore.includes("node_modules"), ".gitignore includes node_modules [G6]"))
    checks.push(check(gitignore.includes(".harness/"), ".gitignore includes .harness/ local harness framework"))
    checks.push(check(gitignore.includes("AGENTS.md"), ".gitignore includes AGENTS.md local harness file"))
    checks.push(check(gitignore.includes("CLAUDE.md"), ".gitignore includes CLAUDE.md local harness file"))
    checks.push(check(gitignore.includes("agents/"), ".gitignore includes agents/ local harness specs"))
    checks.push(check(gitignore.includes("docs/ai/"), ".gitignore includes docs/ai/ local harness docs"))
    checks.push(check(gitignore.includes("docs/progress/"), ".gitignore includes docs/progress/ local harness docs"))
  } else {
    checks.push(check(false, ".gitignore is missing", "Run harness-setup again to restore the base files"))
  }

  return checks
}

export function getPhaseStructuralChecks(phase: Phase, state: ProjectState): StructuralCheck[] {
  switch (phase) {
    case "MARKET_RESEARCH":
      return [
        check(!!state.projectInfo.name, "projectInfo.name is set [Q1]"),
        check(!!state.projectInfo.displayName, "projectInfo.displayName is set"),
        check(!!state.projectInfo.concept, "projectInfo.concept is set [Q2]"),
        check(!!state.projectInfo.problem, "projectInfo.problem is set [Q3]"),
        check(!!state.projectInfo.goal, "projectInfo.goal is set [Q4]"),
        check(state.projectInfo.types.length > 0, "projectInfo.types is selected [Q5]"),
        check(!!state.projectInfo.aiProvider, "aiProvider is selected [Q6]"),
        check(!!state.projectInfo.teamSize, "teamSize is selected [Q8]"),
        check(typeof state.projectInfo.isGreenfield === "boolean", "isGreenfield is decided [Q0]"),
        ...(isUiProject(state.projectInfo.types)
          ? [check(!!state.projectInfo.designStyle, "designStyle is selected [Q9] (required for UI projects)")]
          : []),
      ]

    case "TECH_STACK":
      return [
        check(!!state.marketResearch.summary, "marketResearch.summary is present"),
        check(state.marketResearch.competitors.length > 0, "competitors.length > 0"),
        check(
          state.techStack.decisions.every(decision => !!decision.adrFile?.trim()),
          "every techStack decision has an adrFile",
          "Create docs/adr/ADR-xxx.md and persist the matching techStack.decisions[].adrFile",
        ),
      ]

    case "PRD_ARCH":
      return [
        check(state.techStack.confirmed, "techStack.confirmed = true"),
        check(state.techStack.decisions.length > 0, `techStack.decisions: ${state.techStack.decisions.length} ADR(s)`),
        check(
          state.techStack.decisions.every(decision => !!decision.adrFile?.trim()),
          "every ADR / stack decision has an adrFile",
          "Every stack decision must map to docs/adr/ADR-xxx.md",
        ),
      ]

    case "SCAFFOLD":
      return scaffoldPlanningChecks(state)

    case "EXECUTING":
      return executingStructuralChecks(state)

    case "VALIDATING":
      return [
        check(state.execution.allMilestonesComplete, "all milestones are complete"),
        check(
          state.execution.milestones.every(milestone => ["COMPLETE", "MERGED"].includes(milestone.status)),
          "all milestone statuses are COMPLETE / MERGED",
        ),
      ]

    case "COMPLETE":
      return [
        check(state.validation.score >= 80, "validation.score >= 80"),
        check(state.docs.readme.isFinal, "docs.readme.isFinal is true"),
        check(state.execution.allMilestonesComplete, "all milestones are complete"),
        check(
          state.execution.milestones.every(milestone => ["COMPLETE", "MERGED"].includes(milestone.status)),
          "all milestone statuses are COMPLETE / MERGED",
        ),
      ]
    case "DISCOVERY":
      return []
  }
}
