#!/usr/bin/env bun
/**
 * .harness/validate.ts
 *
 * Harness validation script — cross-platform (Windows + macOS + Linux)
 * Corresponds to spec: references/gates-and-guardians.md
 */

import type { Phase } from "./types"
import { validateEnv, validateGuardians } from "./runtime/validation/env-and-guardians"
import { validateMilestone, fullValidation } from "./runtime/validation/milestone-score"
import { validatePhaseGate } from "./runtime/validation/phase"
import { createReporter } from "./runtime/validation/reporter"
import { loadState, saveState, syncStateFromFilesystem } from "./runtime/validation/state"
import { validateTask } from "./runtime/validation/task"

const args = process.argv.slice(2)
const reporter = createReporter()

if (args.includes("--env")) {
  await validateEnv(reporter)
  reporter.finish()
}

if (args.includes("--guardian")) {
  const guardianState = loadState(false)
  const syncedGuardianState = guardianState ? syncStateFromFilesystem(guardianState) : undefined
  if (syncedGuardianState) saveState(syncedGuardianState)
  await validateGuardians(reporter, syncedGuardianState)
  reporter.finish()
}

const loadedState = loadState(true)
const state = syncStateFromFilesystem(loadedState!)
saveState(state)

if (args.includes("--phase")) {
  const phase = args[args.indexOf("--phase") + 1] as Phase | undefined
  if (!phase) {
    reporter.failSoft("Please provide a --phase value, e.g. bun .harness/validate.ts --phase EXECUTING")
    reporter.finish()
  }
  await validatePhaseGate(phase!, state, reporter)
  reporter.finish()
}

if (args.includes("--task")) {
  const taskId = args[args.indexOf("--task") + 1]
  if (!taskId) {
    reporter.failSoft("Please provide a --task value, e.g. bun .harness/validate.ts --task T001")
    reporter.finish()
  }
  await validateTask(taskId!, state, reporter)
  reporter.finish()
}

if (args.includes("--milestone")) {
  const milestoneId = args[args.indexOf("--milestone") + 1]
  if (!milestoneId) {
    reporter.failSoft("Please provide a --milestone value, e.g. bun .harness/validate.ts --milestone M1")
    reporter.finish()
  }
  await validateMilestone(milestoneId!, state, reporter)
  reporter.finish()
}

fullValidation(state, reporter)
reporter.finish()
