import type { ActiveAgent, AgentId, AgentPlatform, AgentTaskPacket, Milestone, ProjectState, Task } from "../../types"
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
  platform: AgentPlatform,
  postAction?: string,
): DispatchResult {
  const entry = getAgentEntry(agentId)
  if (!entry) {
    return { type: "none", message: `Agent "${agentId}" not found in registry.` }
  }
  const packet = buildAgentTaskPacket(agentId, state, platform)
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

function getDiscoveryAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
  // Fast Path: if level is "lite", dispatch fast-path-bootstrap instead of full discovery
  const level = state.projectInfo?.harnessLevel?.level ?? "standard"
  if (level === "lite") {
    return agentDispatch(
      "fast-path-bootstrap",
      state,
      platform,
      [
        "Fast Path (Lite): Bootstrap will infer project metadata, generate minimal PRD/Architecture, and scaffold.",
        "After completion, phase will be EXECUTING.",
      ].join("\n"),
    )
  }

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
    platform,
    [
      "After completing Q0-Q9:",
      "1. bun harness:advance",
      "2. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getExecutingAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
  // --- Scope change pending check (single-dispatch path) ---
  // If there are unresolved scope changes, surface them before dispatching any task.
  const pendingScopeChanges = (state.execution.pendingScopeChanges ?? []).filter(
    c => c.status === "pending",
  )
  if (pendingScopeChanges.length > 0) {
    return manualGuidance(
      `${pendingScopeChanges.length} pending scope change(s) must be resolved before execution.\n` +
      "Review and apply:\n" +
      "  bun harness:scope-change --preview\n" +
      "  bun harness:scope-change --apply\n" +
      "Then re-run: bun .harness/orchestrator.ts",
    )
  }

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
    // Recommend entropy scan at milestone boundary before merge
    return manualGuidance(
      `Milestone ${milestone.id} is in REVIEW.\n` +
      "Recommended: run entropy scan before merge:\n" +
      "  bun harness:entropy-scan\n" +
      "Then merge via:\n" +
      `  bun harness:autoflow\n` +
      `Manual fallback: bun harness:merge-milestone ${milestone.id}`
    )
  }

  if (needsFrontendDesigner(state)) {
    return agentDispatch("frontend-designer", state, platform)
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
      `Task ${task.id} has failed ${task.retryCount} times. Recovery steps:\n` +
      `1. Validate: bun harness:validate --task ${task.id}\n` +
      `2. If too large, split in PRD then: bun harness:sync-backlog\n` +
      `3. If blocked on external dep, mark BLOCKED in state.json\n` +
      `4. If transient, reset retryCount to 0 in state.json\n` +
      `5. Re-run: bun .harness/orchestrator.ts`,
    )
  }

  // --- Doom-loop awareness ---
  // If the task has been retried but not yet hit the hard cap (retryCount >= 3),
  // flag a doom-loop warning so the orchestrator can surface it to the operator.
  // Heuristic: retryCount >= 2 with no file-diff progress suggests a loop.
  if (task.retryCount >= 2) {
    const postWarning =
      `⚠ Doom-loop heuristic: task ${task.id} has ${task.retryCount} retries. ` +
      "If the next attempt produces no new file changes, consider splitting or blocking the task."
    if (task.isUI) {
      return agentDispatch("execution-engine", state, platform,
        postWarning + "\nUI Task: After implementation + self-validation passes, run Design Review (agents/design-reviewer.md)")
    }
    return agentDispatch("execution-engine", state, platform,
      postWarning + "\nNon-UI Task: After implementation + self-validation passes, run Code Review via bun .harness/orchestrator.ts --code-review")
  }

  if (task.isUI) {
    return agentDispatch(
      "execution-engine",
      state,
      platform,
      "UI Task: After implementation + self-validation passes, run Design Review (agents/design-reviewer.md)",
    )
  }

  return agentDispatch(
    "execution-engine",
    state,
    platform,
    "Non-UI Task: After implementation + self-validation passes, run Code Review via bun .harness/orchestrator.ts --code-review",
  )
}

function getPrdArchAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
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
    platform,
    [
      "After completing PRD / Architecture / GitBook skeleton:",
      "1. If UI project: dispatch Frontend Designer for DESIGN_SYSTEM.md + product-prototype.html",
      "2. bun harness:advance",
      "3. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getScaffoldAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
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
      platform,
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
    platform,
    [
      "After completing Scaffold:",
      "1. bun install",
      "2. bun harness:advance",
      "3. bun .harness/orchestrator.ts",
    ].join("\n"),
  )
}

function getCompleteAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
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
    platform,
    [
      "Project is complete:",
      "1. bun harness:advance",
      "2. bun harness:compact --status",
    ].join("\n"),
  )
}

function getMarketResearchAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
  if (getPhaseReadiness(state).ready) {
    return phaseAdvanceGuidance([
      "Market Research outputs are ready.",
      "Run:",
      "  bun harness:advance",
      "  bun .harness/orchestrator.ts",
    ])
  }
  return agentDispatch("market-research", state, platform,
    "After completing Market Research:\n1. bun harness:validate --phase TECH_STACK\n2. bun harness:advance\n3. bun .harness/orchestrator.ts")
}

function getTechStackAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
  if (getPhaseReadiness(state).ready) {
    return phaseAdvanceGuidance([
      "Tech Stack outputs are ready.",
      "Run:",
      "  bun harness:advance",
      "  bun .harness/orchestrator.ts",
    ])
  }
  return agentDispatch("tech-stack-advisor", state, platform,
    "After completing Tech Stack negotiation:\n1. bun harness:validate --phase PRD_ARCH\n2. bun harness:advance\n3. bun .harness/orchestrator.ts")
}

function getValidatingAction(state: ProjectState, platform: AgentPlatform): DispatchResult {
  const readiness = getPhaseReadiness(state)
  if (!readiness.ready) {
    return manualGuidance("VALIDATING entered but milestones not all complete.\n" +
      "Recovery:\n1. Return to EXECUTING\n2. Or mark incomplete milestones SKIPPED")
  }
  if (state.validation.lastRun && state.validation.score < 80) {
    return agentDispatch("harness-validator", state, platform,
      `Previous score: ${state.validation.score}/100. Focus on failing critical checks.\nAfter fixes: bun harness:validate\nThen: bun .harness/orchestrator.ts`)
  }
  return agentDispatch("harness-validator", state, platform,
    "After validation:\n1. Review Harness Score (target: >= 80)\n2. If passed: bun harness:advance\n3. If failed: fix critical checks, re-run bun harness:validate")
}

function getEligibleTasks(state: ProjectState): Task[] {
  const eligible: Task[] = []
  const allTasks = state.execution.milestones.flatMap(m => m.tasks)
  const activeTaskIds = new Set(
    (state.execution.activeAgents ?? []).map(a => a.taskId),
  )
  const activeFiles = new Set(
    (state.execution.activeAgents ?? []).flatMap(a => {
      const task = allTasks.find(t => t.id === a.taskId)
      return task?.affectedFiles ?? []
    }),
  )

  for (const milestone of state.execution.milestones) {
    if (milestone.status === "MERGED" || milestone.status === "COMPLETE") continue
    if (milestone.status === "REVIEW") continue

    for (const task of milestone.tasks) {
      if (task.status !== "PENDING") continue
      if (activeTaskIds.has(task.id)) continue

      // Check dependsOn
      if (task.dependsOn && task.dependsOn.length > 0) {
        const depsComplete = task.dependsOn.every(depId => {
          const dep = allTasks.find(t => t.id === depId)
          return dep?.status === "DONE"
        })
        if (!depsComplete) continue
      }

      // Check file overlap with active agents
      const hasActiveOverlap = task.affectedFiles.some(f => activeFiles.has(f))
      if (hasActiveOverlap) continue

      // Check file overlap with already-eligible tasks
      const hasEligibleOverlap = eligible.some(e =>
        e.affectedFiles.some(f => task.affectedFiles.includes(f)),
      )
      if (hasEligibleOverlap) continue

      eligible.push(task)
    }
  }

  return eligible
}

export interface ParallelDispatchResult {
  dispatches: DispatchResult[]
  concurrencyMode: "sequential" | "parallel-tasks" | "parallel-milestones"
  stateVersion: number
}

export function dispatchParallel(
  state: ProjectState,
  platform: AgentPlatform = "unknown",
): ParallelDispatchResult {
  const stateVersion = state.execution.stateVersion ?? 0

  // Check for pending scope changes before dispatch
  const pendingChanges = (state.execution.pendingScopeChanges ?? []).filter(
    c => c.status === "pending",
  )
  if (pendingChanges.length > 0) {
    return {
      dispatches: [
        manualGuidance(
          `${pendingChanges.length} pending scope change(s) detected.\n` +
          "Review before dispatching:\n" +
          "  bun harness:scope-change --preview\n" +
          "  bun harness:scope-change --apply",
        ),
      ],
      concurrencyMode: "sequential",
      stateVersion,
    }
  }

  const policy = state.projectInfo.concurrency ?? {
    maxParallelTasks: 1,
    maxParallelMilestones: 1,
    enableInterMilestone: false,
  }

  // If policy is sequential, fall back to single dispatch
  if (policy.maxParallelTasks <= 1 && policy.maxParallelMilestones <= 1) {
    return {
      dispatches: [dispatch(state, platform)],
      concurrencyMode: "sequential",
      stateVersion,
    }
  }

  const eligible = getEligibleTasks(state)
  if (eligible.length === 0) {
    // Fall back to single dispatch for non-task scenarios (phase advance, etc.)
    return {
      dispatches: [dispatch(state, platform)],
      concurrencyMode: "sequential",
      stateVersion,
    }
  }

  const maxTasks = Math.min(eligible.length, policy.maxParallelTasks)
  const dispatches: DispatchResult[] = []

  for (let i = 0; i < maxTasks; i++) {
    const task = eligible[i]
    const milestone = state.execution.milestones.find(m =>
      m.tasks.some(t => t.id === task.id),
    )
    if (!milestone) continue

    const entry = getAgentEntry("execution-engine")
    if (!entry) continue

    const packet = buildAgentTaskPacket("execution-engine", state, platform)
    const context = renderAgentTaskPacket(packet)

    dispatches.push({
      type: "agent",
      agentId: "execution-engine",
      context,
      message: `${entry.name} — Task ${task.id}: ${task.name}`,
      packet,
      postAction: task.isUI
        ? "UI Task: After implementation + self-validation passes, run Design Review"
        : "Non-UI Task: After implementation + self-validation passes, run Code Review",
    })
  }

  const milestoneIds = new Set(eligible.slice(0, maxTasks).map(t => t.milestoneId))
  const concurrencyMode = milestoneIds.size > 1 ? "parallel-milestones" : "parallel-tasks"

  return {
    dispatches: dispatches.length > 0 ? dispatches : [dispatch(state, platform)],
    concurrencyMode: dispatches.length > 0 ? concurrencyMode : "sequential",
    stateVersion,
  }
}

export function dispatch(state: ProjectState, platform: AgentPlatform = "unknown"): DispatchResult {
  const guidance = getUnsupportedPhaseGuidance(state.phase)
  if (guidance) return manualGuidance(guidance)

  switch (state.phase) {
    case "DISCOVERY":
      return getDiscoveryAction(state, platform)
    case "MARKET_RESEARCH":
      return getMarketResearchAction(state, platform)
    case "TECH_STACK":
      return getTechStackAction(state, platform)
    case "PRD_ARCH":
      return getPrdArchAction(state, platform)
    case "SCAFFOLD":
      return getScaffoldAction(state, platform)
    case "EXECUTING":
      return getExecutingAction(state, platform)
    case "VALIDATING":
      return getValidatingAction(state, platform)
    case "COMPLETE":
      return getCompleteAction(state, platform)
    default:
      return noAction(`Unhandled phase: ${state.phase}`)
  }
}

export function getStatus(state: ProjectState, platform: AgentPlatform = "unknown"): string {
  const stage = getCurrentProductStage(state)
  const milestone = getCurrentMilestone(state)
  const task = getCurrentTask(state)
  const result = dispatch(state, platform)
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

export function dispatchCodeReview(state: ProjectState, platform: AgentPlatform = "unknown"): DispatchResult {
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
    return manualGuidance(
      `Task ${task.id} has failed ${task.retryCount} times. Recovery steps:\n` +
      `1. Validate: bun harness:validate --task ${task.id}\n` +
      `2. If too large, split in PRD then: bun harness:sync-backlog\n` +
      `3. If blocked on external dep, mark BLOCKED in state.json\n` +
      `4. If transient, reset retryCount to 0 in state.json\n` +
      `5. Re-run: bun .harness/orchestrator.ts`,
    )
  }
  return agentDispatch("code-reviewer", state, platform,
    "If passed: create Atomic Commit with Code Review: \u2705 in the message.\nIf failed: fix issues, re-run: bun .harness/orchestrator.ts --code-review")
}

export function dispatchDesignReview(state: ProjectState, platform: AgentPlatform = "unknown"): DispatchResult {
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
    return manualGuidance(
      `Task ${task.id} has failed ${task.retryCount} times. Recovery steps:\n` +
      `1. Validate: bun harness:validate --task ${task.id}\n` +
      `2. If too large, split in PRD then: bun harness:sync-backlog\n` +
      `3. If blocked on external dep, mark BLOCKED in state.json\n` +
      `4. If transient, reset retryCount to 0 in state.json\n` +
      `5. Re-run: bun .harness/orchestrator.ts`,
    )
  }
  return agentDispatch("design-reviewer", state, platform,
    "If passed: create Atomic Commit with Design Review: \u2705 in the message.\nIf failed: fix issues, re-run: bun .harness/orchestrator.ts --review")
}
