import type {
  AgentId,
  AgentPacketMilestone,
  AgentPacketStage,
  AgentPacketTask,
  AgentPlatform,
  AgentTaskPacket,
  Milestone,
  ProjectState,
  Task,
} from "../../types"
import { getAgentEntry } from "./agent-registry"
import { getAgentMaterialPolicy } from "./material-policy"
import { getPhaseReadiness } from "./phase-readiness"
import { getCurrentProductStage } from "../stages"

function hasCodexRuntimeSignals(): boolean {
  return Boolean(
    process.env.CODEX_THREAD_ID
    || process.env.CODEX_MANAGED_BY_NPM
    || process.env.CODEX_SANDBOX
    || process.env.CODEX_HOME,
  )
}

export function detectPlatform(): AgentPlatform {
  if (process.env.CLAUDE_CODE) return "claude-code"
  if (hasCodexRuntimeSignals()) return "codex-cli"
  return "unknown"
}

function getCurrentMilestone(state: ProjectState): Milestone | undefined {
  return state.execution.milestones.find(m => m.id === state.execution.currentMilestone)
}

function getCurrentTask(state: ProjectState): Task | undefined {
  return state.execution.milestones
    .flatMap(m => m.tasks)
    .find(t => t.id === state.execution.currentTask)
}

function serializeMilestone(milestone?: Milestone): AgentPacketMilestone | undefined {
  if (!milestone) return undefined
  return {
    id: milestone.id,
    name: milestone.name,
    status: milestone.status,
  }
}

function serializeStage(state: ProjectState): AgentPacketStage | undefined {
  const stage = getCurrentProductStage(state)
  if (!stage) return undefined
  return {
    architectureVersion: stage.architectureVersion,
    id: stage.id,
    name: stage.name,
    prdVersion: stage.prdVersion,
    status: stage.status,
  }
}

function serializeTask(task?: Task): AgentPacketTask | undefined {
  if (!task) return undefined
  return {
    affectedFiles: [...task.affectedFiles],
    id: task.id,
    isUI: task.isUI,
    name: task.name,
    prdRef: task.prdRef,
    retryCount: task.retryCount,
    status: task.status,
    type: task.type,
  }
}

function formatValidationCommand(
  agentId: AgentId,
  state: ProjectState,
  taskOverride?: Task,
  milestoneOverride?: Milestone,
): string {
  const task = taskOverride ?? getCurrentTask(state)
  const milestone = milestoneOverride ?? getCurrentMilestone(state)

  switch (agentId) {
    case "project-discovery":
      return "bun harness:validate --phase MARKET_RESEARCH"
    case "prd-architect":
      return "bun harness:validate --phase SCAFFOLD"
    case "scaffold-generator":
      return "bun harness:validate --phase EXECUTING"
    case "context-compactor":
      return "bun harness:validate --phase COMPLETE"
    case "execution-engine":
    case "design-reviewer":
    case "code-reviewer":
      return task ? `bun harness:validate --task ${task.id}` : "bun harness:validate"
    case "harness-validator":
      return milestone
        ? `bun harness:validate --milestone ${milestone.id}`
        : "bun harness:validate"
    default:
      return `bun harness:validate --phase ${state.phase}`
  }
}

function agentOwnsCurrentPhase(agentId: AgentId, phase: ProjectState["phase"]): boolean {
  switch (phase) {
    case "DISCOVERY":
      return agentId === "project-discovery"
    case "MARKET_RESEARCH":
      return agentId === "market-research"
    case "TECH_STACK":
      return agentId === "tech-stack-advisor"
    case "PRD_ARCH":
      return agentId === "prd-architect"
    case "SCAFFOLD":
      return agentId === "scaffold-generator"
    case "VALIDATING":
      return agentId === "harness-validator"
    case "EXECUTING":
      return (
        agentId === "execution-engine" ||
        agentId === "design-reviewer" ||
        agentId === "code-reviewer" ||
        agentId === "frontend-designer"
      )
    case "COMPLETE":
      return agentId === "context-compactor"
    default:
      return false
  }
}

function shouldIncludeCurrentPhaseOutputs(agentId: AgentId, phase: ProjectState["phase"]): boolean {
  if (agentOwnsCurrentPhase(agentId, phase)) return true

  if (phase === "SCAFFOLD" && agentId === "prd-architect") {
    return true
  }

  return false
}

function buildAfterCompletion(
  agentId: AgentId,
  state: ProjectState,
  validationCmd: string,
  taskOverride?: Task,
): string[] {
  const task = taskOverride ?? getCurrentTask(state)

  if (agentId === "project-discovery") {
    return [
      `Validation: ${validationCmd}`,
      "Advance: bun harness:advance",
      "Next: Re-run orchestrator to dispatch Market Research.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "market-research") {
    return [
      `Validation: ${validationCmd}`,
      "Advance: bun harness:advance",
      "Next: Re-run orchestrator to dispatch Tech Stack Advisor.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "tech-stack-advisor") {
    return [
      `Validation: ${validationCmd}`,
      "Advance: bun harness:advance",
      "Next: Re-run orchestrator to dispatch PRD Architect.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "prd-architect") {
    return [
      `Validation: ${validationCmd}`,
      "Advance: bun harness:advance",
      "Next: Re-run orchestrator to dispatch Scaffold Generator.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "scaffold-generator") {
    return [
      "Install deps: bun install",
      "Advance: bun harness:advance",
      `Validation: ${validationCmd}`,
      "Next: Re-run orchestrator to dispatch the next runtime agent.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "harness-validator") {
    return [
      `Validation: ${validationCmd}`,
      "Advance: bun harness:advance",
      "Next: Re-run orchestrator to dispatch final closeout.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "context-compactor") {
    return [
      `Validation: ${validationCmd}`,
      "Closeout: bun harness:compact --status",
      "Project lifecycle is complete. Archive or clear session context if needed.",
    ]
  }

  if (agentId === "frontend-designer") {
    return [
      `Validation: ${validationCmd}`,
      "Next: Re-run orchestrator to dispatch Execution Engine for implementation.",
      "  bun .harness/orchestrator.ts",
    ]
  }

  if (agentId === "design-reviewer") {
    const lines = [
      `Validation: ${validationCmd}`,
      "If ✅ passed: proceed to Atomic Commit.",
      "  Commit message must include the current Task-ID, current PRD mapping, and: Design Review: ✅",
    ]
    if (task) {
      lines.push(`  State update: completeTask("${task.id}", "<commitHash>") from .harness/init.ts`)
    }
    lines.push("If ❌ failed: fix issues, re-run self-validation, then:")
    lines.push("  bun .harness/orchestrator.ts --review")
    return lines
  }

  if (agentId === "code-reviewer") {
    const lines = [
      `Validation: ${validationCmd}`,
      "If ✅ passed: proceed to Atomic Commit.",
      "  Commit message must include the current Task-ID, current PRD mapping, and: Code Review: ✅",
    ]
    if (task) {
      lines.push(`  State update: completeTask("${task.id}", "<commitHash>") from .harness/init.ts`)
    }
    lines.push("If ❌ failed: fix issues, re-run self-validation, then:")
    lines.push("  bun .harness/orchestrator.ts --code-review")
    return lines
  }

  if (task) {
    const lines = [
      `Validation: ${validationCmd}`,
      "Atomic Commit: create exactly one HEAD commit for this task, including the current Task-ID and PRD mapping.",
      `State update: completeTask("${task.id}", "<commitHash>") from .harness/init.ts`,
    ]
    if (task.isUI) {
      lines.push("UI Task: After self-validation passes, run Design Review:")
      lines.push("  bun .harness/orchestrator.ts --review")
    }
    return lines
  }

  return [`Validation: ${validationCmd}`]
}

export function buildAgentTaskPacket(agentId: AgentId, state: ProjectState, platform: AgentPlatform = "unknown"): AgentTaskPacket {
  const entry = getAgentEntry(agentId)
  if (!entry) {
    throw new Error(`Agent "${agentId}" not found in registry.`)
  }

  const milestone = getCurrentMilestone(state)
  const task = getCurrentTask(state)
  const validationCmd = formatValidationCommand(agentId, state, task, milestone)
  const policy = getAgentMaterialPolicy(agentId, state, platform, { milestone, task })
  const phaseReadiness = getPhaseReadiness(state)
  const phaseOutputs = shouldIncludeCurrentPhaseOutputs(agentId, state.phase)
    ? phaseReadiness
    : { missingOutputs: [], requiredOutputs: [] }

  return {
    agentId,
    agentName: entry.name,
    afterCompletion: buildAfterCompletion(agentId, state, validationCmd, task),
    architectureVersion: state.docs.architecture.version,
    currentMilestone: serializeMilestone(milestone),
    currentStage: serializeStage(state),
    currentTask: serializeTask(task),
    inlineConstraints: [...policy.inlineConstraints],
    missingOutputs: [...phaseOutputs.missingOutputs],
    optionalRefs: [...policy.optionalRefs],
    phase: state.phase,
    platform,
    prdVersion: state.docs.prd.version,
    requiredOutputs: [...phaseOutputs.requiredOutputs],
    requiredRefs: [...policy.requiredRefs],
    specPath: entry.specPath,
    taskDod: task ? [...task.dod] : [],
    timeoutMs: entry.timeoutMs,
    validationCommand: validationCmd,
    worktree: state.execution.currentWorktree || undefined,
  }
}

export function buildAgentTaskPacketForTask(
  agentId: AgentId,
  state: ProjectState,
  milestone: Milestone,
  task: Task,
  platform: AgentPlatform = "unknown",
): AgentTaskPacket {
  const entry = getAgentEntry(agentId)
  if (!entry) {
    throw new Error(`Agent "${agentId}" not found in registry.`)
  }

  const validationCmd = formatValidationCommand(agentId, state, task, milestone)
  const policy = getAgentMaterialPolicy(agentId, state, platform, { milestone, task })
  const phaseReadiness = getPhaseReadiness(state)
  const phaseOutputs = shouldIncludeCurrentPhaseOutputs(agentId, state.phase)
    ? phaseReadiness
    : { missingOutputs: [], requiredOutputs: [] }

  // Add affectedFiles scope constraint for parallel execution
  const constraints = [...policy.inlineConstraints]
  if (task.affectedFiles.length > 0) {
    constraints.push(
      `Parallel execution scope: only modify files in [${task.affectedFiles.join(", ")}]`,
    )
  } else {
    constraints.push(
      `Parallel execution scope: no explicit affectedFiles were declared; treat ${milestone.worktreePath} as worktree-isolated write scope.`,
    )
  }

  return {
    agentId,
    agentName: entry.name,
    afterCompletion: buildAfterCompletion(agentId, state, validationCmd, task),
    architectureVersion: state.docs.architecture.version,
    currentMilestone: serializeMilestone(milestone),
    currentStage: serializeStage(state),
    currentTask: serializeTask(task),
    inlineConstraints: constraints,
    missingOutputs: [...phaseOutputs.missingOutputs],
    optionalRefs: [...policy.optionalRefs],
    phase: state.phase,
    platform,
    prdVersion: state.docs.prd.version,
    requiredOutputs: [...phaseOutputs.requiredOutputs],
    requiredRefs: [...policy.requiredRefs],
    specPath: entry.specPath,
    taskDod: task ? [...task.dod] : [],
    timeoutMs: entry.timeoutMs,
    validationCommand: validationCmd,
    worktree: milestone.worktreePath || undefined,
  }
}

export function renderAgentTaskPacket(packet: AgentTaskPacket): string {
  const lines: string[] = []

  lines.push(`${"═".repeat(50)}`)
  lines.push("  Harness Orchestrator")
  lines.push(`${"═".repeat(50)}`)
  lines.push("")
  lines.push(`Agent: ${packet.agentName}`)
  lines.push(`Spec: ${packet.specPath}`)
  lines.push(`Platform: ${packet.platform}`)
  lines.push(`Packet Mode: selective`)
  lines.push("")

  lines.push(`${"─".repeat(40)} Inline Context`)
  lines.push(`Phase: ${packet.phase}`)
  if (packet.currentStage) {
    lines.push(
      `Product Stage: ${packet.currentStage.id} — ${packet.currentStage.name} (${packet.currentStage.status})`,
    )
  }
  lines.push(`PRD Version: ${packet.prdVersion}`)
  lines.push(`Architecture Version: ${packet.architectureVersion}`)
  if (packet.currentMilestone) {
    lines.push(
      `Milestone: ${packet.currentMilestone.id} — ${packet.currentMilestone.name} (${packet.currentMilestone.status})`,
    )
  }
  if (packet.currentTask) {
    lines.push(
      `Task: ${packet.currentTask.id} — ${packet.currentTask.name} (${packet.currentTask.status})`,
    )
    lines.push(`Task Type: ${packet.currentTask.type}`)
    lines.push(`PRD Ref: ${packet.currentTask.prdRef}`)
    lines.push(`UI Task: ${packet.currentTask.isUI ? "yes" : "no"}`)
    if (packet.currentTask.affectedFiles.length > 0) {
      lines.push(`Affected Files: ${packet.currentTask.affectedFiles.join(", ")}`)
    }
    if (packet.currentTask.retryCount >= 3) {
      lines.push(
        `⚠️  Task has failed ${packet.currentTask.retryCount} times. Please pause and notify the user. See agents/orchestrator.md:88`,
      )
    }
  }
  if (packet.worktree) {
    lines.push(`Worktree: ${packet.worktree}`)
  }
  lines.push(`Validation Gate: ${packet.validationCommand}`)
  if (packet.timeoutMs) {
    const minutes = Math.round(packet.timeoutMs / 60_000)
    lines.push(`Soft Time Limit: ${minutes} min — if approaching this limit, checkpoint progress and continue unless a blocker requires the user`)
  }
  lines.push("")

  if (packet.requiredOutputs.length > 0) {
    lines.push(`${"─".repeat(40)} Phase Outputs`)
    for (const item of packet.requiredOutputs) {
      const marker = packet.missingOutputs.includes(item) ? "[ ]" : "[x]"
      lines.push(`- ${marker} ${item}`)
    }
    lines.push("")
  }

  lines.push(`${"─".repeat(40)} Required Refs`)
  for (const ref of packet.requiredRefs) {
    lines.push(`- ${ref}`)
  }
  lines.push("")

  if (packet.optionalRefs.length > 0) {
    lines.push(`${"─".repeat(40)} Optional Refs`)
    for (const ref of packet.optionalRefs) {
      lines.push(`- ${ref}`)
    }
    lines.push("")
  }

  lines.push(`${"─".repeat(40)} Core Constraints`)
  for (const constraint of packet.inlineConstraints) {
    lines.push(`- ${constraint}`)
  }
  lines.push("")

  if (packet.taskDod.length > 0) {
    lines.push(`${"─".repeat(40)} Task DoD`)
    for (const item of packet.taskDod) {
      lines.push(`- [ ] ${item}`)
    }
    lines.push("")
  }

  lines.push(`${"─".repeat(40)} After Completion`)
  for (const item of packet.afterCompletion) {
    lines.push(item)
  }

  return lines.join("\n")
}

export function buildContext(agentId: AgentId, state: ProjectState, platform: AgentPlatform = "unknown"): string {
  return renderAgentTaskPacket(buildAgentTaskPacket(agentId, state, platform))
}
