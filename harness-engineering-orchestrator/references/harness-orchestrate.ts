#!/usr/bin/env bun
/**
 * .harness/orchestrate.ts
 *
 * Parent-runtime launcher contract for one child-agent launch cycle.
 * It prepares a machine-readable launch packet, optionally reserves task-agent
 * ownership in state, and exposes lifecycle commands for confirm / rollback / release.
 *
 * Child spawning still belongs to the parent runtime (Codex / Claude), not Bun.
 */

import { existsSync } from "fs"
import { detectPlatform } from "./runtime/orchestrator/context-builder"
import {
  confirmLaunch,
  prepareLaunchCycle,
  releaseLaunch,
  rollbackLaunch,
} from "./runtime/orchestrator/launcher"
import { deriveStateFromFilesystem, STATE_PATH } from "./runtime/shared"
import { readProjectStateFromDisk } from "./runtime/state-io"

function getArgValue(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const inline = args.find(arg => arg.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)

  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const next = args[index + 1]
  return next && !next.startsWith("--") ? next : undefined
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function renderCycleSummary(cyclePath: string, cycle: NonNullable<ReturnType<typeof prepareLaunchCycle>["cycle"]>): string {
  const lines: string[] = []
  lines.push(`${"═".repeat(50)}`)
  lines.push("  Harness Launcher")
  lines.push(`${"═".repeat(50)}`)
  lines.push("")
  lines.push(`Cycle ID: ${cycle.cycleId}`)
  lines.push(`Mode: ${cycle.mode}`)
  lines.push(`State Version: ${cycle.stateVersion}`)
  lines.push(`Planner: ${cycle.plannerCommand}`)
  lines.push(`Launcher: ${cycle.launcherCommand}`)
  lines.push(`Cycle File: ${cyclePath}`)
  lines.push("")

  for (const [index, launch] of cycle.launches.entries()) {
    if (cycle.launches.length > 1) {
      lines.push(`${"─".repeat(40)} Launch ${index + 1}`)
    } else {
      lines.push(`${"─".repeat(40)} Launch`)
    }
    lines.push(`Launch ID: ${launch.launchId}`)
    lines.push(`Agent: ${launch.logicalAgentId}`)
    lines.push(`Kind: ${launch.kind}`)
    lines.push(`Status: ${launch.status}`)
    lines.push(`Spec: ${launch.packet.specPath}`)
    if (launch.packet.currentMilestone) {
      lines.push(`Milestone: ${launch.packet.currentMilestone.id} — ${launch.packet.currentMilestone.name}`)
    }
    if (launch.packet.currentTask) {
      lines.push(`Task: ${launch.packet.currentTask.id} — ${launch.packet.currentTask.name}`)
    }
    lines.push(`Validation: ${launch.lifecycle.validationCommand}`)
    if (launch.lifecycle.confirmCommand) {
      lines.push(`Confirm: ${launch.lifecycle.confirmCommand}`)
    }
    if (launch.lifecycle.releaseCommand) {
      lines.push(`Release: ${launch.lifecycle.releaseCommand}`)
    }
    if (launch.lifecycle.rollbackCommand) {
      lines.push(`Rollback: ${launch.lifecycle.rollbackCommand}`)
    }
    lines.push("")
    lines.push(launch.prompt)
    if (launch.postAction) {
      lines.push("")
      lines.push(`${"─".repeat(24)} Post-Action`)
      lines.push(launch.postAction)
    }
    lines.push("")
  }

  return lines.join("\n").trimEnd()
}

function renderLifecycleSummary(
  action: "confirmed" | "released" | "rolled-back",
  result: ReturnType<typeof confirmLaunch> | ReturnType<typeof releaseLaunch> | ReturnType<typeof rollbackLaunch>,
): string {
  const lines: string[] = []
  lines.push(`${action.toUpperCase()}: ${result.launch.launchId}`)
  lines.push(`Cycle: ${result.cycle.cycleId}`)
  lines.push(`Cycle File: ${result.cyclePath}`)
  lines.push(`Agent: ${result.launch.logicalAgentId}`)
  lines.push(`Status: ${result.launch.status}`)
  if (result.launch.packet.currentTask) {
    lines.push(`Task: ${result.launch.packet.currentTask.id}`)
  }
  return lines.join("\n")
}

if (!existsSync(STATE_PATH)) {
  console.error("❌ .harness/state.json does not exist. Run bun .harness/init.ts to initialize.")
  process.exit(1)
}

const confirmId = getArgValue("--confirm")
const rollbackId = getArgValue("--rollback")
const releaseId = getArgValue("--release")
const jsonMode = hasFlag("--json")

try {
  if (confirmId) {
    const handle = getArgValue("--handle")
    if (!handle) {
      throw new Error("Usage: bun .harness/orchestrate.ts --confirm <launchId> --handle <runtime-handle>")
    }

    const result = confirmLaunch(confirmId, handle)
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(renderLifecycleSummary("confirmed", result))
    }
    process.exit(0)
  }

  if (rollbackId) {
    const reason = getArgValue("--reason") ?? "launcher rollback"
    const result = rollbackLaunch(rollbackId, reason)
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(renderLifecycleSummary("rolled-back", result))
    }
    process.exit(0)
  }

  if (releaseId) {
    const result = releaseLaunch(releaseId)
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(renderLifecycleSummary("released", result))
    }
    process.exit(0)
  }

  const state = deriveStateFromFilesystem(readProjectStateFromDisk(STATE_PATH), {
    updateProgressTimestamp: false,
    updateValidationTimestamp: false,
  })
  const platform = detectPlatform()
  const prepareResult = prepareLaunchCycle(state, {
    launcherCommand: `bun .harness/orchestrate.ts${process.argv.slice(2).length > 0 ? ` ${process.argv.slice(2).join(" ")}` : ""}`,
    parallel: hasFlag("--parallel"),
    platform,
    reserve: !hasFlag("--no-reserve"),
    reviewMode: hasFlag("--review") ? "design" : hasFlag("--code-review") ? "code" : undefined,
  })

  if (!prepareResult.cycle || !prepareResult.cyclePath) {
    const fallback =
      prepareResult.plannerDispatches[0]
      ?? { message: "No launchable child action is available.", type: "none" as const }

    if (jsonMode) {
      console.log(JSON.stringify(fallback, null, 2))
    } else {
      console.log(fallback.message)
    }
    process.exit(1)
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      cycle: prepareResult.cycle,
      cyclePath: prepareResult.cyclePath,
    }, null, 2))
  } else {
    console.log(renderCycleSummary(prepareResult.cyclePath, prepareResult.cycle))
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
