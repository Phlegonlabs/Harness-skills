/**
 * harness:entropy-scan — Run entropy scan and produce report.
 *
 * Usage:
 *   bun harness:entropy-scan
 */

import { loadState, saveState } from "./runtime/state-io.js"
import { runEntropyScan, formatEntropyReport } from "./runtime/entropy.js"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

async function main() {
  const state = await loadState()
  const codebasePath = process.cwd()
  const reportsDir = join(codebasePath, ".harness", "reports")

  // Load previous scan if it exists
  const latestPath = join(reportsDir, "entropy-latest.md")
  const previousPath = join(reportsDir, "entropy-previous.md")

  let previousResult: Parameters<typeof runEntropyScan>[2]
  if (existsSync(latestPath)) {
    // Rotate: current -> previous
    const current = readFileSync(latestPath, "utf-8")
    mkdirSync(dirname(previousPath), { recursive: true })
    writeFileSync(previousPath, current)
  }

  const result = runEntropyScan(state, codebasePath, previousResult)
  const report = formatEntropyReport(result)

  mkdirSync(reportsDir, { recursive: true })
  writeFileSync(latestPath, report)

  console.log(report)

  if (result.blockCount > 0) {
    console.log(`\n${result.blockCount} block-level findings must be resolved before merge.`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error("harness:entropy-scan failed:", err)
  process.exit(1)
})
