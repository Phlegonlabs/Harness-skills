/**
 * Install git hook shims and Codex CLI config when .harness/ already exists.
 * For full clone recovery, prefer: bun harness:hooks:install
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { CODEX_CONFIG_TOML, CODEX_GUARDIAN_RULES } from "./codex-config"

const SHIMS: Record<string, string> = {
  "pre-commit": [
    "#!/bin/sh",
    'bun .harness/runtime/hooks/check-guardian.ts --hook pre-commit',
    "",
  ].join("\n"),
  "commit-msg": [
    "#!/bin/sh",
    'bun .harness/runtime/hooks/check-guardian.ts --hook commit-msg "$1"',
    "",
  ].join("\n"),
  "pre-push": [
    "#!/bin/sh",
    'bun .harness/runtime/hooks/check-guardian.ts --hook pre-push',
    "",
  ].join("\n"),
  "post-commit": [
    "#!/bin/sh",
    'bun .harness/runtime/hooks/check-guardian.ts --hook post-commit',
    "",
  ].join("\n"),
}

function mergeCodexConfig(filePath: string, defaultContent: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, defaultContent)
    console.log(`[harness-hooks] Created ${filePath}`)
    return
  }

  const existing = readFileSync(filePath, "utf-8")
  const lines = defaultContent.split(/\r?\n/)
  let appended = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    if (!existing.includes(trimmed)) {
      writeFileSync(filePath, `${existing.trimEnd()}\n${trimmed}\n`)
      console.log(`[harness-hooks] Appended missing config to ${filePath}: ${trimmed}`)
      appended = true
    }
  }

  if (!appended) {
    console.log(`[harness-hooks] ${filePath} already contains required config`)
  }
}

function mergeClaudeSettings(filePath: string): void {
  mkdirSync(".claude", { recursive: true })

  const harnessHooks = {
    "PreToolUse": ["bun .harness/runtime/hooks/check-guardian.ts --hook pre-write"],
    "PostToolUse": ["bun .harness/runtime/hooks/check-guardian.ts --hook post-write"],
    "Stop": ["bun .harness/runtime/hooks/check-guardian.ts --hook stop"],
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify({ hooks: harnessHooks }, null, 2))
    console.log(`[harness-hooks] Created ${filePath}`)
    return
  }

  try {
    const existing = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>
    const existingHooks = (existing.hooks ?? {}) as Record<string, string[]>

    for (const [event, commands] of Object.entries(harnessHooks)) {
      const current = existingHooks[event] ?? []
      for (const cmd of commands) {
        if (!current.includes(cmd)) {
          current.push(cmd)
        }
      }
      existingHooks[event] = current
    }

    existing.hooks = existingHooks
    writeFileSync(filePath, JSON.stringify(existing, null, 2))
    console.log(`[harness-hooks] Merged hooks into ${filePath}`)
  } catch {
    console.warn(`[harness-hooks] Could not parse ${filePath} — skipping merge`)
  }
}

function ensureExecutable(hookPath: string): void {
  if (process.platform === "win32") {
    // Windows: verify shebang line exists (git for Windows handles executability)
    try {
      const content = readFileSync(hookPath, "utf-8")
      if (!content.startsWith("#!/")) {
        console.warn(`[harness-hooks] ⚠️  ${hookPath} is missing shebang line`)
      }
    } catch {
      // File just written — should be readable
    }
    return
  }

  // Unix: verify executable bit
  try {
    const stats = statSync(hookPath)
    const isExecutable = (stats.mode & 0o111) !== 0
    if (!isExecutable) {
      chmodSync(hookPath, 0o755)
      console.log(`[harness-hooks] Set executable permission on ${hookPath}`)
    }
  } catch {
    console.warn(`[harness-hooks] ⚠️  Could not verify permissions on ${hookPath}`)
  }
}

function main(): void {
  // Git hooks — only if .git exists
  if (existsSync(".git")) {
    const hooksDir = join(".git", "hooks")
    mkdirSync(hooksDir, { recursive: true })

    for (const [name, content] of Object.entries(SHIMS)) {
      const hookPath = join(hooksDir, name)
      writeFileSync(hookPath, content)
      ensureExecutable(hookPath)
      console.log(`[harness-hooks] Installed ${name}`)
    }
  } else {
    console.warn("[harness-hooks] No .git directory — skipping git hooks (run git init first)")
  }

  // Claude Code settings — merge, don't overwrite
  mergeClaudeSettings(join(".claude", "settings.local.json"))

  // Codex CLI config — merge to preserve user customizations
  mkdirSync(".codex", { recursive: true })
  mergeCodexConfig(join(".codex", "config.toml"), CODEX_CONFIG_TOML)

  // Codex rules — always overwrite (Harness-managed file)
  mkdirSync(join(".codex", "rules"), { recursive: true })
  const rulesPath = join(".codex", "rules", "guardian.rules")
  writeFileSync(rulesPath, CODEX_GUARDIAN_RULES)
  console.log(`[harness-hooks] Updated ${rulesPath}`)

  console.log("[harness-hooks] Hook installation complete.")
}

main()
