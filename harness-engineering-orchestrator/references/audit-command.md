# Audit Command — `bun harness:audit`

## Overview

The audit command produces a comprehensive project health report covering documentation, code quality, security, architecture, and Harness compliance. It reads the current state and filesystem to generate an 8-section report.

## Report Sections

### 1. State Consistency

- Validate `.harness/state.json` parses correctly
- Check phase matches filesystem evidence (e.g., EXECUTING requires CI workflow)
- Verify milestone/task status consistency (no DONE tasks without commit hashes)
- Check for orphaned milestones (in state but not in PRD)

### 2. Documentation Coverage

- PRD exists and contains milestones
- Architecture doc exists and defines dependency direction
- GitBook initialized with SUMMARY.md
- CHANGELOG.md exists and has entries for merged milestones
- README.md exists (isFinal checked in COMPLETE phase)

### 3. Guardian Compliance

- G2: No feature commits on main/master branch
- G3: All source files ≤ 400 lines
- G4/G6: No forbidden patterns in source files
- G5: Dependency direction validated (if dependency-cruiser configured)
- G8: AGENTS.md and CLAUDE.md share the same hash
- G9: LEARNING.md not present in repository root
- G10: Recent commits follow atomic commit format

### 4. Test Health

- Test files exist for critical modules
- `bun test` passes (or equivalent toolchain command)
- Build succeeds
- Typecheck passes

### 5. Dependency Health

- No unused dependencies in manifest
- No known security advisories (if audit command available)
- Lockfile is present and up to date

### 6. Scaffold Completeness

- All expected scaffold files present
- Package.json scripts include all harness commands
- CI workflow present and valid
- Git hooks installed

### 7. Metrics Summary

- Task throughput (tasks completed per session)
- Quality score trend
- Harness health score
- Entropy scan trend (if scans have been run)

### 8. Recommendations

- Prioritized list of findings by severity (block → warn → info)
- Suggested next actions
- Links to relevant docs

## Output

Reports are written to:

```
.harness/reports/audit-{timestamp}.md
.harness/reports/audit-latest.md (symlink/copy)
```

Console output shows a summary table:

```
+==========================+
|   Harness Audit Report   |
+==========================+
| State Consistency    OK  |
| Documentation        !!  |
| Guardian Compliance  OK  |
| Test Health          OK  |
| Dependency Health    !!  |
| Scaffold Complete    OK  |
| Metrics              OK  |
| Overall Score: 85/100    |
+==========================+
```

## Invocation

```bash
# Full audit
bun harness:audit

# Specific section only
bun harness:audit --section guardians

# JSON output for CI integration
bun harness:audit --format json

# Quiet mode (exit code only: 0 = pass, 1 = block-level findings)
bun harness:audit --quiet
```
