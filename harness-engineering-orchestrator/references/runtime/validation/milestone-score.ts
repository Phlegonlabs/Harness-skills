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

  const incomplete = milestone.tasks.filter(task => !["DONE", "SKIPPED"].includes(task.status))
  if (incomplete.length === 0) {
    reporter.pass(`All ${milestone.tasks.length} task(s) are complete`)
  } else {
    reporter.failSoft(`${incomplete.length} task(s) are incomplete: ${incomplete.map(task => task.id).join(", ")}`)
  }

  for (const args of [
    ["run", "typecheck"],
    ["run", "lint"],
    ["run", "format:check"],
    ["test"],
    ["run", "build"],
  ]) {
    const result = await runBun(args)
    if (result.ok) reporter.pass(`bun ${args.join(" ")}`)
    else reporter.failSoft(`bun ${args.join(" ")} failed`, result.output)
  }

  const coverage = await runBun(["test", "--coverage"])
  if (!coverage.ok) {
    reporter.warn("Unable to parse test coverage automatically; confirm bun test --coverage manually")
  } else {
    const match = coverage.output.match(/(\d+(?:\.\d+)?)%/)
    const value = parseFloat(match?.[1] ?? "0")
    if (value >= 60) reporter.pass(`Test coverage ${value}%`)
    else reporter.warn(`Coverage ${value}% < 60% (recommended: add more tests)`)
  }

  const overLimit = findFiles("src", [".ts", ".tsx"])
    .map(file => ({ file, lines: countLines(file) }))
    .filter(item => item.lines > 400)
  if (overLimit.length === 0) reporter.pass("All src files are <= 400 lines [G3]")
  else reporter.failSoft(`${overLimit.length} file(s) exceed 400 lines [G3]`, overLimit[0].file)

  const forbiddenHits = findForbiddenPatternHits("src", [".ts", ".tsx", ".swift", ".go", ".kt"])
  for (const rule of FORBIDDEN_PATTERN_RULES) {
    const hits = forbiddenHits.filter(hit => hit.label === rule.label)
    if (hits.length === 0) reporter.pass(`No ${rule.label} [G4]`)
    else if (rule.blocking) {
      reporter.failSoft(`Found ${rule.label} (${hits.length} hit(s)) [G4]`, `${hits[0].file}:${hits[0].line}`)
    } else {
      reporter.warn(`Found ${rule.label} (${hits.length} hit(s)) [G4]: ${hits[0].file}:${hits[0].line}`)
    }
  }

  if (filesShareHash("AGENTS.md", "CLAUDE.md")) {
    reporter.pass("AGENTS.md == CLAUDE.md [G8]")
  } else {
    reporter.failSoft("AGENTS.md ≠ CLAUDE.md [G8]", "Synchronize CLAUDE.md so it matches AGENTS.md exactly")
  }

  const changelogPath = "docs/gitbook/changelog/CHANGELOG.md"
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, "utf-8")
    if (changelog.includes(milestoneId) || changelog.includes(milestone.name)) {
      reporter.pass("CHANGELOG.md was updated")
    } else {
      reporter.failSoft("CHANGELOG.md does not include this milestone", `Update ${changelogPath}`)
    }
  } else {
    reporter.failSoft("CHANGELOG.md is missing", `Create ${changelogPath}`)
  }

  const guidePath = `docs/gitbook/guides/${milestoneId.toLowerCase()}.md`
  if (existsSync(guidePath)) reporter.pass(`GitBook guide is present: ${guidePath}`)
  else reporter.warn(`GitBook guide is missing: ${guidePath}`)
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
    [existsSync("biome.json"), "biome.json is present"],
    [packageManagerIsBun, "packageManager uses Bun"],
    [gitignore.includes(".env"), ".gitignore includes .env [G6]"],
    [gitignore.includes("node_modules"), ".gitignore includes node_modules [G6]"],
    [state.docs.adrs.length > 0, `ADR records (${state.docs.adrs.length})`],
    [state.techStack.confirmed, "Tech Stack is confirmed"],
    [state.execution.allMilestonesComplete, "All milestones are complete"],
  ]

  if (items.length !== HARNESS_CRITICAL_TOTAL) {
    throw new Error(
      `Harness critical contract mismatch: expected ${HARNESS_CRITICAL_TOTAL}, got ${items.length}`,
    )
  }

  const critical = items.filter(([ok]) => ok).length
  const score = Math.round((critical / HARNESS_CRITICAL_TOTAL) * 100)
  return { items, score, critical }
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
