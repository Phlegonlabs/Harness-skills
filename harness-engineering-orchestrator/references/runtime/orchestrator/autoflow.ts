import type { ProjectState } from "../../types"
import { getCurrentProductStage, hasDeferredProductStages } from "../stages"
import { runBun } from "../validation/helpers"
import { loadState, saveState, syncStateFromFilesystem } from "../validation/state"
import { dispatch } from "./dispatcher"
import { getPhaseReadiness } from "./phase-readiness"

const AUTOFLOW_MAX_STEPS = 12

function readRuntimeState(): ProjectState {
  const loaded = loadState(true)
  const state = syncStateFromFilesystem(loaded!)
  saveState(state)
  return state
}

function logStep(message: string): void {
  console.log(`• ${message}`)
}

async function runCommand(label: string, args: string[]): Promise<boolean> {
  logStep(label)
  const result = await runBun(args)
  if (result.ok) return true

  if (result.output.trim()) {
    console.error(result.output.trim())
  }
  return false
}

async function tryAdvance(): Promise<boolean> {
  return runCommand("bun harness:advance", ["run", "harness:advance"])
}

function stopAtBoundary(state: ProjectState): number {
  const next = dispatch(state)
  const readiness = getPhaseReadiness(state)
  console.log(`\nAutoflow stopped at phase ${state.phase}.`)
  if (readiness.missingOutputs.length > 0) {
    console.log("Missing outputs:")
    for (const item of readiness.missingOutputs) {
      console.log(`- ${item}`)
    }
  }
  if (next.type === "agent" && next.agentId) {
    console.log(`Next agent: ${next.agentId}`)
  } else {
    console.log(next.message)
  }
  return 0
}

function getReviewMilestone(state: ProjectState) {
  return state.execution.milestones.find(milestone => milestone.status === "REVIEW")
}

export async function runAutoflow(): Promise<number> {
  for (let step = 0; step < AUTOFLOW_MAX_STEPS; step++) {
    const state = readRuntimeState()
    const readiness = getPhaseReadiness(state)

    switch (state.phase) {
      case "DISCOVERY":
      case "MARKET_RESEARCH":
      case "TECH_STACK": {
        if (!readiness.ready) {
          return stopAtBoundary(state)
        }
        if (!(await tryAdvance())) {
          return stopAtBoundary(state)
        }
        continue
      }

      case "PRD_ARCH": {
        if (!readiness.ready) {
          return stopAtBoundary(state)
        }
        if (!(await tryAdvance())) {
          return stopAtBoundary(state)
        }
        continue
      }

      case "SCAFFOLD": {
        if (!readiness.ready) {
          return stopAtBoundary(state)
        }
        if (!(await runCommand("bun install", ["install"]))) return 1
        if (!(await runCommand("bun harness:env", ["run", "harness:env"]))) return 1
        if (!(await runCommand("bun .harness/init.ts --from-prd", [".harness/init.ts", "--from-prd"]))) return 1
        if (!(await runCommand("bun harness:validate --phase EXECUTING", ["run", "harness:validate", "--phase", "EXECUTING"]))) return 1
        return stopAtBoundary(readRuntimeState())
      }

      case "EXECUTING": {
        const reviewMilestone = getReviewMilestone(state)
        if (reviewMilestone) {
          if (
            !(await runCommand(
              `bun harness:merge-milestone ${reviewMilestone.id} (auto closeout + compact)`,
              ["run", "harness:merge-milestone", reviewMilestone.id],
            ))
          ) {
            return stopAtBoundary(readRuntimeState())
          }
          continue
        }

        const currentStage = getCurrentProductStage(state)
        if (currentStage?.status === "DEPLOY_REVIEW") {
          return stopAtBoundary(state)
        }

        if (!state.execution.allMilestonesComplete) {
          return stopAtBoundary(state)
        }

        if (hasDeferredProductStages(state)) {
          return stopAtBoundary(state)
        }

        if (!(await tryAdvance())) return 1
        continue
      }

      case "VALIDATING": {
        if (!(await tryAdvance())) {
          return stopAtBoundary(state)
        }
        continue
      }

      case "COMPLETE": {
        if (!(await runCommand("bun harness:compact", ["run", "harness:compact"]))) return 1
        if (!(await runCommand("bun harness:compact:status", ["run", "harness:compact:status"]))) return 1
        return stopAtBoundary(state)
      }
    }
  }

  console.error("Autoflow reached the maximum number of steps without settling.")
  return 1
}
