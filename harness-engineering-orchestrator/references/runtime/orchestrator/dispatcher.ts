import type { AgentId, AgentTaskPacket, Milestone, ProjectState, Task } from "../../types"
import {
  countExecutionMilestonesForStage,
  getActiveProductStage,
  getCurrentProductStage,
  getNextDeferredProductStage,
  hasDeferredProductStages,
} from "../stages"
import { getPhaseStructuralChecks } from "../phase-structural"
import {
  getAgentEntry,
  getUnsupportedPhaseGuidance,
  needsFrontendDesigner,
} from "./agent-registry"
import { buildAgentTaskPacket, renderAgentTaskPacket } from "./context-builder"
import { getPhaseReadiness } from "./phase-readiness"

export interface DispatchResult {
  type: "agent" | "manual" | "none"
  agentId?: AgentId
  context?: string
  message: string
  packet?: AgentTaskPacket
  postAction?: string
}

function getCurrentMilestone(state: ProjectState): Milestone | undefined {
  return state.execution.milestones.find(m => m.id === state.execution.currentMilestone)
}

function getCurrentTask(state: ProjectState): Task | undefined {
  return state.execution.milestones
    .flatMap(m => m.tasks)
    .find(t => t.id === state.execution.currentTask)
}

function needsBacklogSync(state: ProjectState): boolean {
  const activeStage = getActiveProductStage(state)
  if (!activeStage) return false
  return state.docs.prd.milestoneCount > countExecutionMilestonesForStage(state, activeStage.id)
}

function agentDispatch(
  agentId: AgentId,
  state: ProjectState,
  postAction?: string,
): DispatchResult {
  const entry = getAgentEntry(agentId)
  if (!entry) {
    return { type: "none", message: `Agent "${agentId}" not found in registry.` }
  }
  const packet = buildAgentTaskPacket(agentId, state)
  const context = renderAgentTaskPacket(packet)
  return {
    type: "agent",
    agentId,
    context,
    message: entry.name,
    packet,
    postAction,
  }
}

function manualGuidance(message: string): DispatchResult {
  return { type: "manual", message }
}

function noAction(message: string): DispatchResult {
  return { type: "none", message }
}

function phaseAdvanceGuidance(lines: string[]): DispatchResult {
  return manualGuidance(lines.join("\n"))
}

function getDiscoveryAction(state: ProjectState): DispatchResult {
  const readiness = getPhaseReadiness(state)
  if (readiness.ready) {
    return phaseAdvanceGuidance([
      "Discovery outputs are ready.",
      "Run:",
      "  bun harness:advance",
      "  bun .harness/orchestrator.ts",
    ])
  }

  return agentDispatch(
    "project-discovery",
    state,
    [
      "After completing Q0-Q9:",
      "1. bun harness:advance",
      "2. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getExecutingAction(state: ProjectState): DispatchResult {
  const currentStage = getCurrentProductStage(state)
  if (currentStage?.status === "DEPLOY_REVIEW") {
    const nextDeferredStage = getNextDeferredProductStage(state)
    if (nextDeferredStage) {
      return manualGuidance(
        `Product stage ${currentStage.id} is in DEPLOY_REVIEW.\n` +
        "Deploy and test the current version in the real environment before activating the next stage.\n" +
        `When the next version is ready in PRD / Architecture, run:\n` +
        `  bun harness:stage --promote ${nextDeferredStage.id}\n` +
        "  bun .harness/orchestrator.ts"
      )
    }

    return manualGuidance(
      `Product stage ${currentStage.id} is in DEPLOY_REVIEW.\n` +
      "Deploy and test the current version in the real environment.\n" +
      "If no next stage is planned, run:\n" +
      "  bun harness:advance"
    )
  }

  const milestone = getCurrentMilestone(state)
  if (!milestone) {
    if (needsBacklogSync(state)) {
      return manualGuidance(
        "PRD contains unsynced milestone scope. Run:\n" +
        "  bun harness:sync-backlog\n" +
        "  bun .harness/orchestrator.ts"
      )
    }
    const reviewMilestone = state.execution.milestones.find(m => m.status === "REVIEW")
    if (reviewMilestone) {
      return manualGuidance(
        `Milestone ${reviewMilestone.id} is in REVIEW.\n` +
        `From the main worktree, run bun harness:autoflow to auto-compact, merge, and continue.\n` +
        `Manual fallback: bun harness:merge-milestone ${reviewMilestone.id}`
      )
    }
    return noAction("No active milestone. Run: bun .harness/init.ts --from-prd")
  }

  if (milestone.status === "REVIEW") {
    return manualGuidance(
      `Milestone ${milestone.id} is in REVIEW.\n` +
      `From the main worktree, run bun harness:autoflow to auto-compact, merge, and continue.\n` +
      `Manual fallback: bun harness:merge-milestone ${milestone.id}`
    )
  }

  if (needsFrontendDesigner(state)) {
    return agentDispatch("frontend-designer", state)
  }

  const task = getCurrentTask(state)
  if (!task) return noAction("No active task in current milestone.")

  if (task.status === "BLOCKED") {
    const nextExecutable = milestone!.tasks.find(
      t => t.status === "PENDING" || t.status === "IN_PROGRESS"
    )
    if (nextExecutable) {
      return manualGuidance(
        `Task ${task.id} is BLOCKED: ${task.blockedReason ?? "no reason given"}\n` +
        `Next executable task: ${nextExecutable.id} — ${nextExecutable.name}\n` +
        `Update execution.currentTask to "${nextExecutable.id}" in .harness/state.json, then re-run orchestrator.`
      )
    }
    return manualGuidance(
      `Task ${task.id} is BLOCKED: ${task.blockedReason ?? "no reason given"}\n` +
      `No other executable tasks remain in ${milestone!.id}. Manual intervention required.`
    )
  }

  if (task.retryCount >= 3) {
    return manualGuidance(
      `Task ${task.id} has failed ${task.retryCount} times. Manual intervention required. Reference: agents/orchestrator.md:88`,
    )
  }

  if (task.isUI) {
    return agentDispatch(
      "execution-engine",
      state,
      "UI Task: After implementation + self-validation passes, run Design Review (agents/design-reviewer.md)",
    )
  }

  return agentDispatch(
    "execution-engine",
    state,
    "Non-UI Task: After implementation + self-validation passes, run Code Review via bun .harness/orchestrator.ts --code-review",
  )
}

function getPrdArchAction(state: ProjectState): DispatchResult {
  const readiness = getPhaseReadiness(state)
  if (readiness.ready) {
    return phaseAdvanceGuidance([
      "PRD / Architecture outputs are ready.",
      "Run:",
      "  bun harness:advance",
      "  bun .harness/orchestrator.ts",
    ])
  }

  return agentDispatch(
    "prd-architect",
    state,
    [
      "After completing PRD / Architecture / GitBook skeleton:",
      "1. If UI project: dispatch Frontend Designer for DESIGN_SYSTEM.md + product-prototype.html",
      "2. bun harness:advance",
      "3. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getScaffoldAction(state: ProjectState): DispatchResult {
  const readiness = getPhaseReadiness(state)
  const planningChecks = getPhaseStructuralChecks("SCAFFOLD", state)
  const planningBlocked = planningChecks.some(item => !item.ok)
  if (readiness.ready) {
    return phaseAdvanceGuidance([
      "Scaffold outputs are ready.",
      "Run:",
      "  bun install",
      "  bun harness:advance",
      "  bun .harness/orchestrator.ts",
    ])
  }

  if (planningBlocked) {
    return agentDispatch(
      "prd-architect",
      state,
      [
        "Planning docs are not complete enough to enter scaffold.",
        "1. Finish PRD / Architecture / GitBook skeleton content",
        "2. bun harness:advance",
        "3. bun .harness/orchestrator.ts",
      ].join("\n"),
    )
  }

  return agentDispatch(
    "scaffold-generator",
    state,
    [
      "After completing Scaffold:",
      "1. bun install",
      "2. bun harness:advance",
      "3. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getCompleteAction(state: ProjectState): DispatchResult {
  if (hasDeferredProductStages(state)) {
    const nextDeferredStage = getNextDeferredProductStage(state)
    return manualGuidance(
      "Deferred product stages are still present in the roadmap.\n" +
      "If you are continuing delivery, update PRD / Architecture and run:\n" +
      `  bun harness:stage --promote ${nextDeferredStage?.id ?? "V2"}`
    )
  }

  if (needsBacklogSync(state)) {
    return manualGuidance(
      "New PRD milestone scope was detected after completion. Run:\n" +
      "  bun harness:sync-backlog\n" +
      "  bun .harness/orchestrator.ts"
    )
  }

  return agentDispatch(
    "context-compactor",
    state,
    [
      "Project is complete:",
      "1. bun harness:advance",
      "2. bun harness:compact --status",
    ].join("\n"),
  )
}

export function dispatch(state: ProjectState): DispatchResult {
  const guidance = getUnsupportedPhaseGuidance(state.phase)
  if (guidance) return manualGuidance(guidance)

  switch (state.phase) {
    case "DISCOVERY":
      return getDiscoveryAction(state)
    case "MARKET_RESEARCH":
      return getPhaseReadiness(state).ready
        ? phaseAdvanceGuidance([
            "Market Research outputs are ready.",
            "Run:",
            "  bun harness:advance",
            "  bun .harness/orchestrator.ts",
          ])
        : agentDispatch("market-research", state)
    case "TECH_STACK":
      return getPhaseReadiness(state).ready
        ? phaseAdvanceGuidance([
            "Tech Stack outputs are ready.",
            "Run:",
            "  bun harness:advance",
            "  bun .harness/orchestrator.ts",
          ])
        : agentDispatch("tech-stack-advisor", state)
    case "PRD_ARCH":
      return getPrdArchAction(state)
    case "SCAFFOLD":
      return getScaffoldAction(state)
    case "EXECUTING":
      return getExecutingAction(state)
    case "VALIDATING":
      return agentDispatch("harness-validator", state)
    case "COMPLETE":
      return getCompleteAction(state)
    default:
      return noAction(`Unhandled phase: ${state.phase}`)
  }
}

export function getStatus(state: ProjectState): string {
  const stage = getCurrentProductStage(state)
  const milestone = getCurrentMilestone(state)
  const task = getCurrentTask(state)
  const result = dispatch(state)
  const readiness = getPhaseReadiness(state)

  const lines: string[] = []
  lines.push(`${"═".repeat(50)}`)
  lines.push("  Harness Orchestrator — Status")
  lines.push(`${"═".repeat(50)}`)
  lines.push("")
  lines.push(`Phase:     ${state.phase}`)
  lines.push(`Stage:     ${stage ? `${stage.id} — ${stage.name} (${stage.status})` : "—"}`)
  lines.push(`PRD:       ${state.docs.prd.version}`)
  lines.push(`Arch:      ${state.docs.architecture.version}`)
  lines.push(`Milestone: ${milestone ? `${milestone.id} — ${milestone.name} (${milestone.status})` : "—"}`)
  lines.push(`Task:      ${task ? `${task.id} — ${task.name} (${task.status})` : "—"}`)
  lines.push(`Worktree:  ${state.execution.currentWorktree || "—"}`)
  lines.push(`Phase Ready: ${readiness.ready ? "yes" : "no"}`)
  lines.push("")

  const totalTasks = state.execution.milestones.flatMap(m => m.tasks).length
  const doneTasks = state.execution.milestones.flatMap(m => m.tasks).filter(t => t.status === "DONE").length
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5))
  lines.push(`Progress:  [${bar}] ${pct}% (${doneTasks}/${totalTasks})`)
  lines.push("")

  lines.push(`${"─".repeat(40)} Next Action`)
  if (result.type === "agent") {
    lines.push(`Agent: ${result.message}`)
  } else if (result.type === "manual") {
    lines.push(`Manual: ${result.message}`)
  } else {
    lines.push(`None: ${result.message}`)
  }

  if (readiness.missingOutputs.length > 0) {
    lines.push("")
    lines.push(`${"─".repeat(40)} Missing Outputs`)
    for (const item of readiness.missingOutputs) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join("\n")
}

export function dispatchCodeReview(state: ProjectState): DispatchResult {
  if (state.phase !== "EXECUTING") {
    return noAction("Code Review is only available during EXECUTING phase.")
  }
  const task = getCurrentTask(state)
  if (!task) {
    return noAction("No active task. Cannot run Code Review.")
  }
  if (task.isUI) {
    return noAction(`Task ${task.id} is a UI task. Code Review only applies to non-UI tasks.`)
  }
  if (task.status !== "IN_PROGRESS") {
    return noAction(`Task ${task.id} is ${task.status}. Code Review requires an IN_PROGRESS task.`)
  }
  if (task.retryCount >= 3) {
    return noAction(
      `Task ${task.id} has failed ${task.retryCount} times. Manual intervention required.`,
    )
  }
  return agentDispatch("code-reviewer", state)
}

export function dispatchDesignReview(state: ProjectState): DispatchResult {
  if (state.phase !== "EXECUTING") {
    return noAction("Design Review is only available during EXECUTING phase.")
  }
  const task = getCurrentTask(state)
  if (!task) {
    return noAction("No active task. Cannot run Design Review.")
  }
  if (!task.isUI) {
    return noAction(`Task ${task.id} is not a UI task. Design Review only applies to UI tasks.`)
  }
  if (task.status !== "IN_PROGRESS") {
    return noAction(`Task ${task.id} is ${task.status}. Design Review requires an IN_PROGRESS task.`)
  }
  if (task.retryCount >= 3) {
    return noAction(
      `Task ${task.id} has failed ${task.retryCount} times. Manual intervention required.`,
    )
  }
  return agentDispatch("design-reviewer", state)
}
