/**
 * prd-delta.ts
 *
 * Pure function that generates PRD delta content from a ScopeChangeRequest.
 * The emitted markdown must round-trip through parsePrdStageSpecs() so new
 * scope can be synced back into milestones/tasks without manual cleanup.
 */

import type { Milestone, ProjectState, ScopeChangeRequest } from "../types"

export interface PrdDelta {
  insertAfterLine: number
  content: string
  newMilestoneId?: string
  newTaskIds: string[]
}

function getHighestMilestoneNumber(state: ProjectState): number {
  const ids = [
    ...state.execution.milestones.map(milestone => milestone.id),
    ...state.roadmap.stages.flatMap(stage => stage.milestoneIds),
  ].map(id => {
    const match = id.match(/^M(\d+)$/)
    return match ? Number.parseInt(match[1], 10) : 0
  })
  return Math.max(0, ...ids)
}

function getHighestMilestoneNumberFromPrd(prdContent: string): number {
  const ids = Array.from(prdContent.matchAll(/^###\s+Milestone\s+(\d+)/gim))
    .map(match => Number.parseInt(match[1] ?? "0", 10))
    .filter(Number.isFinite)
  return Math.max(0, ...ids)
}

function getHighestTaskNumber(state: ProjectState): number {
  const ids = state.execution.milestones.flatMap(milestone =>
    milestone.tasks.map(task => {
      const match = task.id.match(/^T(\d+)$/)
      return match ? Number.parseInt(match[1], 10) : 0
    }),
  )
  return Math.max(0, ...ids)
}

function getHighestFeatureNumber(state: ProjectState): number {
  const ids = state.execution.milestones.flatMap(milestone =>
    milestone.tasks.map(task => {
      const match = task.prdRef.match(/^PRD#F(\d+)$/i)
      return match ? Number.parseInt(match[1], 10) : 0
    }),
  )
  return Math.max(0, ...ids)
}

function getHighestFeatureNumberFromPrd(prdContent: string): number {
  const ids = Array.from(prdContent.matchAll(/^####\s+F(\d+)/gim))
    .map(match => Number.parseInt(match[1] ?? "0", 10))
    .filter(Number.isFinite)
  return Math.max(0, ...ids)
}

function milestoneNumber(milestoneId: string): number | undefined {
  const match = milestoneId.match(/^M(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : undefined
}

function resolveTargetMilestone(
  state: ProjectState,
  targetMilestoneId?: string,
): Milestone | null {
  if (!targetMilestoneId) return null
  const milestone = state.execution.milestones.find(candidate => candidate.id === targetMilestoneId)
  if (!milestone) return null
  if (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") {
    return milestone
  }
  return null
}

function resolveTargetStageId(state: ProjectState, request: ScopeChangeRequest): string {
  const milestone = state.execution.milestones.find(candidate => candidate.id === request.targetMilestoneId)
  if (milestone) return milestone.productStageId

  return (
    state.roadmap.currentStageId
    || state.roadmap.stages.find(stage => stage.status === "ACTIVE")?.id
    || state.roadmap.stages.find(stage => stage.status === "DEPLOY_REVIEW")?.id
    || state.roadmap.stages.find(stage => stage.status === "COMPLETED")?.id
    || state.execution.milestones[state.execution.milestones.length - 1]?.productStageId
    || "V1"
  )
}

function parseStageRanges(prdContent: string): Array<{ id: string; start: number; end: number }> {
  const lines = prdContent.split("\n")
  const headings = lines.flatMap((line, index) => {
    const match = line.match(
      /^##\s+Product Stage\s+(V\d+)\s*:\s*(.+?)(?:\s+\[(ACTIVE|DEFERRED|DEPLOY_REVIEW|COMPLETED)\])?\s*$/i,
    )
    if (!match) return []
    return [{ id: match[1]!.trim().toUpperCase(), start: index }]
  })

  return headings.map((heading, index) => ({
    id: heading.id,
    start: heading.start,
    end: index + 1 < headings.length ? headings[index + 1]!.start - 1 : lines.length - 1,
  }))
}

function findStageInsertLine(prdContent: string, stageId: string): number {
  const stage = parseStageRanges(prdContent).find(candidate => candidate.id === stageId)
  if (!stage) {
    const lines = prdContent.split("\n")
    return lines.length - 1
  }
  return stage.end
}

function findMilestoneInsertLine(prdContent: string, milestoneId: string): number {
  const lines = prdContent.split("\n")
  const targetNumber = milestoneNumber(milestoneId)
  if (!targetNumber) {
    return lines.length - 1
  }

  const pattern = new RegExp(`^###\\s+Milestone\\s+${targetNumber}(?:\\b|\\s*[:：])`, "i")
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (!pattern.test(lines[lineIndex]!)) continue

    let end = lineIndex
    for (let next = lineIndex + 1; next < lines.length; next++) {
      if (/^##\s+Product Stage\b/i.test(lines[next]!) || /^###\s+Milestone\b/i.test(lines[next]!)) {
        break
      }
      end = next
    }
    return end
  }

  return lines.length - 1
}

function formatFeatureNumber(featureNumber: number): string {
  return `F${String(featureNumber).padStart(3, "0")}`
}

function formatTaskNumber(taskNumber: number): string {
  return `T${String(taskNumber).padStart(3, "0")}`
}

function renderFeatureBlock(
  request: ScopeChangeRequest["proposedTasks"][number],
  featureId: string,
): string[] {
  const lines = [`#### ${featureId}: ${request.name}`]

  for (const item of request.dod) {
    lines.push(`- [ ] ${item}`)
  }

  if (request.isUI) {
    lines.push("**UI Task:** Yes")
  }
  if (request.affectedFiles?.length) {
    lines.push(`**Affected Files:** ${request.affectedFiles.join(", ")}`)
  }
  if (request.dependsOn?.length) {
    lines.push(`**Depends On:** ${request.dependsOn.join(", ")}`)
  }

  lines.push("")
  return lines
}

export function generatePrdDelta(
  request: ScopeChangeRequest,
  state: ProjectState,
  prdContent: string,
): PrdDelta {
  const newTaskIds: string[] = []
  let featureCounter = Math.max(getHighestFeatureNumber(state), getHighestFeatureNumberFromPrd(prdContent))
  let taskCounter = getHighestTaskNumber(state)
  const highestMilestoneNumber = Math.max(getHighestMilestoneNumber(state), getHighestMilestoneNumberFromPrd(prdContent))
  const targetMilestone = resolveTargetMilestone(state, request.targetMilestoneId)

  if (targetMilestone) {
    const lines: string[] = [""]
    for (const proposed of request.proposedTasks) {
      featureCounter += 1
      taskCounter += 1
      newTaskIds.push(formatTaskNumber(taskCounter))
      lines.push(...renderFeatureBlock(proposed, formatFeatureNumber(featureCounter)))
    }

    return {
      insertAfterLine: findMilestoneInsertLine(prdContent, targetMilestone.id),
      content: lines.join("\n").trimEnd(),
      newTaskIds,
    }
  }

  const nextMilestoneNumber = highestMilestoneNumber + 1
  const newMilestoneId = `M${nextMilestoneNumber}`
  const targetStageId = resolveTargetStageId(state, request)
  const lines: string[] = [
    "",
    `### Milestone ${nextMilestoneNumber}: ${request.description}`,
    "",
  ]

  for (const proposed of request.proposedTasks) {
    featureCounter += 1
    taskCounter += 1
    newTaskIds.push(formatTaskNumber(taskCounter))
    lines.push(...renderFeatureBlock(proposed, formatFeatureNumber(featureCounter)))
  }

  return {
    insertAfterLine: findStageInsertLine(prdContent, targetStageId),
    content: lines.join("\n").trimEnd(),
    newMilestoneId,
    newTaskIds,
  }
}
