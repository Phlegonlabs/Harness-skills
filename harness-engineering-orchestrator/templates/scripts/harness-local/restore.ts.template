#!/usr/bin/env bun

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"

type ManifestEntry = {
  content: string
  path: string
}

type LocalBootstrapManifest = {
  files: ManifestEntry[]
  version: number
}

const MANIFEST_PATH = "scripts/harness-local/manifest.json"

const GIT_HOOK_SHIMS: Record<string, string> = {
  "pre-commit": "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook pre-commit\n",
  "commit-msg": '#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook commit-msg "$1"\n',
  "pre-push": "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook pre-push\n",
  "post-commit": "#!/bin/sh\nbun .harness/runtime/hooks/check-guardian.ts --hook post-commit\n",
}

function normalizeText(content: string): string {
  return content.replace(/\r\n/g, "\n")
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`)
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`)
}

function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath)
  if (parent && parent !== ".") mkdirSync(parent, { recursive: true })
}

function readManifest(): LocalBootstrapManifest {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing ${MANIFEST_PATH}. Re-run the Harness scaffold in a tracked checkout.`)
  }

  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as LocalBootstrapManifest
  if (!Array.isArray(parsed.files)) {
    throw new Error(`Invalid ${MANIFEST_PATH}: files[] is required.`)
  }

  return parsed
}

function restoreEntry(entry: ManifestEntry): "created" | "unchanged" | "updated" {
  ensureParentDir(entry.path)
  const nextText = normalizeText(entry.content)

  if (!existsSync(entry.path)) {
    writeFileSync(entry.path, nextText)
    return "created"
  }

  const current = normalizeText(readFileSync(entry.path, "utf-8"))
  if (current === nextText) return "unchanged"

  writeFileSync(entry.path, nextText)
  return "updated"
}

function installGitHooks(): { installed: number; skipped: boolean } {
  if (!existsSync(".git")) {
    writeStderr("[harness-hooks] No .git directory detected; skipping git hook installation.")
    return { installed: 0, skipped: true }
  }

  const hooksDir = join(".git", "hooks")
  mkdirSync(hooksDir, { recursive: true })

  let installed = 0
  for (const [name, content] of Object.entries(GIT_HOOK_SHIMS)) {
    const hookPath = join(hooksDir, name)
    writeFileSync(hookPath, content)
    try {
      chmodSync(hookPath, 0o755)
    } catch {
      // Git for Windows handles executability separately.
    }
    installed++
  }

  return { installed, skipped: false }
}

function main(): void {
  const manifest = readManifest()
  const stats = { created: 0, unchanged: 0, updated: 0 }

  for (const entry of manifest.files) {
    const result = restoreEntry(entry)
    stats[result]++
  }

  const gitHooks = installGitHooks()
  writeStdout(
    `[harness-hooks] Restored ${manifest.files.length} local Harness file(s): ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged.`,
  )

  if (!gitHooks.skipped) {
    writeStdout(`[harness-hooks] Reinstalled ${gitHooks.installed} git hook shim(s).`)
  }

  writeStdout("[harness-hooks] Local Harness restore complete.")
}

main()
