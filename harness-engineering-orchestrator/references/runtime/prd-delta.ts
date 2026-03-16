/**
 * prd-delta.ts
 *
 * Pure function that generates PRD delta content from a ScopeChangeRequest.
 * Determines where to insert new tasks/milestones in docs/PRD.md.
 */

import { readFileSync } from "fs"
import type { Milestone, ProjectState, ScopeChangeRequest } from "../types"

export interface PrdDelta {
  insertAfterLine: number
  content: string
  newMilestoneId?: string
  newTaskIds: string[]
}

function getHighestMilestoneNumber(state: ProjectState): number {
  const ids = state.execution.milestones.map(m => {
    const match = m.id.match(/^M(\d+)$/)
    return match ? parseInt(match[1], 10) : 0
  })
  return Math.max(0, ...ids)
}

function getHighestTaskNumber(state: ProjectState): number {
  const ids = state.execution.milestones.flatMap(m =>
    m.tasks.map(t => {
      const match = t.id.match(/^T(\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    }),
  )
  return Math.max(0, ...ids)
}

function findTargetMilestone(
  state: ProjectState,
  targetMilestoneId?: string,
): Milestone | null {
  if (!targetMilestoneId) return null
  const milestone = state.execution.milestones.find(m => m.id === targetMilestoneId)
  if (!milestone) return null
  // Only append to open milestones
  if (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") {
    return milestone
  }
  return null
}

function findMilestoneInsertLine(prdContent: string, milestoneId: string): number {
  const lines = prdContent.split("\n")
  // Find the milestone heading in the PRD
  const milestonePattern = new RegExp(`^##\\s+.*${milestoneId}`, "i")
  let lastLineInMilestone = -1

  for (let i = 0; i < lines.length; i++) {
    if (milestonePattern.test(lines[i])) {
      // Found the milestone heading — scan to find the end of this section
      lastLineInMilestone = i
      for (let j = i + 1; j < lines.length; j++) {
        if (/^##\s+/.test(lines[j])) break // Next section starts
        lastLineInMilestone = j
      }
      break
    }
  }

  return lastLineInMilestone > 0 ? lastLineInMilestone : lines.length - 1
}

function findPrdEndLine(prdContent: string): number {
  const lines = prdContent.split("\n")
  return lines.length - 1
}

export function generatePrdDelta(
  request: ScopeChangeRequest,
  state: ProjectState,
  prdContent: string,
): PrdDelta {
  const newTaskIds: string[] = []
  let taskCounter = getHighestTaskNumber(state)

  const target = findTargetMilestone(state, request.targetMilestoneId)

  if (target) {
    // Append tasks under existing open milestone
    const lines: string[] = [""]
    for (const proposed of request.proposedTasks) {
      taskCounter++
      const taskId = `T${String(taskCounter).padStart(3, "0")}`
      newTaskIds.push(taskId)
      lines.push(`### ${taskId}: ${proposed.name}`)
      lines.push("")
      lines.push("**Definition of Done:**")
      for (const item of proposed.dod) {
        lines.push(`- [ ] ${item}`)
      }
      lines.push("")
      if (proposed.isUI) lines.push("**UI Task:** Yes")
      if (proposed.affectedFiles?.length) {
        lines.push(`**Affected Files:** ${proposed.affectedFiles.join(", ")}`)
      }
      if (proposed.dependsOn?.length) {
        lines.push(`**Depends On:** ${proposed.dependsOn.join(", ")}`)
      }
      lines.push("")
    }

    const insertLine = findMilestoneInsertLine(prdContent, target.id)
    return {
      insertAfterLine: insertLine,
      content: lines.join("\n"),
      newTaskIds,
    }
  }

  // Create new milestone
  const milestoneNum = getHighestMilestoneNumber(state) + 1
  const newMilestoneId = `M${milestoneNum}`

  const lines: string[] = [
    "",
    `## ${newMilestoneId}: ${request.description}`,
    "",
  ]

  for (const proposed of request.proposedTasks) {
    taskCounter++
    const taskId = `T${String(taskCounter).padStart(3, "0")}`
    newTaskIds.push(taskId)
    lines.push(`### ${taskId}: ${proposed.name}`)
    lines.push("")
    lines.push("**Definition of Done:**")
    for (const item of proposed.dod) {
      lines.push(`- [ ] ${item}`)
    }
    lines.push("")
    if (proposed.isUI) lines.push("**UI Task:** Yes")
    if (proposed.affectedFiles?.length) {
      lines.push(`**Affected Files:** ${proposed.affectedFiles.join(", ")}`)
    }
    if (proposed.dependsOn?.length) {
      lines.push(`**Depends On:** ${proposed.dependsOn.join(", ")}`)
    }
    lines.push("")
  }

  const insertLine = findPrdEndLine(prdContent)
  return {
    insertAfterLine: insertLine,
    content: lines.join("\n"),
    newMilestoneId,
    newTaskIds,
  }
}
