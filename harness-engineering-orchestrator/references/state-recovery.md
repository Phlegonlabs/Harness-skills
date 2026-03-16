# State Recovery Guide

## Overview

The Harness state file (`.harness/state.json`) is the single source of truth for project execution state. This guide covers failure modes and recovery procedures.

## Failure Modes

### Deleted State File

**Symptom:** `State not initialized. Run harness-init first.`

**Cause:** State file was accidentally deleted or not present after cloning.

### Corrupt JSON

**Symptom:** `State file is unreadable — The JSON is invalid or was interrupted during a previous write.`

**Cause:** Process crash during write, disk full, or manual edit introduced invalid JSON.

### State Drift

**Symptom:** State file exists but contains stale or inconsistent data (e.g., task marked DONE but no commit hash, milestone IN_PROGRESS but all tasks DONE).

**Cause:** Interrupted execution, manual state edits, or skipped validation steps.

## Recovery Procedures

### Quick Recovery (Automatic Backup)

The runtime maintains `.harness/state.json.backup` — the last successfully written state. When `readState()` or `loadState()` encounters a corrupt primary file:

1. The backup file is automatically read
2. If valid, it replaces the corrupt primary file
3. A warning is emitted: `Primary state file is corrupt — recovering from backup.`
4. Execution continues normally

No manual intervention required.

### Full Recovery (Re-derive from Filesystem)

If both primary and backup files are corrupt:

1. Check git history for the last valid state:
   ```bash
   git log --oneline -- .harness/state.json
   git show <commit>:.harness/state.json > .harness/state.json
   ```

2. If state was never committed (`.harness/` is gitignored):
   ```bash
   bun .harness/init.ts
   ```
   This re-initializes state from the filesystem, preserving docs and scaffold state.

3. Re-derive execution progress:
   ```bash
   bun harness:validate
   ```
   The validation pass will detect mismatches between state and filesystem.

### Post-Clone Recovery

After cloning a Harness project, local files must be restored:

```bash
bun scripts/harness-local/restore.ts
bun harness:hooks:install
```

This restores:
- `.harness/` runtime files and state
- `AGENTS.md` and `CLAUDE.md`
- `agents/` spec files
- `.claude/settings.local.json`
- `.codex/config.toml` and `.codex/rules/guardian.rules`
- `.git/hooks/` shims

## Prevention

1. **Backup is maintained automatically** — every successful `writeState()` preserves the previous version as `.backup`
2. **Atomic writes** — state is written to a temp file first, then atomically renamed
3. **Retry logic** — `readProjectStateFromDisk()` retries up to 3 times on transient read failures
4. **Validation** — `bun harness:validate` detects state inconsistencies before they compound

## State File Location

| Path | Purpose |
|------|---------|
| `.harness/state.json` | Primary state file |
| `.harness/state.json.backup` | Last successful write |
| `.harness/state.json.*.tmp` | Transient write temp (cleaned up) |
