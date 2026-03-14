/**
 * Install git hook shims and Codex CLI config when .harness/ already exists.
 * For full clone recovery, prefer: bun harness:hooks:install
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs"
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

function writeFileIfMissing(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content)
    console.log(`[harness-hooks] Created ${filePath}`)
  } else {
    console.log(`[harness-hooks] ${filePath} already exists, skipping`)
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
      try {
        chmodSync(hookPath, 0o755)
      } catch {
        // chmod may fail on Windows — git for Windows handles executability differently
      }
      console.log(`[harness-hooks] Installed ${name}`)
    }
  } else {
    console.warn("[harness-hooks] No .git directory — skipping git hooks (run git init first)")
  }

  // Codex CLI config — always generated
  mkdirSync(".codex", { recursive: true })
  writeFileIfMissing(".codex/config.toml", CODEX_CONFIG_TOML)
  mkdirSync(join(".codex", "rules"), { recursive: true })
  writeFileIfMissing(join(".codex", "rules", "guardian.rules"), CODEX_GUARDIAN_RULES)

  console.log("[harness-hooks] Hook installation complete.")
}

main()
