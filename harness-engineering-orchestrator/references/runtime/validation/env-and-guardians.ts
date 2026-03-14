import { existsSync, readFileSync } from "fs"
import {
  commandExists,
  countLines,
  filesShareHash,
  findFiles,
  findForbiddenPatternHits,
  FORBIDDEN_PATTERN_RULES,
  getVersion,
  runBun,
} from "./helpers"
import type { ValidationReporter } from "./reporter"

export async function validateEnv(reporter: ValidationReporter): Promise<void> {
  reporter.section("Environment Gate (Cross-Platform)")

  const bunOk = await commandExists("bun")
  const gitOk = await commandExists("git")
  const nodeOk = await commandExists("node")

  if (bunOk) {
    reporter.pass(`bun is installed: ${await getVersion("bun")}`)
  } else {
    reporter.failSoft(
      "bun is missing",
      process.platform === "win32"
        ? 'PowerShell: powershell -c "irm bun.sh/install.ps1 | iex"'
        : "curl -fsSL https://bun.sh/install | bash",
    )
  }

  if (gitOk) {
    reporter.pass(`git is installed: ${await getVersion("git")}`)
  } else {
    reporter.failSoft(
      "git is missing",
      process.platform === "win32"
        ? "Install Git for Windows: https://git-scm.com/download/win"
        : "brew install git (macOS) or sudo apt install git (Linux)",
    )
  }

  if (nodeOk) {
    const version = await getVersion("node")
    const major = parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10)
    if (major >= 20) reporter.pass(`node is installed: ${version}`)
    else reporter.warn(`node version ${version} should be upgraded to 20+`)
  } else {
    reporter.warn("node is missing (some tools need it); install Node.js 20+")
  }

  const ghOk = await commandExists("gh")
  if (ghOk) {
    reporter.pass(`gh CLI is installed: ${await getVersion("gh")}`)
  } else {
    reporter.warn("gh CLI is missing (required for GitHub automation): https://cli.github.com/")
  }

  reporter.pass(process.platform === "win32" ? "Windows platform detected" : `${process.platform} platform detected`)
}

export async function validateGuardians(reporter: ValidationReporter): Promise<void> {
  reporter.section("Guardian Baseline Scan")

  const srcExts = [".ts", ".tsx", ".swift", ".go", ".kt"]
  const overLimit = findFiles("src", srcExts)
    .map(file => ({ file, lines: countLines(file) }))
    .filter(item => item.lines > 400)

  if (overLimit.length === 0) {
    reporter.pass("G3 ✓ all src files are <= 400 lines")
  } else {
    reporter.failSoft(
      `G3 ✗ ${overLimit.length} file(s) exceed 400 lines`,
      overLimit.slice(0, 3).map(item => `${item.file} (${item.lines} lines)`).join(", "),
    )
  }

  const forbiddenHits = findForbiddenPatternHits("src", [".ts", ".tsx", ".swift", ".go", ".kt"])

  for (const rule of FORBIDDEN_PATTERN_RULES) {
    const hits = forbiddenHits.filter(hit => hit.label === rule.label)
    if (hits.length === 0) {
      reporter.pass(`G4 ✓ no ${rule.label}`)
      continue
    }

    const hint = `First hit: ${hits[0].file}:${hits[0].line} (${hits.length} hit(s) total)`
    if (rule.blocking) reporter.failSoft(`G4 ✗ found ${rule.label}`, hint)
    else reporter.warn(`G4 ⚠ found ${rule.label}: ${hint}`)
  }

  if (existsSync(".gitignore")) {
    const gitignore = readFileSync(".gitignore", "utf-8")
    for (const entry of [".env", ".env.local", ".env.production", "node_modules"]) {
      if (gitignore.includes(entry)) reporter.pass(`G6 ✓ .gitignore includes ${entry}`)
      else reporter.failSoft(`G6 ✗ .gitignore is missing ${entry}`)
    }
  } else {
    reporter.failSoft("G6 ✗ .gitignore is missing")
  }

  if (existsSync("AGENTS.md") && existsSync("CLAUDE.md")) {
    if (filesShareHash("AGENTS.md", "CLAUDE.md")) {
      reporter.pass("G8 ✓ AGENTS.md and CLAUDE.md are synchronized")
    } else {
      reporter.failSoft("G8 ✗ AGENTS.md and CLAUDE.md differ", "Synchronize CLAUDE.md so it matches AGENTS.md exactly")
    }
  } else {
    if (!existsSync("AGENTS.md")) reporter.failSoft("G8 ✗ AGENTS.md is missing")
    if (!existsSync("CLAUDE.md")) reporter.failSoft("G8 ✗ CLAUDE.md is missing")
  }

  if (existsSync(".dependency-cruiser.cjs") || existsSync(".dependency-cruiser.js")) {
    const { ok } = await runBun(["run", "check:deps"])
    if (ok) reporter.pass("G5 ✓ dependency direction validation passed")
    else reporter.failSoft("G5 ✗ dependency direction violation", "Run bun run check:deps for details")
  } else {
    reporter.warn("G5 ⚠ dependency-cruiser is not configured (recommended for CI)")
  }
}
