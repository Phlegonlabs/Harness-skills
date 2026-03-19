import { existsSync, readFileSync } from "fs"
import type { SpikeChecklist, TaskChecklist, ProjectState, Task } from "../../types"
import { inspectAtomicTaskCommit } from "../atomic-commit"
import { getLearningPaths } from "../learning"
import { documentExists, PROGRESS_DIR, PROGRESS_PATH } from "../shared"
import { mergeSpikeChecklist, mergeTaskChecklist } from "../task-checklist"
import {
  buildForbiddenPatternRules,
  countLines,
  findFiles,
  findForbiddenPatternHits,
  runGit,
  runToolchainCommand,
  resolveToolchainCommand,
  resolveToolchainSourceExtensions,
  resolveToolchainSourceRoot,
} from "./helpers"
import type { ValidationReporter } from "./reporter"
import { saveState } from "./state"

function isTaskFinalized(task: Task): boolean {
  return task.status === "DONE" || task.status === "SKIPPED"
}

function summarizeFirstFailure<T>(
  entries: T[],
  render: (entry: T) => string,
): string | undefined {
  if (entries.length === 0) return undefined
  return render(entries[0]!)
}

function markerVariants(marker: string): string[] {
  if (!marker.endsWith("✅")) return [marker]

  return [
    marker,
    marker.replace(/✅$/, "âœ…"),
  ]
}

export function commitMessageIncludesMarker(output: string, marker: string): boolean {
  const variants = markerVariants(marker)
  if (variants.some(variant => output.includes(variant))) return true

  try {
    const repaired = Buffer.from(output, "latin1").toString("utf8")
    return variants.some(variant => repaired.includes(variant))
  } catch {
    return false
  }
}

export async function validateTask(
  taskId: string,
  state: ProjectState,
  reporter: ValidationReporter,
): Promise<void> {
  reporter.section(`Gate-Task: ${taskId}`)

  const task = state.execution.milestones.flatMap(milestone => milestone.tasks).find(item => item.id === taskId)
  if (!task) {
    reporter.failSoft(`Task ${taskId} was not found`)
    return
  }

  if (task.type === "SPIKE") {
    reporter.section(`Gate-Spike: ${taskId}`)
    const { codex, claude } = getLearningPaths()
    const hasCodexLearning = existsSync(codex) && readFileSync(codex, "utf-8").trim().length > 0
    const hasClaudeLearning = existsSync(claude) && readFileSync(claude, "utf-8").trim().length > 0
    const currentChecklist = task.checklist as SpikeChecklist | undefined
    const checklist = mergeSpikeChecklist(task.checklist as SpikeChecklist | undefined, {
      evaluationNoteWritten:
        Boolean(currentChecklist?.evaluationNoteWritten) || hasCodexLearning || hasClaudeLearning,
      adrGenerated: Boolean(currentChecklist?.adrGenerated) || state.docs.adrs.length > 0,
    })
    task.checklist = checklist
    saveState(state)
    checklist?.evaluationNoteWritten
      ? reporter.pass("evaluationNote was written to LEARNING.md")
      : reporter.failSoft("evaluationNote was not written", "Write it to ~/.codex/LEARNING.md")
    checklist?.adrGenerated
      ? reporter.pass("ADR was generated")
      : reporter.failSoft("ADR was not generated", "Create docs/adr/ADR-[N]-[topic].md")
    return
  }

  const tc = state.toolchain?.commands
  const typecheck = await runToolchainCommand(resolveToolchainCommand(tc, "typecheck"))
  const lint = await runToolchainCommand(resolveToolchainCommand(tc, "lint"))
  const format = await runToolchainCommand(resolveToolchainCommand(tc, "format"))
  const tests = await runToolchainCommand(resolveToolchainCommand(tc, "test"))
  const build = await runToolchainCommand(resolveToolchainCommand(tc, "build"))
  const sourceRoot = resolveToolchainSourceRoot(state.toolchain)
  const sourceExts = resolveToolchainSourceExtensions(state.toolchain)
  const forbiddenRules = buildForbiddenPatternRules(state.toolchain)

  const overLimit = findFiles(sourceRoot, sourceExts)
    .map(file => ({ file, lines: countLines(file) }))
    .filter(item => item.lines > 400)
  const forbiddenHits = findForbiddenPatternHits(sourceRoot, sourceExts, state.toolchain)
  const blockingForbiddenHits = forbiddenHits.filter(hit => hit.blocking)
  const warningForbiddenHits = forbiddenHits.filter(hit => !hit.blocking)
  const currentChecklist = task.checklist as TaskChecklist | undefined
  const atomicCommit =
    task.commitHash && task.commitHash.trim().length > 0
      ? inspectAtomicTaskCommit(state, task.id, task.commitHash)
      : undefined

  const checklist = mergeTaskChecklist(task.checklist as TaskChecklist | undefined, {
    prdDodMet: Boolean(currentChecklist?.prdDodMet) || isTaskFinalized(task),
    typecheckPassed: typecheck.ok,
    lintPassed: lint.ok,
    formatPassed: format.ok,
    testsPassed: tests.ok,
    buildPassed: build.ok,
    fileSizeOk: overLimit.length === 0,
    noForbiddenPatterns: blockingForbiddenHits.length === 0,
    atomicCommitDone: atomicCommit?.ok ?? false,
    progressUpdated:
      Boolean(currentChecklist?.progressUpdated) ||
      (isTaskFinalized(task) && documentExists(PROGRESS_PATH, PROGRESS_DIR)),
  })
  task.checklist = checklist
  saveState(state)

  const items: [keyof TaskChecklist, string, string][] = [
    ["prdDodMet", "PRD DoD is satisfied", `Check against ${task.prdRef}`],
    ["typecheckPassed", "typecheck → 0 errors", typecheck.output],
    ["lintPassed", "lint → 0 warnings", lint.output],
    ["formatPassed", "format:check → formatting is clean", format.output],
    ["testsPassed", "test → all tests pass", tests.output],
    ["buildPassed", "build → success", build.output],
    [
      "fileSizeOk",
      "modified files are <= 400 lines [G3]",
      summarizeFirstFailure(overLimit, item => `${item.file} (${item.lines} lines)`) ?? `Check ${sourceRoot}/ file length`,
    ],
    [
      "noForbiddenPatterns",
      "no forbidden patterns [G4]",
      summarizeFirstFailure(blockingForbiddenHits, hit => `${hit.file}:${hit.line} ${hit.content}`) ??
        forbiddenRules.map(rule => rule.label).join(" / "),
    ],
    [
      "atomicCommitDone",
      "Atomic Commit is present [G10]",
      atomicCommit?.reasons[0] ?? "Commit the task as one HEAD commit with Task-ID and PRD mapping.",
    ],
    ["progressUpdated", "PROGRESS.md was updated", "docs/PROGRESS.md / docs/progress/"],
  ]

  for (const [key, label, hint] of items) {
    if (checklist?.[key]) reporter.pass(label)
    else reporter.failSoft(label, hint)
  }
  for (const hit of warningForbiddenHits) {
    reporter.warn(`G4 ⚠ found ${hit.label}: ${hit.file}:${hit.line}`)
  }

  if (task.isUI) {
    const lastCommit = runGit(["log", "-1", "--pretty=%B"])
    if (!lastCommit.ok) {
      reporter.warn("Unable to read the last commit message; confirm Design Review approval manually")
    } else if (commitMessageIncludesMarker(lastCommit.output, "Design Review: ✅")) {
      reporter.pass("Design Review passed [G7]")
    } else {
      reporter.failSoft("UI task is missing 'Design Review: ✅' [G7]", "Design Reviewer approval is required before commit")
    }
  }

  if (!task.isUI) {
    const lastCommit = runGit(["log", "-1", "--pretty=%B"])
    if (!lastCommit.ok) {
      reporter.warn("Unable to read the last commit message; confirm Code Review approval manually")
    } else if (commitMessageIncludesMarker(lastCommit.output, "Code Review: ✅")) {
      reporter.pass("Code Review passed")
    } else {
      reporter.failSoft("Non-UI task is missing 'Code Review: ✅'", "Code Reviewer approval is required before commit")
    }
  }

  const currentBranch = runGit(["branch", "--show-current"])
  if (!currentBranch.ok) {
    reporter.warn("Unable to read the current git branch; confirm manually that work is not happening on main")
  } else if (currentBranch.output !== "main" && currentBranch.output !== "master") {
    reporter.pass(`On the correct branch: ${currentBranch.output} [G2]`)
  } else {
    reporter.failSoft(`Feature work is on ${currentBranch.output} [G2]`, "Feature work must happen on a milestone branch")
  }
}
