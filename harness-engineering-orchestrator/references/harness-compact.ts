#!/usr/bin/env bun
/**
 * harness-compact.ts
 *
 * Context health management for AI agents.
 * Generates CONTEXT_SNAPSHOT.md with retention-tiered information
 * so agents can safely compact conversation context.
 *
 * Usage:
 *   bun .harness/compact.ts              → Task-level snapshot
 *   bun .harness/compact.ts --milestone  → Milestone-level archive + suggest /clear
 *   bun .harness/compact.ts --milestone --milestone-id M[N] → Archive a specific milestone during closeout
 *   bun .harness/compact.ts --status     → Show context health advice
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const STATE_PATH = ".harness/state.json"
const SNAPSHOT_PATH = "docs/progress/CONTEXT_SNAPSHOT.md"
const ADR_DIR = "docs/adr"
const PROGRESS_DIR = "docs/progress"

interface MinimalState {
  docs: {
    architecture: {
      version: string
    }
    prd: {
      version: string
    }
  }
  phase: string
  roadmap: {
    currentStageId: string
    stages: Array<{
      id: string
      name: string
      status: string
    }>
  }
  execution: {
    currentMilestone: string
    currentTask: string
    currentWorktree: string
    milestones: MinimalMilestone[]
  }
}

interface MinimalMilestone {
  id: string
  name: string
  status: string
  tasks: Array<{
    id: string
    name: string
    status: string
    commitHash?: string
  }>
}

function readState(): MinimalState | null {
  if (!existsSync(STATE_PATH)) return null
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as MinimalState
  } catch {
    return null
  }
}

function collectAdrSummaries(): string[] {
  if (!existsSync(ADR_DIR)) return []
  return readdirSync(ADR_DIR)
    .filter(f => /^ADR-\d{3}.*\.md$/i.test(f))
    .sort()
    .slice(-5)
    .map(file => {
      const content = readFileSync(join(ADR_DIR, file), "utf-8")
      const heading = content.match(/^#\s+(.+)/m)?.[1] ?? file
      return `- ${file}: ${heading}`
    })
}

function collectRecentLearning(): string[] {
  const home = Bun.env.HOME ?? Bun.env.USERPROFILE ?? ""
  const sep = process.platform === "win32" ? "\\" : "/"
  const paths = [
    `${home}${sep}.codex${sep}LEARNING.md`,
    `${home}${sep}.claude${sep}LEARNING.md`,
  ]

  for (const p of paths) {
    if (!existsSync(p)) continue
    const content = readFileSync(p, "utf-8")
    const entries = content.split(/^##\s+/m).filter(Boolean).slice(-5)
    if (entries.length > 0) {
      return entries.map(e => `- ${e.split("\n")[0]?.trim() ?? "(untitled)"}`)
    }
  }
  return []
}

function getCompletedTasks(state: MinimalState): Array<{ id: string; name: string; commitHash?: string }> {
  return state.execution.milestones
    .flatMap(m => m.tasks)
    .filter(t => t.status === "DONE")
    .slice(-3)
}

function resolveMilestoneTarget(state: MinimalState, milestoneId?: string): MinimalMilestone | undefined {
  if (milestoneId) {
    return state.execution.milestones.find(milestone => milestone.id === milestoneId)
  }

  return state.execution.milestones.find(m => m.id === state.execution.currentMilestone)
}

function getRemainingTasks(
  state: MinimalState,
  milestoneId?: string,
): Array<{ id: string; name: string; status: string }> {
  const milestone = resolveMilestoneTarget(state, milestoneId)
  if (!milestone) return []
  return milestone.tasks.filter(t => t.status !== "DONE" && t.status !== "SKIPPED")
}

function getMilestoneArchiveTasks(
  milestone?: MinimalMilestone,
): Array<{ commitHash?: string; id: string; name: string; status: string }> {
  return milestone?.tasks ?? []
}

function generateSnapshot(state: MinimalState, isMilestone: boolean, milestoneId?: string): string {
  const now = new Date().toISOString()
  const recentTasks = getCompletedTasks(state)
  const targetMilestone = resolveMilestoneTarget(state, milestoneId)
  const currentStage =
    state.roadmap.stages.find(stage => stage.id === state.roadmap.currentStageId)
    ?? state.roadmap.stages.find(stage => stage.status === "ACTIVE")
    ?? state.roadmap.stages.find(stage => stage.status === "DEPLOY_REVIEW")
  const remaining = getRemainingTasks(state, milestoneId)
  const archiveTasks = getMilestoneArchiveTasks(targetMilestone)
  const adrSummaries = collectAdrSummaries()
  const learningEntries = collectRecentLearning()

  const lines: string[] = []
  lines.push(`# CONTEXT_SNAPSHOT`)
  lines.push(``)
  lines.push(`> Generated: ${now}`)
  lines.push(`> Mode: ${isMilestone ? "milestone" : "task"}`)
  lines.push(``)

  // 🔴 RETAIN
  lines.push(`## 🔴 RETAIN — Must Keep`)
  lines.push(``)
  lines.push(`- **Phase**: ${state.phase}`)
  lines.push(`- **Product Stage**: ${currentStage ? `${currentStage.id} — ${currentStage.name} [${currentStage.status}]` : "—"}`)
  lines.push(`- **PRD Version**: ${state.docs.prd.version}`)
  lines.push(`- **Architecture Version**: ${state.docs.architecture.version}`)
  lines.push(`- **Milestone**: ${targetMilestone?.id ?? state.execution.currentMilestone}`)
  lines.push(`- **Task**: ${state.execution.currentTask}`)
  lines.push(`- **Worktree**: ${state.execution.currentWorktree || "main"}`)
  lines.push(``)
  if (adrSummaries.length > 0) {
    lines.push(`### Recent ADR Decisions`)
    lines.push(``)
    for (const adr of adrSummaries) {
      lines.push(adr)
    }
    lines.push(``)
  }

  // 🟡 PREFER
  lines.push(`## 🟡 PREFER — Keep if Possible`)
  lines.push(``)
  if (recentTasks.length > 0) {
    lines.push(`### Last ${recentTasks.length} Completed Tasks`)
    lines.push(``)
    for (const t of recentTasks) {
      lines.push(`- ${t.id}: ${t.name}${t.commitHash ? ` (${t.commitHash.slice(0, 7)})` : ""}`)
    }
    lines.push(``)
  }
  if (!isMilestone && remaining.length > 0) {
    lines.push(`### Remaining Tasks (current milestone)`)
    lines.push(``)
    for (const t of remaining) {
      lines.push(`- ${t.id}: ${t.name} [${t.status}]`)
    }
    lines.push(``)
  }
  if (learningEntries.length > 0) {
    lines.push(`### Recent LEARNING.md Entries`)
    lines.push(``)
    for (const entry of learningEntries) {
      lines.push(entry)
    }
    lines.push(``)
  }

  // 🟢 SAFE TO DISCARD
  lines.push(`## 🟢 SAFE TO DISCARD`)
  lines.push(``)
  lines.push(`- Old typecheck/lint/test/build full output from completed Tasks`)
  lines.push(`- Debug loop intermediate attempts`)
  lines.push(`- Design Review detailed line-by-line comparisons`)
  lines.push(`- Full file contents that were read but not modified`)
  lines.push(`- Git diff/log output from completed Tasks`)
  lines.push(``)

  if (isMilestone) {
    lines.push(`## 📦 Milestone Archive`)
    lines.push(``)
    if (targetMilestone) {
      lines.push(`- Target milestone: ${targetMilestone.id} — ${targetMilestone.name} [${targetMilestone.status}]`)
      lines.push(``)
      lines.push(`### Milestone Tasks`)
      lines.push(``)
      for (const task of archiveTasks) {
        lines.push(
          `- ${task.id}: ${task.name} [${task.status}]${task.commitHash ? ` (${task.commitHash.slice(0, 7)})` : ""}`,
        )
      }
      lines.push(``)
    }
    lines.push(`All Tasks in the target milestone have been completed and are ready for merge closeout.`)
    lines.push(`Consider running \`/compact\` with the above snapshot as retention guidance.`)
    lines.push(``)
  }

  return lines.join("\n")
}

function showStatus(state: MinimalState | null): void {
  console.log(`\n${"═".repeat(50)}`)
  console.log("  Context Health Status")
  console.log(`${"═".repeat(50)}\n`)

  if (!state) {
    console.log("⚠️  No state.json found. Run: bun .harness/init.ts")
    return
  }

  console.log(`Phase:     ${state.phase}`)
  console.log(
    `Stage:     ${
      state.roadmap.stages.find(stage => stage.id === state.roadmap.currentStageId)?.id
      ?? state.roadmap.stages.find(stage => stage.status === "ACTIVE")?.id
      ?? "—"
    }`,
  )
  console.log(`PRD:       ${state.docs.prd.version}`)
  console.log(`Arch:      ${state.docs.architecture.version}`)
  console.log(`Milestone: ${state.execution.currentMilestone}`)
  console.log(`Task:      ${state.execution.currentTask}`)
  console.log(`Worktree:  ${state.execution.currentWorktree || "main"}`)
  console.log("")

  const snapshotExists = existsSync(SNAPSHOT_PATH)
  if (snapshotExists) {
    const content = readFileSync(SNAPSHOT_PATH, "utf-8")
    const match = content.match(/Generated:\s*(.+)/)
    console.log(`Last snapshot: ${match?.[1] ?? "unknown"}`)
  } else {
    console.log("Last snapshot: none")
  }

  console.log("")
  console.log("Recommendations:")
  console.log("  • Run `bun harness:compact` after each Task completion")
  console.log("  • Milestone closeout auto-runs `bun .harness/compact.ts --milestone --milestone-id M[N]`")
  console.log("  • Use snapshot as /compact retention guidance")
  console.log("")
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isMilestone = args.includes("--milestone")
const isStatus = args.includes("--status")
const milestoneId =
  args.find(arg => arg.startsWith("--milestone-id="))?.slice("--milestone-id=".length) ??
  (() => {
    const index = args.indexOf("--milestone-id")
    const next = index === -1 ? undefined : args[index + 1]
    return next && !next.startsWith("--") ? next : undefined
  })()

const state = readState()

if (isStatus) {
  showStatus(state)
  process.exit(0)
}

if (!state) {
  console.error("❌ .harness/state.json not found. Run: bun .harness/init.ts")
  process.exit(1)
}

if (isMilestone && milestoneId && !resolveMilestoneTarget(state, milestoneId)) {
  console.error(`❌ Milestone ${milestoneId} was not found in .harness/state.json`)
  process.exit(1)
}

const snapshot = generateSnapshot(state, isMilestone, milestoneId)

mkdirSync(PROGRESS_DIR, { recursive: true })
writeFileSync(SNAPSHOT_PATH, snapshot)

console.log(`\n✅ CONTEXT_SNAPSHOT.md ${isMilestone ? "(milestone)" : "(task)"} written to ${SNAPSHOT_PATH}`)
if (isMilestone) {
  console.log("\n💡 Milestone complete. Consider running /compact to clear conversation context.")
}
console.log("")
