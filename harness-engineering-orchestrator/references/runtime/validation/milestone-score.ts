import { existsSync, readFileSync } from "fs"
import type { ProjectState } from "../../types"
import {
  ARCHITECTURE_DIR,
  ARCHITECTURE_PATH,
  documentExists,
  HARNESS_CRITICAL_TOTAL,
  PROGRESS_DIR,
  PROGRESS_PATH,
  PRD_DIR,
  PRD_PATH,
  STATE_PATH,
} from "../shared"
import { mergeMilestoneChecklist } from "../task-checklist"
import {
  countLines,
  filesShareHash,
  findFiles,
  findForbiddenPatternHits,
  FORBIDDEN_PATTERN_RULES,
  runBun,
} from "./helpers"
import type { ValidationReporter } from "./reporter"
import { saveState } from "./state"

export async function validateMilestone(
  milestoneId: string,
  state: ProjectState,
  reporter: ValidationReporter,
): Promise<void> {
  reporter.section(`Gate-Milestone: ${milestoneId}`)

  const milestone = state.execution.milestones.find(item => item.id === milestoneId)
  if (!milestone) {
    reporter.failSoft(`Milestone ${milestoneId} was not found`)
    return
  }

  // Track checklist results
  const incomplete = milestone.tasks.filter(task => !["DONE", "SKIPPED"].includes(task.status))
  const allTasksComplete = incomplete.length === 0
  if (allTasksComplete) {
    reporter.pass(`All ${milestone.tasks.length} task(s) are complete`)
  } else {
    reporter.failSoft(`${incomplete.length} task(s) are incomplete: ${incomplete.map(task => task.id).join(", ")}`)
  }

  const toolchainChecks: { key: "typecheckPassed" | "lintPassed" | "formatPassed" | "testsPassed" | "buildPassed"; args: string[] }[] = [
    { key: "typecheckPassed", args: ["run", "typecheck"] },
    { key: "lintPassed", args: ["run", "lint"] },
    { key: "formatPassed", args: ["run", "format:check"] },
    { key: "testsPassed", args: ["test"] },
    { key: "buildPassed", args: ["run", "build"] },
  ]

  const checkResults: Record<string, boolean> = {}
  for (const { key, args } of toolchainChecks) {
    const result = await runBun(args)
    checkResults[key] = result.ok
    if (result.ok) reporter.pass(`bun ${args.join(" ")}`)
    else reporter.failSoft(`bun ${args.join(" ")} failed`, result.output)
  }

  const coverage = await runBun(["test", "--coverage"])
  let coverageMet = false
  if (!coverage.ok) {
    reporter.warn("Unable to parse test coverage automatically; confirm bun test --coverage manually")
  } else {
    const match = coverage.output.match(/(\d+(?:\.\d+)?)%/)
    const value = parseFloat(match?.[1] ?? "0")
    coverageMet = value >= 60
    if (coverageMet) reporter.pass(`Test coverage ${value}%`)
    else reporter.warn(`Coverage ${value}% < 60% (recommended: add more tests)`)
  }

  const overLimit = findFiles("src", [".ts", ".tsx"])
    .map(file => ({ file, lines: countLines(file) }))
    .filter(item => item.lines > 400)
  const fileSizeOk = overLimit.length === 0
  if (fileSizeOk) reporter.pass("All src files are <= 400 lines [G3]")
  else reporter.failSoft(`${overLimit.length} file(s) exceed 400 lines [G3]`, overLimit[0].file)

  const forbiddenHits = findForbiddenPatternHits("src", [".ts", ".tsx", ".swift", ".go", ".kt"])
  const blockingHits = forbiddenHits.filter(hit => hit.blocking)
  const noBlockingForbiddenPatterns = blockingHits.length === 0
  for (const rule of FORBIDDEN_PATTERN_RULES) {
    const hits = forbiddenHits.filter(hit => hit.label === rule.label)
    if (hits.length === 0) reporter.pass(`No ${rule.label} [G4]`)
    else if (rule.blocking) {
      reporter.failSoft(`Found ${rule.label} (${hits.length} hit(s)) [G4]`, `${hits[0].file}:${hits[0].line}`)
    } else {
      reporter.warn(`Found ${rule.label} (${hits.length} hit(s)) [G4]: ${hits[0].file}:${hits[0].line}`)
    }
  }

  const agentsMdSynced = filesShareHash("AGENTS.md", "CLAUDE.md")
  if (agentsMdSynced) {
    reporter.pass("AGENTS.md == CLAUDE.md [G8]")
  } else {
    reporter.failSoft("AGENTS.md ≠ CLAUDE.md [G8]", "Synchronize CLAUDE.md so it matches AGENTS.md exactly")
  }

  const changelogPath = "docs/gitbook/changelog/CHANGELOG.md"
  let changelogUpdated = false
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, "utf-8")
    changelogUpdated = changelog.includes(milestoneId) || changelog.includes(milestone.name)
    if (changelogUpdated) {
      reporter.pass("CHANGELOG.md was updated")
    } else {
      reporter.failSoft("CHANGELOG.md does not include this milestone", `Update ${changelogPath}`)
    }
  } else {
    reporter.failSoft("CHANGELOG.md is missing", `Create ${changelogPath}`)
  }

  const guidePath = `docs/gitbook/guides/${milestoneId.toLowerCase()}.md`
  const gitbookGuidePresent = existsSync(guidePath)
  if (gitbookGuidePresent) reporter.pass(`GitBook guide is present: ${guidePath}`)
  else reporter.warn(`GitBook guide is missing: ${guidePath}`)

  // Populate milestone checklist and persist
  milestone.checklist = mergeMilestoneChecklist(milestone.checklist, {
    allTasksComplete,
    typecheckPassed: checkResults["typecheckPassed"] ?? false,
    lintPassed: checkResults["lintPassed"] ?? false,
    formatPassed: checkResults["formatPassed"] ?? false,
    testsPassed: checkResults["testsPassed"] ?? false,
    buildPassed: checkResults["buildPassed"] ?? false,
    coverageMet,
    fileSizeOk,
    noBlockingForbiddenPatterns,
    agentsMdSynced,
    changelogUpdated,
    gitbookGuidePresent,
  })
  saveState(state)
}

export function computeHarnessScore(state: ProjectState): {
  items: [boolean, string][]
  score: number
  critical: number
} {
  let packageManagerIsBun = false
  if (existsSync("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { packageManager?: string }
      packageManagerIsBun = pkg.packageManager?.startsWith("bun@") ?? false
    } catch {
      packageManagerIsBun = false
    }
  }

  const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf-8") : ""
  const items: [boolean, string][] = [
    [existsSync("AGENTS.md"), "AGENTS.md is present"],
    [existsSync("CLAUDE.md"), "CLAUDE.md is present"],
    [filesShareHash("AGENTS.md", "CLAUDE.md"), "AGENTS.md == CLAUDE.md [G8]"],
    [documentExists(PRD_PATH, PRD_DIR), "docs/PRD.md or docs/prd/ is present"],
    [documentExists(ARCHITECTURE_PATH, ARCHITECTURE_DIR), "docs/ARCHITECTURE.md or docs/architecture/ is present"],
    [documentExists(PROGRESS_PATH, PROGRESS_DIR), "docs/PROGRESS.md or docs/progress/ is present"],
    [existsSync(STATE_PATH), ".harness/state.json is present"],
    [existsSync("docs/gitbook/SUMMARY.md"), "GitBook SUMMARY.md is present"],
    [state.docs.readme.exists && state.docs.readme.isFinal, "README.md is final (isFinal)"],
    [existsSync(".github/workflows/ci.yml"), "CI workflow is present"],
    [existsSync(".github/PULL_REQUEST_TEMPLATE.md"), "PR template is present"],
    [existsSync(".env.example"), ".env.example is present [G6]"],
    [state.scaffold?.linterConfigured ?? existsSync("biome.json"), "Linter/formatter configured"],
    [state.scaffold?.manifestExists ?? existsSync("package.json"), "Project manifest present and valid"],
    [gitignore.includes(".env"), ".gitignore includes .env [G6]"],
    [gitignore.includes("node_modules") || gitignore.includes("__pycache__") || gitignore.includes("/target/") || gitignore.includes("/vendor/"), ".gitignore includes ecosystem-specific entries [G6]"],
    [state.docs.adrs.length > 0, `ADR records (${state.docs.adrs.length})`],
    [state.techStack.confirmed, "Tech Stack is confirmed"],
    [state.execution.allMilestonesComplete, "All milestones are complete"],
  ]

  // Use level-scoped critical counts: lite=8, standard=15, full=19
  const level = state.projectInfo?.harnessLevel?.level ?? "standard"
  const levelTotal = getHarnessCriticalTotal(level)
  const levelItems = items.slice(0, levelTotal)

  if (items.length !== HARNESS_CRITICAL_TOTAL) {
    throw new Error(
      `Harness critical contract mismatch: expected ${HARNESS_CRITICAL_TOTAL}, got ${items.length}`,
    )
  }

  const critical = levelItems.filter(([ok]) => ok).length
  const score = Math.round((critical / levelTotal) * 100)
  return { items: levelItems, score, critical }
}

export function fullValidation(state: ProjectState, reporter: ValidationReporter): ProjectState {
  reporter.section("Harness Full Validation (GATE-FINAL)")

  const { items, score, critical } = computeHarnessScore(state)
  for (const [ok, label] of items) {
    if (ok) reporter.pass(label)
    else reporter.failSoft(label)
  }
  if (score < 80) {
    reporter.failSoft(`Harness Score ${score} < 80`, "At least 80 points are required to pass the Final Gate")
  }

  state.validation.score = score
  state.validation.criticalPassed = critical
  state.validation.criticalTotal = HARNESS_CRITICAL_TOTAL
  state.validation.lastRun = new Date().toISOString()
  saveState(state)

  console.log(`\n${"─".repeat(55)}`)
  console.log(`Harness Score: ${score}/100  (${critical}/${HARNESS_CRITICAL_TOTAL} critical)`)
  const hasCriticalFailures = critical < HARNESS_CRITICAL_TOTAL
  console.log(
    score >= 90 && !hasCriticalFailures
      ? "🟢 Excellent — meets the Harness Engineering bar"
      : score >= 80 && hasCriticalFailures
        ? "🟠 Score is high enough, but the Final Gate still fails because critical checks remain"
        : score >= 80
          ? "🟡 Final Gate passed"
        : "🔴 Not passed — fix the issues and try again",
  )
  console.log(`${"─".repeat(55)}\n`)

  return state
}

/** Return the critical total based on harness level. */
export function getHarnessCriticalTotal(level: "lite" | "standard" | "full"): number {
  switch (level) {
    case "lite": return 8
    case "standard": return 15
    case "full": return 19
  }
}
