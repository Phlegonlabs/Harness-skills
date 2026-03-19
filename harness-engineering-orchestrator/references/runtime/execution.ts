import { existsSync } from "fs"
import type { ActiveAgent, HarnessLevel, Milestone, MilestoneChecklist, MilestoneStatus, Phase, ProductStageStatus, ProjectState, Task, TaskChecklist } from "../types"
import { formatAtomicCommitFailure, inspectAtomicTaskCommit } from "./atomic-commit"
import { recordMetric, collectThroughputMetrics, collectQualityMetrics, collectHarnessHealthMetrics } from "./metrics"
import { syncPublicManagedDocs } from "./public-docs"
import { markStageDeployReview } from "./stages"
import { readState, writeState } from "./state-core"
import { mergeTaskChecklist } from "./task-checklist"
import {
  appendWorkflowEvent,
  createMilestoneMergedEvent,
  createMilestoneReviewReadyEvent,
  createPhaseAdvancedEvent,
  createStageDeployReviewEvent,
  createTaskBlockedEvent,
  createTaskCompletedEvent,
  createTaskSkippedEvent,
  createTaskStartedEvent,
} from "./workflow-history"

function findTaskLocation(state: ProjectState, taskId: string): { milestone: Milestone; task: Task } | null {
  for (const milestone of state.execution.milestones) {
    const task = milestone.tasks.find(candidate => candidate.id === taskId)
    if (task) return { milestone, task }
  }
  return null
}

export function registerActiveAgent(
  state: ProjectState,
  agent: ActiveAgent,
): void {
  if (!state.execution.activeAgents) {
    state.execution.activeAgents = []
  }
  // Remove any existing entry for the same taskId (idempotent)
  state.execution.activeAgents = state.execution.activeAgents.filter(
    a => a.taskId !== agent.taskId && a.agentId !== agent.agentId,
  )
  state.execution.activeAgents.push(agent)
  syncExecutionPointersFromActiveAgents(state)
}

function isParallelExecutionEnabled(state: ProjectState): boolean {
  const concurrency = state.projectInfo.concurrency
  return (
    (concurrency?.maxParallelTasks ?? 1) > 1 ||
    (concurrency?.maxParallelMilestones ?? 1) > 1
  )
}

function clearExecutionPointers(state: ProjectState): void {
  state.execution.currentMilestone = ""
  state.execution.currentTask = ""
  state.execution.currentWorktree = ""
}

export function syncExecutionPointersFromActiveAgents(state: ProjectState): void {
  const activeAgents = (state.execution.activeAgents ?? []).filter(
    agent => agent.status !== "completed" && agent.status !== "closing",
  )

  if (activeAgents.length === 0) {
    clearExecutionPointers(state)
    return
  }

  const first = activeAgents[0]
  state.execution.currentMilestone = first.milestoneId
  state.execution.currentTask = first.taskId
  state.execution.currentWorktree = first.worktreePath
}

function runTaskAutoCompact(): void {
  if (!existsSync(".harness/compact.ts")) return

  const proc = Bun.spawnSync(["bun", ".harness/compact.ts"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode === 0) return

  const stdout = new TextDecoder().decode(proc.stdout).trim()
  const stderr = new TextDecoder().decode(proc.stderr).trim()
  const detail = stderr || stdout || "unknown compact failure"
  console.warn(`⚠️  Auto compact failed after task completion: ${detail}`)
}

function deregisterActiveAgentsForTask(state: ProjectState, taskId: string): void {
  if (!state.execution.activeAgents) return
  state.execution.activeAgents = state.execution.activeAgents.filter(
    agent => agent.taskId !== taskId,
  )
  syncExecutionPointersFromActiveAgents(state)
}

export function deregisterActiveAgent(
  state: ProjectState,
  agentId: string,
): void {
  if (!state.execution.activeAgents) return
  state.execution.activeAgents = state.execution.activeAgents.filter(
    a => a.agentId !== agentId,
  )

  syncExecutionPointersFromActiveAgents(state)
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

function activateNextTask(state: ProjectState): { milestone: Milestone; task: Task } | null {
  if (preserveActiveTask(state)) {
    return null
  }

  for (const milestone of state.execution.milestones) {
    const pendingTasks = milestone.tasks.filter(task => task.status === "PENDING")
    // Prefer urgent tasks over normal tasks
    const nextTask = pendingTasks.find(t => t.priority === "urgent") ?? pendingTasks[0]
    if (!nextTask) continue

    nextTask.startedAt = nextTask.startedAt ?? new Date().toISOString()
    milestone.status = milestone.status === "PENDING" ? "IN_PROGRESS" : milestone.status
    nextTask.status = "IN_PROGRESS"
    state.execution.currentMilestone = milestone.id
    state.execution.currentTask = nextTask.id
    state.execution.currentWorktree = milestone.worktreePath
    return { milestone, task: nextTask }
  }

  state.execution.currentMilestone = ""
  state.execution.currentTask = ""
  state.execution.currentWorktree = ""
  return null
}

export function activateMultipleTasks(
  state: ProjectState,
  maxCount: number,
): Array<{ milestone: Milestone; task: Task }> {
  const activated: Array<{ milestone: Milestone; task: Task }> = []

  for (const milestone of state.execution.milestones) {
    if (milestone.status === "MERGED" || milestone.status === "COMPLETE") continue

    const pendingTasks = milestone.tasks.filter(task => {
      if (task.status !== "PENDING") return false
      // Check dependsOn
      if (task.dependsOn && task.dependsOn.length > 0) {
        const allDeps = milestone.tasks.concat(
          state.execution.milestones.flatMap(m => m.tasks),
        )
        const depsComplete = task.dependsOn.every(depId => {
          const dep = allDeps.find(t => t.id === depId)
          return dep?.status === "DONE"
        })
        if (!depsComplete) return false
      }
      // Check file overlap with already-activated tasks
      const hasOverlap = activated.some(({ task: active }) =>
        active.affectedFiles.some(f => task.affectedFiles.includes(f)),
      )
      return !hasOverlap
    })

    // Prefer urgent tasks
    const sorted = [
      ...pendingTasks.filter(t => t.priority === "urgent"),
      ...pendingTasks.filter(t => t.priority !== "urgent"),
    ]

    for (const task of sorted) {
      if (activated.length >= maxCount) break
      task.status = "IN_PROGRESS"
      task.startedAt = task.startedAt ?? new Date().toISOString()
      if (milestone.status === "PENDING") {
        milestone.status = "IN_PROGRESS"
      }
      activated.push({ milestone, task })
    }

    if (activated.length >= maxCount) break
  }

  return activated
}

function milestoneStatusMap(state: ProjectState): Map<string, MilestoneStatus> {
  return new Map(state.execution.milestones.map(milestone => [milestone.id, milestone.status]))
}

function stageStatusMap(state: ProjectState): Map<string, ProductStageStatus> {
  return new Map(state.roadmap.stages.map(stage => [stage.id, stage.status]))
}

function recordReviewReadyTransitions(
  state: ProjectState,
  previousStatuses: Map<string, MilestoneStatus>,
): ProjectState {
  for (const milestone of state.execution.milestones) {
    if (milestone.status !== "REVIEW") continue
    if (previousStatuses.get(milestone.id) === "REVIEW") continue
    state = appendWorkflowEvent(state, createMilestoneReviewReadyEvent(state.phase, milestone))
  }

  return state
}

export function refreshMilestoneStatuses(state: ProjectState): void {
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

function assertTaskChecklistPasses(task: Task, level: HarnessLevel): void {
  if (task.type !== "TASK") return
  const checklist = task.checklist as Partial<TaskChecklist> | undefined
  if (!checklist) {
    const msg = `Task ${task.id} has no checklist — run bun harness:validate --task ${task.id} first`
    if (level === "lite") {
      console.warn(`⚠️  ${msg}`)
      return
    }
    throw new Error(msg)
  }

  const critical: (keyof TaskChecklist)[] = [
    "typecheckPassed", "lintPassed", "testsPassed",
    "buildPassed", "fileSizeOk", "noForbiddenPatterns",
  ]
  const failures = critical.filter(key => !checklist[key])
  if (failures.length === 0) return

  const msg = `Task ${task.id} checklist gate failed: ${failures.join(", ")}`
  if (level === "lite") {
    console.warn(`⚠️  ${msg}`)
  } else {
    throw new Error(msg)
  }
}

function assertMilestoneChecklistPasses(milestone: Milestone, level: HarnessLevel): void {
  const checklist = milestone.checklist
  if (!checklist) {
    const msg = `Milestone ${milestone.id} has no checklist — run bun harness:validate --milestone ${milestone.id} first`
    if (level === "lite") {
      console.warn(`⚠️  ${msg}`)
      return
    }
    throw new Error(msg)
  }

  const critical: (keyof MilestoneChecklist)[] = [
    "allTasksComplete", "typecheckPassed", "lintPassed",
    "testsPassed", "buildPassed", "noBlockingForbiddenPatterns",
    "agentsMdSynced", "changelogUpdated",
  ]
  if (level === "full") {
    critical.push("gitbookGuidePresent")
  }
  if (level !== "lite") {
    critical.push("compactCompleted")
  }

  const failures = critical.filter(key => !checklist[key])
  if (failures.length === 0) return

  const msg = `Milestone ${milestone.id} checklist gate failed: ${failures.join(", ")}`
  if (level === "lite") {
    console.warn(`⚠️  ${msg}`)
  } else {
    throw new Error(msg)
  }
}

export function completeTask(taskId: string, commitHash: string): ProjectState {
  const state = readState()
  const location = findTaskLocation(state, taskId)
  if (!location) throw new Error(`Task ${taskId} not found`)
  const previousMilestoneStatuses = milestoneStatusMap(state)

  const atomicCommit = inspectAtomicTaskCommit(state, taskId, commitHash)
  if (!atomicCommit.ok) {
    throw new Error(formatAtomicCommitFailure(taskId, atomicCommit))
  }

  assertTaskChecklistPasses(location.task, state.projectInfo?.harnessLevel?.level ?? "standard")

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

  deregisterActiveAgentsForTask(state, taskId)

  appendWorkflowEvent(state, createTaskCompletedEvent(state.phase, location.milestone, location.task))
  refreshMilestoneStatuses(state)
  recordReviewReadyTransitions(state, previousMilestoneStatuses)
  if (isParallelExecutionEnabled(state)) {
    syncExecutionPointersFromActiveAgents(state)
  } else {
    const nextTask = activateNextTask(state)
    if (nextTask) {
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, nextTask.milestone, nextTask.task))
    }
  }

  // Record throughput and quality metrics after task completion
  for (const entry of [...collectThroughputMetrics(state), ...collectQualityMetrics(state)]) {
    recordMetric(state, entry)
  }

  const updated = writeState(state)
  runTaskAutoCompact()
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

  deregisterActiveAgentsForTask(state, taskId)

  appendWorkflowEvent(state, createTaskBlockedEvent(state.phase, location.milestone, location.task))
  refreshMilestoneStatuses(state)
  if (isParallelExecutionEnabled(state)) {
    syncExecutionPointersFromActiveAgents(state)
  } else {
    const nextTask = activateNextTask(state)
    if (nextTask) {
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, nextTask.milestone, nextTask.task))
    }
  }

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

  assertMilestoneChecklistPasses(milestone, state.projectInfo?.harnessLevel?.level ?? "standard")

  const previousStageStatuses = stageStatusMap(state)

  milestone.status = "MERGED"
  milestone.mergeCommit = mergeCommit
  milestone.completedAt = milestone.completedAt ?? new Date().toISOString()

  if (state.execution.currentMilestone === milestoneId) {
    clearExecutionPointers(state)
  }

  refreshMilestoneStatuses(state)
  markStageDeployReview(state, milestone.productStageId)
  appendWorkflowEvent(state, createMilestoneMergedEvent(state.phase, milestone))

  const stage = state.roadmap.stages.find(candidate => candidate.id === milestone.productStageId)
  if (stage && previousStageStatuses.get(stage.id) !== "DEPLOY_REVIEW" && stage.status === "DEPLOY_REVIEW") {
    appendWorkflowEvent(
      state,
      createStageDeployReviewEvent(
        state.phase,
        stage.id,
        `Product stage ${stage.id} entered DEPLOY_REVIEW after ${milestone.id} merged`,
      ),
    )
  }
  if (isParallelExecutionEnabled(state)) {
    syncExecutionPointersFromActiveAgents(state)
  } else {
    const nextTask = activateNextTask(state)
    if (nextTask) {
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, nextTask.milestone, nextTask.task))
    }
  }

  // Record all category metrics after milestone completion
  for (const entry of [
    ...collectThroughputMetrics(state),
    ...collectQualityMetrics(state),
    ...collectHarnessHealthMetrics(state),
  ]) {
    recordMetric(state, entry)
  }

  const updated = syncPublicManagedDocs(state, {
    milestoneId: milestone.id,
    stageId: milestone.productStageId,
    summary: `Public docs synced after ${milestone.id} merged`,
  }).state
  console.log(`✅ Milestone ${milestoneId} marked MERGED (commit: ${mergeCommit})`)
  return updated
}

export function advancePhase(newPhase: Phase): ProjectState {
  const state = readState()
  const previousPhase = state.phase
  state.phase = newPhase
  appendWorkflowEvent(
    state,
    createPhaseAdvancedEvent(previousPhase, newPhase, { stageId: state.roadmap.currentStageId || undefined }),
  )
  const updated = syncPublicManagedDocs(state, {
    stageId: state.roadmap.currentStageId || undefined,
    summary: `Public docs synced after phase advanced to ${newPhase}`,
  }).state
  console.log(`📍 Phase advanced to: ${newPhase}`)
  return updated
}

export function skipTask(taskId: string, reason: string): ProjectState {
  const state = readState()
  const location = findTaskLocation(state, taskId)
  if (!location) throw new Error(`Task ${taskId} not found`)

  location.task.status = "SKIPPED"
  location.task.blockedReason = reason
  location.task.completedAt = new Date().toISOString()

  deregisterActiveAgentsForTask(state, taskId)

  appendWorkflowEvent(state, createTaskSkippedEvent(state.phase, location.milestone, location.task))
  refreshMilestoneStatuses(state)
  if (isParallelExecutionEnabled(state)) {
    syncExecutionPointersFromActiveAgents(state)
  } else {
    const nextTask = activateNextTask(state)
    if (nextTask) {
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, nextTask.milestone, nextTask.task))
    }
  }

  const updated = writeState(state)
  console.log(`⏭️  Task ${taskId} SKIPPED: ${reason}`)
  return updated
}

export function finalizeMilestone(milestoneId: string): ProjectState {
  const state = readState()
  const milestone = state.execution.milestones.find(m => m.id === milestoneId)
  if (!milestone) throw new Error(`Milestone ${milestoneId} not found`)
  if (milestone.status !== "MERGED") {
    throw new Error(`Milestone ${milestoneId} is ${milestone.status}, expected MERGED`)
  }

  milestone.status = "COMPLETE"
  refreshMilestoneStatuses(state)

  const updated = writeState(state)
  console.log(`✅ Milestone ${milestoneId} finalized to COMPLETE`)
  return updated
}

export function rollbackTask(taskId: string, reason: string): ProjectState {
  const state = readState()
  const location = findTaskLocation(state, taskId)
  if (!location) throw new Error(`Task ${taskId} not found`)

  location.task.commitHash = undefined
  location.task.completedAt = undefined
  location.task.status = "BLOCKED"
  location.task.retryCount = (location.task.retryCount ?? 0) + 1
  location.task.blockedReason = `Rollback: ${reason}`
  location.task.blockedAt = new Date().toISOString()

  deregisterActiveAgentsForTask(state, taskId)

  appendWorkflowEvent(state, createTaskBlockedEvent(state.phase, location.milestone, location.task))
  refreshMilestoneStatuses(state)
  if (isParallelExecutionEnabled(state)) {
    syncExecutionPointersFromActiveAgents(state)
  } else {
    const nextTask = activateNextTask(state)
    if (nextTask) {
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, nextTask.milestone, nextTask.task))
    }
  }

  const updated = writeState(state)
  console.log(`🔄 Task ${taskId} rolled back: ${reason}`)
  return updated
}
