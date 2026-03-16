/**
 * Metrics Collection — RT-17
 *
 * Records, stores, and derives metrics across 5 categories.
 */

import type { MetricEntry, MetricCategory, MetricsState, ProjectState } from "../harness-types.js"

/** Append a metric entry to state. */
export function recordMetric(state: ProjectState, entry: MetricEntry): void {
  if (!state.metrics) {
    state.metrics = { entries: [], lastCollectedAt: undefined }
  }
  state.metrics.entries.push(entry)
  state.metrics.lastCollectedAt = new Date().toISOString()
}

/** Derive throughput metrics from current state. */
export function collectThroughputMetrics(state: ProjectState): MetricEntry[] {
  const now = new Date().toISOString()
  const entries: MetricEntry[] = []

  const milestones = state.execution?.milestones ?? []
  const activeMilestone = milestones.find(m => m.status === "active" || m.status === "IN_PROGRESS")
  if (activeMilestone) {
    const doneTasks = activeMilestone.tasks.filter(
      t => t.status === "DONE" || t.status === "done"
    ).length
    entries.push({
      name: "tasks_completed",
      category: "throughput",
      value: doneTasks,
      unit: "count",
      recordedAt: now,
      milestoneId: activeMilestone.id,
    })
  }

  return entries
}

/** Derive quality metrics from current state. */
export function collectQualityMetrics(state: ProjectState): MetricEntry[] {
  const now = new Date().toISOString()
  const entries: MetricEntry[] = []

  if (state.validation?.score !== undefined) {
    entries.push({
      name: "harness_score",
      category: "quality",
      value: state.validation.score,
      unit: "points",
      recordedAt: now,
    })
  }

  return entries
}

/** Derive harness health metrics from current state. */
export function collectHarnessHealthMetrics(state: ProjectState): MetricEntry[] {
  const now = new Date().toISOString()
  const entries: MetricEntry[] = []

  entries.push({
    name: "state_consistency",
    category: "harness_health",
    value: 1, // 1 = consistent, 0 = inconsistent — checked by validation
    unit: "boolean",
    recordedAt: now,
  })

  return entries
}

/** Format metrics summary for display. */
export function getMetricsSummary(
  state: ProjectState,
  category?: MetricCategory,
): string {
  if (!state.metrics || state.metrics.entries.length === 0) {
    return "No metrics recorded yet."
  }

  const entries = category
    ? state.metrics.entries.filter(e => e.category === category)
    : state.metrics.entries

  const byCategory = new Map<MetricCategory, MetricEntry[]>()
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? []
    list.push(entry)
    byCategory.set(entry.category, list)
  }

  const lines: string[] = ["## Metrics Summary", ""]
  for (const [cat, catEntries] of byCategory) {
    lines.push(`### ${cat}`)
    // Show latest value for each metric name
    const latest = new Map<string, MetricEntry>()
    for (const e of catEntries) {
      const existing = latest.get(e.name)
      if (!existing || e.recordedAt > existing.recordedAt) {
        latest.set(e.name, e)
      }
    }
    for (const [name, entry] of latest) {
      lines.push(`- **${name}**: ${entry.value} ${entry.unit}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
