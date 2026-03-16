# Level Upgrade Backfill

When a project upgrades its harness level mid-execution, previously completed milestones may not meet the new level's requirements. This document defines the 6-step backfill sequence.

## Trigger

`state.projectInfo.harnessLevel.upgradedFrom` is set and `upgradedAt` falls within the current stage's execution window.

## 6-Step Backfill Sequence

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Inventory** | Scan completed milestones — identify milestones completed at the previous level |
| 2 | **Gap report** | Run `bun harness:validate --milestone M[N]` at the new level — collect failures that would not have occurred at the old level |
| 3 | **Classify** | Categorize each gap: `backfill-required` (critical gate failure), `backfill-optional` (advisory), `exempt` (level-appropriate at time of completion) |
| 4 | **Selective re-gate** | Re-run critical gate checks only — do not re-execute tasks; only re-validate artifacts |
| 5 | **Remediation tasks** | Generate remediation tasks for `backfill-required` gaps — append to current milestone's task list with `prdRef: "BACKFILL"` |
| 6 | **Audit trail** | Record `level_upgrade_backfill` event in workflow history — include gap count, remediation task count, exemption count |

## Per-Upgrade-Path Items

| Upgrade Path | New Requirements |
|---|---|
| Lite → Standard | Modular PRD sections, ADR directory, full guardian set (G5 active), task gate enforcement (blocking, not warning) |
| Lite → Full | All Standard items plus: GitBook documentation, monorepo structure, full 19-item critical checklist, Harness Score ≥ 80 |
| Standard → Full | GitBook documentation, monorepo structure, `gitbookGuidePresent` required per milestone, `compactCompleted` enforced |

## Exemption Rules

- Milestones in `MERGED` or `COMPLETE` status are exempt from structural re-scaffolding
- Quality gate re-validation (typecheck, lint, test, build) always runs regardless of exemption
- Documentation gaps generate remediation tasks rather than blocking

See also: [gates-and-guardians/01-guardians.md](./gates-and-guardians/01-guardians.md)
