import type { Milestone, ProductStage, ProjectState } from "../types"

export function getCurrentProductStage(state: ProjectState): ProductStage | undefined {
  return (
    state.roadmap.stages.find(stage => stage.id === state.roadmap.currentStageId)
    ?? getActiveProductStage(state)
    ?? state.roadmap.stages.find(stage => stage.status === "DEPLOY_REVIEW")
    ?? state.roadmap.stages[0]
  )
}

export function getActiveProductStage(state: ProjectState): ProductStage | undefined {
  return state.roadmap.stages.find(stage => stage.status === "ACTIVE")
}

export function getDeferredProductStages(state: ProjectState): ProductStage[] {
  return state.roadmap.stages.filter(stage => stage.status === "DEFERRED")
}

export function getNextDeferredProductStage(state: ProjectState): ProductStage | undefined {
  return getDeferredProductStages(state)[0]
}

export function hasDeferredProductStages(state: ProjectState): boolean {
  return getDeferredProductStages(state).length > 0
}

export function getStageMilestones(state: ProjectState, stageId: string): Milestone[] {
  return state.execution.milestones.filter(milestone => milestone.productStageId === stageId)
}

export function countExecutionMilestonesForStage(state: ProjectState, stageId: string): number {
  return getStageMilestones(state, stageId).length
}

export function stageIsReadyForDeployReview(state: ProjectState, stageId: string): boolean {
  const milestones = getStageMilestones(state, stageId)
  if (milestones.length === 0) return false
  return milestones.every(milestone => ["MERGED", "COMPLETE"].includes(milestone.status))
}

export function markStageDeployReview(state: ProjectState, stageId: string): void {
  const stage = state.roadmap.stages.find(candidate => candidate.id === stageId)
  if (!stage) return
  if (!stageIsReadyForDeployReview(state, stageId)) return

  stage.status = "DEPLOY_REVIEW"
  stage.deployReviewStartedAt = stage.deployReviewStartedAt ?? new Date().toISOString()
  state.roadmap.currentStageId = stage.id
}
