/**
 * harness:metrics — Collect and display metrics summary.
 *
 * Usage:
 *   bun harness:metrics                    # All categories
 *   bun harness:metrics --category quality # Single category
 */

import { loadState, saveState } from "./runtime/state-io.js"
import {
  recordMetric,
  collectThroughputMetrics,
  collectQualityMetrics,
  collectHarnessHealthMetrics,
  getMetricsSummary,
} from "./runtime/metrics.js"
import type { MetricCategory } from "./harness-types.js"

const VALID_CATEGORIES: MetricCategory[] = [
  "throughput", "quality", "human_attention", "harness_health", "safety",
]

async function main() {
  const args = process.argv.slice(2)
  let category: MetricCategory | undefined

  const catIdx = args.indexOf("--category")
  if (catIdx !== -1 && args[catIdx + 1]) {
    const raw = args[catIdx + 1] as MetricCategory
    if (!VALID_CATEGORIES.includes(raw)) {
      console.error(`Invalid category: ${raw}. Valid: ${VALID_CATEGORIES.join(", ")}`)
      process.exit(1)
    }
    category = raw
  }

  const state = await loadState()

  // Collect fresh metrics
  const entries = [
    ...collectThroughputMetrics(state),
    ...collectQualityMetrics(state),
    ...collectHarnessHealthMetrics(state),
  ]

  for (const entry of entries) {
    recordMetric(state, entry)
  }

  await saveState(state)

  console.log(getMetricsSummary(state, category))
}

main().catch(err => {
  console.error("harness:metrics failed:", err)
  process.exit(1)
})
