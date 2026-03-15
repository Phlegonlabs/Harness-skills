import type { Milestone, Phase, ProjectState, Task, TaskChecklist } from "../types"
import { formatAtomicCommitFailure, inspectAtomicTaskCommit } from "./atomic-commit"
import { markStageDeployReview } from "./stages"
import { readState, writeState } from "./state-core"
import { mergeTaskChecklist } from "./task-checklist"

function findTaskLocation(state: ProjectState, taskId: string): { milestone: Milestone; task: Task } | null {
  for (const milestone of state.execution.milestones) {
    const task = milestone.tasks.find(candidate => candidate.id === taskId)
    if (task) return { milestone, task }
  }
  return null
}

function preserveActiveTask(state: ProjectState): boolean {
  if (!state.execution.currentTask) return false

  const location = findTaskLocation(state, state.execution.currentTask)
  if (!location || location.task.status !== "IN_PROGRESS") {
    return false
  }

  location.task.startedAt = location.task.startedAt ?? new Date().toISOString()
  state.execution.currentMilestone = location.milestone.id
  state.execution.currentWorktree = location.milestone.worktreePath
  if (location.milestone.status === "PENDING") {
    location.milestone.status = "IN_PROGRESS"
  }
  return true
}

function activateNextTask(state: ProjectState): void {
  if (preserveActiveTask(state)) {
    return
  }

  for (const milestone of state.execution.milestones) {
    const nextTask = milestone.tasks.find(task => task.status === "PENDING")
    if (!nextTask) continue

    nextTask.startedAt = nextTask.startedAt ?? new Date().toISOString()
    milestone.status = milestone.status === "PENDING" ? "IN_PROGRESS" : milestone.status
    nextTask.status = "IN_PROGRESS"
    state.execution.currentMilestone = milestone.id
    state.execution.currentTask = nextTask.id
    state.execution.currentWorktree = milestone.worktreePath
    return
  }

  state.execution.currentMilestone = ""
  state.execution.currentTask = ""
  state.execution.currentWorktree = ""
}

function refreshMilestoneStatuses(state: ProjectState): void {
  for (const milestone of state.execution.milestones) {
    const allFinished = milestone.tasks.every(
      task => task.status === "DONE" || task.status === "SKIPPED",
    )
    const hasWorkStarted = milestone.tasks.some(task =>
      ["IN_PROGRESS", "DONE", "BLOCKED"].includes(task.status),
    )

    if (allFinished) {
      milestone.status = milestone.status === "MERGED" ? "MERGED" : "REVIEW"
      milestone.completedAt = milestone.completedAt ?? new Date().toISOString()
    } else if (hasWorkStarted) {
      milestone.status = "IN_PROGRESS"
    } else if (milestone.status !== "COMPLETE" && milestone.status !== "MERGED") {
      milestone.status = "PENDING"
    }
  }
}

export function completeTask(taskId: string, commitHash: string): ProjectState {
  const state = readState()
  const location = findTaskLocation(state, taskId)
  if (!location) throw new Error(`Task ${taskId} not found`)

  const atomicCommit = inspectAtomicTaskCommit(state, taskId, commitHash)
  if (!atomicCommit.ok) {
    throw new Error(formatAtomicCommitFailure(taskId, atomicCommit))
  }

  location.task.status = "DONE"
  location.task.commitHash = atomicCommit.commitHash
  location.task.completedAt = new Date().toISOString()
  if (location.task.type === "TASK") {
    const checklist = location.task.checklist as Partial<TaskChecklist> | undefined
    location.task.checklist = mergeTaskChecklist(checklist, {
      prdDodMet: true,
      atomicCommitDone: atomicCommit.ok,
      progressUpdated: true,
    })
  }

  if (state.execution.currentTask === taskId) {
    state.execution.currentTask = ""
  }

  refreshMilestoneStatuses(state)
  activateNextTask(state)

  const updated = writeState(state)
  console.log(`✅ Task ${taskId} marked DONE (commit: ${atomicCommit.commitHash})`)
  return updated
}

export function blockTask(taskId: string, reason: string): ProjectState {
  const state = readState()
  const location = findTaskLocation(state, taskId)
  if (!location) throw new Error(`Task ${taskId} not found`)

  location.task.status = "BLOCKED"
  location.task.retryCount = (location.task.retryCount ?? 0) + 1
  location.task.blockedReason = reason
  location.task.blockedAt = new Date().toISOString()
  if (location.task.type === "TASK") {
    const checklist = location.task.checklist as Partial<TaskChecklist> | undefined
    location.task.checklist = mergeTaskChecklist(checklist, {
      progressUpdated: true,
    })
  }

  if (state.execution.currentTask === taskId) {
    state.execution.currentTask = ""
  }

  refreshMilestoneStatuses(state)
  activateNextTask(state)

  const updated = writeState(state)
  console.log(`⚠️  Task ${taskId} BLOCKED: ${reason}`)
  return updated
}

export function completeMilestone(milestoneId: string, mergeCommit: string): ProjectState {
  const state = readState()
  const milestone = state.execution.milestones.find(m => m.id === milestoneId)
  if (!milestone) throw new Error(`Milestone ${milestoneId} not found`)
  if (milestone.status !== "REVIEW") {
    throw new Error(`Milestone ${milestoneId} is ${milestone.status}, expected REVIEW`)
  }

  milestone.status = "MERGED"
  milestone.mergeCommit = mergeCommit
  milestone.completedAt = milestone.completedAt ?? new Date().toISOString()

  if (state.execution.currentMilestone === milestoneId) {
    state.execution.currentMilestone = ""
    state.execution.currentTask = ""
    state.execution.currentWorktree = ""
  }

  refreshMilestoneStatuses(state)
  markStageDeployReview(state, milestone.productStageId)
  activateNextTask(state)

  const updated = writeState(state)
  console.log(`✅ Milestone ${milestoneId} marked MERGED (commit: ${mergeCommit})`)
  return updated
}

export function advancePhase(newPhase: Phase): ProjectState {
  const state = readState()
  state.phase = newPhase
  const updated = writeState(state)
  console.log(`📍 Phase advanced to: ${newPhase}`)
  return updated
}
