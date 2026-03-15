#!/usr/bin/env bun
/**
 * harness-init.ts
 *
 * State management utility for Phase 4/5.
 * Responsibilities:
 * - initialize .harness/state.json
 * - parse milestone / task backlog from docs/PRD.md or docs/prd/
 * - synchronize docs/PROGRESS.md and docs/progress/ after state changes
 */

import { existsSync } from "fs"
import { bootstrapExecutionFromPrd, syncExecutionBacklogFromPrd } from "./runtime/backlog"
import { advancePhase, blockTask, completeMilestone, completeTask } from "./runtime/execution"
import { getLearningPaths, syncLearning } from "./runtime/learning"
import { ensureProjectDirs, initState, readState, updateState, writeState } from "./runtime/state-core"
import { STATE_PATH } from "./runtime/shared"

export {
  advancePhase,
  blockTask,
  bootstrapExecutionFromPrd,
  completeMilestone,
  completeTask,
  getLearningPaths,
  initState,
  syncExecutionBacklogFromPrd,
  syncLearning,
  updateState,
}

function getArgValue(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const inline = args.find(arg => arg.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)

  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const next = args[index + 1]
  return next && !next.startsWith("--") ? next : undefined
}

if (import.meta.main) {
  ensureProjectDirs()

  try {
    if (process.argv.includes("--from-prd")) {
      const updated = bootstrapExecutionFromPrd()
      console.log(`✅ Created ${updated.execution.milestones.length} milestone(s) from docs/prd/ (or docs/PRD.md)`)
      console.log(
        `   Current task: ${updated.execution.currentTask || "—"}  |  Worktree: ${updated.execution.currentWorktree || "—"}`,
      )
    } else if (process.argv.includes("--sync-from-prd")) {
      const updated = syncExecutionBacklogFromPrd()
      console.log(
        `✅ Synced PRD backlog: +${updated.addedStages} stage(s), +${updated.addedMilestones} milestone(s), +${updated.addedTasks} task(s)`,
      )
      console.log(
        `   Current task: ${updated.state.execution.currentTask || "—"}  |  Worktree: ${updated.state.execution.currentWorktree || "—"}`,
      )
    } else if (process.argv.includes("--complete-task")) {
      const taskId = getArgValue("--complete-task")
      const commitHash = getArgValue("--commit")

      if (!taskId || !commitHash) {
        console.error("Usage: bun .harness/init.ts --complete-task T001 --commit <hash>")
        process.exit(1)
      }

      completeTask(taskId, commitHash)
    } else if (!existsSync(STATE_PATH)) {
      const state = writeState(initState({}))
      console.log("✅ .harness/state.json initialized")
      console.log(`   Phase: ${state.phase}`)
      console.log("   Next step: fill in projectInfo, then run bun harness:advance")
    } else {
      const state = writeState(readState())
      console.log("ℹ️  .harness/state.json already exists; derived state and PROGRESS.md were synchronized")
      console.log(`   Phase: ${state.phase}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
