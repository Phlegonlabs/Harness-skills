#!/usr/bin/env bun
/**
 * .harness/merge-milestone.ts
 *
 * Compacts a REVIEW milestone, merges its branch into main, removes the
 * worktree, deletes the branch, and updates state to MERGED.
 */

import { completeMilestone } from "./runtime/execution"
import { readState, writeState } from "./runtime/state-core"
import { mergeMilestoneChecklist } from "./runtime/task-checklist"
import { validateMilestone } from "./runtime/validation/milestone-score"
import { createReporter } from "./runtime/validation/reporter"

function run(cmd: string[]): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" })
  return {
    ok: proc.exitCode === 0,
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
  }
}

const milestoneId = process.argv[2]
if (!milestoneId) {
  console.error("Usage: bun .harness/merge-milestone.ts M[N]")
  process.exit(1)
}

const state = readState()
const milestone = state.execution.milestones.find(m => m.id === milestoneId)
if (!milestone) {
  console.error(`❌ Milestone ${milestoneId} not found in state`)
  process.exit(1)
}
if (milestone.status !== "REVIEW") {
  console.error(`❌ Milestone ${milestoneId} is ${milestone.status}, expected REVIEW`)
  process.exit(1)
}

// Ensure we are on main or master
const branchResult = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
if (!branchResult.ok) {
  console.error("❌ Could not determine current branch")
  process.exit(1)
}
const currentBranch = branchResult.stdout
if (currentBranch !== "main" && currentBranch !== "master") {
  console.error(`❌ Must be on main or master to merge. Currently on: ${currentBranch}`)
  process.exit(1)
}

// Build merge commit message
const taskRange = milestone.tasks.length > 0
  ? `${milestone.tasks[0].id}-${milestone.tasks[milestone.tasks.length - 1].id}`
  : "no-tasks"
const mergeMessage = `feat(${milestone.id.toLowerCase()}): ${milestone.name} [${taskRange}]`

console.log(`\n🧠 Writing milestone snapshot for ${milestone.id}...`)
const compactResult = run(["bun", ".harness/compact.ts", "--milestone", "--milestone-id", milestone.id])
if (!compactResult.ok) {
  console.error(`❌ Milestone compact failed: ${compactResult.stderr || compactResult.stdout}`)
  process.exit(1)
}

// Track compactCompleted in milestone checklist
const freshState = readState()
const freshMilestone = freshState.execution.milestones.find(m => m.id === milestoneId)
if (freshMilestone) {
  freshMilestone.checklist = mergeMilestoneChecklist(freshMilestone.checklist, { compactCompleted: true })
  writeState(freshState)
}

console.log(`\n🔀 Merging ${milestone.branch} into ${currentBranch}...`)
const mergeResult = run(["git", "merge", "--no-ff", milestone.branch, "-m", mergeMessage])
if (!mergeResult.ok) {
  console.error(`❌ Merge failed: ${mergeResult.stderr}`)
  console.error("   Resolve conflicts, then re-run this command.")
  process.exit(1)
}

// Get the merge commit hash
const hashResult = run(["git", "rev-parse", "HEAD"])
const mergeCommit = hashResult.ok ? hashResult.stdout : "unknown"

// Remove worktree (warn on failure)
if (milestone.worktreePath) {
  console.log(`🗂  Removing worktree: ${milestone.worktreePath}`)
  const wtResult = run(["git", "worktree", "remove", milestone.worktreePath])
  if (!wtResult.ok) {
    console.warn(`⚠️  Could not remove worktree: ${wtResult.stderr}`)
    console.warn("   You may need to remove it manually: git worktree remove " + milestone.worktreePath)
  }
}

// Delete branch (warn on failure)
console.log(`🌿 Deleting branch: ${milestone.branch}`)
const branchDeleteResult = run(["git", "branch", "-d", milestone.branch])
if (!branchDeleteResult.ok) {
  console.warn(`⚠️  Could not delete branch: ${branchDeleteResult.stderr}`)
  console.warn("   You may need to delete it manually: git branch -D " + milestone.branch)
}

// Validate milestone checklist before completing
console.log(`\n🔍 Validating milestone ${milestoneId} checklist...`)
const preCompleteState = readState()
const reporter = createReporter()
await validateMilestone(milestoneId, preCompleteState, reporter)

// Update state
completeMilestone(milestoneId, mergeCommit)
console.log(`\n✅ Milestone ${milestoneId} merged and state updated.`)
