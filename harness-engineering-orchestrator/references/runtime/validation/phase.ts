import { existsSync, readFileSync } from "fs"
import type { Phase, ProjectState } from "../../types"
import {
  documentExists,
  readDocument,
  ARCHITECTURE_DIR,
  ARCHITECTURE_PATH,
  PROGRESS_DIR,
  PROGRESS_PATH,
  PRD_DIR,
  PRD_PATH,
  STATE_PATH,
  isUiProject,
} from "../shared"
import { filesShareHash, runBun, runGit } from "./helpers"
import type { ValidationReporter } from "./reporter"
import { computeHarnessScore } from "./milestone-score"
import { getAllAgentEntries } from "../orchestrator/agent-registry"
import { hasAgentSurface, surfaceWorkspaceList } from "../surfaces"

function architectureDefinesDependencyDirection(): boolean {
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

function onlyMainWorktreeRemains(): { ok: boolean; hint?: string } {
  const result = runGit(["worktree", "list", "--porcelain"])
  if (!result.ok) {
    return { ok: false, hint: result.output || "Unable to run git worktree list --porcelain" }
  }

  const worktreeLines = result.output
    .split(/\r?\n/)
    .filter(line => line.startsWith("worktree "))

  if (worktreeLines.length !== 1) {
    return {
      ok: false,
      hint: `There are currently ${worktreeLines.length} worktrees. Clean them up until only the primary worktree remains.`,
    }
  }

  const branchLine = result.output
    .split(/\r?\n/)
    .find(line => line.startsWith("branch "))

  if (!branchLine) {
    return { ok: false, hint: "Unable to identify the branch attached to the primary worktree." }
  }

  const branch = branchLine.replace(/^branch\s+refs\/heads\//, "").trim()
  if (branch === "main" || branch === "master") {
    return { ok: true }
  }

  return {
    ok: false,
    hint: `The primary worktree is currently on ${branch}; expected main/master.`,
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

function requiredAgentPaths(): string[] {
  return getAllAgentEntries()
    .flatMap(entry => [entry.specPath, ...(entry.subSpecs ?? [])])
    .filter((value, index, all) => all.indexOf(value) === index)
}

export async function validatePhaseGate(
  phase: Phase,
  state: ProjectState,
  reporter: ValidationReporter,
): Promise<void> {
  reporter.section(`Phase Gate → ${phase}`)
  const check = (ok: boolean, label: string, hint?: string) => {
    if (ok) reporter.pass(label)
    else reporter.failSoft(label, hint)
  }

  switch (phase) {
    case "MARKET_RESEARCH":
      check(!!state.projectInfo.name, "projectInfo.name is set [Q1]")
      check(!!state.projectInfo.displayName, "projectInfo.displayName is set")
      check(!!state.projectInfo.concept, "projectInfo.concept is set [Q2]")
      check(!!state.projectInfo.problem, "projectInfo.problem is set [Q3]")
      check(!!state.projectInfo.goal, "projectInfo.goal is set [Q4]")
      check(state.projectInfo.types.length > 0, "projectInfo.types is selected [Q5]")
      check(!!state.projectInfo.aiProvider, "aiProvider is selected [Q6]")
      check(!!state.projectInfo.teamSize, "teamSize is selected [Q8]")
      check(typeof state.projectInfo.isGreenfield === "boolean", "isGreenfield is decided [Q0]")
      if (isUiProject(state.projectInfo.types)) {
        check(!!state.projectInfo.designStyle, "designStyle is selected [Q9] (required for UI projects)")
      }
      break

    case "TECH_STACK":
      check(!!state.marketResearch.summary, "marketResearch.summary is present")
      check(state.marketResearch.competitors.length > 0, "competitors.length > 0")
      check(
        state.techStack.decisions.every(decision => !!decision.adrFile?.trim()),
        "every techStack decision has an adrFile",
        "Create docs/adr/ADR-xxx.md and persist the matching techStack.decisions[].adrFile",
      )
      break

    case "PRD_ARCH":
      check(state.techStack.confirmed, "techStack.confirmed = true")
      check(state.techStack.decisions.length > 0, `techStack.decisions: ${state.techStack.decisions.length} ADR(s)`)
      check(
        state.techStack.decisions.every(decision => !!decision.adrFile?.trim()),
        "every ADR / stack decision has an adrFile",
        "Every stack decision must map to docs/adr/ADR-xxx.md",
      )
      break

    case "SCAFFOLD":
      check(documentExists(PRD_PATH, PRD_DIR), "docs/PRD.md or docs/prd/ is present")
      check(documentExists(ARCHITECTURE_PATH, ARCHITECTURE_DIR), "docs/ARCHITECTURE.md or docs/architecture/ is present")
      check(state.docs.gitbook.initialized, "docs/gitbook/ is initialized")
      check(existsSync("docs/gitbook/SUMMARY.md"), "docs/gitbook/SUMMARY.md is present")
      check(
        architectureDefinesDependencyDirection(),
        "ARCHITECTURE defines dependency direction (types → config → lib → services → app)",
        "Add the dependency direction to docs/ARCHITECTURE.md or docs/architecture/03-dependency-rules.md",
      )
      check(state.docs.prd.milestoneCount > 0, "the PRD includes at least 1 milestone")
      break

    case "EXECUTING": {
      check(existsSync("AGENTS.md"), "AGENTS.md is present")
      check(existsSync("CLAUDE.md"), "CLAUDE.md is present")
      check(filesShareHash("AGENTS.md", "CLAUDE.md"), "AGENTS.md == CLAUDE.md (same hash) [G8]")
      check(existsSync(STATE_PATH), ".harness/state.json is present")
      check(existsSync(".github/workflows/ci.yml"), "CI workflow is present")
      check(documentExists(PROGRESS_PATH, PROGRESS_DIR), "docs/PROGRESS.md or docs/progress/ is present")
      check(existsSync(".env.example"), ".env.example is present")
      check(existsSync(".env.local"), ".env.local skeleton is present")
      check(existsSync("biome.json"), "biome.json is present [linter]")
      check(existsSync(".harness/advance.ts"), ".harness/advance.ts is present")
      check(existsSync(".harness/compact.ts"), ".harness/compact.ts is present")
      check(existsSync(".harness/add-surface.ts"), ".harness/add-surface.ts is present")
      check(existsSync(".harness/audit.ts"), ".harness/audit.ts is present")
      check(existsSync(".harness/sync-docs.ts"), ".harness/sync-docs.ts is present")
      check(existsSync(".harness/sync-skills.ts"), ".harness/sync-skills.ts is present")
      check(existsSync(".harness/api-add.ts"), ".harness/api-add.ts is present")
      check(existsSync("scripts/harness-local/restore.ts"), "scripts/harness-local/restore.ts is present")
      check(existsSync("scripts/harness-local/manifest.json"), "scripts/harness-local/manifest.json is present")
      check(packageJsonHasScript("harness:advance"), "package.json includes harness:advance")
      check(packageJsonHasScript("harness:add-surface"), "package.json includes harness:add-surface")
      check(packageJsonHasScript("harness:autoflow"), "package.json includes harness:autoflow")
      check(packageJsonHasScript("harness:audit"), "package.json includes harness:audit")
      check(packageJsonHasScript("harness:hooks:install"), "package.json includes harness:hooks:install")
      check(packageJsonHasScript("harness:sync-docs"), "package.json includes harness:sync-docs")
      check(packageJsonHasScript("harness:sync-skills"), "package.json includes harness:sync-skills")
      check(packageJsonHasScript("harness:api:add"), "package.json includes harness:api:add")
      check(packageJsonHasScript("harness:compact"), "package.json includes harness:compact")
      check(packageJsonHasScript("harness:compact:milestone"), "package.json includes harness:compact:milestone")
      check(packageJsonHasScript("harness:compact:status"), "package.json includes harness:compact:status")
      check(packageJsonHasWorkspace("apps/*"), "package.json includes apps/* workspace")
      check(packageJsonHasWorkspace("packages/*"), "package.json includes packages/* workspace")
      check(existsSync("packages/shared/package.json"), "packages/shared/package.json is present")

      for (const workspace of surfaceWorkspaceList(state.projectInfo.types)) {
        check(existsSync(`apps/${workspace}/package.json`), `apps/${workspace}/package.json is present`)
      }

      if (hasAgentSurface(state.projectInfo.types)) {
        check(existsSync("SKILLS.md"), "SKILLS.md is present")
        check(existsSync("skills/api-wrapper/SKILL.md"), "skills/api-wrapper/SKILL.md is present")
        check(existsSync("packages/shared/api/README.md"), "packages/shared/api/README.md is present")
      }

      const missingAgentPaths = requiredAgentPaths().filter(path => !existsSync(path))
      check(
        missingAgentPaths.length === 0,
        "orchestrator-dependent agents/* specs are present",
        missingAgentPaths.length > 0 ? missingAgentPaths[0] : undefined,
      )

      if (existsSync(".gitignore")) {
        const gitignore = readFileSync(".gitignore", "utf-8")
        check(gitignore.includes(".env"), ".gitignore includes .env [G6]")
        check(gitignore.includes("node_modules"), ".gitignore includes node_modules [G6]")
        check(gitignore.includes(".harness/"), ".gitignore includes .harness/ local harness framework")
        check(gitignore.includes("AGENTS.md"), ".gitignore includes AGENTS.md local harness file")
        check(gitignore.includes("CLAUDE.md"), ".gitignore includes CLAUDE.md local harness file")
        check(gitignore.includes("agents/"), ".gitignore includes agents/ local harness specs")
        check(gitignore.includes("docs/ai/"), ".gitignore includes docs/ai/ local harness docs")
        check(gitignore.includes("docs/progress/"), ".gitignore includes docs/progress/ local harness docs")
      } else {
        reporter.failSoft(".gitignore is missing", "Run harness-setup again to restore the base files")
      }

      const typecheck = await runBun(["run", "typecheck"])
      check(typecheck.ok, "bun run typecheck → 0 errors", typecheck.ok ? undefined : typecheck.output)

      const format = await runBun(["run", "format:check"])
      check(format.ok, "bun run format:check → formatting is clean", format.ok ? undefined : format.output)

      const build = await runBun(["run", "build"])
      check(build.ok, "bun run build → success", build.ok ? undefined : build.output)
      break
    }

    case "VALIDATING":
      check(state.execution.allMilestonesComplete, "all milestones are complete")
      check(
        state.execution.milestones.every(milestone => ["COMPLETE", "MERGED"].includes(milestone.status)),
        "all milestone statuses are COMPLETE / MERGED",
      )
      break

    case "COMPLETE": {
      const { score } = computeHarnessScore(state)
      check(score >= 80, `Harness Score ${score} ≥ 80`)
      check(state.docs.readme.isFinal, "README.md is final")
      check(state.execution.allMilestonesComplete, "execution.allMilestonesComplete = true")
      const worktreeCheck = onlyMainWorktreeRemains()
      check(
        worktreeCheck.ok,
        "git worktree list only shows main / master",
        worktreeCheck.hint ?? "Clean up extra worktrees and try again",
      )
      const compactStatus = await runBun(["run", "harness:compact:status"])
      check(
        compactStatus.ok,
        "bun run harness:compact:status runs successfully",
        compactStatus.ok ? undefined : compactStatus.output,
      )
      if (isUiProject(state.projectInfo.types)) {
        check(existsSync("docs/design/DESIGN_SYSTEM.md"), "docs/design/DESIGN_SYSTEM.md is present [G7]")
      }
      break
    }
  }
}
