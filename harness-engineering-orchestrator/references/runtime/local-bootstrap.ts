import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { dirname, join } from "path"

export const LOCAL_BOOTSTRAP_MANIFEST_PATH = "scripts/harness-local/manifest.json"

type LocalBootstrapEntry = {
  content: string
  path: string
}

type LocalBootstrapManifest = {
  files: LocalBootstrapEntry[]
  version: 1
}

const LOCAL_BOOTSTRAP_TARGETS = [
  ".harness",
  ".claude",
  ".codex",
  ".env.local",
  "AGENTS.md",
  "CLAUDE.md",
  "SKILLS.md",
  "agents",
  "docs/PROGRESS.md",
  "docs/ai",
  "docs/progress",
  "skills",
] as const

function normalizeText(content: string): string {
  return content.replace(/\r\n/g, "\n")
}

function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath)
  if (parent && parent !== ".") mkdirSync(parent, { recursive: true })
}

function walkTarget(targetPath: string): string[] {
  if (!existsSync(targetPath)) return []

  const normalized = targetPath.replace(/\\/g, "/")
  if (!statSync(targetPath).isDirectory()) return [normalized]

  const results: string[] = []
  const stack = [normalized]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = join(current, entry.name).replace(/\\/g, "/")
      if (entry.isDirectory()) stack.push(nextPath)
      else if (entry.isFile()) results.push(nextPath)
    }
  }

  return results.sort()
}

function listBootstrapFiles(): string[] {
  return Array.from(
    new Set(
      LOCAL_BOOTSTRAP_TARGETS.flatMap(target => walkTarget(target))
        .filter(path => path !== LOCAL_BOOTSTRAP_MANIFEST_PATH),
    ),
  ).sort()
}

export function buildLocalBootstrapManifest(): LocalBootstrapManifest {
  return {
    version: 1,
    files: listBootstrapFiles().map(path => ({
      path,
      content: normalizeText(readFileSync(path, "utf-8")),
    })),
  }
}

export function syncLocalBootstrapManifest(): {
  changed: boolean
  fileCount: number
  path: string
} {
  const manifest = buildLocalBootstrapManifest()
  const nextText = `${JSON.stringify(manifest, null, 2)}\n`

  ensureParentDir(LOCAL_BOOTSTRAP_MANIFEST_PATH)

  if (
    existsSync(LOCAL_BOOTSTRAP_MANIFEST_PATH) &&
    normalizeText(readFileSync(LOCAL_BOOTSTRAP_MANIFEST_PATH, "utf-8")) === nextText
  ) {
    return {
      changed: false,
      fileCount: manifest.files.length,
      path: LOCAL_BOOTSTRAP_MANIFEST_PATH,
    }
  }

  writeFileSync(LOCAL_BOOTSTRAP_MANIFEST_PATH, nextText)
  return {
    changed: true,
    fileCount: manifest.files.length,
    path: LOCAL_BOOTSTRAP_MANIFEST_PATH,
  }
}
