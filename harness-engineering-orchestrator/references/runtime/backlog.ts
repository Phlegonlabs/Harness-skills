import { existsSync } from "fs"
import type { Milestone, ProductStage, ProductStageStatus, ProjectState, ProjectType, Task } from "../types"
import { assertPlanningDocumentsReady } from "./planning-docs"
import { initState, readState, writeState } from "./state-core"
import { ARCHITECTURE_DIR, ARCHITECTURE_PATH, isUiProject, PRD_DIR, PRD_PATH, readDocument, STATE_PATH } from "./shared"
import { createEmptyTaskChecklist } from "./task-checklist"

type ParsedTaskSpec = {
  affectedFiles: string[]
  dependsOn?: string[]
  dod: string[]
  isUI: boolean
  milestoneId: string
  name: string
  prdRef: string
}

type ParsedMilestoneSpec = {
  branch: string
  id: string
  name: string
  productStageId: string
  tasks: ParsedTaskSpec[]
  worktreePath: string
}

type ParsedStageSpec = {
  id: string
  name: string
  milestoneSpecs: ParsedMilestoneSpec[]
  statusHint?: ProductStageStatus
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function inferTaskFiles(isUI: boolean): string[] {
  return isUI
    ? ["src/app", "src/services", "src/types", "docs/design/DESIGN_SYSTEM.md", "tests"]
    : ["src/types", "src/config", "src/lib", "src/services", "tests"]
}

function inferUiTask(text: string, projectTypes: ProjectType[]): boolean {
  if (!isUiProject(projectTypes)) return false
  return /(ui|page|screen|layout|component|design|dashboard|form|login|settings|profile|navbar|modal|table)/i.test(
    text,
  )
}

function parseStageStatusHint(raw?: string): ProductStageStatus | undefined {
  const value = raw?.trim().toUpperCase()
  switch (value) {
    case "ACTIVE":
    case "DEFERRED":
    case "DEPLOY_REVIEW":
    case "COMPLETED":
      return value
    default:
      return undefined
  }
}

function parseDocumentVersion(content: string, fallback: string): string {
  const match = content.match(/^\s*>\s*\*\*Version\*\*:\s*(v[0-9][^\r\n]*)$/im)
  return match?.[1]?.trim() ?? fallback
}

function defaultStage(): ParsedStageSpec {
  return {
    id: "V1",
    name: "Current Delivery",
    milestoneSpecs: [],
    statusHint: "ACTIVE",
  }
}

function defaultMilestone(state: ProjectState): ParsedMilestoneSpec {
  const taskIsUi = isUiProject(state.projectInfo.types)
  return {
    id: "M1",
    name: "Foundation",
    productStageId: "V1",
    branch: "milestone/m1-foundation",
    worktreePath: `../${state.projectInfo.name || "project"}-m1`,
    tasks: [
      {
        name: "Foundation setup",
        prdRef: "PRD#F001",
        milestoneId: "M1",
        dod: ["Complete foundational project initialization"],
        isUI: taskIsUi,
        affectedFiles: inferTaskFiles(taskIsUi),
        dependsOn: [],
      },
    ],
  }
}

function parsePrdStageSpecs(state: ProjectState): ParsedStageSpec[] {
  const content = readDocument(PRD_PATH, PRD_DIR)
  if (!content) {
    throw new Error("docs/prd/ or docs/PRD.md not found. Generate PRD before running --from-prd.")
  }

  const lines = content.split(/\r?\n/)
  const stages: ParsedStageSpec[] = []
  let currentStage: ParsedStageSpec | null = null
  let currentMilestone: ParsedMilestoneSpec | null = null
  let currentFeature:
    | {
        affectedFiles?: string[]
        body: string[]
        dependsOn?: string[]
        dod: string[]
        explicitIsUi?: boolean
        featureId: string
        name: string
      }
    | null = null

  const ensureStage = () => {
    if (!currentStage) {
      currentStage = defaultStage()
    }
  }

  const flushFeature = () => {
    if (!currentMilestone || !currentFeature) return

    const taskText = [currentMilestone.name, currentFeature.name, ...currentFeature.body, ...currentFeature.dod].join(" ")
    const taskIsUi = currentFeature.explicitIsUi ?? inferUiTask(taskText, state.projectInfo.types)
    const affectedFiles = currentFeature.affectedFiles?.length
      ? [...currentFeature.affectedFiles]
      : inferTaskFiles(taskIsUi)

    currentMilestone.tasks.push({
      name: currentFeature.name,
      prdRef: `PRD#F${currentFeature.featureId}`,
      milestoneId: currentMilestone.id,
      dod: currentFeature.dod.length > 0 ? currentFeature.dod : ["Meet PRD acceptance criteria"],
      isUI: taskIsUi,
      affectedFiles,
      dependsOn: currentFeature.dependsOn?.length ? [...currentFeature.dependsOn] : undefined,
    })

    currentFeature = null
  }

  const flushMilestone = () => {
    flushFeature()
    if (!currentMilestone) return
    ensureStage()
    currentStage!.milestoneSpecs.push(currentMilestone)
    currentMilestone = null
  }

  const flushStage = () => {
    flushMilestone()
    if (!currentStage) return
    stages.push(currentStage)
    currentStage = null
  }

  for (const line of lines) {
    const stageMatch = line.match(
      /^##\s+Product Stage\s+(V\d+)\s*:\s*(.+?)(?:\s+\[(ACTIVE|DEFERRED|DEPLOY_REVIEW|COMPLETED)\])?\s*$/i,
    )
    if (stageMatch) {
      flushStage()
      currentStage = {
        id: stageMatch[1]!.trim().toUpperCase(),
        name: stageMatch[2]!.trim(),
        milestoneSpecs: [],
        statusHint: parseStageStatusHint(stageMatch[3]),
      }
      continue
    }

    const milestoneMatch = line.match(/^###\s+Milestone\s+(\d+)[：:]\s*(.+)$/)
    if (milestoneMatch) {
      flushMilestone()
      ensureStage()
      const milestoneNumber = milestoneMatch[1]
      const milestoneName = milestoneMatch[2].trim()
      currentMilestone = {
        id: `M${milestoneNumber}`,
        name: milestoneName,
        productStageId: currentStage!.id,
        branch: `milestone/m${milestoneNumber}-${slugify(milestoneName || "milestone")}`,
        worktreePath: `../${state.projectInfo.name || "project"}-m${milestoneNumber}`,
        tasks: [],
      }
      continue
    }

    const featureMatch = line.match(/^####\s+F(\d{3})[：:]\s*(.+)$/)
    if (featureMatch && currentMilestone) {
      flushFeature()
      currentFeature = {
        featureId: featureMatch[1],
        name: featureMatch[2].trim(),
        body: [],
        dependsOn: [],
        dod: [],
      }
      continue
    }

    if (!currentFeature) continue

    const metadataLine = line.replace(/\*\*/g, "").trim()

    const uiMatch = metadataLine.match(/^UI Task\s*:\s*(yes|no)\s*$/i)
    if (uiMatch) {
      currentFeature.explicitIsUi = uiMatch[1]!.trim().toLowerCase() === "yes"
      continue
    }

    const affectedFilesMatch = metadataLine.match(/^Affected Files\s*:\s*(.+)\s*$/i)
    if (affectedFilesMatch) {
      currentFeature.affectedFiles = affectedFilesMatch[1]!
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
      continue
    }

    const dependsOnMatch = metadataLine.match(/^Depends On\s*:\s*(.+)\s*$/i)
    if (dependsOnMatch) {
      currentFeature.dependsOn = dependsOnMatch[1]!
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
      continue
    }

    const dodMatch = line.match(/^\s*-\s*\[\s*\]\s*(.+)$/)
    if (dodMatch) {
      currentFeature.dod.push(dodMatch[1].trim())
      continue
    }

    const trimmed = line.trim()
    if (trimmed.length > 0) {
      currentFeature.body.push(trimmed)
    }
  }

  flushStage()

  if (stages.length === 0) {
    const stage = defaultStage()
    stage.milestoneSpecs.push(defaultMilestone(state))
    return [stage]
  }

  if (stages.every(stage => stage.milestoneSpecs.length === 0)) {
    stages[0]!.milestoneSpecs.push(defaultMilestone(state))
  }

  let sawActive = false
  for (const [index, stage] of stages.entries()) {
    if (stage.statusHint === "ACTIVE" && !sawActive) {
      sawActive = true
      continue
    }
    if (stage.statusHint === "ACTIVE" && sawActive) {
      stage.statusHint = "DEFERRED"
      continue
    }
    if (!stage.statusHint) {
      stage.statusHint = sawActive || index > 0 ? "DEFERRED" : "ACTIVE"
      if (stage.statusHint === "ACTIVE") {
        sawActive = true
      }
    }
  }

  return stages
}

function taskNumber(taskId: string): number {
  const match = taskId.match(/^T(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function nextTaskId(nextNumber: number): string {
  return `T${String(nextNumber).padStart(3, "0")}`
}

function createTaskFromSpec(spec: ParsedTaskSpec, taskId: string): Task {
  return {
    id: taskId,
    name: spec.name,
    type: "TASK",
    status: "PENDING",
    prdRef: spec.prdRef,
    milestoneId: spec.milestoneId,
    dod: [...spec.dod],
    isUI: spec.isUI,
    affectedFiles: [...spec.affectedFiles],
    dependsOn: spec.dependsOn ? [...spec.dependsOn] : undefined,
    retryCount: 0,
    checklist: createEmptyTaskChecklist(),
  }
}

function buildMilestonesFromSpecs(specs: ParsedMilestoneSpec[]): Milestone[] {
  let taskCounter = 1

  return specs.map(spec => ({
    id: spec.id,
    name: spec.name,
    productStageId: spec.productStageId,
    branch: spec.branch,
    worktreePath: spec.worktreePath,
    status: "PENDING",
    tasks: spec.tasks.map(task => createTaskFromSpec(task, nextTaskId(taskCounter++))),
  }))
}

function activateNextAvailableTask(milestones: Milestone[]): {
  currentMilestone: string
  currentTask: string
  currentWorktree: string
} {
  const activeTask = milestones
    .flatMap(milestone => milestone.tasks.map(task => ({ milestone, task })))
    .find(entry => entry.task.status === "IN_PROGRESS")

  if (activeTask) {
    activeTask.task.startedAt = activeTask.task.startedAt ?? new Date().toISOString()
    if (activeTask.milestone.status === "PENDING") {
      activeTask.milestone.status = "IN_PROGRESS"
    }
    return {
      currentMilestone: activeTask.milestone.id,
      currentTask: activeTask.task.id,
      currentWorktree: activeTask.milestone.worktreePath,
    }
  }

  for (const milestone of milestones) {
    const nextTask = milestone.tasks.find(task => task.status === "PENDING")
    if (!nextTask) continue

    nextTask.status = "IN_PROGRESS"
    nextTask.startedAt = nextTask.startedAt ?? new Date().toISOString()
    if (milestone.status === "PENDING") {
      milestone.status = "IN_PROGRESS"
    }
    return {
      currentMilestone: milestone.id,
      currentTask: nextTask.id,
      currentWorktree: milestone.worktreePath,
    }
  }

  return { currentMilestone: "", currentTask: "", currentWorktree: "" }
}

function hasOpenMilestones(milestones: Milestone[]): boolean {
  return milestones.some(milestone => !["MERGED", "COMPLETE"].includes(milestone.status))
}

function buildRoadmapStageFromSpec(
  spec: ParsedStageSpec,
  existingStage: ProductStage | undefined,
  currentVersions: { architectureVersion: string; prdVersion: string },
): ProductStage {
  let status = existingStage?.status
  if (!status) {
    status = spec.statusHint ?? "DEFERRED"
  }

  return {
    id: spec.id,
    name: spec.name,
    status,
    milestoneIds: spec.milestoneSpecs.map(milestone => milestone.id),
    prdVersion:
      existingStage?.prdVersion
      ?? (status === "ACTIVE" ? currentVersions.prdVersion : undefined),
    architectureVersion:
      existingStage?.architectureVersion
      ?? (status === "ACTIVE" ? currentVersions.architectureVersion : undefined),
    promotedAt: existingStage?.promotedAt,
    deployReviewStartedAt: existingStage?.deployReviewStartedAt,
    deployReviewedAt: existingStage?.deployReviewedAt,
    completedAt: existingStage?.completedAt,
  }
}

function syncRoadmapState(baseState: ProjectState, parsedStages: ParsedStageSpec[]): {
  addedStages: number
  roadmap: ProjectState["roadmap"]
} {
  const existingStages = baseState.roadmap.stages
  const existingStageMap = new Map(existingStages.map(stage => [stage.id, stage]))
  const prdContent = readDocument(PRD_PATH, PRD_DIR)
  const architectureContent = readDocument(ARCHITECTURE_PATH, ARCHITECTURE_DIR)
  const currentVersions = {
    prdVersion: parseDocumentVersion(prdContent, baseState.docs.prd.version),
    architectureVersion: parseDocumentVersion(architectureContent, baseState.docs.architecture.version),
  }

  let addedStages = 0
  const syncedStages = parsedStages.map((spec, index) => {
    const existingStage = existingStageMap.get(spec.id)
    if (!existingStage) {
      addedStages += 1
    }

    const nextStage = buildRoadmapStageFromSpec(spec, existingStage, currentVersions)
    if (!existingStage && !spec.statusHint) {
      nextStage.status = index === 0 ? "ACTIVE" : "DEFERRED"
    }
    return nextStage
  })

  const activeOrReviewStage =
    syncedStages.find(stage => stage.status === "ACTIVE")
    ?? syncedStages.find(stage => stage.status === "DEPLOY_REVIEW")

  if (!activeOrReviewStage && syncedStages[0]) {
    syncedStages[0].status = "ACTIVE"
  }

  const parsedIds = new Set(parsedStages.map(stage => stage.id))
  const orphanStages = existingStages.filter(stage => !parsedIds.has(stage.id))

  return {
    addedStages,
    roadmap: {
      currentStageId:
        activeOrReviewStage?.id
        ?? syncedStages[0]?.id
        ?? baseState.roadmap.currentStageId,
      stages: [...syncedStages, ...orphanStages],
    },
  }
}

function buildOrderedMilestones(
  existingMilestones: Milestone[],
  parsedStages: ParsedStageSpec[],
  activeStageId: string,
  mergeActiveStage: (spec: ParsedStageSpec) => Milestone[],
): Milestone[] {
  const milestonesByStage = new Map<string, Milestone[]>()
  for (const milestone of existingMilestones) {
    const current = milestonesByStage.get(milestone.productStageId) ?? []
    current.push(milestone)
    milestonesByStage.set(milestone.productStageId, current)
  }

  const ordered: Milestone[] = []
  for (const stage of parsedStages) {
    if (stage.id === activeStageId) {
      ordered.push(...mergeActiveStage(stage))
      continue
    }

    ordered.push(...(milestonesByStage.get(stage.id) ?? []))
    milestonesByStage.delete(stage.id)
  }

  for (const stageMilestones of milestonesByStage.values()) {
    ordered.push(...stageMilestones)
  }

  return ordered
}

export function syncRoadmapFromPrd(baseState: ProjectState): {
  addedStages: number
  state: ProjectState
} {
  const parsedStages = parsePrdStageSpecs(baseState)
  const roadmapSync = syncRoadmapState(baseState, parsedStages)

  return {
    addedStages: roadmapSync.addedStages,
    state: {
      ...baseState,
      roadmap: roadmapSync.roadmap,
    },
  }
}

export function deriveExecutionFromPrd(baseState: ProjectState): ProjectState {
  assertPlanningDocumentsReady()
  const parsedStages = parsePrdStageSpecs(baseState)
  const roadmapSync = syncRoadmapState(baseState, parsedStages)
  const activeStage =
    roadmapSync.roadmap.stages.find(stage => stage.status === "ACTIVE")
    ?? roadmapSync.roadmap.stages[0]

  if (!activeStage) {
    throw new Error("No product stage is available in docs/PRD.md.")
  }

  const activeStageSpecs = parsedStages.find(stage => stage.id === activeStage.id)
  if (!activeStageSpecs) {
    throw new Error(`Product stage ${activeStage.id} was not found in docs/PRD.md.`)
  }

  const milestones = buildMilestonesFromSpecs(activeStageSpecs.milestoneSpecs)
  const pointers = activateNextAvailableTask(milestones)

  return {
    ...baseState,
    phase:
      baseState.phase === "VALIDATING" || baseState.phase === "COMPLETE"
        ? baseState.phase
        : "EXECUTING",
    roadmap: roadmapSync.roadmap,
    execution: {
      ...baseState.execution,
      currentMilestone: pointers.currentMilestone,
      currentTask: pointers.currentTask,
      currentWorktree: pointers.currentWorktree,
      milestones,
      allMilestonesComplete: false,
    },
    docs: {
      ...baseState.docs,
      prd: {
        ...baseState.docs.prd,
        exists: true,
        milestoneCount: activeStage.milestoneIds.length,
      },
      progress: {
        ...baseState.docs.progress,
        exists: true,
        lastUpdated: new Date().toISOString(),
      },
    },
  }
}

export function syncExecutionFromPrd(baseState: ProjectState): {
  addedMilestones: number
  addedStages: number
  addedTasks: number
  state: ProjectState
} {
  assertPlanningDocumentsReady()
  const parsedStages = parsePrdStageSpecs(baseState)
  const roadmapSync = syncRoadmapState(baseState, parsedStages)
  const activeStage =
    roadmapSync.roadmap.stages.find(stage => stage.status === "ACTIVE")
    ?? roadmapSync.roadmap.stages.find(stage => stage.id === roadmapSync.roadmap.currentStageId)
    ?? roadmapSync.roadmap.stages.find(stage => stage.status === "DEPLOY_REVIEW")
    ?? roadmapSync.roadmap.stages.find(stage => stage.status === "COMPLETED")
  if (!activeStage) {
    throw new Error(
      "No product stage is available. If the current stage is waiting on deploy/test, update PRD / Architecture, then run bun harness:sync-backlog or promote the next stage when ready.",
    )
  }

  const activeStageSpecs = parsedStages.find(stage => stage.id === activeStage.id)
  if (!activeStageSpecs) {
    throw new Error(`Product stage ${activeStage.id} was not found in docs/PRD.md.`)
  }

  const existingMilestones = baseState.execution.milestones
  const existingMilestoneMap = new Map(existingMilestones.map(milestone => [milestone.id, milestone]))
  const highestTaskNumber = existingMilestones
    .flatMap(milestone => milestone.tasks)
    .reduce((highest, task) => Math.max(highest, taskNumber(task.id)), 0)

  let nextTaskNumberValue = highestTaskNumber
  let addedMilestones = 0
  let addedTasks = 0

  const mergeActiveStageMilestones = (stage: ParsedStageSpec): Milestone[] =>
    stage.milestoneSpecs.map(spec => {
      const existingMilestone = existingMilestoneMap.get(spec.id)
      const existingTaskMap = new Map(existingMilestone?.tasks.map(task => [task.prdRef, task]) ?? [])
      const parsedPrdRefs = new Set(spec.tasks.map(task => task.prdRef))

      if (existingMilestone && ["MERGED", "COMPLETE"].includes(existingMilestone.status)) {
        const appendedScope = spec.tasks.filter(task => !existingTaskMap.has(task.prdRef))
        if (appendedScope.length > 0) {
          throw new Error(
            `Milestone ${spec.id} is already ${existingMilestone.status}. Add new scope as a new milestone instead of modifying a merged milestone.`,
          )
        }
      }

      const tasks = spec.tasks.map(taskSpec => {
        const existingTask = existingTaskMap.get(taskSpec.prdRef)
        if (existingTask) {
          return {
            ...existingTask,
            name: taskSpec.name,
            prdRef: taskSpec.prdRef,
            milestoneId: spec.id,
            dod: [...taskSpec.dod],
            isUI: taskSpec.isUI,
            affectedFiles: [...taskSpec.affectedFiles],
            dependsOn: taskSpec.dependsOn?.length ? [...taskSpec.dependsOn] : undefined,
          }
        }

        addedTasks += 1
        nextTaskNumberValue += 1
        return createTaskFromSpec(taskSpec, nextTaskId(nextTaskNumberValue))
      })

      const orphanTasks = existingMilestone?.tasks.filter(task => !parsedPrdRefs.has(task.prdRef)) ?? []
      const milestone: Milestone = existingMilestone
        ? {
            ...existingMilestone,
            name: spec.name,
            productStageId: spec.productStageId,
            branch: existingMilestone.branch || spec.branch,
            worktreePath: existingMilestone.worktreePath || spec.worktreePath,
            tasks: [...tasks, ...orphanTasks],
          }
        : {
            id: spec.id,
            name: spec.name,
            productStageId: spec.productStageId,
            branch: spec.branch,
            worktreePath: spec.worktreePath,
            status: "PENDING",
            tasks,
          }

      if (!existingMilestone) {
        addedMilestones += 1
      }

      return milestone
    })

  const milestones = buildOrderedMilestones(
    existingMilestones,
    parsedStages,
    activeStage.id,
    mergeActiveStageMilestones,
  )
  const pointers = activateNextAvailableTask(milestones)
  const shouldReopenExecution = hasOpenMilestones(milestones)
  const activeStageHasOpenMilestones = milestones.some(milestone =>
    milestone.productStageId === activeStage.id &&
    !["MERGED", "COMPLETE"].includes(milestone.status),
  )

  if (activeStageHasOpenMilestones) {
    for (const stage of roadmapSync.roadmap.stages) {
      if (stage.id === activeStage.id) {
        stage.status = "ACTIVE"
        stage.deployReviewStartedAt = undefined
        stage.deployReviewedAt = undefined
        stage.completedAt = undefined
        continue
      }

      if (stage.status === "ACTIVE" && stage.id !== activeStage.id) {
        stage.status = "DEFERRED"
      }
    }
    roadmapSync.roadmap.currentStageId = activeStage.id
  }

  const nextState: ProjectState = {
    ...baseState,
    phase:
      shouldReopenExecution && ["VALIDATING", "COMPLETE"].includes(baseState.phase)
        ? "EXECUTING"
        : baseState.phase,
    roadmap: roadmapSync.roadmap,
    execution: {
      ...baseState.execution,
      currentMilestone: pointers.currentMilestone,
      currentTask: pointers.currentTask,
      currentWorktree: pointers.currentWorktree,
      milestones,
      allMilestonesComplete: !shouldReopenExecution && milestones.length > 0,
    },
    docs: {
      ...baseState.docs,
      prd: {
        ...baseState.docs.prd,
        exists: true,
        milestoneCount: activeStage.milestoneIds.length,
      },
      progress: {
        ...baseState.docs.progress,
        exists: true,
        lastUpdated: new Date().toISOString(),
      },
    },
  }

  return {
    addedMilestones,
    addedStages: roadmapSync.addedStages,
    addedTasks,
    state: nextState,
  }
}

export function bootstrapExecutionFromPrd(): ProjectState {
  const baseState = existsSync(STATE_PATH) ? readState() : initState({})
  return writeState(deriveExecutionFromPrd(baseState))
}

export function syncExecutionBacklogFromPrd(): {
  addedMilestones: number
  addedStages: number
  addedTasks: number
  state: ProjectState
} {
  const baseState = existsSync(STATE_PATH) ? readState() : initState({})
  const result = syncExecutionFromPrd(baseState)
  return {
    ...result,
    state: writeState(result.state),
  }
}
