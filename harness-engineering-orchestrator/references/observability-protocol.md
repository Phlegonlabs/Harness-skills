# Observability Protocol

## Purpose

Define how the harness runtime manages dev server lifecycle, structured logging, browser validation, and performance measurement during execution.

## Dev Server Lifecycle

### Boot

1. Read `state.toolchain.commands.build` and run it to produce the dev artifact
2. Allocate a port from the 3000-3999 range (scan for first available)
3. Start the dev server process and record `{ pid, port, milestoneId, startedAt }` in `state.observability.devServers[]`
4. Run a health check loop (see below)

### Health Check

- Method: HTTP GET to `http://localhost:{port}/`
- Timeout: 5 seconds per attempt
- Retry: up to 3 attempts with 2-second backoff
- On success: set `healthy: true` in the server entry
- On failure after retries: log a structured error, mark `healthy: false`, surface to the execution engine

### Port Allocation

- Range: 3000-3999
- Strategy: scan sequentially from 3000, skip ports that respond to a TCP connect
- Record the allocated port in the dev server state entry
- On worktree switch, allocate a different port to avoid conflicts

### Cleanup

- On milestone merge or worktree removal, send SIGTERM to all dev servers for that milestone
- Remove the server entries from `state.observability.devServers[]`
- On process exit, clean up any orphaned server processes

## Structured Log Format

All harness runtime logs use a consistent JSON-line format:

```json
{
  "ts": "2026-03-16T12:00:00.000Z",
  "level": "info",
  "source": "execution-engine",
  "milestoneId": "M1",
  "taskId": "T001",
  "message": "Task validation passed",
  "data": {}
}
```

### Log Query Interface

Agents can query logs by:
- `source` — filter by agent or runtime module
- `level` — filter by severity (debug, info, warn, error)
- `milestoneId` / `taskId` — filter by execution context
- Time range — filter by timestamp window

Logs are stored in `.harness/logs/` with one file per session.

## MCP Browser Validation Protocol

Browser-based visual validation is **capability-gated**: the runtime checks whether MCP browser tools are available before attempting to use them.

### Capability Check

1. Query available MCP tools for browser-related capabilities
2. If unavailable, skip browser validation gracefully and log a warning
3. Never block task completion on missing browser capabilities

### When Available

- Navigate to the running dev server URL
- Capture a screenshot for visual comparison
- Run basic accessibility checks (contrast, aria attributes)
- Report findings in the design review output

### Graceful Degradation

When MCP browser tools are not available:
- Design review relies on static code analysis only
- Log: `"MCP browser tools unavailable — skipping visual validation"`
- No error, no block

## Performance Measurement

### Build Time

- Record wall-clock time for `toolchain.commands.build`
- Store as a metric entry: `{ name: "build_time_ms", category: "quality", value: <ms> }`

### Startup Time

- Record time from dev server process spawn to first successful health check
- Store as a metric entry: `{ name: "startup_time_ms", category: "quality", value: <ms> }`

### Response Latency

- After health check succeeds, measure response time of the health check request
- Store as a metric entry: `{ name: "response_latency_ms", category: "quality", value: <ms> }`

## Integration Points

### Execution Engine

- The execution engine calls the observability module during preflight to boot the dev server
- During task validation, it queries the health check status
- After task completion, it records performance metrics

### Design Reviewer

- When MCP browser tools are available, the design reviewer uses the running dev server for visual validation
- The observability module provides the server URL and health status
