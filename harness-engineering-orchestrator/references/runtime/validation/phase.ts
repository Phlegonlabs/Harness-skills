import { existsSync } from "fs"
import type { Phase, ProjectState } from "../../types"
import { isUiProject } from "../shared"
import { runBun, runGit } from "./helpers"
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

  for (const item of getPhaseStructuralChecks(phase, state)) {
    check(item.ok, item.label, item.hint)
  }

  switch (phase) {
    case "MARKET_RESEARCH":
    case "TECH_STACK":
    case "PRD_ARCH":
    case "SCAFFOLD":
      break

    case "EXECUTING": {
      const typecheck = await runBun(["run", "typecheck"])
      check(typecheck.ok, "bun run typecheck → 0 errors", typecheck.ok ? undefined : typecheck.output)

      const format = await runBun(["run", "format:check"])
      check(format.ok, "bun run format:check → formatting is clean", format.ok ? undefined : format.output)

      const build = await runBun(["run", "build"])
      check(build.ok, "bun run build → success", build.ok ? undefined : build.output)
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
