import type {
  Milestone,
  Phase,
  ProjectState,
  Task,
  WorkflowEvent,
  WorkflowEventKind,
  WorkflowEventVisibility,
} from "../types"

const WORKFLOW_EVENT_LIMIT = 250

type WorkflowEventInput = Omit<WorkflowEvent, "at"> & {
  at?: string
}

function eventKey(event: WorkflowEvent): string {
  return [
    event.kind,
    event.at,
    event.phase,
    event.stageId ?? "",
    event.milestoneId ?? "",
    event.taskId ?? "",
  ].join("|")
}

function shortCommit(commitHash?: string): string | undefined {
  if (!commitHash) return undefined
  return commitHash.slice(0, 7)
}

export function ensureWorkflowHistory(state: ProjectState): ProjectState {
  const next = state as ProjectState & {
    history?: {
      events?: WorkflowEvent[]
    }
  }

  if (!next.history || !Array.isArray(next.history.events)) {
    next.history = { events: [] }
    return next as ProjectState
  }

  if (next.history.events.length > WORKFLOW_EVENT_LIMIT) {
    next.history.events = next.history.events.slice(-WORKFLOW_EVENT_LIMIT)
  }

  return next as ProjectState
}

export function appendWorkflowEvent(state: ProjectState, event: WorkflowEventInput): ProjectState {
  const next = ensureWorkflowHistory(state)
  next.history.events.push({
    ...event,
    at: event.at ?? new Date().toISOString(),
  })

  if (next.history.events.length > WORKFLOW_EVENT_LIMIT) {
    next.history.events = next.history.events.slice(-WORKFLOW_EVENT_LIMIT)
  }

  return next
}

export function appendWorkflowEvents(state: ProjectState, events: WorkflowEventInput[]): ProjectState {
  let next = ensureWorkflowHistory(state)
  for (const event of events) {
    next = appendWorkflowEvent(next, event)
  }
  return next
}

function syntheticTaskEvent(
  phase: Phase,
  visibility: WorkflowEventVisibility,
  kind: WorkflowEventKind,
  at: string,
  milestone: Milestone,
  task: Task,
  summary: string,
): WorkflowEvent {
  return {
    at,
    kind,
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    taskId: task.id,
    summary,
    visibility,
  }
}

function synthesizeTaskLifecycleEvents(state: ProjectState): WorkflowEvent[] {
  return state.execution.milestones.flatMap(milestone =>
    milestone.tasks.flatMap(task => {
      const events: WorkflowEvent[] = []

      if (task.startedAt) {
        events.push(
          syntheticTaskEvent(
            state.phase,
            "internal",
            "task_started",
            task.startedAt,
            milestone,
            task,
            `Task ${task.id} entered IN_PROGRESS in ${milestone.id} — ${task.name}`,
          ),
        )
      }

      if (task.blockedAt) {
        events.push(
          syntheticTaskEvent(
            state.phase,
            "internal",
            "task_blocked",
            task.blockedAt,
            milestone,
            task,
            `Task ${task.id} became BLOCKED — ${task.blockedReason ?? "reason not recorded"}`,
          ),
        )
      }

      if (task.completedAt) {
        const commitLabel = shortCommit(task.commitHash)
        events.push(
          syntheticTaskEvent(
            state.phase,
            "internal",
            "task_completed",
            task.completedAt,
            milestone,
            task,
            `Task ${task.id} completed${commitLabel ? ` (${commitLabel})` : ""}`,
          ),
        )
      }

      return events
    }),
  )
}

export function collectWorkflowEvents(state: ProjectState): WorkflowEvent[] {
  const next = ensureWorkflowHistory(state)
  const explicitEvents = [...next.history.events]
  const merged = [...explicitEvents]
  const seen = new Set(explicitEvents.map(eventKey))

  for (const event of synthesizeTaskLifecycleEvents(next)) {
    const key = eventKey(event)
    if (seen.has(key)) continue
    merged.push(event)
    seen.add(key)
  }

  return merged.sort((left, right) => right.at.localeCompare(left.at))
}

export function findLatestWorkflowEvent(
  state: ProjectState,
  predicate?: (event: WorkflowEvent) => boolean,
): WorkflowEvent | undefined {
  return collectWorkflowEvents(state).find(event => (predicate ? predicate(event) : true))
}

export function createPhaseAdvancedEvent(
  previousPhase: Phase,
  nextPhase: Phase,
  options: {
    stageId?: string
  } = {},
): WorkflowEventInput {
  return {
    kind: "phase_advanced",
    phase: nextPhase,
    stageId: options.stageId,
    summary: `Phase advanced: ${previousPhase} -> ${nextPhase}`,
    visibility: "public",
  }
}

export function createTaskStartedEvent(
  phase: Phase,
  milestone: Milestone,
  task: Task,
): WorkflowEventInput {
  return {
    kind: "task_started",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    taskId: task.id,
    summary: `Task ${task.id} entered IN_PROGRESS in ${milestone.id} — ${task.name}`,
    visibility: "internal",
  }
}

export function createTaskBlockedEvent(
  phase: Phase,
  milestone: Milestone,
  task: Task,
): WorkflowEventInput {
  return {
    kind: "task_blocked",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    taskId: task.id,
    summary: `Task ${task.id} became BLOCKED — ${task.blockedReason ?? "reason not recorded"}`,
    visibility: "internal",
  }
}

export function createTaskCompletedEvent(
  phase: Phase,
  milestone: Milestone,
  task: Task,
): WorkflowEventInput {
  const commitLabel = shortCommit(task.commitHash)
  return {
    kind: "task_completed",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    taskId: task.id,
    summary: `Task ${task.id} completed${commitLabel ? ` (${commitLabel})` : ""}`,
    visibility: "internal",
  }
}

export function createTaskSkippedEvent(
  phase: Phase,
  milestone: Milestone,
  task: Task,
): WorkflowEventInput {
  return {
    kind: "task_skipped",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    taskId: task.id,
    summary: `Task ${task.id} skipped — ${task.blockedReason ?? "reason not recorded"}`,
    visibility: "internal",
  }
}

export function createMilestoneReviewReadyEvent(
  phase: Phase,
  milestone: Milestone,
): WorkflowEventInput {
  return {
    kind: "milestone_review_ready",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    summary: `Milestone ${milestone.id} entered REVIEW — ${milestone.name}`,
    visibility: "internal",
  }
}

export function createMilestoneMergedEvent(
  phase: Phase,
  milestone: Milestone,
): WorkflowEventInput {
  const commitLabel = shortCommit(milestone.mergeCommit)
  return {
    kind: "milestone_merged",
    phase,
    stageId: milestone.productStageId,
    milestoneId: milestone.id,
    summary: `Milestone ${milestone.id} merged${commitLabel ? ` (${commitLabel})` : ""} — ${milestone.name}`,
    visibility: "public",
  }
}

export function createStageDeployReviewEvent(
  phase: Phase,
  stageId: string,
  summary: string,
): WorkflowEventInput {
  return {
    kind: "stage_deploy_review",
    phase,
    stageId,
    summary,
    visibility: "public",
  }
}

export function createStagePromotedEvent(
  phase: Phase,
  previousStageId: string,
  nextStageId: string,
): WorkflowEventInput {
  return {
    kind: "stage_promoted",
    phase,
    stageId: nextStageId,
    summary: `Product stage promoted: ${previousStageId} -> ${nextStageId}`,
    visibility: "public",
  }
}

export function createPublicDocsSyncedEvent(
  phase: Phase,
  summary: string,
  options: {
    milestoneId?: string
    stageId?: string
    visibility?: WorkflowEventVisibility
  } = {},
): WorkflowEventInput {
  return {
    kind: "public_docs_synced",
    phase,
    stageId: options.stageId,
    milestoneId: options.milestoneId,
    summary,
    visibility: options.visibility ?? "public",
  }
}
