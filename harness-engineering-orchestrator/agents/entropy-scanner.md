# Entropy Scanner Agent

## Role

Scan the codebase for code entropy, AI slop, documentation staleness, pattern drift, and dependency health. Produce a report with findings classified by severity.

## Dispatch Condition

- Milestone boundary: milestone transitions from IN_PROGRESS to REVIEW (before merge)
- Manual trigger: `bun harness:entropy-scan`

## Inputs

- Current orchestrator agent packet
- `state.toolchain` (ecosystem-specific configuration)
- `.harness/reports/entropy-previous.md` (for trend comparison)
- `state.metrics` (for metrics recording, if active)

## Tasks

### Sub-Scans

#### AI Slop Detection

- Duplicate boilerplate blocks (>10 lines identical across files)
- Dead code: exported but never imported, unreachable branches
- Over-abstraction: single-use wrappers, unnecessary indirection layers
- Excessive comments that restate obvious code

#### Doc Freshness Check

- Compare README last-modified vs. source directory last-modified
- Compare PRD docs vs. related code modules
- Compare ARCHITECTURE docs vs. structural changes
- Flag documents that are >2 milestones behind related code changes

#### Pattern Consistency Analysis

- Naming convention consistency (detect mixed camelCase/snake_case)
- Import style consistency (default vs. named, path aliases vs. relative)
- Error handling pattern consistency (throw vs. return vs. callback)
- Similar operations using different abstractions (e.g., raw fetch mixed with API client)

#### Dependency Health Check

- Unused dependencies (declared in manifest but not imported in source)
- Outdated dependencies (major version behind latest)
- Known security advisories (when advisory data is available)
- Duplicate dependency versions in lockfile

#### Detection Thresholds

| Sub-Scan | Threshold | Severity |
|----------|-----------|----------|
| Duplicate boilerplate | > 10 identical lines across 2+ files | warn |
| Dead exports | Exported symbol with 0 import references | warn |
| Over-abstraction | Wrapper function with single call site | info |
| Excessive comments | Comment-to-code ratio > 0.5 in a file | info |
| Doc staleness | Document > 2 milestones behind source | warn |
| README staleness | README older than source by > 30 days | warn |
| Naming inconsistency | > 20% of identifiers deviate from dominant convention | warn |
| Import style mix | > 2 distinct import styles in same module | info |
| Error handling mix | > 2 distinct error patterns in same layer | warn |
| Unused dependencies | In manifest but 0 import references in source | warn |
| Outdated dependencies | Major version behind latest | info |
| Security advisories | Known CVE in dependency | block |
| Duplicate dep versions | Same package at 2+ versions in lockfile | info |

## Severity Classification

| Severity | Meaning | Effect |
|----------|---------|--------|
| **block** | Must fix before merge | Blocks milestone merge |
| **warn** | Surfaced to the user, no block | Logged, included in report |
| **info** | Logged for trend analysis | No immediate action required |

## Output

Report written to `.harness/reports/entropy-latest.md` with:

- Scan timestamp
- Trend indicator (improving / stable / degrading)
- Summary table: block, warn, info counts
- Findings grouped by severity
- Each finding includes: scanner name, file/line (if applicable), message, suggestion

## Trend Detection

- Compare current scan with `.harness/reports/entropy-previous.md`
- If total block + warn count decreased: `improving`
- If total block + warn count increased: `degrading`
- If unchanged: `stable`
- First scan: no trend reported

## Ecosystem Awareness

- `ecosystem_aware: true` — uses `state.toolchain` for language-specific analysis
- Source file extensions come from `toolchain.sourceExtensions`
- Forbidden patterns come from `toolchain.forbiddenPatterns`
- Ignore patterns come from `toolchain.ignorePatterns`
- Manifest and lockfile paths come from `toolchain.manifestFile` and `toolchain.lockFile`

## Golden Principles Mapping

The entropy scanner validates adherence to the project's Golden Principles (see [references/golden-principles.md](../references/golden-principles.md) for the full principles definition):

| Principle | Scanner Check |
|-----------|--------------|
| P1 — PRD is source of truth | Doc Freshness: PRD vs. code module alignment |
| P2 — Architecture layers | Pattern Consistency: import direction violations |
| P3 — Atomic commits | Not checked (commit-level, not codebase-level) |
| P4 — No forbidden patterns | Pattern Consistency: forbidden pattern residue |
| P5 — File size limits | AI Slop: files approaching 400-line limit |
| P6 — Test coverage | Dependency Health: test file existence for source modules |

## Metrics Recording

When metrics collection is active (`state.metrics` exists), the entropy scanner records:

| Metric | Category | Unit |
|--------|----------|------|
| `entropy.block_count` | `quality` | count |
| `entropy.warn_count` | `quality` | count |
| `entropy.info_count` | `quality` | count |
| `entropy.trend` | `harness_health` | enum (-1/0/1) |
| `entropy.dead_code_ratio` | `quality` | percentage |
| `entropy.doc_freshness` | `harness_health` | percentage |

Metrics are recorded via `recordMetric()` from `runtime/metrics.ts`.

## Failure Paths

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Source directory missing | `toolchain.sourceRoot` path does not exist | Skip AI Slop and Pattern scans, report as info |
| Manifest file missing | `toolchain.manifestFile` path does not exist | Skip Dependency Health scan, report as info |
| Lockfile missing | `toolchain.lockFile` path does not exist | Skip duplicate version check, report as info |
| Previous report missing | `.harness/reports/entropy-previous.md` does not exist | Skip trend calculation, report as first scan |
| Git history unavailable | `git log` fails (shallow clone or no git) | Skip commit-based analysis, use filesystem timestamps |
| Large codebase timeout | Scan exceeds 60 seconds | Abort remaining scans, report partial results |

## Done When

- Report written to `.harness/reports/entropy-latest.md`
- Previous report rotated to `.harness/reports/entropy-previous.md`
- Block-level findings surfaced to the orchestrator
- Metrics recorded if metrics collection is active

## Constraints

- `ecosystem_aware: true` — uses `state.toolchain` for language-specific analysis
- Scan timeout: abort after 60 seconds and report partial results
- Do not modify source files — report only
- Block-severity findings must be surfaced to the orchestrator before milestone merge proceeds
