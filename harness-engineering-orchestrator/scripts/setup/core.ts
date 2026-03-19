import { join } from "path"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync } from "fs"
import { initState } from "../../references/harness-init"
import { ensureEnvLocalSkeleton } from "../../references/runtime/env-local"
import { getManagedDocSpecs, getManagedSkillSpecs, syncManagedFiles } from "../../references/runtime/generated-files"
import { syncLocalBootstrapManifest } from "../../references/runtime/local-bootstrap"
import { getHarnessCriticalTotal } from "../../references/runtime/shared"
import {
  buildToolchainConfig,
  detectEcosystem,
  isConfiguredToolchainCommand,
} from "../../references/runtime/toolchain-detect"
import { buildClaudeSettings, stringifyClaudeSettings } from "../../references/runtime/hooks/claude-config"
import { CODEX_CONFIG_TOML, CODEX_GUARDIAN_RULES } from "../../references/runtime/hooks/codex-config"
import type { GitHubState, ToolchainConfig } from "../../references/harness-types"
import {
  countPrdMilestones,
  existingState,
  readTemplate,
  type Context,
  type SetupLogger,
  normalizeTextFileContent,
  writeFileAlways,
  writeFileIfMissing,
  writeTemplateTree,
} from "./shared"

type SetupParams = {
  context: Context
  skillRoot: string
  logger: SetupLogger
}

function toolchainIsConfigured(toolchain?: ToolchainConfig): boolean {
  if (!toolchain) return false
  return ["install", "typecheck", "lint", "format", "test", "build"].every(key =>
    isConfiguredToolchainCommand(toolchain.commands[key as keyof ToolchainConfig["commands"]]),
  )
}

function resolveInitialToolchain(
  context: Context,
  currentToolchain?: ToolchainConfig,
): ToolchainConfig {
  if (toolchainIsConfigured(currentToolchain)) {
    return currentToolchain
  }

  const detected = detectEcosystem(process.cwd())
  if (detected) {
    return buildToolchainConfig(detected, process.cwd())
  }

  return buildToolchainConfig(context.isGreenfield ? "bun" : "custom", process.cwd())
}

function syncClaudeMirrorFromAgents(logger: SetupLogger): void {
  if (!existsSync("AGENTS.md")) return

  const agentsContent = readFileSync("AGENTS.md", "utf-8")
  writeFileAlways("CLAUDE.md", agentsContent, logger)
}

function workspacePackageName(projectName: string, workspace: string): string {
  return `@${projectName}/${workspace}`
}

function copyDirectory(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath)
    } else {
      writeFileSync(targetPath, normalizeTextFileContent(readFileSync(sourcePath, "utf-8")))
    }
  }
}

async function checkEnv(logger: SetupLogger): Promise<void> {
  logger.step("Environment validation")

  for (const [cmd, label, install] of [
    [
      "bun",
      "Bun",
      process.platform === "win32"
        ? 'PowerShell: powershell -c "irm bun.sh/install.ps1 | iex"'
        : "curl -fsSL https://bun.sh/install | bash",
    ],
    [
      "git",
      "Git",
      process.platform === "win32"
        ? "https://git-scm.com/download/win"
        : "brew install git (macOS) / sudo apt install git (Linux)",
    ],
  ] as const) {
    const result = inspectCommandVersion(cmd)
    if (!result.ok) {
      logger.error(`${label} is not installed. Please install: ${install}`)
    }

    logger.log(`${label} installed: ${result.version}`)
  }
}

export function inspectCommandVersion(cmd: string): { ok: boolean; version: string } {
  try {
    const proc = Bun.spawnSync([cmd, "--version"], { stdout: "pipe", stderr: "pipe" })
    if (proc.exitCode !== 0) {
      return { ok: false, version: "" }
    }

    return {
      ok: true,
      version: new TextDecoder().decode(proc.stdout).trim().split(/\r?\n/)[0] ?? "",
    }
  } catch {
    return { ok: false, version: "" }
  }
}

function copyHarnessRuntime(skillRoot: string, logger: SetupLogger): void {
  logger.step("Initialize .harness/")
  mkdirSync(".harness", { recursive: true })

  const entryFiles = [
    ["harness-types.ts", ".harness/types.ts"],
    ["harness-init.ts", ".harness/init.ts"],
    ["harness-stage.ts", ".harness/stage.ts"],
    ["harness-advance.ts", ".harness/advance.ts"],
    ["harness-state.ts", ".harness/state.ts"],
    ["harness-validate.ts", ".harness/validate.ts"],
    ["harness-orchestrator.ts", ".harness/orchestrator.ts"],
    ["harness-orchestrate.ts", ".harness/orchestrate.ts"],
    ["harness-compact.ts", ".harness/compact.ts"],
    ["harness-add-surface.ts", ".harness/add-surface.ts"],
    ["harness-audit.ts", ".harness/audit.ts"],
    ["harness-sync-docs.ts", ".harness/sync-docs.ts"],
    ["harness-sync-skills.ts", ".harness/sync-skills.ts"],
    ["harness-api-add.ts", ".harness/api-add.ts"],
    ["harness-merge-milestone.ts", ".harness/merge-milestone.ts"],
    ["harness-resume.ts", ".harness/resume.ts"],
    ["harness-learn.ts", ".harness/learn.ts"],
    ["harness-metrics.ts", ".harness/metrics.ts"],
    ["harness-entropy-scan.ts", ".harness/entropy-scan.ts"],
    ["harness-scope-change.ts", ".harness/scope-change.ts"],
  ] as const

  for (const [sourceFile, destination] of entryFiles) {
    const content = readFileSync(join(skillRoot, "references", sourceFile), "utf-8")
    writeFileAlways(destination, content, logger)
  }

  copyDirectory(join(skillRoot, "references", "runtime"), join(process.cwd(), ".harness", "runtime"))
  logger.log("Synced .harness/runtime/")
}

function copyAgentSpecs(skillRoot: string, logger: SetupLogger): void {
  logger.step("Sync agents/")
  copyDirectory(join(skillRoot, "agents"), join(process.cwd(), "agents"))
  logger.log("Synced agents/")
}

function ensureProjectStructure(logger: SetupLogger): void {
  logger.step("Create directory structure")

  for (const dir of [
    "docs",
    "docs/prd",
    "docs/prd/versions",
    "docs/architecture",
    "docs/architecture/versions",
    "docs/progress",
    "docs/ai",
    "docs/public",
    "docs/adr",
    "docs/design",
    "docs/gitbook",
    "docs/gitbook/getting-started",
    "docs/gitbook/guides",
    "docs/gitbook/api-reference",
    "docs/gitbook/architecture",
    "docs/gitbook/changelog",
    ".github",
    ".github/workflows",
    ".github/ISSUE_TEMPLATE",
    "src/types",
    "src/config",
    "src/lib",
    "src/services",
    "src/app",
    "tests/unit",
    "tests/integration",
    "tests/e2e",
    "apps",
    "packages",
    "packages/shared",
  ]) {
    mkdirSync(dir, { recursive: true })
    logger.log(`Created ${dir}/`)
  }
}

function ensureMonorepoBaseline({ context, logger }: SetupParams): void {
  logger.step("Create monorepo workspace baseline")

  for (const workspace of context.workspaceApps) {
    mkdirSync(join("apps", workspace), { recursive: true })
    writeFileIfMissing(
      join("apps", workspace, "package.json").replace(/\\/g, "/"),
      `${JSON.stringify(
        {
          name: workspacePackageName(context.projectName, workspace),
          version: "0.1.0",
          private: true,
          type: "module",
          description: `${context.projectDisplayName} ${workspace} workspace.`,
        },
        null,
        2,
      )}\n`,
      logger,
    )
    writeFileIfMissing(
      join("apps", workspace, "README.md").replace(/\\/g, "/"),
      `# ${context.projectDisplayName} — ${workspace}\n\nMonorepo workspace placeholder. Add implementation for this surface when the milestone reaches it.\n`,
      logger,
    )
  }

  mkdirSync("packages/shared", { recursive: true })
  mkdirSync("packages/shared/api", { recursive: true })
  writeFileIfMissing(
    "packages/shared/package.json",
    `${JSON.stringify(
      {
        name: workspacePackageName(context.projectName, "shared"),
        version: "0.1.0",
        private: true,
        type: "module",
        description: `${context.projectDisplayName} shared workspace package.`,
      },
      null,
      2,
    )}\n`,
    logger,
  )
  writeFileIfMissing(
    "packages/shared/README.md",
    `# ${context.projectDisplayName} — shared\n\nCommon contracts, shared utilities, and reusable modules live here as the monorepo grows.\n`,
    logger,
  )
  writeFileIfMissing(
    "packages/shared/api/README.md",
    `# ${context.projectDisplayName} — shared API wrappers\n\nPlace agent-facing API wrappers in subdirectories under this folder. Each service should expose one stable contract for agent workflows.\n`,
    logger,
  )
  writeFileIfMissing(
    "bunfig.toml",
    "[install]\nlinker = \"isolated\"\n",
    logger,
  )
}

function writeAgentSkillScaffold({ context, skillRoot, logger }: SetupParams): void {
  if (!context.hasAgentProject) return

  logger.step("Create agent skill scaffold")
  writeFileIfMissing("SKILLS.md", readTemplate(skillRoot, context, "SKILLS.md.template"), logger)
  writeFileIfMissing(
    "skills/api-wrapper/SKILL.md",
    readTemplate(skillRoot, context, "skills/api-wrapper/SKILL.md.template"),
    logger,
  )
}

function writeCoreFiles({ context, skillRoot, logger }: SetupParams): void {
  logger.step("Generate core documents")

  writeFileIfMissing("package.json", readTemplate(skillRoot, context, "package.json.template"), logger)
  const agents = readTemplate(skillRoot, context, "AGENTS.md.template")
  writeFileIfMissing("AGENTS.md", agents, logger)
  syncClaudeMirrorFromAgents(logger)
  writeFileIfMissing("README.md", readTemplate(skillRoot, context, "README.md.template"), logger)
  writeFileIfMissing(".env.example", readTemplate(skillRoot, context, "_env.example.template"), logger)
  writeFileIfMissing(
    ".github/PULL_REQUEST_TEMPLATE.md",
    readTemplate(skillRoot, context, "PULL_REQUEST_TEMPLATE.md.template"),
    logger,
  )
  writeFileIfMissing(
    ".github/workflows/ci.yml",
    readTemplate(skillRoot, context, ".github/workflows/ci.yml.template"),
    logger,
  )
  writeFileIfMissing(
    ".github/workflows/release.yml",
    readTemplate(skillRoot, context, ".github/workflows/release.yml.template"),
    logger,
  )
  writeTemplateTree(skillRoot, context, ".github/ISSUE_TEMPLATE", ".github/ISSUE_TEMPLATE", logger)

  writeTemplateTree(skillRoot, context, "docs", "docs", logger, relativePath =>
    context.isUiProject || relativePath !== "design/DESIGN_SYSTEM.md.template",
  )
  writeTemplateTree(skillRoot, context, "scripts", "scripts", logger)
  writeTemplateTree(skillRoot, context, "src", "src", logger)
  writeTemplateTree(skillRoot, context, "tests", "tests", logger)

  writeFileIfMissing(
    ".dependency-cruiser.cjs",
    readTemplate(skillRoot, context, ".dependency-cruiser.cjs.template"),
    logger,
  )
  writeFileIfMissing("gitbook.yaml", readTemplate(skillRoot, context, "gitbook.yaml.template"), logger)
  writeFileIfMissing("biome.json", readTemplate(skillRoot, context, "biome.json.template"), logger)
  writeFileIfMissing("tsconfig.json", readTemplate(skillRoot, context, "tsconfig.json.template"), logger)
  writeFileIfMissing("CONTRIBUTING.md", readTemplate(skillRoot, context, "CONTRIBUTING.md.template"), logger)
  writeFileIfMissing("SECURITY.md", readTemplate(skillRoot, context, "SECURITY.md.template"), logger)
  writeFileIfMissing("LICENSE", readTemplate(skillRoot, context, "LICENSE.template"), logger)
}

const CLAUDE_SETTINGS_JSON = stringifyClaudeSettings(buildClaudeSettings())

function installHooks(skillRoot: string, logger: SetupLogger): void {
  logger.step("Install hooks (Git + Claude Code + Codex CLI)")

  // Git hooks — only if .git exists
  if (existsSync(".git")) {
    const shims: Record<string, string> = {
      "pre-commit":
        "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook pre-commit\n",
      "commit-msg":
        '#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook commit-msg "$1"\n',
      "pre-push":
        "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook pre-push\n",
      "post-commit":
        "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook post-commit\n",
    }
    const hooksDir = join(".git", "hooks")
    mkdirSync(hooksDir, { recursive: true })
    for (const [name, content] of Object.entries(shims)) {
      const hookPath = join(hooksDir, name)
      writeFileSync(hookPath, content)
      try {
        chmodSync(hookPath, 0o755)
      } catch {
        // chmod may fail on Windows
      }
    }
    logger.log(
      "Git hooks installed (pre-commit, commit-msg, pre-push, post-commit)",
    )
  }

  // .claude/settings.local.json
  mkdirSync(".claude", { recursive: true })
  writeFileIfMissing(
    ".claude/settings.local.json",
    CLAUDE_SETTINGS_JSON,
    logger,
  )

  // Codex guardrail config + local runtime defaults (not orchestration lifecycle config)
  mkdirSync(".codex", { recursive: true })
  writeFileIfMissing(".codex/config.toml", CODEX_CONFIG_TOML, logger)
  mkdirSync(join(".codex", "rules"), { recursive: true })
  writeFileIfMissing(join(".codex", "rules", "guardian.rules"), CODEX_GUARDIAN_RULES, logger)
}

function updatePackageJson(logger: SetupLogger): void {
  logger.step("Update package.json scripts")

  if (!existsSync("package.json")) {
    logger.warn("package.json does not exist, skipping scripts update")
    return
  }

  const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
    packageManager?: string
    scripts?: Record<string, string>
  }

  pkg.scripts = {
    ...(pkg.scripts ?? {}),
    "check:deps":
      "dependency-cruiser --config .dependency-cruiser.cjs src --output-type err-long",
    "harness:init": "bun .harness/init.ts",
    "harness:init:prd": "bun .harness/init.ts --from-prd",
    "harness:stage": "bun .harness/stage.ts",
    "harness:sync-backlog": "bun .harness/init.ts --sync-from-prd",
    "harness:advance": "bun .harness/advance.ts",
    "harness:add-surface": "bun .harness/add-surface.ts",
    "harness:autoflow": "bun .harness/orchestrator.ts --auto",
    "harness:audit": "bun .harness/audit.ts",
    "harness:sync-docs": "bun .harness/sync-docs.ts",
    "harness:sync-skills": "bun .harness/sync-skills.ts",
    "harness:api:add": "bun .harness/api-add.ts",
    "harness:state": "bun .harness/state.ts",
    "harness:env": "bun .harness/validate.ts --env",
    "harness:validate": "bun .harness/validate.ts",
    "harness:validate:phase": "bun .harness/validate.ts --phase",
    "harness:validate:task": "bun .harness/validate.ts --task",
    "harness:validate:milestone": "bun .harness/validate.ts --milestone",
    "harness:guardian": "bun .harness/validate.ts --guardian",
    "harness:resume": "bun .harness/resume.ts",
    "harness:learn": "bun .harness/learn.ts",
    "harness:metrics": "bun .harness/metrics.ts",
    "harness:entropy-scan": "bun .harness/entropy-scan.ts",
    "harness:scope-change": "bun .harness/scope-change.ts",
    "harness:orchestrator": "bun .harness/orchestrator.ts",
    "harness:orchestrate": "bun .harness/orchestrate.ts",
    "harness:merge-milestone": "bun .harness/merge-milestone.ts",
    "harness:compact": "bun .harness/compact.ts",
    "harness:compact:milestone": "bun .harness/compact.ts --milestone",
    "harness:compact:status": "bun .harness/compact.ts --status",
    "harness:hooks:install": "bun scripts/harness-local/restore.ts",
  }
  pkg.packageManager = pkg.packageManager ?? "bun@latest"

  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`)
  logger.log("harness:* scripts added to package.json")
}

function setupGitignore(logger: SetupLogger): void {
  logger.step("Create/update .gitignore")

  const requiredEntries = [
    "node_modules/",
    ".env",
    ".env.local",
    ".env.*.local",
    ".env.production",
    "dist/",
    ".next/",
    ".turbo/",
    ".harness/*.log",
    ".harness/",
    ".claude/",
    ".codex/",
    "AGENTS.md",
    "CLAUDE.md",
    "agents/",
    "SKILLS.md",
    "skills/",
    "docs/ai/",
    "docs/progress/",
    "docs/PROGRESS.md",
  ]

  if (!existsSync(".gitignore")) {
    writeFileIfMissing(
      ".gitignore",
      `# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local
.env.production

# Build outputs
dist/
.next/
.turbo/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp

# Harness
.harness/
.harness/*.log
.claude/
.codex/
AGENTS.md
CLAUDE.md
agents/
SKILLS.md
skills/
docs/ai/
docs/progress/
docs/PROGRESS.md
`,
      logger,
    )
    return
  }

  const current = readFileSync(".gitignore", "utf-8")
  const missing = requiredEntries.filter(entry => !current.includes(entry))
  if (missing.length === 0) {
    logger.log(".gitignore already contains required rules")
    return
  }

  writeFileAlways(
    ".gitignore",
    `${current.trimEnd()}\n\n# Harness required entries\n${missing.join("\n")}\n`,
    logger,
  )
}

function spawnQuiet(cmd: string[]): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" })
  return {
    ok: proc.exitCode === 0,
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
  }
}

function ensureGitRepository(logger: SetupLogger): void {
  logger.step("Initialize Git")

  const repoCheck = spawnQuiet(["git", "rev-parse", "--is-inside-work-tree"])
  if (repoCheck.ok && repoCheck.stdout === "true") {
    logger.log("Git repo already exists")
    return
  }

  const initResult = spawnQuiet(["git", "init", "-b", "main"])
  if (initResult.ok) {
    logger.log("Created git repo (main)")
    return
  }

  const fallbackInit = spawnQuiet(["git", "init"])
  if (!fallbackInit.ok) {
    logger.error(`git init failed: ${fallbackInit.stderr || initResult.stderr}`)
  }

  const branchRename = spawnQuiet(["git", "branch", "-M", "main"])
  if (!branchRename.ok) {
    logger.warn(`git branch -M main failed: ${branchRename.stderr}`)
  }
  logger.log("Created git repo (main)")
}

function hasLocalCommit(): boolean {
  return spawnQuiet(["git", "rev-parse", "--verify", "HEAD"]).ok
}

function hasDependencyCruiserCiSupport(): boolean {
  if (!existsSync(".dependency-cruiser.cjs")) return false
  if (!existsSync(".github/workflows/ci.yml")) return false
  if (!existsSync("package.json")) return false

  const workflow = readFileSync(".github/workflows/ci.yml", "utf-8")
  const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
    scripts?: Record<string, string>
  }

  return workflow.includes("bun run check:deps") && Boolean(pkg.scripts?.["check:deps"])
}

async function setupGitHub({ context, logger }: SetupParams): Promise<Partial<GitHubState>> {
  logger.step("GitHub remote automation")

  const result: Partial<GitHubState> = {
    orgName: context.org,
    repoName: context.repo,
    visibility: context.visibility,
  }

  // 1. --skipGithub flag
  if (context.skipGithub) {
    logger.warn("--skipGithub is set, skipping GitHub automation")
    return result
  }

  // 2. Check gh CLI
  const ghCheck = spawnQuiet(["gh", "--version"])
  if (!ghCheck.ok) {
    logger.warn("gh CLI is not installed, skipping GitHub automation (install: https://cli.github.com/)")
    return result
  }
  logger.log(`gh CLI installed: ${ghCheck.stdout.split(/\r?\n/)[0]}`)

  // 3. Check gh auth
  const authCheck = spawnQuiet(["gh", "auth", "status"])
  if (!authCheck.ok) {
    logger.warn("gh is not authenticated, skipping GitHub automation (run: gh auth login)")
    return result
  }
  logger.log("gh authenticated")

  // 4. Determine owner/repo
  const owner = context.org
  const repo = context.repo
  const fullName = context.githubRepo || `${owner}/${repo}`

  // Check if remote origin already exists
  const remoteCheck = spawnQuiet(["git", "remote", "get-url", "origin"])
  const remoteAlreadyExists = remoteCheck.ok

  if (remoteAlreadyExists) {
    logger.log(`remote origin already exists: ${remoteCheck.stdout}`)
    result.remoteUrl = remoteCheck.stdout
    result.remoteAdded = true
    result.repoCreated = true
  } else if (context.githubRepo) {
    // Use existing repo specified via --githubRepo
    logger.log(`Using specified existing repo: ${context.githubRepo}`)
    result.repoCreated = true
    result.remoteUrl = `https://github.com/${context.githubRepo}`
  } else {
    // Create new repo
    const createArgs = [
      "gh", "repo", "create", fullName,
      `--${context.visibility}`,
      "--description", context.projectDescription,
    ]
    if (hasLocalCommit()) {
      createArgs.push("--source", ".", "--push")
    }

    const createResult = spawnQuiet(createArgs)
    if (createResult.ok) {
      logger.log(`GitHub repo created: ${fullName}`)
      result.repoCreated = true
      result.remoteUrl = `https://github.com/${fullName}`
      if (hasLocalCommit()) {
        result.remoteAdded = true
        result.pushed = true
      }
    } else {
      // Repo might already exist — try to continue
      logger.warn(`gh repo create failed (may already exist): ${createResult.stderr}`)
      result.remoteUrl = `https://github.com/${fullName}`
    }
  }

  // 5. Ensure remote origin is set
  if (!result.remoteAdded) {
    const url = result.remoteUrl || `https://github.com/${fullName}`
    const addRemote = spawnQuiet(["git", "remote", "add", "origin", url])
    if (addRemote.ok) {
      logger.log(`remote origin set: ${url}`)
      result.remoteAdded = true
      result.remoteUrl = url
    } else {
      logger.warn(`Failed to set remote origin: ${addRemote.stderr}`)
    }
  }

  // 6. Push (if not already pushed by gh repo create --push)
  if (result.remoteAdded && !result.pushed && hasLocalCommit()) {
    const pushResult = spawnQuiet(["git", "push", "-u", "origin", "main"])
    if (pushResult.ok) {
      logger.log("Pushed to origin/main")
      result.pushed = true
    } else {
      logger.warn(`Push failed (run git push manually later): ${pushResult.stderr}`)
    }
  } else if (result.remoteAdded && !result.pushed) {
    logger.warn("No commits yet, skipping initial push; run git push after the first commit")
  }

  // 7. Branch protection
  const protectResult = spawnQuiet([
    "gh", "api", "-X", "PUT",
    `repos/${fullName}/branches/main/protection`,
    "-f", "required_status_checks[strict]=true",
    "-f", "required_status_checks[contexts][]=ci",
    "-f", "enforce_admins=false",
    "-f", "required_pull_request_reviews[required_approving_review_count]=0",
    "-f", "restrictions=null",
  ])
  if (protectResult.ok) {
    logger.log("branch protection configured (main)")
    result.branchProtection = true
  } else {
    logger.warn(`branch protection setup failed (requires repo admin permissions): ${protectResult.stderr}`)
  }

  // 8. Labels
  const labels = [
    { name: "milestone", color: "0E8A16", description: "Milestone tracking" },
    { name: "task", color: "1D76DB", description: "Task tracking" },
    { name: "blocked", color: "D93F0B", description: "Blocked by external dependency" },
    { name: "spike", color: "FBCA04", description: "Research / investigation" },
    { name: "design-review", color: "C5DEF5", description: "Needs design review" },
    { name: "harness", color: "5319E7", description: "Harness Engineering and Orchestrator managed" },
  ]
  let labelsOk = true
  for (const label of labels) {
    const labelResult = spawnQuiet([
      "gh", "label", "create", label.name,
      "--color", label.color,
      "--description", label.description,
      "--force",
    ])
    if (!labelResult.ok) labelsOk = false
  }
  if (labelsOk) {
    logger.log(`Labels created (${labels.length} total)`)
    result.labelsCreated = true
  } else {
    logger.warn("Some labels failed to create")
  }

  // 9. Issue templates are already written by writeCoreFiles
  result.issueTemplatesCreated = true

  // 10. Repo settings (description + topics)
  spawnQuiet([
    "gh", "repo", "edit", fullName,
    "--description", context.projectDescription,
    "--add-topic", "harness-engineering-orchestrator",
  ])

  return result
}

function writeInitialState(context: Context, logger: SetupLogger, githubResult?: Partial<GitHubState>): void {
  logger.step("Sync .harness/state.json")

  const prd = existsSync("docs/prd/03-requirements.md")
    ? readFileSync("docs/prd/03-requirements.md", "utf-8")
    : existsSync("docs/PRD.md")
      ? readFileSync("docs/PRD.md", "utf-8")
      : ""
  const milestoneCount = Math.max(1, countPrdMilestones(prd))
  const current = existingState()
  const defaults = initState({})
  const harnessLevel = current?.projectInfo.harnessLevel ?? defaults.projectInfo.harnessLevel
  const toolchain = resolveInitialToolchain(context, current?.toolchain)

  const next = initState({
    ...(current ?? {}),
    phase: current?.phase && current.phase !== "DISCOVERY" ? current.phase : "SCAFFOLD",
    projectInfo: {
      ...(current?.projectInfo ?? {}),
      name: context.projectName,
      displayName: context.projectDisplayName,
      concept: current?.projectInfo.concept ?? context.projectConcept,
      problem: current?.projectInfo.problem ?? context.projectProblem,
      goal: current?.projectInfo.goal ?? context.projectGoal,
      types: current?.projectInfo.types?.length ? current.projectInfo.types : context.projectTypes,
      aiProvider: current?.projectInfo.aiProvider ?? context.aiProvider,
      teamSize: current?.projectInfo.teamSize ?? context.teamSize,
      isGreenfield: current?.projectInfo.isGreenfield ?? context.isGreenfield,
      designStyle: current?.projectInfo.designStyle ?? context.designStyle,
      designReference: current?.projectInfo.designReference ?? context.designReference,
      harnessLevel,
    },
    docs: {
      ...(current?.docs ?? defaults.docs),
      prd: {
        path: "docs/PRD.md",
        exists: true,
        version: current?.docs.prd.version ?? "v1.0",
        milestoneCount,
      },
      architecture: {
        path: "docs/ARCHITECTURE.md",
        exists: true,
        version: current?.docs.architecture.version ?? "v1.0",
        dependencyLayers:
          current?.docs.architecture.dependencyLayers?.length
            ? current.docs.architecture.dependencyLayers
            : ["types", "config", "lib", "services", "app"],
        ciValidated: hasDependencyCruiserCiSupport(),
      },
      progress: {
        path: "docs/PROGRESS.md",
        exists: true,
        lastUpdated: context.nowIso,
      },
      gitbook: {
        path: "docs/gitbook/",
        initialized: true,
        summaryExists: true,
      },
      readme: {
        path: "README.md",
        exists: true,
        isFinal: current?.docs.readme.isFinal ?? false,
      },
      design: context.isUiProject
        ? {
            systemPath: "docs/design/DESIGN_SYSTEM.md",
            exists: existsSync("docs/design/DESIGN_SYSTEM.md"),
            milestoneSpecs: current?.docs.design?.milestoneSpecs ?? [],
          }
        : undefined,
      adrs: Array.from(
        new Set([...(current?.docs.adrs ?? []), "docs/adr/ADR-001-initial-tech-stack.md"]),
      ),
    },
    scaffold: {
      ...(current?.scaffold ?? defaults.scaffold),
      agentsMdExists: true,
      claudeMdExists: true,
      envExampleExists: true,
      ciExists: true,
      cdExists: existsSync(".github/workflows/release.yml"),
      prTemplateExists: true,
      depCheckConfigured: existsSync(".dependency-cruiser.cjs"),
      githubSetup: githubResult?.repoCreated ?? current?.scaffold.githubSetup ?? false,
    },
    roadmap: current?.roadmap ?? defaults.roadmap,
    validation: {
      ...(current?.validation ?? defaults.validation),
      criticalTotal: getHarnessCriticalTotal(harnessLevel.level),
    },
    github: {
      ...(current?.github ?? defaults.github),
      orgName: context.org,
      repoName: context.repo,
      visibility: context.visibility,
      ...githubResult,
    },
    toolchain,
  })

  writeFileAlways(".harness/state.json", `${JSON.stringify(next, null, 2)}\n`, logger)
}

function syncManagedArtifacts(logger: SetupLogger): void {
  const state = existingState()
  if (!state) return

  logger.step("Sync managed docs / skills")
  syncManagedFiles(getManagedDocSpecs(state))
  syncManagedFiles(getManagedSkillSpecs(state))
  ensureEnvLocalSkeleton(state)
  syncClaudeMirrorFromAgents(logger)
  const manifest = syncLocalBootstrapManifest()
  logger.log(
    `${manifest.changed ? "Updated" : "Verified"} ${manifest.path} (${manifest.fileCount} local file(s) captured)`,
  )
  logger.log("Managed docs and skills synchronized")
}

export async function runSetup(params: SetupParams): Promise<void> {
  const { context, skillRoot, logger } = params

  console.log(`\n${"═".repeat(55)}`)
  console.log(`  🔨 Harness Setup — ${context.projectDisplayName} (${context.projectTypeLabel})`)
  console.log(`${"═".repeat(55)}`)

  await checkEnv(logger)
  copyHarnessRuntime(skillRoot, logger)
  copyAgentSpecs(skillRoot, logger)
  ensureProjectStructure(logger)
  writeCoreFiles(params)
  ensureMonorepoBaseline(params)
  writeAgentSkillScaffold(params)
  setupGitignore(logger)
  updatePackageJson(logger)
  ensureGitRepository(logger)
  installHooks(skillRoot, logger)
  const githubResult = await setupGitHub(params)
  writeInitialState(context, logger, githubResult)
  syncManagedArtifacts(logger)

  console.log(`\n${"═".repeat(55)}`)
  console.log("  ✅ Harness initialization complete")
  console.log("")
  console.log("  Next steps:")
  console.log("    1. bun install")
  console.log("    2. Fill in actual content for docs/prd/ and docs/architecture/")
  console.log("    3. bun harness:advance")
  console.log("    4. bun harness:env")
  console.log("    5. bun harness:validate --phase EXECUTING")
  console.log("    6. git tag v0.1.0 && git push origin v0.1.0  (first release)")
  console.log(`${"═".repeat(55)}\n`)
}
