/**
 * harness-learn.ts
 *
 * CLI entry point: bun harness:learn "lesson text"
 * Appends a timestamped learning entry to LEARNING.md and syncs
 * to both Claude Code and Codex knowledge paths.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs"
import { join } from "path"

const LEARNING_PATHS = [
  join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".claude", "LEARNING.md"),
  join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".codex", "LEARNING.md"),
]

function ensureParentDir(filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/") === -1 ? filePath.lastIndexOf("\\") : filePath.lastIndexOf("/"))
  if (dir) mkdirSync(dir, { recursive: true })
}

function formatEntry(lesson: string): string {
  const timestamp = new Date().toISOString()
  return `\n## ${timestamp}\n\n${lesson.trim()}\n`
}

function main(): void {
  const args = process.argv.slice(2)
  let lesson = args.join(" ").trim()

  if (!lesson) {
    // Try reading from stdin
    try {
      lesson = readFileSync("/dev/stdin", "utf-8").trim()
    } catch {
      // stdin not available
    }
  }

  if (!lesson) {
    console.error("Usage: bun harness:learn \"lesson text\"")
    process.exit(1)
  }

  const entry = formatEntry(lesson)

  for (const targetPath of LEARNING_PATHS) {
    try {
      ensureParentDir(targetPath)
      appendFileSync(targetPath, entry)
      console.log(`📝 Appended to ${targetPath}`)
    } catch (error) {
      console.warn(`⚠️  Could not write to ${targetPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log("✅ Learning entry recorded.")
}

main()
