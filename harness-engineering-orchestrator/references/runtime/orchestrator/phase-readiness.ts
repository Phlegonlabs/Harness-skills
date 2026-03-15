import type { Phase, ProjectState } from "../../types"
import { getPhaseStructuralChecks } from "../phase-structural"
import { getCurrentProductStage } from "../stages"

type OutputCheck = {
  label: string
  ok: boolean
}

export interface PhaseReadiness {
  missingOutputs: string[]
  phase: Phase
  ready: boolean
  requiredOutputs: string[]
}

function check(label: string, ok: boolean): OutputCheck {
  return { label, ok }
}

function buildReadiness(phase: Phase, checks: OutputCheck[]): PhaseReadiness {
  return {
    missingOutputs: checks.filter(item => !item.ok).map(item => item.label),
    phase,
    ready: checks.every(item => item.ok),
    requiredOutputs: checks.map(item => item.label),
  }
}

function nextPhaseForReadiness(phase: Phase): Phase {
  switch (phase) {
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
    default:
      return phase
  }
}

export function getPhaseReadiness(state: ProjectState): PhaseReadiness {
  switch (state.phase) {
    case "DISCOVERY":
    case "MARKET_RESEARCH":
    case "TECH_STACK":
    case "PRD_ARCH":
    case "SCAFFOLD":
      return buildReadiness(
        state.phase,
        getPhaseStructuralChecks(nextPhaseForReadiness(state.phase), state).map(item => check(item.label, item.ok)),
      )
    case "EXECUTING":
      if (getCurrentProductStage(state)?.status === "DEPLOY_REVIEW") {
        return buildReadiness(state.phase, [
          check("current product stage is waiting on deploy / real-world review", true),
        ])
      }
      return buildReadiness(state.phase, [
        check("execution backlog has at least 1 milestone", state.execution.milestones.length > 0),
        check(
          "there is an active milestone or a milestone in REVIEW",
          Boolean(state.execution.currentMilestone) || state.execution.milestones.some(item => item.status === "REVIEW"),
        ),
      ])
    case "VALIDATING":
      return buildReadiness(state.phase, [
        check("all milestones are complete", state.execution.allMilestonesComplete),
      ])
    case "COMPLETE":
      return buildReadiness(state.phase, [])
  }
}
