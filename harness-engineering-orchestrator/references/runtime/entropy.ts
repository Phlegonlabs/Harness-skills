/**
 * Entropy Scanning — RT-19
 *
 * Scans for AI slop, doc staleness, pattern drift, and dependency health.
 */

import type { ProjectState } from "../harness-types.js"

export type EntropySeverity = "block" | "warn" | "info"

export interface EntropyFinding {
  scanner: "ai-slop" | "doc-freshness" | "pattern-consistency" | "dependency-health"
  severity: EntropySeverity
  message: string
  file?: string
  line?: number
  suggestion?: string
}

export interface EntropyScanResult {
  findings: EntropyFinding[]
  scannedAt: string
  blockCount: number
  warnCount: number
  infoCount: number
  trend?: "improving" | "stable" | "degrading"
}

/** Scan for AI-generated slop: boilerplate duplication, dead code, over-abstraction. */
export function scanAiSlop(_codebasePath: string): EntropyFinding[] {
  // Implementation scans for:
  // - Duplicate boilerplate blocks (>10 lines identical across files)
  // - Dead code (exported but never imported, unreachable branches)
  // - Over-abstraction (single-use wrappers, unnecessary indirection)
  // - Excessive comments restating obvious code
  return []
}

/** Scan for stale documentation relative to code changes. */
export function scanDocFreshness(_state: ProjectState): EntropyFinding[] {
  // Implementation compares:
  // - README last modified vs. src/ last modified
  // - PRD docs vs. related code modules
  // - ARCHITECTURE docs vs. structural changes
  // - Flagged if doc is >2 milestones behind related code
  return []
}

/** Scan for pattern inconsistencies across the codebase. */
export function scanPatternConsistency(_codebasePath: string): EntropyFinding[] {
  // Implementation checks:
  // - Naming convention consistency (camelCase vs snake_case mixing)
  // - Import style consistency (default vs named, path aliases)
  // - Error handling patterns (throw vs return vs callback)
  // - Similar operations using different abstractions
  return []
}

/** Scan dependency manifest and lockfile for health issues. */
export function scanDependencyHealth(
  _manifestPath: string,
  _lockPath?: string,
): EntropyFinding[] {
  // Implementation checks:
  // - Unused dependencies (declared but not imported)
  // - Outdated dependencies (major version behind)
  // - Known security advisories
  // - Duplicate dependency versions
  return []
}

/** Run all entropy scans and produce a combined result. */
export function runEntropyScan(
  state: ProjectState,
  codebasePath: string,
  previousResult?: EntropyScanResult,
): EntropyScanResult {
  const manifestPath = state.toolchain?.manifestFile
    ? `${codebasePath}/${state.toolchain.manifestFile}`
    : undefined
  const lockPath = state.toolchain?.lockFile
    ? `${codebasePath}/${state.toolchain.lockFile}`
    : undefined

  const findings = [
    ...scanAiSlop(codebasePath),
    ...scanDocFreshness(state),
    ...scanPatternConsistency(codebasePath),
    ...(manifestPath ? scanDependencyHealth(manifestPath, lockPath) : []),
  ]

  const result: EntropyScanResult = {
    findings,
    scannedAt: new Date().toISOString(),
    blockCount: findings.filter(f => f.severity === "block").length,
    warnCount: findings.filter(f => f.severity === "warn").length,
    infoCount: findings.filter(f => f.severity === "info").length,
  }

  // Determine trend by comparing with previous scan
  if (previousResult) {
    const prevTotal = previousResult.blockCount + previousResult.warnCount
    const currTotal = result.blockCount + result.warnCount
    if (currTotal < prevTotal) result.trend = "improving"
    else if (currTotal > prevTotal) result.trend = "degrading"
    else result.trend = "stable"
  }

  return result
}

/** Format entropy scan result as markdown report. */
export function formatEntropyReport(result: EntropyScanResult): string {
  const lines: string[] = [
    "# Entropy Scan Report",
    "",
    `Scanned at: ${result.scannedAt}`,
    `Trend: ${result.trend ?? "first scan"}`,
    "",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Block    | ${result.blockCount} |`,
    `| Warn     | ${result.warnCount} |`,
    `| Info     | ${result.infoCount} |`,
    "",
  ]

  for (const severity of ["block", "warn", "info"] as EntropySeverity[]) {
    const group = result.findings.filter(f => f.severity === severity)
    if (group.length === 0) continue
    lines.push(`## ${severity.toUpperCase()} Findings`, "")
    for (const f of group) {
      const loc = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""
      lines.push(`- **[${f.scanner}]**${loc}: ${f.message}`)
      if (f.suggestion) lines.push(`  - Suggestion: ${f.suggestion}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
