# Metrics Framework

## Purpose

Define the 5-category metrics system used to measure project health, delivery velocity, and harness effectiveness.

## Categories

### 1. Throughput

Measures delivery velocity.

| Metric | Description | Unit |
|--------|-------------|------|
| `tasks_completed` | Tasks completed in the current milestone | count |
| `milestone_cycle_time` | Time from milestone IN_PROGRESS to MERGED | hours |
| `tasks_per_milestone` | Average tasks completed per milestone | count |

**Collection trigger**: After each task completion and milestone merge.

### 2. Quality

Measures code and product quality.

| Metric | Description | Unit |
|--------|-------------|------|
| `harness_score` | Current Harness validation score | points (0-100) |
| `test_pass_rate` | Percentage of tests passing | percent |
| `lint_clean` | Whether lint passes with zero warnings | boolean |
| `typecheck_clean` | Whether typecheck passes with zero errors | boolean |
| `build_time_ms` | Build duration | milliseconds |

**Collection trigger**: After each task validation run.

### 3. Human Attention

Measures how much human intervention the harness requires.

| Metric | Description | Unit |
|--------|-------------|------|
| `questions_per_milestone` | Questions asked to the user during a milestone | count |
| `rejections_per_milestone` | User rejections or correction requests per milestone | count |
| `blocked_tasks` | Tasks marked BLOCKED requiring manual resolution | count |

**Collection trigger**: At milestone boundary (REVIEW status).

### 4. Harness Health

Measures the internal consistency and freshness of harness state.

| Metric | Description | Unit |
|--------|-------------|------|
| `state_consistency` | Whether state.json passes structural validation | boolean |
| `progress_doc_freshness` | Time since last PROGRESS.md update | hours |
| `entropy_scan_score` | Block + warn count from latest entropy scan | count |
| `agents_claude_in_sync` | AGENTS.md and CLAUDE.md are identical | boolean |

**Collection trigger**: At each state write and milestone boundary.

### 5. Safety

Measures security and guardian compliance.

| Metric | Description | Unit |
|--------|-------------|------|
| `guardian_violations_caught` | Guardian violations detected and blocked | count |
| `supply_chain_flags` | Dependency changes flagged for review | count |
| `prompt_injection_attempts` | Suspected prompt injection content detected | count |
| `secret_pattern_hits` | Secret patterns caught before commit | count |

**Collection trigger**: After each guardian scan and commit hook run.

## Storage Format

Metrics are stored in `state.metrics.entries[]` as `MetricEntry` objects:

```typescript
interface MetricEntry {
  name: string
  category: MetricCategory
  value: number
  unit: string
  recordedAt: string       // ISO timestamp
  milestoneId?: string
  taskId?: string
}
```

## Display Format

The `harness:metrics` command outputs a markdown summary:

```bash
bun harness:metrics                      # All categories
bun harness:metrics --category quality   # Single category
```

Output shows the latest value for each metric name, grouped by category.

## Retention

- Metrics entries accumulate in state across the project lifecycle
- No automatic pruning — the full history enables trend analysis
- Entropy scan comparisons use the two most recent scan results

## Runtime Implementation

The metrics collection logic lives in `runtime/metrics.ts`. It exports functions for:
- `collectMetrics(state, category?)` — collects metrics for one or all categories
- `recordMetric(state, entry)` — appends a single metric entry to `state.metrics.entries[]`
- `getLatestMetrics(state)` — returns the most recent value for each metric name

See also: `harness-metrics.ts` for the CLI command entry point.
