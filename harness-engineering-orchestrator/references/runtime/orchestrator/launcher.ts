import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type {
  ActiveAgent,
  AgentId,
  AgentLaunchAdapterHint,
  AgentLaunchKind,
  AgentLaunchRequest,
  AgentPlatform,
  LaunchCycle,
  Milestone,
  ProjectState,
  SubagentDispatchPolicy,
  Task,
} from "../../types"
import { refreshMilestoneStatuses, registerActiveAgent, syncExecutionPointersFromActiveAgents } from "../execution"
import { STATE_PATH } from "../shared"
import { readProjectStateFromDisk, withStateTransaction } from "../state-io"
import { appendWorkflowEvent, createTaskStartedEvent } from "../workflow-history"
import {
  type DispatchResult,
  buildTaskLaunchMetadata,
  dispatch,
  dispatchCodeReview,
  dispatchDesignReview,
  dispatchParallel,
} from "./dispatcher"

const LAUNCH_DIR = ".harness/launches"
const LATEST_LAUNCH_PATH = join(LAUNCH_DIR, "latest.json")
const LAUNCH_PROTOCOL_VERSION = "1.0"

export interface LaunchPrepareOptions {
  launcherCommand: string
  parallel?: boolean
  platform?: AgentPlatform
  reserve?: boolean
  reviewMode?: "design" | "code"
}

export interface LaunchPrepareResult {
  cycle?: LaunchCycle
  cyclePath?: string
  plannerDispatches: DispatchResult[]
}

export interface LaunchLifecycleResult {
  cycle: LaunchCycle
  cyclePath: string
  launch: AgentLaunchRequest
}

function ensureLaunchDir(): void {
  mkdirSync(LAUNCH_DIR, { recursive: true })
}

function createLaunchCycleId(): string {
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createLaunchId(cycleId: string, index: number): string {
  return `${cycleId}-L${index + 1}`
}

function writeJsonFile(filePath: string, payload: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function getCyclePath(cycleId: string): string {
  return join(LAUNCH_DIR, `${cycleId}.json`)
}

function getPersistedStateVersion(statePath = STATE_PATH): number {
  const state = readProjectStateFromDisk(statePath)
  return state.execution.stateVersion ?? 0
}

function persistLaunchCycle(cycle: LaunchCycle): string {
  ensureLaunchDir()
  const cyclePath = getCyclePath(cycle.cycleId)
  writeJsonFile(cyclePath, cycle)
  writeJsonFile(LATEST_LAUNCH_PATH, cycle)
  return cyclePath.replace(/\\/g, "/")
}

function loadLaunchCycle(path: string): LaunchCycle {
  return JSON.parse(readFileSync(path, "utf-8")) as LaunchCycle
}

function listLaunchCyclePaths(): string[] {
  if (!existsSync(LAUNCH_DIR)) return []

  return readdirSync(LAUNCH_DIR)
    .filter(file => file.endsWith(".json") && file !== "latest.json")
    .sort()
    .reverse()
    .map(file => join(LAUNCH_DIR, file))
}

function findLaunchRecord(launchId: string): {
  cycle: LaunchCycle
  cyclePath: string
  launch: AgentLaunchRequest
  launchIndex: number
} {
  for (const cyclePath of listLaunchCyclePaths()) {
    const cycle = loadLaunchCycle(cyclePath)
    const launchIndex = cycle.launches.findIndex(launch => launch.launchId === launchId)
    if (launchIndex === -1) continue

    return {
      cycle,
      cyclePath: cyclePath.replace(/\\/g, "/"),
      launch: cycle.launches[launchIndex],
      launchIndex,
    }
  }

  throw new Error(`Launch ${launchId} was not found in ${LAUNCH_DIR}/`)
}

function getPlannerDispatches(
  state: ProjectState,
  platform: AgentPlatform,
  options: LaunchPrepareOptions,
): {
  dispatches: DispatchResult[]
  mode: LaunchCycle["mode"]
  plannerCommand: string
} {
  if (options.parallel) {
    const parallelResult = dispatchParallel(state, platform)
    return {
      dispatches: parallelResult.dispatches,
      mode: "parallel",
      plannerCommand: "bun .harness/orchestrator.ts --parallel",
    }
  }

  if (options.reviewMode === "design") {
    return {
      dispatches: [dispatchDesignReview(state, platform)],
      mode: "single",
      plannerCommand: "bun .harness/orchestrator.ts --review",
    }
  }

  if (options.reviewMode === "code") {
    return {
      dispatches: [dispatchCodeReview(state, platform)],
      mode: "single",
      plannerCommand: "bun .harness/orchestrator.ts --code-review",
    }
  }

  return {
    dispatches: [dispatch(state, platform)],
    mode: "single",
    plannerCommand: "bun .harness/orchestrator.ts",
  }
}

function classifyLaunchKind(agentId: AgentId): AgentLaunchKind {
  if (agentId === "design-reviewer" || agentId === "code-reviewer") {
    return "review-agent"
  }

  if (agentId === "execution-engine" || agentId === "frontend-designer") {
    return "task-agent"
  }

  return "phase-agent"
}

function findMilestone(state: ProjectState, milestoneId?: string): Milestone | undefined {
  if (!milestoneId) return undefined
  return state.execution.milestones.find(milestone => milestone.id === milestoneId)
}

function findTask(state: ProjectState, taskId?: string): Task | undefined {
  if (!taskId) return undefined
  return state.execution.milestones.flatMap(milestone => milestone.tasks).find(task => task.id === taskId)
}

function defaultAdapterHints(
  kind: AgentLaunchKind,
  policy?: SubagentDispatchPolicy,
): {
  claude: AgentLaunchAdapterHint
  codex: AgentLaunchAdapterHint
} {
  const base: AgentLaunchAdapterHint = policy
    ? {
        closeStrategy: policy.closeStrategy,
        forkContext: policy.forkContext,
        nativeRole: policy.nativeRole,
        waitStrategy: policy.waitStrategy,
        writeMode: policy.writeMode,
      }
    : kind === "review-agent"
      ? {
          closeStrategy: "close-on-integration",
          forkContext: true,
          nativeRole: "worker",
          waitStrategy: "immediate",
          writeMode: "read-only",
        }
      : {
          closeStrategy: "close-on-integration",
          forkContext: true,
          nativeRole: "worker",
          waitStrategy: "immediate",
          writeMode: "scoped-write",
        }

  return {
    claude: { ...base },
    codex: { ...base },
  }
}

function buildLifecycleCommands(launchId: string, packetValidationCommand: string) {
  return {
    confirmCommand: `bun .harness/orchestrate.ts --confirm ${launchId} --handle <runtime-handle>`,
    releaseCommand: `bun .harness/orchestrate.ts --release ${launchId}`,
    rollbackCommand: `bun .harness/orchestrate.ts --rollback ${launchId} --reason "<why>"`,
    validationCommand: packetValidationCommand,
  }
}

function buildLaunchRequest(
  cycleId: string,
  index: number,
  dispatchResult: DispatchResult,
  state: ProjectState,
): AgentLaunchRequest | null {
  if (dispatchResult.type !== "agent" || !dispatchResult.agentId || !dispatchResult.packet || !dispatchResult.context) {
    return null
  }

  const launchId = createLaunchId(cycleId, index)
  const kind = classifyLaunchKind(dispatchResult.agentId)
  const milestone = findMilestone(state, dispatchResult.packet.currentMilestone?.id)
  const task = findTask(state, dispatchResult.packet.currentTask?.id)
  const metadata =
    kind === "task-agent" && milestone && task
      ? buildTaskLaunchMetadata(dispatchResult.agentId, milestone, task, dispatchResult.packet.platform, launchId)
      : undefined
  const reservation: ActiveAgent | undefined =
    metadata?.activeAgent
      ? {
          ...metadata.activeAgent,
          launchId,
          runtimeHandle: `pending:${launchId}`,
          status: "waiting",
        }
      : undefined
  const subagentPolicy = metadata?.subagentPolicy ?? dispatchResult.subagentPolicy

  return {
    launchId,
    kind,
    logicalAgentId: dispatchResult.agentId,
    packet: dispatchResult.packet,
    prompt: dispatchResult.context,
    reservation,
    taskSnapshot:
      reservation && milestone && task
        ? {
            milestoneStatus: milestone.status,
            startedAt: task.startedAt,
            status: task.status,
          }
        : undefined,
    status: "prepared",
    subagentPolicy,
    postAction: dispatchResult.postAction,
    adapterHints: defaultAdapterHints(kind, subagentPolicy),
    lifecycle: {
      afterCompletion: [...dispatchResult.packet.afterCompletion],
      ...buildLifecycleCommands(launchId, dispatchResult.packet.validationCommand),
    },
  }
}

function reserveLaunches(launches: AgentLaunchRequest[], statePath = STATE_PATH): number {
  if (launches.every(launch => !launch.reservation)) {
    return getPersistedStateVersion(statePath)
  }

  withStateTransaction(state => {
    const liveAgents = (state.execution.activeAgents ?? []).filter(
      agent => agent.status !== "completed" && agent.status !== "closing",
    )

    for (const launch of launches) {
      if (!launch.reservation) continue

      const alreadyReserved = liveAgents.some(agent =>
        agent.launchId === launch.launchId ||
        agent.taskId === launch.reservation?.taskId,
      )
      if (alreadyReserved) {
        throw new Error(`Task ${launch.reservation.taskId} already has a live child reservation.`)
      }

      const reservation: ActiveAgent = {
        ...launch.reservation,
        launchId: launch.launchId,
        runtimeHandle: `pending:${launch.launchId}`,
        status: "waiting",
      }
      registerActiveAgent(state, reservation)
      launch.status = "reserved"
    }
  }, statePath)

  return getPersistedStateVersion(statePath)
}

function setTaskRunning(state: ProjectState, launch: AgentLaunchRequest, startedAt: string): void {
  const taskId = launch.packet.currentTask?.id
  if (!taskId) return

  for (const milestone of state.execution.milestones) {
    const task = milestone.tasks.find(candidate => candidate.id === taskId)
    if (!task) continue

    if (task.status === "DONE" || task.status === "SKIPPED" || task.status === "BLOCKED") {
      return
    }

    if (task.status === "PENDING") {
      task.status = "IN_PROGRESS"
      task.startedAt = startedAt
      appendWorkflowEvent(state, createTaskStartedEvent(state.phase, milestone, task))
    } else {
      task.startedAt = task.startedAt ?? startedAt
    }

    if (milestone.status === "PENDING") {
      milestone.status = "IN_PROGRESS"
    }

    state.execution.currentMilestone = milestone.id
    state.execution.currentTask = task.id
    state.execution.currentWorktree = milestone.worktreePath
    return
  }
}

function restoreTaskSnapshot(state: ProjectState, launch: AgentLaunchRequest): void {
  const taskId = launch.packet.currentTask?.id
  const snapshot = launch.taskSnapshot
  if (!taskId || !snapshot) return

  for (const milestone of state.execution.milestones) {
    const task = milestone.tasks.find(candidate => candidate.id === taskId)
    if (!task) continue

    task.status = snapshot.status
    task.startedAt = snapshot.startedAt
    if (snapshot.status !== "BLOCKED") {
      task.blockedAt = undefined
      task.blockedReason = undefined
    }
    if (snapshot.status !== "DONE") {
      task.completedAt = undefined
      task.commitHash = undefined
    }
    milestone.status = snapshot.milestoneStatus
    refreshMilestoneStatuses(state)

    const hasOtherLiveAgents = (state.execution.activeAgents ?? []).some(agent =>
      agent.status !== "completed" &&
      agent.status !== "closing" &&
      agent.taskId !== task.id,
    )

    if (snapshot.status === "IN_PROGRESS" && !hasOtherLiveAgents) {
      state.execution.currentMilestone = milestone.id
      state.execution.currentTask = task.id
      state.execution.currentWorktree = milestone.worktreePath
    }
    return
  }
}

function updateCycleLaunch(
  cycle: LaunchCycle,
  launchIndex: number,
  updater: (launch: AgentLaunchRequest) => void,
): AgentLaunchRequest {
  const launch = cycle.launches[launchIndex]
  if (!launch) {
    throw new Error(`Launch index ${launchIndex} is out of bounds for cycle ${cycle.cycleId}.`)
  }

  updater(launch)
  return launch
}

export function prepareLaunchCycle(
  state: ProjectState,
  options: LaunchPrepareOptions,
  statePath = STATE_PATH,
): LaunchPrepareResult {
  const platform = options.platform ?? "unknown"
  const planner = getPlannerDispatches(state, platform, options)
  const cycleId = createLaunchCycleId()
  const launches = planner.dispatches
    .map((result, index) => buildLaunchRequest(cycleId, index, result, state))
    .filter((launch): launch is AgentLaunchRequest => Boolean(launch))

  if (launches.length === 0) {
    return {
      plannerDispatches: planner.dispatches,
    }
  }

  const cycle: LaunchCycle = {
    cycleId,
    launcherCommand: options.launcherCommand,
    mode: planner.mode,
    plannerCommand: planner.plannerCommand,
    preparedAt: new Date().toISOString(),
    protocolVersion: LAUNCH_PROTOCOL_VERSION,
    stateVersion: state.execution.stateVersion ?? 0,
    launches,
  }

  if (options.reserve ?? true) {
    cycle.stateVersion = reserveLaunches(cycle.launches, statePath)
  }

  const cyclePath = persistLaunchCycle(cycle)
  return {
    cycle,
    cyclePath,
    plannerDispatches: planner.dispatches,
  }
}

export function confirmLaunch(
  launchId: string,
  runtimeHandle: string,
  statePath = STATE_PATH,
): LaunchLifecycleResult {
  const record = findLaunchRecord(launchId)
  const startedAt = new Date().toISOString()

  if (!runtimeHandle.trim()) {
    throw new Error("A non-empty runtime handle is required for --confirm.")
  }

  if (record.launch.reservation) {
    const reservation = record.launch.reservation
    withStateTransaction(state => {
      const activeAgents = state.execution.activeAgents ?? []
      let activeAgent = activeAgents.find(agent =>
        agent.launchId === launchId ||
        agent.agentId === reservation.agentId,
      )

      if (!activeAgent) {
        const activeReservation: ActiveAgent = {
          ...reservation,
          launchId,
          runtimeHandle,
          status: "running",
          startedAt,
        }
        registerActiveAgent(state, activeReservation)
        activeAgent = (state.execution.activeAgents ?? []).find(agent => agent.launchId === launchId)
      }

      if (activeAgent) {
        activeAgent.launchId = launchId
        activeAgent.runtimeHandle = runtimeHandle
        activeAgent.status = "running"
        activeAgent.startedAt = startedAt
      }

      setTaskRunning(state, record.launch, startedAt)
    }, statePath)
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  } else {
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  }

  const launch = updateCycleLaunch(record.cycle, record.launchIndex, current => {
    current.status = "running"
    if (current.reservation) {
      current.reservation.runtimeHandle = runtimeHandle
      current.reservation.status = "running"
      current.reservation.startedAt = startedAt
    }
  })

  persistLaunchCycle(record.cycle)
  return {
    cycle: record.cycle,
    cyclePath: record.cyclePath,
    launch,
  }
}

export function rollbackLaunch(
  launchId: string,
  reason = "launcher rollback",
  statePath = STATE_PATH,
): LaunchLifecycleResult {
  const record = findLaunchRecord(launchId)

  if (record.launch.reservation) {
    withStateTransaction(state => {
      if (state.execution.activeAgents?.length) {
        state.execution.activeAgents = state.execution.activeAgents.filter(agent =>
          agent.launchId !== launchId &&
          agent.agentId !== record.launch.reservation?.agentId,
        )
      }

      syncExecutionPointersFromActiveAgents(state)
      restoreTaskSnapshot(state, record.launch)
    }, statePath)
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  } else {
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  }

  const launch = updateCycleLaunch(record.cycle, record.launchIndex, current => {
    current.status = "rolled-back"
    if (current.postAction) {
      current.postAction = `${current.postAction}\nRollback reason: ${reason}`
    } else {
      current.postAction = `Rollback reason: ${reason}`
    }
    if (current.reservation) {
      current.reservation.status = "blocked"
    }
  })

  persistLaunchCycle(record.cycle)
  return {
    cycle: record.cycle,
    cyclePath: record.cyclePath,
    launch,
  }
}

export function releaseLaunch(
  launchId: string,
  statePath = STATE_PATH,
): LaunchLifecycleResult {
  const record = findLaunchRecord(launchId)

  if (record.launch.reservation) {
    withStateTransaction(state => {
      if (state.execution.activeAgents?.length) {
        state.execution.activeAgents = state.execution.activeAgents.filter(agent =>
          agent.launchId !== launchId &&
          agent.agentId !== record.launch.reservation?.agentId,
        )
      }
      syncExecutionPointersFromActiveAgents(state)
    }, statePath)
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  } else {
    record.cycle.stateVersion = getPersistedStateVersion(statePath)
  }

  const launch = updateCycleLaunch(record.cycle, record.launchIndex, current => {
    current.status = "released"
    if (current.reservation) {
      current.reservation.status = "closing"
    }
  })

  persistLaunchCycle(record.cycle)
  return {
    cycle: record.cycle,
    cyclePath: record.cyclePath,
    launch,
  }
}
