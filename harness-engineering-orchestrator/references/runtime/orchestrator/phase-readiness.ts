import { existsSync, readFileSync } from "fs"
import type { Phase, ProjectState } from "../../types"
import {
  ARCHITECTURE_DIR,
  ARCHITECTURE_PATH,
  documentExists,
  PROGRESS_DIR,
  PROGRESS_PATH,
  PRD_DIR,
  PRD_PATH,
  STATE_PATH,
} from "../shared"
import { hasAgentSurface, surfaceWorkspaceList } from "../surfaces"

type OutputCheck = {
  label: string
  ok: boolean
}

export interface PhaseReadiness {
  missingOutputs: string[]
  phase: Phase
  ready: boolean
  requiredOutputs: string[]
}

function check(label: string, ok: boolean): OutputCheck {
  return { label, ok }
}

function buildReadiness(phase: Phase, checks: OutputCheck[]): PhaseReadiness {
  return {
    missingOutputs: checks.filter(item => !item.ok).map(item => item.label),
    phase,
    ready: checks.every(item => item.ok),
    requiredOutputs: checks.map(item => item.label),
  }
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

function discoveryChecks(state: ProjectState): OutputCheck[] {
  return [
    check("projectInfo.name is set [Q1]", !!state.projectInfo.name),
    check("projectInfo.displayName is set", !!state.projectInfo.displayName),
    check("projectInfo.concept is set [Q2]", !!state.projectInfo.concept),
    check("projectInfo.problem is set [Q3]", !!state.projectInfo.problem),
    check("projectInfo.goal is set [Q4]", !!state.projectInfo.goal),
    check("projectInfo.types is selected [Q5]", state.projectInfo.types.length > 0),
    check("aiProvider is selected [Q6]", !!state.projectInfo.aiProvider),
    check("teamSize is selected [Q8]", !!state.projectInfo.teamSize),
  ]
}

function marketResearchChecks(state: ProjectState): OutputCheck[] {
  return [
    check("marketResearch.summary is present", !!state.marketResearch.summary),
    check("marketResearch.competitors has at least one entry", state.marketResearch.competitors.length > 0),
  ]
}

function techStackChecks(state: ProjectState): OutputCheck[] {
  return [
    check("techStack.confirmed = true", state.techStack.confirmed),
    check("techStack.decisions has at least one entry", state.techStack.decisions.length > 0),
    check(
      "every techStack decision has an adrFile",
      state.techStack.decisions.every(decision => !!decision.adrFile?.trim()),
    ),
  ]
}

function prdArchChecks(state: ProjectState): OutputCheck[] {
  return [
    check("docs/PRD.md or docs/prd/ is present", documentExists(PRD_PATH, PRD_DIR)),
    check(
      "docs/ARCHITECTURE.md or docs/architecture/ is present",
      documentExists(ARCHITECTURE_PATH, ARCHITECTURE_DIR),
    ),
    check("docs/gitbook/SUMMARY.md is present", existsSync("docs/gitbook/SUMMARY.md")),
    check("the PRD includes at least 1 milestone", state.docs.prd.milestoneCount > 0),
  ]
}

function scaffoldChecks(state: ProjectState): OutputCheck[] {
  const checks: OutputCheck[] = [
    check("AGENTS.md is present", state.scaffold.agentsMdExists),
    check("CLAUDE.md is present", state.scaffold.claudeMdExists),
    check(".harness/state.json is present", existsSync(STATE_PATH)),
    check("docs/PROGRESS.md or docs/progress/ is present", documentExists(PROGRESS_PATH, PROGRESS_DIR)),
    check(".env.example is present", state.scaffold.envExampleExists),
    check(".env.local skeleton is present", existsSync(".env.local")),
    check("biome.json is present", existsSync("biome.json")),
    check(".harness/advance.ts is present", existsSync(".harness/advance.ts")),
    check(".harness/compact.ts is present", existsSync(".harness/compact.ts")),
    check(".harness/add-surface.ts is present", existsSync(".harness/add-surface.ts")),
    check(".harness/audit.ts is present", existsSync(".harness/audit.ts")),
    check(".harness/sync-docs.ts is present", existsSync(".harness/sync-docs.ts")),
    check(".harness/sync-skills.ts is present", existsSync(".harness/sync-skills.ts")),
    check(".harness/api-add.ts is present", existsSync(".harness/api-add.ts")),
    check(".harness/merge-milestone.ts is present", existsSync(".harness/merge-milestone.ts")),
    check("scripts/harness-local/restore.ts is present", existsSync("scripts/harness-local/restore.ts")),
    check("scripts/harness-local/manifest.json is present", existsSync("scripts/harness-local/manifest.json")),
    check("package.json includes harness:advance", packageJsonHasScript("harness:advance")),
    check("package.json includes harness:autoflow", packageJsonHasScript("harness:autoflow")),
    check(
      "package.json includes harness:merge-milestone",
      packageJsonHasScript("harness:merge-milestone"),
    ),
    check("package.json includes apps/* workspace", packageJsonHasWorkspace("apps/*")),
    check("package.json includes packages/* workspace", packageJsonHasWorkspace("packages/*")),
    check("packages/shared/package.json is present", existsSync("packages/shared/package.json")),
    check("CI workflow is present", state.scaffold.ciExists),
  ]

  for (const workspace of surfaceWorkspaceList(state.projectInfo.types)) {
    checks.push(check(`apps/${workspace}/package.json is present`, existsSync(`apps/${workspace}/package.json`)))
  }

  if (hasAgentSurface(state.projectInfo.types)) {
    checks.push(check("SKILLS.md is present", existsSync("SKILLS.md")))
    checks.push(check("skills/api-wrapper/SKILL.md is present", existsSync("skills/api-wrapper/SKILL.md")))
    checks.push(check("packages/shared/api/README.md is present", existsSync("packages/shared/api/README.md")))
  }

  return checks
}

export function getPhaseReadiness(state: ProjectState): PhaseReadiness {
  switch (state.phase) {
    case "DISCOVERY":
      return buildReadiness(state.phase, discoveryChecks(state))
    case "MARKET_RESEARCH":
      return buildReadiness(state.phase, marketResearchChecks(state))
    case "TECH_STACK":
      return buildReadiness(state.phase, techStackChecks(state))
    case "PRD_ARCH":
      return buildReadiness(state.phase, prdArchChecks(state))
    case "SCAFFOLD":
      return buildReadiness(state.phase, scaffoldChecks(state))
    case "EXECUTING":
      return buildReadiness(state.phase, [
        check("execution backlog has at least 1 milestone", state.execution.milestones.length > 0),
        check(
          "there is an active milestone or a milestone in REVIEW",
          Boolean(state.execution.currentMilestone) || state.execution.milestones.some(item => item.status === "REVIEW"),
        ),
      ])
    case "VALIDATING":
      return buildReadiness(state.phase, [
        check("all milestones are complete", state.execution.allMilestonesComplete),
      ])
    case "COMPLETE":
      return buildReadiness(state.phase, [])
  }
}
