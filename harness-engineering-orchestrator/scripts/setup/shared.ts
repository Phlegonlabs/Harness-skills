import { basename, dirname, join, relative } from "path"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import type {
  AIProvider,
  DesignStyle,
  HarnessSkillConfig,
  ProjectState,
  ProjectType,
  TeamSize,
} from "../../references/harness-types"
import { readProjectStateFromDisk } from "../../references/runtime/state-io"

export type Context = {
  projectName: string
  projectDisplayName: string
  projectTypes: ProjectType[]
  projectType: ProjectType
  projectTypeLabel: string
  workspaceApps: string[]
  hasAgentProject: boolean
  projectConcept: string
  projectDescription: string
  projectProblem: string
  projectGoal: string
  aiProvider: AIProvider
  aiProviderLabel: string
  teamSize: TeamSize
  teamSizeLabel: string
  isGreenfield: boolean
  greenfieldLabel: string
  designStyle?: DesignStyle
  designStyleLabel: string
  designReference: string
  userName: string
  org: string
  repo: string
  projectUrl: string
  gitbookUrl: string
  today: string
  nowIso: string
  year: string
  isUiProject: boolean
  visibility: "public" | "private"
  skipGithub: boolean
  githubRepo: string   // "owner/repo" for existing repos, or "" for auto
  ecosystem: string
  packageManagerLabel: string
  installCommand: string
  workspaceModel: string
  existingRepoSummary: string
  existingDependencySummary: string
  existingScriptSummary: string
  existingDirectorySummary: string
}

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  "web-app": "Web App",
  "ios-app": "iOS App",
  "android-app": "Android App",
  api: "API / Backend",
  "mobile-cross-platform": "Cross-Platform Mobile",
  cli: "CLI",
  agent: "Agent Project",
  desktop: "Desktop App",
  monorepo: "Monorepo",
}

const WORKSPACE_APP_DIRS: Partial<Record<ProjectType, string>> = {
  "web-app": "web",
  "ios-app": "ios",
  "android-app": "android",
  api: "api",
  "mobile-cross-platform": "mobile",
  cli: "cli",
  agent: "agent",
  desktop: "desktop",
}

const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI / Codex",
  anthropic: "Anthropic Claude",
  both: "OpenAI + Claude",
  "vercel-ai-sdk": "Vercel AI SDK",
  google: "Google Gemini",
  "open-source": "Open Source (Ollama / vLLM)",
  multi: "Multi-Provider",
  none: "None",
}

const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  solo: "Solo",
  small: "Small team",
  large: "Large team",
}

const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  "dark-modern": "Dark Modern",
  "clean-minimal": "Clean Minimal",
  "bold-expressive": "Bold Expressive",
  professional: "Professional",
  "soft-friendly": "Soft Friendly",
  custom: "Custom",
}

// [packageManagerLabel, installCommand, workspaceModel]
const ECOSYSTEM_TOOLCHAIN: Record<string, [string, string, string]> = {
  "bun":           ["Bun",        "bun install",                   "Monorepo (Bun workspaces)"],
  "node-npm":      ["npm",        "npm install",                   "Monorepo (npm workspaces)"],
  "node-pnpm":     ["pnpm",       "pnpm install",                  "Monorepo (pnpm workspaces)"],
  "node-yarn":     ["Yarn",       "yarn install",                  "Monorepo (Yarn workspaces)"],
  "python":        ["pip",        "pip install -r requirements.txt","Monorepo (Python)"],
  "go":            ["Go modules", "go mod download",               "Monorepo (Go modules)"],
  "rust":          ["Cargo",      "cargo build",                   "Monorepo (Cargo workspace)"],
  "kotlin-gradle": ["Gradle",     "./gradlew build",               "Monorepo (Gradle)"],
  "java-gradle":   ["Gradle",     "./gradlew build",               "Monorepo (Gradle)"],
  "java-maven":    ["Maven",      "mvn install",                   "Monorepo (Maven)"],
  "ruby":          ["Bundler",    "bundle install",                "Monorepo (Bundler)"],
  "csharp-dotnet": ["dotnet",     "dotnet restore",                "Monorepo (.NET)"],
  "swift":         ["Swift PM",   "swift package resolve",         "Monorepo (Swift PM)"],
  "flutter":       ["pub",        "flutter pub get",               "Monorepo (Flutter)"],
  "custom":        ["Bun",        "bun install",                   "Monorepo (Bun workspaces)"],
}

export type SetupLogger = {
  log: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => never
  step: (message: string) => void
}

export function createLogger(): SetupLogger {
  return {
    log: (message: string) => console.log(`  ✅ ${message}`),
    warn: (message: string) => console.log(`  ⚠️  ${message}`),
    error: (message: string) => {
      console.error(`  ❌ ${message}`)
      process.exit(1)
    },
    step: (message: string) =>
      console.log(`\n── ${message} ${"─".repeat(Math.max(0, 50 - message.length))}`),
  }
}

export function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv
      .filter(arg => arg.startsWith("--"))
      .map(arg => {
        const [key, value] = arg.slice(2).split("=")
        return [key, value ?? "true"]
      }),
  )
}

export function projectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPE_LABELS[type]
}

function parseProjectTypes(args: Record<string, string>): ProjectType[] {
  const detectedTypes = detectExistingProjectTypes().join(",")
  const raw = args.types ?? args.type ?? (detectedTypes || "web-app")
  const values = Array.from(
    new Set(
      raw
        .split(",")
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )

  if (values.length === 0) return ["web-app"]

  const invalid = values.filter(value => !(value in PROJECT_TYPE_LABELS))
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported project type(s): ${invalid.join(", ")}. Supported values: ${Object.keys(PROJECT_TYPE_LABELS).join(", ")}`,
    )
  }

  const normalized = values as ProjectType[]
  const surfaceTypes = normalized.filter(type => type !== "monorepo")

  if (normalized.includes("monorepo")) {
    return surfaceTypes.length > 0 ? ["monorepo", ...surfaceTypes] : ["monorepo"]
  }

  return ["monorepo", ...normalized]
}

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T
  } catch {
    return null
  }
}

export function loadSkillConfig(skillRoot: string): HarnessSkillConfig | null {
  return readJsonIfExists<HarnessSkillConfig>(join(skillRoot, "config.json"))
}

function readFirstExisting(paths: string[]): string {
  for (const path of paths) {
    if (!existsSync(path)) continue
    const content = readFileSync(path, "utf-8").trim()
    if (content) return content
  }
  return ""
}

function firstMarkdownHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ""
}

function firstParagraph(content: string): string {
  const normalized = content
    .replace(/^---[\s\S]*?---/m, "")
    .split(/\r?\n\r?\n/)
    .map(block => block.replace(/^#+\s+.+$/gm, "").trim())
    .find(block => block.length > 0)

  return normalized ?? ""
}

function detectExistingProjectTypes(): ProjectType[] {
  const detected = new Set<ProjectType>()

  if (existsSync("apps")) {
    const dirs = readdirSync("apps", { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)

    if (dirs.includes("web")) detected.add("web-app")
    if (dirs.includes("ios")) detected.add("ios-app")
    if (dirs.includes("android")) detected.add("android-app")
    if (dirs.includes("api")) detected.add("api")
    if (dirs.includes("mobile")) detected.add("mobile-cross-platform")
    if (dirs.includes("cli")) detected.add("cli")
    if (dirs.includes("agent")) detected.add("agent")
    if (dirs.includes("desktop")) detected.add("desktop")
  }

  const pkg = readJsonIfExists<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; name?: string }>("package.json")
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }

  if (deps.next || deps.react || deps["react-dom"]) detected.add("web-app")
  if (deps["@openai/agents"] || deps.ai || deps["@ai-sdk/openai"] || deps["@ai-sdk/anthropic"]) detected.add("agent")
  if (deps["@clack/prompts"] || deps.commander) detected.add("cli")
  if (deps.tauri || deps.electron) detected.add("desktop")

  // Android / Kotlin / Gradle detection
  if (existsSync("build.gradle") || existsSync("build.gradle.kts") || existsSync("android")) detected.add("android-app")

  // API / Backend detection (Hono or Fastify without React)
  if ((deps.hono || deps.fastify) && !deps.react && !deps["react-dom"]) detected.add("api")

  // Cross-platform mobile detection (React Native, Expo, Flutter)
  if (deps["react-native"] || deps.expo || existsSync("pubspec.yaml")) detected.add("mobile-cross-platform")

  return detected.size > 0 ? Array.from(detected) : ["web-app"]
}

function summarizeList(items: string[], emptyText: string, max = 8): string {
  if (items.length === 0) return emptyText
  const visible = items.slice(0, max)
  const suffix = items.length > max ? `, +${items.length - max} more` : ""
  return visible.join(", ") + suffix
}

function detectTopLevelDirectories(): string[] {
  return readdirSync(process.cwd(), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => ![".git", "node_modules", "dist", "tmp", ".harness"].includes(name))
    .sort()
}

function detectExistingDependencies(): string[] {
  const pkg = readJsonIfExists<{
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }>("package.json")

  if (!pkg) return []
  return Array.from(
    new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]),
  ).sort()
}

function detectExistingScripts(): string[] {
  const pkg = readJsonIfExists<{ scripts?: Record<string, string> }>("package.json")
  return pkg?.scripts ? Object.keys(pkg.scripts).sort() : []
}

function existingRepoSummary(projectDisplayName: string, isGreenfield: boolean): string {
  if (isGreenfield) {
    return "This repository starts from a fresh Harness program baseline. Product-specific frameworks and content are introduced milestone by milestone."
  }

  const dirs = summarizeList(detectTopLevelDirectories(), "no notable directories detected")
  const deps = summarizeList(detectExistingDependencies(), "no package dependencies detected")
  const scripts = summarizeList(detectExistingScripts(), "no package scripts detected")

  return `${projectDisplayName} appears to be an existing repository. Detected top-level directories: ${dirs}. Detected dependencies: ${deps}. Detected scripts: ${scripts}.`
}

function detectProjectName(args: Record<string, string>): string {
  if (args.name) return args.name

  const pkg = readJsonIfExists<{ name?: string }>("package.json")
  if (pkg?.name?.trim()) return pkg.name.trim()

  return basename(process.cwd()).replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "my-project"
}

function detectDisplayName(projectName: string, args: Record<string, string>): string {
  if (args.displayName) return args.displayName

  const heading = firstMarkdownHeading(
    readFirstExisting(["docs/PRD.md", "README.md", "docs/ARCHITECTURE.md"]),
  )
  if (heading) return heading.replace(/^PRD\s+[—-]\s+/, "").replace(/^Architecture\s+[—-]\s+/, "")

  return projectName
}

function detectDescription(projectDisplayName: string, args: Record<string, string>): string {
  if (args.description) return args.description

  const pkg = readJsonIfExists<{ description?: string }>("package.json")
  if (pkg?.description?.trim()) return pkg.description.trim()

  const paragraph = firstParagraph(readFirstExisting(["README.md", "docs/PRD.md"]))
  if (paragraph) return paragraph

  return `${projectDisplayName} prepared with the Harness Engineering and Orchestrator workflow.`
}

function parseEnumValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(`Unsupported value "${value}". Allowed: ${allowed.join(", ")}`)
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback

  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "y":
      return true
    case "false":
    case "0":
    case "no":
    case "n":
      return false
    default:
      throw new Error(`Unsupported boolean value "${value}". Use true/false.`)
  }
}

function normalizeOptional(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : fallback
}

function combinedProjectTypeLabel(types: ProjectType[]): string {
  return types.map(projectTypeLabel).join(" + ")
}

function primaryProjectType(types: ProjectType[]): ProjectType {
  return types.find(type => type !== "monorepo") ?? "monorepo"
}

function workspaceAppsFor(types: ProjectType[]): string[] {
  const surfaceTypes = types.filter(type => type !== "monorepo")
  if (surfaceTypes.length === 0) return ["core"]

  return Array.from(
    new Set(
      surfaceTypes.map(type => WORKSPACE_APP_DIRS[type] ?? type),
    ),
  )
}

export function createContext(args: Record<string, string>, skillRoot?: string): Context {
  const cfg = skillRoot ? loadSkillConfig(skillRoot) : null
  const d = cfg?.defaults ?? {}

  const projectTypes = parseProjectTypes(args)
  const projectType = primaryProjectType(projectTypes)
  const projectName = detectProjectName(args)
  const projectDisplayName = detectDisplayName(projectName, args)
  const projectDescription = detectDescription(projectDisplayName, args)
  const projectConcept = normalizeOptional(
    args.concept,
    firstParagraph(readFirstExisting(["docs/prd/01-overview.md", "docs/PRD.md", "README.md"])) || projectDescription,
  )
  const projectProblem = normalizeOptional(
    args.problem,
    "TBD: Define the core problem the target users are facing.",
  )
  const projectGoal = normalizeOptional(
    args.goal,
    "Build a sustainable and verifiable project scaffold",
  )
  const aiProvider = parseEnumValue<AIProvider>(
    args.aiProvider ?? d.aiProvider,
    ["openai", "anthropic", "both", "vercel-ai-sdk", "google", "open-source", "multi", "none"],
    "none",
  )
  const teamSize = parseEnumValue<TeamSize>(args.teamSize ?? d.teamSize, ["solo", "small", "large"], "solo")
  const isGreenfield = parseBooleanFlag(args.isGreenfield, true)
  const isUiProject = projectTypes.some(type => ["web-app", "ios-app", "android-app", "mobile-cross-platform", "desktop"].includes(type))
  const designStyle = isUiProject
    ? parseEnumValue<DesignStyle>(
        args.designStyle ?? d.designStyle,
        ["dark-modern", "clean-minimal", "bold-expressive", "professional", "soft-friendly", "custom"],
        "professional",
      )
    : undefined
  const designReference = normalizeOptional(args.designReference, "Not provided")
  const hasAgentProject = projectTypes.includes("agent")
  const ecosystem = args.ecosystem ?? d.ecosystem ?? "bun"
  const [packageManagerLabel, installCommand, workspaceModel] =
    ECOSYSTEM_TOOLCHAIN[ecosystem] ?? ECOSYSTEM_TOOLCHAIN["bun"]
  const dependencySummary = summarizeList(
    detectExistingDependencies(),
    "No dependency manifest was detected yet.",
  )
  const scriptSummary = summarizeList(
    detectExistingScripts(),
    "No package scripts were detected yet.",
  )
  const directorySummary = summarizeList(
    detectTopLevelDirectories(),
    "No existing app directories were detected yet.",
  )

  return {
    projectName,
    projectDisplayName,
    projectTypes,
    projectType,
    projectTypeLabel: combinedProjectTypeLabel(projectTypes),
    workspaceApps: workspaceAppsFor(projectTypes),
    hasAgentProject,
    projectConcept,
    projectDescription,
    projectProblem,
    projectGoal,
    aiProvider,
    aiProviderLabel: AI_PROVIDER_LABELS[aiProvider],
    teamSize,
    teamSizeLabel: TEAM_SIZE_LABELS[teamSize],
    isGreenfield,
    greenfieldLabel: isGreenfield ? "Greenfield" : "Existing codebase",
    designStyle,
    designStyleLabel: designStyle ? DESIGN_STYLE_LABELS[designStyle] : "N/A",
    designReference,
    userName: args.user ?? cfg?.org?.defaultUser ?? "Operator",
    org: args.org ?? cfg?.org?.name ?? "your-org",
    repo: args.repo ?? projectName,
    projectUrl: args.projectUrl ?? `${projectName}.example.com`,
    gitbookUrl: args.gitbookUrl ?? `docs.${projectName}.example.com`,
    today: new Date().toISOString().slice(0, 10),
    nowIso: new Date().toISOString(),
    year: new Date().getFullYear().toString(),
    isUiProject,
    visibility: (args.visibility ?? d.visibility ?? "private") as "public" | "private",
    skipGithub: args.skipGithub !== undefined ? args.skipGithub === "true" : (d.skipGithub ?? false),
    githubRepo: args.githubRepo ?? "",
    ecosystem,
    packageManagerLabel,
    installCommand,
    workspaceModel,
    existingRepoSummary: existingRepoSummary(projectDisplayName, isGreenfield),
    existingDependencySummary: dependencySummary,
    existingScriptSummary: scriptSummary,
    existingDirectorySummary: directorySummary,
  }
}

export function ensureDirForFile(path: string): void {
  const dir = dirname(path)
  if (dir !== ".") mkdirSync(dir, { recursive: true })
}

export function normalizeTextFileContent(content: string): string {
  return content.replace(/\r\n/g, "\n")
}

export function writeFileIfMissing(path: string, content: string, logger: SetupLogger): void {
  if (existsSync(path)) {
    logger.warn(`${path} already exists, skipping`)
    return
  }

  ensureDirForFile(path)
  writeFileSync(path, normalizeTextFileContent(content))
  logger.log(`Generated ${path}`)
}

export function writeFileAlways(path: string, content: string, logger: SetupLogger): void {
  ensureDirForFile(path)
  writeFileSync(path, normalizeTextFileContent(content))
  logger.log(`Updated ${path}`)
}

export function buildVisualDesignContent(context: Context): string {
  return context.isUiProject
    ? `### 3.1 Design Style
**Selection**: ${context.designStyleLabel}

**Reference App / Website**: ${context.designReference}

### 3.2 Design Principles
- Color palette: Clear, maintainable
- Personality: Professional, direct
- Reference UI Library: TBD in Phase 2`
    : "This project type is not primarily UI-driven. If a UI is added later, supplement with DESIGN_SYSTEM.md and related specs."
}

export function buildDirectoryStructure(context: Context): string {
  const workspaceSection = context.workspaceApps
    .map(app => `│   ├── ${app}/`)
    .join("\n")
  const agentSkillSection = context.hasAgentProject
    ? `├── SKILLS.md
├── skills/
│   └── api-wrapper/
│       └── SKILL.md
`
    : ""

  return `${context.projectName}/
├── AGENTS.md
├── CLAUDE.md
├── README.md
${agentSkillSection}├── agents/
├── apps/
${workspaceSection}
├── packages/
│   └── shared/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── PROGRESS.md
│   ├── prd/
│   ├── architecture/
│   ├── progress/
│   ├── ai/
│   ├── public/
│   ├── adr/
│   ├── design/
│   └── gitbook/
├── .harness/
│   ├── types.ts
│   ├── init.ts
│   ├── advance.ts
│   ├── state.ts
│   ├── validate.ts
│   ├── compact.ts
│   ├── resume.ts
│   ├── runtime/
│   └── state.json
├── scripts/
│   └── harness-local/
│       ├── restore.ts
│       └── manifest.json
├── .dependency-cruiser.cjs
├── bunfig.toml
├── src/
│   ├── types/
│   ├── config/
│   ├── lib/
│   ├── services/
│   └── app/
├── tests/
└── .github/workflows/`
}

export function renderPlaceholders(content: string, context: Context): string {
  const replacements: Record<string, string> = {
    PROJECT_NAME: context.projectName,
    PROJECT_NAME_JSON: JSON.stringify(context.projectName),
    PROJECT_DISPLAY_NAME: context.projectDisplayName,
    PROJECT_DISPLAY_NAME_JSON: JSON.stringify(context.projectDisplayName),
    PROJECT_TYPE: context.projectTypeLabel,
    PROJECT_TYPE_JSON: JSON.stringify(context.projectTypeLabel),
    PROJECT_TYPES: context.projectTypes.join(", "),
    PROJECT_TYPES_JSON: JSON.stringify(context.projectTypes.join(", ")),
    PROJECT_DESCRIPTION: context.projectDescription,
    PROJECT_DESCRIPTION_JSON: JSON.stringify(context.projectDescription),
    PROJECT_CONCEPT: context.projectConcept,
    PROJECT_CONCEPT_JSON: JSON.stringify(context.projectConcept),
    PROJECT_PROBLEM: context.projectProblem,
    PROJECT_PROBLEM_JSON: JSON.stringify(context.projectProblem),
    PROJECT_GOAL: context.projectGoal,
    PROJECT_GOAL_JSON: JSON.stringify(context.projectGoal),
    AI_PROVIDER: context.aiProviderLabel,
    AI_PROVIDER_JSON: JSON.stringify(context.aiProviderLabel),
    TEAM_SIZE: context.teamSizeLabel,
    TEAM_SIZE_JSON: JSON.stringify(context.teamSizeLabel),
    GREENFIELD_MODE: context.greenfieldLabel,
    GREENFIELD_MODE_JSON: JSON.stringify(context.greenfieldLabel),
    DESIGN_STYLE: context.designStyleLabel,
    DESIGN_STYLE_JSON: JSON.stringify(context.designStyleLabel),
    DESIGN_REFERENCE: context.designReference,
    DESIGN_REFERENCE_JSON: JSON.stringify(context.designReference),
    YOUR_NAME: context.userName,
    USER_NAME: context.userName,
    ORG: context.org,
    REPO: context.repo,
    PROJECT_URL: context.projectUrl,
    GITBOOK_URL: context.gitbookUrl,
    DATE: context.today,
    DATETIME: context.nowIso,
    YEAR: context.year,
    SECURITY_EMAIL: `security@${context.projectName}.dev`,
    AUTHOR: "Harness Engineering and Orchestrator",
    VISUAL_DESIGN_CONTENT: buildVisualDesignContent(context),
    DIRECTORY_STRUCTURE: buildDirectoryStructure(context),
    PACKAGE_MANAGER: context.packageManagerLabel,
    WORKSPACE_MODEL: context.workspaceModel,
    INSTALL_COMMAND: context.installCommand,
    CURRENT_PHASE: "SCAFFOLD",
    CURRENT_MILESTONE: "Not yet created",
    CURRENT_WORKTREE: `../${context.projectName}-m1`,
    CURRENT_TASK: "Backlog not yet initialized",
    PROGRESS_BAR: "░░░░░░░░░░",
    DONE_TASKS: "0",
    TOTAL_TASKS: "0",
    PROGRESS_PERCENT: "0",
    SURFACE_EVOLUTION_NOTE:
      "Start with the current product surfaces and keep adding new surfaces as later milestones inside the same monorepo.",
    AGENT_SKILLS_CONTEXT: context.hasAgentProject
      ? "This workspace includes `SKILLS.md` and `skills/api-wrapper/SKILL.md` so agent surfaces can wrap project and third-party APIs behind one reusable skill contract."
      : "No agent-specific skill wrapper is required yet.",
    AGENT_SKILLS_AGENTS: context.hasAgentProject
      ? "- **Agent skills**: `SKILLS.md` + `skills/api-wrapper/SKILL.md`"
      : "",
    AGENT_SKILLS_DOC_MAP: context.hasAgentProject
      ? "- `SKILLS.md` / `skills/`: agent skill catalog and API wrapper guidance"
      : "",
    AGENT_SKILLS_QUICKSTART: context.hasAgentProject
      ? "If this workspace includes agent surfaces, read `SKILLS.md` and `skills/api-wrapper/SKILL.md` before wiring tool or API calls."
      : "",
    AGENT_SKILLS_REQUIREMENTS: context.hasAgentProject
      ? `#### F003: Agent Skill Wrapper
- **Description**: Provide a reusable project-local skill that wraps internal and third-party APIs for agent surfaces.
- **User story**: As an agent developer, I want one stable skill entry point for API access so tools, auth, retries, and payload shaping do not get reimplemented in every workflow.
- **Acceptance criteria**:
  - [ ] \`SKILLS.md\` documents the project-local skills catalog
  - [ ] \`skills/api-wrapper/SKILL.md\` exists and explains how API wrappers are exposed to agent workflows
  - [ ] Agent-facing API calls are routed through the wrapper skill contract instead of scattered raw requests
- **Priority**: P0
- **Dependencies**: F001
`
      : "",
    EXISTING_REPO_SUMMARY: context.existingRepoSummary,
    EXISTING_DEPENDENCY_SUMMARY: context.existingDependencySummary,
    EXISTING_SCRIPT_SUMMARY: context.existingScriptSummary,
    EXISTING_DIRECTORY_SUMMARY: context.existingDirectorySummary,
  }

  return content.replace(/\[([A-Z_]+)\]/g, (full, key) => replacements[key] ?? full)
}

export function readSkillFile(skillRoot: string, ...parts: string[]): string {
  return readFileSync(join(skillRoot, ...parts), "utf-8")
}

export function readTemplate(skillRoot: string, context: Context, path: string): string {
  return renderPlaceholders(readSkillFile(skillRoot, "templates", path), context)
}

export function collectTemplateFiles(skillRoot: string, dir: string): string[] {
  const root = join(skillRoot, "templates", dir)
  const results: string[] = []

  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) results.push(full)
    }
  }

  walk(root)
  return results
}

export function writeTemplateTree(
  skillRoot: string,
  context: Context,
  templateDir: string,
  outputDir: string,
  logger: SetupLogger,
  include: (relativePath: string) => boolean = () => true,
): void {
  const templateRoot = join(skillRoot, "templates", templateDir)

  for (const file of collectTemplateFiles(skillRoot, templateDir)) {
    const rel = relative(templateRoot, file).replace(/\\/g, "/")
    if (!include(rel)) continue
    const outputPath = join(outputDir, rel.replace(/\.template$/, "")).replace(/\\/g, "/")
    const content = renderPlaceholders(readFileSync(file, "utf-8"), context)
    writeFileIfMissing(outputPath, content, logger)
  }
}

export function countPrdMilestones(content: string): number {
  return Array.from(content.matchAll(/^###\s+Milestone\b/gm)).length
}

export function existingState(): ProjectState | null {
  if (!existsSync(".harness/state.json")) return null
  return readProjectStateFromDisk(".harness/state.json")
}
