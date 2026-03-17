import { createHash } from "crypto"
import { extname, join } from "path"
import { existsSync, readdirSync, readFileSync } from "fs"
import { UNCONFIGURED_TOOLCHAIN_SENTINEL } from "../toolchain-detect.js"

export type ForbiddenPatternRule = {
  label: string
  pattern: RegExp
  blocking: boolean
}

export type ForbiddenPatternHit = {
  blocking: boolean
  content: string
  file: string
  label: string
  line: number
}

type ToolchainLike = {
  sourceRoot?: string
  sourceExtensions?: string[]
  forbiddenPatterns?: Array<{
    pattern: string
    reason: string
    severity: "block" | "warn"
  }>
}

type ToolchainCommandKey = "install" | "typecheck" | "lint" | "format" | "test" | "build" | "depCheck"
type ToolchainCommandMap = Partial<Record<ToolchainCommandKey, ToolchainCommandSpec>>

export const FORBIDDEN_PATTERN_RULES: ForbiddenPatternRule[] = [
  { label: "console.log", pattern: /console\.log\s*\(/, blocking: true },
  { label: ": any", pattern: /:\s*any\b/, blocking: true },
  { label: "@ts-ignore", pattern: /@ts-ignore/, blocking: true },
  { label: "TODO:", pattern: /\bTODO:/, blocking: false },
  { label: "FIXME:", pattern: /\bFIXME:/, blocking: false },
  { label: "OpenAI key", pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/, blocking: true },
  { label: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{10,}\b/, blocking: true },
  { label: "GitHub PAT", pattern: /\bghp_[A-Za-z0-9]{20,}\b/, blocking: true },
  { label: "eval()", pattern: /\beval\s*\(/, blocking: true },
  { label: "innerHTML assignment", pattern: /\.innerHTML\s*=/, blocking: true },
  { label: "dangerouslySetInnerHTML", pattern: /dangerouslySetInnerHTML/, blocking: true },
  { label: "hardcoded http://", pattern: /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/, blocking: true },
]

const DEFAULT_SOURCE_ROOT = "src"
const DEFAULT_SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".rs", ".kt", ".kts",
  ".java", ".swift", ".dart", ".rb", ".cs",
]

export function findFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return []

  const results: string[] = []
  const walk = (currentDir: string) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const full = join(currentDir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full)
      } else if (entry.isFile() && exts.includes(extname(entry.name))) {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}

export function countLines(filePath: string): number {
  try {
    return readFileSync(filePath, "utf-8").split(/\r?\n/).length
  } catch {
    return 0
  }
}

export function searchInFiles(dir: string, pattern: RegExp, exts: string[]) {
  const matches: { file: string; line: number; content: string }[] = []

  for (const file of findFiles(dir, exts)) {
    try {
      readFileSync(file, "utf-8")
        .split(/\r?\n/)
        .forEach((content, index) => {
          if (pattern.test(content)) {
            matches.push({ file, line: index + 1, content: content.trim() })
          }
        })
    } catch {
      // skip unreadable files
    }
  }

  return matches
}

export function buildForbiddenPatternRules(toolchain?: ToolchainLike): ForbiddenPatternRule[] {
  const dynamicRules: ForbiddenPatternRule[] = []

  for (const rule of toolchain?.forbiddenPatterns ?? []) {
    try {
      dynamicRules.push({
        label: rule.reason || rule.pattern,
        pattern: new RegExp(rule.pattern),
        blocking: rule.severity !== "warn",
      })
    } catch {
      // Ignore invalid regex patterns rather than crashing validation.
    }
  }

  return [...FORBIDDEN_PATTERN_RULES, ...dynamicRules]
}

export function findForbiddenPatternHits(
  dir: string,
  exts: string[],
  toolchain?: ToolchainLike,
): ForbiddenPatternHit[] {
  return buildForbiddenPatternRules(toolchain).flatMap(rule =>
    searchInFiles(dir, rule.pattern, exts).map(hit => ({
      ...hit,
      blocking: rule.blocking,
      label: rule.label,
    })),
  )
}

export function fileHash(path: string): string {
  if (!existsSync(path)) return ""
  return createHash("md5").update(readFileSync(path)).digest("hex")
}

export function filesShareHash(...paths: string[]): boolean {
  if (paths.length < 2 || paths.some(path => !existsSync(path))) return false

  const [first, ...rest] = paths.map(fileHash)
  return rest.every(hash => hash === first)
}

export interface ToolchainCommandSpec {
  command: string
  label?: string
  optional?: boolean
}

export function createUnconfiguredToolchainCommand(
  key: ToolchainCommandKey,
  options: { optional?: boolean } = {},
): ToolchainCommandSpec {
  return {
    command: `echo "${UNCONFIGURED_TOOLCHAIN_SENTINEL}:${key}"`,
    label: `${key} (not configured)`,
    optional: options.optional ?? false,
  }
}

export function isToolchainCommandConfigured(spec?: ToolchainCommandSpec | null): boolean {
  return Boolean(spec?.command) && !spec.command.includes(UNCONFIGURED_TOOLCHAIN_SENTINEL)
}

export function resolveToolchainCommand(
  commands: ToolchainCommandMap | undefined,
  key: ToolchainCommandKey,
  options: { optional?: boolean } = {},
): ToolchainCommandSpec {
  return commands?.[key] ?? createUnconfiguredToolchainCommand(key, options)
}

export function resolveToolchainSourceRoot(toolchain?: ToolchainLike): string {
  const sourceRoot = toolchain?.sourceRoot?.trim()
  return sourceRoot && sourceRoot.length > 0 ? sourceRoot : DEFAULT_SOURCE_ROOT
}

export function resolveToolchainSourceExtensions(toolchain?: ToolchainLike): string[] {
  return toolchain?.sourceExtensions?.length ? toolchain.sourceExtensions : DEFAULT_SOURCE_EXTENSIONS
}

/** Execute a toolchain command string (e.g. "bun run typecheck", "cargo check"). */
export async function runToolchainCommand(
  spec: ToolchainCommandSpec,
): Promise<{ ok: boolean; output: string }> {
  if (!isToolchainCommandConfigured(spec)) {
    if (spec.optional) {
      return { ok: true, output: "" }
    }
    return {
      ok: false,
      output: `${spec.label ?? spec.command} is not configured. Update state.toolchain.commands before running validation.`,
    }
  }

  if (spec.optional) {
    // Optional commands may still fail when explicitly configured.
  }
  try {
    const proc = Bun.spawn(
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", spec.command]
        : ["sh", "-lc", spec.command],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    await proc.exited
    const output = proc.exitCode === 0 ? stdout : stderr || stdout
    return { ok: proc.exitCode === 0, output }
  } catch (error) {
    return { ok: false, output: String(error) }
  }
}

/** @deprecated Use runToolchainCommand() for ecosystem-agnostic execution. */
export async function runBun(args: string[]): Promise<{ ok: boolean; output: string }> {
  return runToolchainCommand({ command: `bun ${args.join(" ")}` })
}

export function runGit(args: string[]): { ok: boolean; output: string } {
  try {
    const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" })
    const stdout = new TextDecoder().decode(proc.stdout).trim()
    const stderr = new TextDecoder().decode(proc.stderr).trim()
    return { ok: proc.exitCode === 0, output: proc.exitCode === 0 ? stdout : stderr }
  } catch (error) {
    return { ok: false, output: String(error) }
  }
}

export async function commandExists(cmd: string): Promise<boolean> {
  const finder = process.platform === "win32" ? "where" : "which"

  try {
    const proc = Bun.spawn([finder, cmd], { stdout: "pipe", stderr: "pipe" })
    await proc.exited
    return proc.exitCode === 0
  } catch {
    return false
  }
}

export async function getVersion(cmd: string): Promise<string> {
  try {
    const proc = Bun.spawn([cmd, "--version"], { stdout: "pipe", stderr: "pipe" })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited
    return stdout.trim().split(/\r?\n/)[0] ?? ""
  } catch {
    return ""
  }
}
