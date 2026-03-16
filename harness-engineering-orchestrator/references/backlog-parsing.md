# Backlog Parsing — `parsePrdStageSpecs()` Algorithm

## Overview

The `parsePrdStageSpecs()` function in `runtime/backlog.ts` transforms a PRD document into structured stage specifications with milestones, tasks, and definitions of done. This is the bridge between human-authored PRD prose and the machine-readable execution backlog.

## Input

- PRD content (from `docs/PRD.md` or modular `docs/prd/*.md` files)
- Active product stage context (from `state.roadmap`)

## Heading Format

The parser recognizes a strict heading hierarchy:

```
## Product Stage V1: Stage Name [ACTIVE]
### Milestone M1: Milestone Name
#### T001: Task Name
```

- Stage headings (`##`) include an optional status tag: `[ACTIVE]`, `[DEFERRED]`, `[COMPLETED]`, `[DEPLOY_REVIEW]`
- Milestone headings (`###`) must include an `M{n}` identifier
- Task headings (`####`) must include a `T{nnn}` identifier

## DoD Extraction

Each task's Definition of Done is extracted from a checklist block immediately following the task heading:

```markdown
#### T001: Implement auth flow

**Definition of Done:**
- [ ] Login form renders with email/password fields
- [ ] JWT token stored in httpOnly cookie
- [ ] Unauthorized routes redirect to /login
```

- Lines matching `- [ ] ...` or `- [x] ...` are captured as DoD items
- The `**Definition of Done:**` label is optional — any checklist block after the heading is parsed
- DoD items are stored as `task.dod: string[]`

## UI Task Inference

A task is marked `isUI: true` when any of these conditions hold:

1. Task name contains UI-related keywords: `ui`, `page`, `screen`, `component`, `layout`, `form`, `modal`, `dialog`, `dashboard`, `view`
2. Affected files include extensions: `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`
3. The task appears under a milestone tagged with `[UI]`
4. The PRD section references design specs or wireframes

## Stage Assignment

Tasks are assigned to stages based on their containing `## Product Stage` heading:

1. Parse all stage headings and their line ranges
2. For each milestone heading, find the enclosing stage by line number
3. Set `task.milestoneId` from the milestone heading
4. Set `milestone.productStageId` from the stage heading
5. If no stage heading exists, assign all milestones to a default `V1` stage

## Affected Files Extraction

The parser looks for an affected files annotation in the task body:

```markdown
**Affected Files:** `src/auth/login.tsx`, `src/auth/api.ts`
```

- Comma-separated, backtick-wrapped file paths
- Maximum 5 files per task (excess files are truncated with a warning)
- If no annotation exists, `affectedFiles` defaults to an empty array

## Fallback Behavior

| Scenario | Fallback |
|----------|----------|
| No stage headings found | Create a single default `V1` stage |
| No milestone headings | Create a single `M1` milestone |
| Milestone without tasks | Log warning, create milestone with empty task list |
| Task without DoD | Set `dod: []`, log warning |
| Duplicate task IDs | Append suffix (`T001-2`), log warning |
| Empty PRD content | Return empty stage spec array |

## Output

Returns `StageSpec[]` where each spec contains:

```typescript
interface StageSpec {
  stageId: string          // "V1", "V2", etc.
  stageName: string
  stageStatus: string      // "ACTIVE", "DEFERRED", etc.
  milestones: MilestoneSpec[]
}

interface MilestoneSpec {
  id: string               // "M1", "M2", etc.
  name: string
  tasks: TaskSpec[]
}

interface TaskSpec {
  id: string               // "T001", "T002", etc.
  name: string
  type: "TASK" | "SPIKE"
  isUI: boolean
  dod: string[]
  affectedFiles: string[]
  prdRef: string           // "PRD#F001" or heading reference
}
```

## Sync Behavior

After parsing, `syncBacklog()` merges specs into the existing `state.execution.milestones` array:

1. New tasks are appended with `status: "PENDING"`
2. Existing tasks retain their current status and metadata
3. Removed tasks are marked `SKIPPED` with reason `"Removed from PRD"`
4. Milestone ordering follows the PRD document order
