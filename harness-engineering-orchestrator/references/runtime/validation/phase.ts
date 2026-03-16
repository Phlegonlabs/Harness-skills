import { existsSync } from "fs"
import type { Phase, ProjectState } from "../../types"
import { isUiProject } from "../shared"
import { runBun, runGit, runToolchainCommand } from "./helpers"
import type { ValidationReporter } from "./reporter"
import { computeHarnessScore } from "./milestone-score"
import { getPhaseStructuralChecks } from "../phase-structural"

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

  const level = state.projectInfo?.harnessLevel?.level ?? "standard"

  // Filter structural checks by level
  const structuralChecks = getPhaseStructuralChecks(phase, state)
  for (const item of structuralChecks) {
    // Lite: skip GitBook, monorepo workspace, dep-cruiser checks
    if (level === "lite") {
      if (item.label.includes("gitbook") || item.label.includes("GitBook") ||
          item.label.includes("workspace") || item.label.includes("dep-cruiser") ||
          item.label.includes("dependency-cruiser") || item.label.includes("dep-check")) {
        continue
      }
    }
    // Standard: skip GitBook, dep-cruiser optional
    if (level === "standard") {
      if (item.label.includes("gitbook") || item.label.includes("GitBook")) {
        continue
      }
    }
    check(item.ok, item.label, item.hint)
  }

  switch (phase) {
    case "MARKET_RESEARCH":
    case "TECH_STACK":
    case "PRD_ARCH":
    case "SCAFFOLD":
      break

    case "EXECUTING": {
      const tc = state.toolchain?.commands
      const typecheck = await runToolchainCommand(tc?.typecheck ?? { command: "bun run typecheck" })
      check(typecheck.ok, "typecheck → 0 errors", typecheck.ok ? undefined : typecheck.output)

      const format = await runToolchainCommand(tc?.format ?? { command: "bun run format:check" })
      check(format.ok, "format → formatting is clean", format.ok ? undefined : format.output)

      const build = await runToolchainCommand(tc?.build ?? { command: "bun run build" })
      check(build.ok, "build → success", build.ok ? undefined : build.output)
      break
    }

    case "VALIDATING":
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
