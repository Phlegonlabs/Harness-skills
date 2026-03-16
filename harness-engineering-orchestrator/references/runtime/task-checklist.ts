import type { MilestoneChecklist, SpikeChecklist, TaskChecklist } from "../types"

export function createEmptyTaskChecklist(): TaskChecklist {
  return {
    prdDodMet: false,
    typecheckPassed: false,
    lintPassed: false,
    formatPassed: false,
    testsPassed: false,
    buildPassed: false,
    fileSizeOk: false,
    noForbiddenPatterns: false,
    atomicCommitDone: false,
    progressUpdated: false,
  }
}

export function createEmptySpikeChecklist(): SpikeChecklist {
  return {
    evaluationNoteWritten: false,
    adrGenerated: false,
  }
}

export function mergeTaskChecklist(
  current?: Partial<TaskChecklist> | null,
  updates?: Partial<TaskChecklist>,
): TaskChecklist {
  return {
    ...createEmptyTaskChecklist(),
    ...(current ?? {}),
    ...(updates ?? {}),
  }
}

export function mergeSpikeChecklist(
  current?: Partial<SpikeChecklist> | null,
  updates?: Partial<SpikeChecklist>,
): SpikeChecklist {
  return {
    ...createEmptySpikeChecklist(),
    ...(current ?? {}),
    ...(updates ?? {}),
  }
}

export function createEmptyMilestoneChecklist(): MilestoneChecklist {
  return {
    allTasksComplete: false,
    typecheckPassed: false,
    lintPassed: false,
    formatPassed: false,
    testsPassed: false,
    buildPassed: false,
    coverageMet: false,
    fileSizeOk: false,
    noBlockingForbiddenPatterns: false,
    agentsMdSynced: false,
    changelogUpdated: false,
    gitbookGuidePresent: false,
    compactCompleted: false,
  }
}

export function mergeMilestoneChecklist(
  current?: Partial<MilestoneChecklist> | null,
  updates?: Partial<MilestoneChecklist>,
): MilestoneChecklist {
  const base = createEmptyMilestoneChecklist()
  const merged = { ...base, ...(current ?? {}), ...(updates ?? {}) }
  // OR-merge: once true, stays true
  for (const key of Object.keys(base) as (keyof MilestoneChecklist)[]) {
    if ((current as Record<string, boolean> | null)?.[key] === true) {
      merged[key] = true
    }
  }
  return merged
}
