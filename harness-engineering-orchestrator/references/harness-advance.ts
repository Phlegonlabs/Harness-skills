#!/usr/bin/env bun
/**
 * .harness/advance.ts
 *
 * Runtime-owned phase advancement entrypoint.
 * Validates the next phase gate first, then advances state only if the gate passes.
 */

import type { Phase, ProjectState } from "./types"
import { deriveExecutionFromPrd } from "./runtime/backlog"
import { syncPublicManagedDocs } from "./runtime/public-docs"
import { getCurrentProductStage, hasDeferredProductStages } from "./runtime/stages"
import { validatePhaseGate } from "./runtime/validation/phase"
import { loadState, saveState, syncStateFromFilesystem } from "./runtime/validation/state"
import { appendWorkflowEvent, createPhaseAdvancedEvent, createTaskStartedEvent } from "./runtime/workflow-history"

type ReporterState = {
  failCount: number
  warnCount: number
  passCount: number
}

function createAdvanceReporter(state: ReporterState) {
  return {
    pass(message: string) {
      console.log(`  ✅ ${message}`)
      state.passCount++
    },
    warn(message: string) {
      console.warn(`  ⚠️  ${message}`)
      state.warnCount++
    },
    failSoft(message: string, hint?: string) {
      console.error(`  ❌ ${message}`)
      if (hint) console.error(`     → ${hint}`)
      state.failCount++
    },
    section(title: string) {
      console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`)
    },
    finish() {
      throw new Error("advance reporter does not support finish()")
    },
  }
}

function getNextPhase(current: Phase): Phase | null {
  switch (current) {
    case "DISCOVERY":
      return "MARKET_RESEARCH"
    case "MARKET_RESEARCH":
      return "TECH_STACK"
    case "TECH_STACK":
      return "PRD_ARCH"
    case "PRD_ARCH":
      return "SCAFFOLD"
    case "SCAFFOLD":
      return "EXECUTING"
    case "EXECUTING":
      return "VALIDATING"
    case "VALIDATING":
      return "COMPLETE"
    case "COMPLETE":
      return null
  }
}

function getCurrentExecutionTask(state: ProjectState) {
  const milestone = state.execution.milestones.find(candidate => candidate.id === state.execution.currentMilestone)
  const task = milestone?.tasks.find(candidate => candidate.id === state.execution.currentTask)
  return milestone && task ? { milestone, task } : null
}

async function validateGateOrExit(phase: Phase, state: ProjectState): Promise<void> {
  const reporterState: ReporterState = { passCount: 0, warnCount: 0, failCount: 0 }
  const reporter = createAdvanceReporter(reporterState)
  await validatePhaseGate(phase, state, reporter)

  if (reporterState.failCount > 0) {
    console.error(`\n${reporterState.failCount} issue(s) need to be fixed. See references/gates-and-guardians.md`)
    process.exit(1)
  }
}

const loaded = loadState(true)
const state = syncStateFromFilesystem(loaded!)
saveState(state)

const currentStage = getCurrentProductStage(state)
if (
  state.phase === "EXECUTING" &&
  currentStage?.status === "DEPLOY_REVIEW" &&
  hasDeferredProductStages(state)
) {
  console.error(
    `❌ Product stage ${currentStage.id} is waiting on deploy / real-world review and the roadmap still has deferred follow-up stages.`,
  )
  console.error("   Promote the next stage explicitly after updating PRD / Architecture:")
  console.error("   bun harness:stage --promote V[N]")
  process.exit(1)
}

const nextPhase = getNextPhase(state.phase)
if (!nextPhase) {
  console.log("ℹ️  Project is already at COMPLETE. No further phase advancement is available.")
  process.exit(0)
}

let nextState = state
if (state.phase === "SCAFFOLD") {
  nextState = deriveExecutionFromPrd(state)
} else {
  nextState = { ...state, phase: nextPhase }
}

await validateGateOrExit(nextPhase, nextState)

appendWorkflowEvent(
  nextState,
  createPhaseAdvancedEvent(state.phase, nextState.phase, {
    stageId: nextState.roadmap.currentStageId || undefined,
  }),
)

const currentExecutionTask = getCurrentExecutionTask(nextState)
if (currentExecutionTask) {
  appendWorkflowEvent(
    nextState,
    createTaskStartedEvent(nextState.phase, currentExecutionTask.milestone, currentExecutionTask.task),
  )
}

const persisted = syncPublicManagedDocs(nextState, {
  stageId: nextState.roadmap.currentStageId || undefined,
  summary: `Public docs synced after phase advanced to ${nextState.phase}`,
}).state
console.log(`\n✅ phase advanced: ${state.phase} -> ${persisted.phase}`)
if (persisted.phase === "EXECUTING") {
  console.log(`   Current Task: ${persisted.execution.currentTask || "—"}  |  Worktree: ${persisted.execution.currentWorktree || "—"}`)
}
