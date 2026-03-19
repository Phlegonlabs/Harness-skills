#!/usr/bin/env bun
/**
 * .harness/scope-change.ts
 *
 * CLI command for managing scope changes: preview, apply, reject.
 * Semi-automated flow — user confirms before PRD modifications.
 */

import { existsSync, readFileSync, writeFileSync } from "fs"
import { generatePrdDelta } from "./runtime/prd-delta"
import { syncExecutionFromPrd } from "./runtime/backlog"
import { deriveStateFromFilesystem, STATE_PATH } from "./runtime/shared"
import { writeState } from "./runtime/state-core"
import { readProjectStateFromDisk } from "./runtime/state-io"
import { appendWorkflowEvent } from "./runtime/workflow-history"
import type { ScopeChangeRequest } from "./types"

if (!existsSync(STATE_PATH)) {
  console.error("❌ .harness/state.json does not exist. Run bun .harness/init.ts to initialize.")
  process.exit(1)
}

const state = deriveStateFromFilesystem(readProjectStateFromDisk(STATE_PATH), {
  updateProgressTimestamp: false,
  updateValidationTimestamp: false,
})

const args = process.argv.slice(2)

function getPrdPath(): string {
  return state.docs.prd.path || "docs/PRD.md"
}

if (args.includes("--preview")) {
  const pending = (state.execution.pendingScopeChanges ?? []).filter(
    c => c.status === "pending" || c.status === "previewed",
  )

  if (pending.length === 0) {
    console.log("No pending scope changes.")
    process.exit(0)
  }

  const prdPath = getPrdPath()
  const prdContent = existsSync(prdPath) ? readFileSync(prdPath, "utf-8") : ""

  for (const change of pending) {
    const delta = generatePrdDelta(change, state, prdContent)
    console.log(`${"═".repeat(50)}`)
    console.log(`  Scope Change Preview: ${change.id}`)
    console.log(`${"═".repeat(50)}`)
    console.log("")
    console.log(`Source: ${change.source}`)
    console.log(`Priority: ${change.priority}`)
    console.log(`Target: ${change.targetMilestoneId ?? "new milestone"}`)
    console.log("")
    console.log("Tasks to add:")
    for (const [i, taskId] of delta.newTaskIds.entries()) {
      const proposed = change.proposedTasks[i]
      console.log(`  ${taskId}: ${proposed.name}`)
      for (const item of proposed.dod) {
        console.log(`    - ${item}`)
      }
      console.log(`    UI: ${proposed.isUI ? "yes" : "no"}`)
    }
    console.log("")
    if (delta.newMilestoneId) {
      console.log(`New Milestone: ${delta.newMilestoneId}`)
    }
    console.log(`PRD Delta: insert after line ${delta.insertAfterLine}`)
    console.log("")

    // Mark as previewed
    change.status = "previewed"
  }

  writeState(state)
  console.log("Run `bun harness:scope-change --apply` to confirm.")
  process.exit(0)
}

if (args.includes("--apply")) {
  const previewed = (state.execution.pendingScopeChanges ?? []).filter(
    c => c.status === "previewed",
  )

  if (previewed.length === 0) {
    console.log("No previewed scope changes to apply. Run --preview first.")
    process.exit(1)
  }

  const prdPath = getPrdPath()
  let prdContent = existsSync(prdPath) ? readFileSync(prdPath, "utf-8") : ""

  for (const change of previewed) {
    const delta = generatePrdDelta(change, state, prdContent)

    // Apply delta to PRD content
    const lines = prdContent.split("\n")
    lines.splice(delta.insertAfterLine + 1, 0, delta.content)
    prdContent = lines.join("\n")

    change.status = "applied"
    console.log(`✅ Applied scope change: ${change.description}`)
  }

  writeFileSync(prdPath, prdContent)

  // Remove applied changes from pending before syncing execution back from the PRD.
  state.execution.pendingScopeChanges = (state.execution.pendingScopeChanges ?? []).filter(
    c => c.status !== "applied",
  )

  const synced = syncExecutionFromPrd(state)
  appendWorkflowEvent(synced.state, {
    kind: "scope_change_applied",
    phase: synced.state.phase,
    stageId: synced.state.roadmap.currentStageId || undefined,
    summary: `Applied ${previewed.length} scope change(s): ${previewed.map(change => change.description).join("; ")}`,
    visibility: "internal",
  })
  const persisted = writeState(synced.state)

  console.log("")
  console.log(
    `PRD updated and backlog synced: +${synced.addedStages} stage(s), +${synced.addedMilestones} milestone(s), +${synced.addedTasks} task(s)`,
  )
  console.log(
    `Current task: ${persisted.execution.currentTask || "—"}  |  Worktree: ${persisted.execution.currentWorktree || "—"}`,
  )
  process.exit(0)
}

if (args.includes("--reject")) {
  const rejectId = args[args.indexOf("--reject") + 1]
  const pending = state.execution.pendingScopeChanges ?? []
  const found = pending.find(c => c.id === rejectId)

  if (!found) {
    console.error(`Scope change ${rejectId ?? "(no ID)"} not found.`)
    process.exit(1)
  }

  found.status = "rejected"
  state.execution.pendingScopeChanges = pending.filter(c => c.status !== "rejected")
  writeState(state)
  console.log(`❌ Rejected scope change: ${found.description}`)
  process.exit(0)
}

if (args.includes("--from-stdin")) {
  const input = readFileSync(0, "utf-8")
  const request = JSON.parse(input) as ScopeChangeRequest
  request.id = request.id ?? crypto.randomUUID()
  request.createdAt = request.createdAt ?? new Date().toISOString()
  request.status = "pending"

  if (args.includes("--urgent")) {
    request.priority = "urgent"
  }

  const milestoneFlag = args.indexOf("--milestone")
  if (milestoneFlag !== -1 && args[milestoneFlag + 1]) {
    request.targetMilestoneId = args[milestoneFlag + 1]
  }

  if (!state.execution.pendingScopeChanges) {
    state.execution.pendingScopeChanges = []
  }
  state.execution.pendingScopeChanges.push(request)
  appendWorkflowEvent(state, {
    kind: "scope_change_queued",
    phase: state.phase,
    stageId: state.roadmap.currentStageId || undefined,
    milestoneId: request.targetMilestoneId,
    summary: `Queued scope change: ${request.description}`,
    visibility: "internal",
  })
  writeState(state)
  console.log(`📋 Scope change queued: ${request.description}`)
  console.log("Run `bun harness:scope-change --preview` to review.")
  process.exit(0)
}

// Default: show status
const pending = (state.execution.pendingScopeChanges ?? [])
if (pending.length === 0) {
  console.log("No pending scope changes.")
} else {
  console.log(`${pending.length} scope change(s):`)
  for (const c of pending) {
    console.log(`  [${c.status}] ${c.id}: ${c.description} (${c.priority})`)
  }
}
