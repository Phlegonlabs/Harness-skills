#!/usr/bin/env bun

import { addSurfaceToState } from "./runtime/automation"
import { ensureEnvLocalSkeleton } from "./runtime/env-local"
import { getManagedDocSpecs, getManagedSkillSpecs, syncManagedFiles } from "./runtime/generated-files"
import { syncLocalBootstrapManifest } from "./runtime/local-bootstrap"
import { readState, writeState } from "./runtime/state-core"
import { validatePhaseGate } from "./runtime/validation/phase"

type ReporterState = {
  failCount: number
  passCount: number
  warnCount: number
}

function createInlineReporter(state: ReporterState) {
  return {
    pass(message: string) {
      console.log(`  ✅ ${message}`)
      state.passCount++
    },
    warn(message: string) {
      console.log(`  ⚠️  ${message}`)
      state.warnCount++
    },
    failSoft(message: string, hint?: string) {
      console.log(`  ❌ ${message}`)
      if (hint) console.log(`     → ${hint}`)
      state.failCount++
    },
    section(title: string) {
      console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`)
    },
    finish(): never {
      throw new Error("inline reporter does not support finish()")
    },
  }
}

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const inline = args.find(arg => arg.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)

  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const next = args[index + 1]
  return next && !next.startsWith("--") ? next : undefined
}

const type = getArg("--type")
const workspace = getArg("--workspace")

if (!type) {
  console.error("Usage: bun .harness/add-surface.ts --type <web-app|ios-app|cli|agent|desktop> [--workspace <name>]")
  process.exit(1)
}

const state = readState()
const result = addSurfaceToState(state, type, workspace)
syncManagedFiles(getManagedDocSpecs(result.state))
syncManagedFiles(getManagedSkillSpecs(result.state))
const updated = writeState(result.state)
ensureEnvLocalSkeleton(updated)
syncLocalBootstrapManifest()

const validationPhase: "SCAFFOLD" | "EXECUTING" =
  ["EXECUTING", "VALIDATING", "COMPLETE"].includes(updated.phase) ? "EXECUTING" : "SCAFFOLD"

const reporterState: ReporterState = { failCount: 0, passCount: 0, warnCount: 0 }
await validatePhaseGate(validationPhase, updated, createInlineReporter(reporterState))

if (reporterState.failCount > 0) {
  console.error(`\n${reporterState.failCount} issue(s) need to be fixed after adding the new surface.`)
  process.exit(1)
}

console.log(
  `✅ surface ${result.changed ? "added" : "reconciled"}: ${result.surface} -> apps/${result.workspace}`,
)
