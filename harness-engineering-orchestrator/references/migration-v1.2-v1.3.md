# Migration: Schema v1.2 to v1.3

## Purpose

Document the state schema changes introduced between schema v1.2 and v1.3, covering new top-level fields, new workflow event types, and the recommended migration path.

## New Top-Level Fields

### `metrics?: MetricsState`

Tracks quantitative metrics collected during execution. Contains `entries: MetricEntry[]` (each with `name`, `category`, `value`, `unit`, `recordedAt`, and optional `milestoneId`/`taskId`) and `lastCollectedAt?: string`. Categories: `throughput`, `quality`, `human_attention`, `harness_health`, `safety`.

### `observability?: ObservabilityState`

Tracks dev server processes (`devServers: DevServerState[]`), log directory (`logDir`), and browser automation availability (`mcpBrowserAvailable`).

### `toolchain: ToolchainConfig`

Previously inferred at scaffold time only. Now a persisted top-level field with full command configuration, source extensions, forbidden patterns, and ignore patterns. See `ToolchainConfig` in `harness-types.ts`.

## New Workflow Event Types

The `WorkflowEventKind` union in `harness-types.ts` gained four new members:

| Event Kind | Trigger |
|------------|---------|
| `entropy_scan_completed` | Entropy scanner agent finishes a codebase health scan |
| `safety_flag_raised` | A guardian or safety check detects a violation |
| `metrics_collected` | Metrics collection pass records new entries |
| `task_skipped` | A task is moved to `SKIPPED` status with a reason |

These events are appended to `state.history.events[]` by the runtime via `appendWorkflowEvent()`.

## Migration Path

### Automatic (Recommended)

Re-initialize the project state:

```bash
bun .harness/init.ts
```

The `initState()` function in `runtime/state-core.ts` constructs a full default `ProjectState` and then spreads the caller's partial over it. Missing fields receive their defaults:

- `metrics` defaults to `{ entries: [], lastCollectedAt: undefined }`
- `toolchain` defaults to the Bun/TypeScript preset
- `observability` is optional and remains `undefined` until the first dev server is started

After initialization, `refreshDerivedState()` reconciles the state against the filesystem.

### Manual

If re-init is not desirable, call `writeState(readState())`. The `writeState()` function in `runtime/state-core.ts` runs `refreshDerivedState()` which calls `deriveStateFromFilesystem()`, filling in missing derived fields and writing the normalized result.

### Deep Merge Behavior

The `deepMerge()` helper in `state-core.ts` (used by `updateState()`) recursively merges objects but replaces arrays wholesale. New object-shaped fields (`metrics`, `observability`) are filled from defaults when absent. Array fields (`entries`, `events`, `milestones`) are replaced if provided, not partially patched.

## Verification

After migration, confirm the new fields are present:

```bash
bun .harness/resume.ts
bun harness:validate
```

The validation pass will report any structural issues. The resume command will display metrics and observability status if populated.
