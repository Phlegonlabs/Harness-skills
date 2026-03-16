# Version History

## Purpose

Describe the product stage lifecycle, document version tracking, and snapshot mechanism that governs how a Harness project evolves across V1, V2, V3, and beyond.

## Product Stage Lifecycle

Each product stage follows a linear status progression:

```
DEFERRED -> ACTIVE -> DEPLOY_REVIEW -> COMPLETED
```

| Status | Meaning |
|--------|---------|
| `DEFERRED` | Defined in the PRD but not yet started |
| `ACTIVE` | Currently being executed (milestones and tasks are in flight) |
| `DEPLOY_REVIEW` | All milestones for this stage are merged; awaiting real-world review |
| `COMPLETED` | Deploy review passed; the next stage has been promoted |

Only one stage is `ACTIVE` at a time. The runtime enforces this via `getCurrentProductStage()` in `runtime/stages.ts`, which resolves the active stage from `state.roadmap.currentStageId`.

## Stage Promotion

Promotion is performed with `bun .harness/stage.ts --promote V2`. The command:

1. Verifies the current stage is in `DEPLOY_REVIEW`
2. Resolves the next deferred stage via `getNextDeferredProductStage()`
3. Validates that PRD and Architecture document versions match the target stage using `expectedVersionPattern()` (e.g., stage `V2` requires a version matching `^v2(\b|\.)`)
4. Snapshots both documents into versioned paths
5. Marks the current stage `COMPLETED` and the target stage `ACTIVE`
6. Re-syncs execution milestones and public docs

Use `bun .harness/stage.ts --status` to inspect the current roadmap without making changes.

## Document Version Snapshots

When a stage is promoted, the current PRD and Architecture documents are frozen as point-in-time snapshots:

| Document | Snapshot Path |
|----------|---------------|
| PRD | `docs/prd/versions/prd-v1.md` |
| Architecture | `docs/architecture/versions/architecture-v1.md` |

The slug is derived from the stage ID (`v1`, `v2`, etc.). Snapshots are written by `writeSnapshot()` in `harness-stage.ts` and are never overwritten.

## Version Parsing

Document versions are extracted from the first line matching the pattern:

```
> **Version**: v1.2
```

The parser lives in `shared.ts` (`parseDocumentVersion()`). The version string is stored in `state.docs.prd.version` and `state.docs.architecture.version`.

## Key Functions

| Function | File | Role |
|----------|------|------|
| `getCurrentProductStage()` | `runtime/stages.ts` | Resolve the active stage |
| `getNextDeferredProductStage()` | `runtime/stages.ts` | Find the next promotable stage |
| `expectedVersionPattern()` | `harness-stage.ts` | Build regex for stage-version validation |
| `markStageDeployReview()` | `runtime/stages.ts` | Transition a stage to `DEPLOY_REVIEW` |
| `stageIsReadyForDeployReview()` | `runtime/stages.ts` | Check that all stage milestones are merged |

## Inspecting Stage Status

```bash
bun .harness/stage.ts --status
```

Prints the runtime phase, current stage (ID, name, status), PRD and Architecture versions, and the full roadmap with per-stage version labels.
