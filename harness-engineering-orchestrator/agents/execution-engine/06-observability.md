## 06. Observability

### Purpose

Manage dev server lifecycle, health checks, structured logging, performance measurement, and MCP browser integration during task execution.

### Dev Server Boot

1. Before running UI tasks, boot the dev server for the current worktree
2. Use `state.toolchain.commands.build` to produce artifacts, then start the dev process
3. Allocate a port from the 3000-3999 range — scan sequentially, skip occupied ports
4. Record `{ pid, port, milestoneId, startedAt, healthy }` in `state.observability.devServers[]`

### Health Check Protocol

After starting the dev server:

```text
1. Wait 2 seconds for initial startup
2. HTTP GET http://localhost:{port}/
3. Timeout: 5 seconds
4. On failure: retry up to 3 times with 2-second backoff
5. On success: set healthy = true
6. On final failure: log structured error, mark healthy = false
```

### Structured Log Query

Agents can query `.harness/logs/` for debugging:

- Filter by `source` (agent name or runtime module)
- Filter by `level` (debug, info, warn, error)
- Filter by `milestoneId` or `taskId`
- Time range filtering

Use structured log queries when debugging test failures or build issues before escalating to the user.

### Performance Measurement

Record timing metrics during task execution:

| Metric | When | How |
|--------|------|-----|
| `build_time_ms` | After build command | Wall-clock time of `toolchain.commands.build` |
| `startup_time_ms` | After health check | Time from process spawn to first healthy response |
| `response_latency_ms` | During health check | Response time of the health check HTTP request |

Store metrics via `recordMetric()` from `runtime/metrics.ts`.

### MCP Browser Integration

Browser-based validation is **capability-gated**:

1. Check if MCP browser tools are available in the current session
2. If available: navigate to `http://localhost:{port}`, capture screenshots, run visual checks
3. If unavailable: skip gracefully, log a warning, rely on static analysis only
4. Never block task completion on missing browser capabilities

### Port Allocation Strategy

- Range: 3000-3999
- Conflict avoidance: TCP connect probe before allocation
- Each worktree gets a unique port to support parallel development
- On milestone cleanup: release the port by terminating the associated dev server

### Cleanup

On milestone merge or worktree removal:
- SIGTERM all dev servers associated with that milestone
- Remove entries from `state.observability.devServers[]`
- Release allocated ports
