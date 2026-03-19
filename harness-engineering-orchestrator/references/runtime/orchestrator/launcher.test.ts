import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { Milestone, ProjectState, Task } from "../../types"
import { initState } from "../state-core"
import { STATE_PATH } from "../shared"
import { readProjectStateFromDisk, writeProjectStateToDisk } from "../state-io"
import { confirmLaunch, prepareLaunchCycle, releaseLaunch, rollbackLaunch } from "./launcher"

let originalCwd = ""
let workspaceDir = ""

function write(path: string, content = ""): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

function createTask(taskId: string, milestoneId: string, options?: Partial<Task>): Task {
  return {
    id: taskId,
    name: `Task ${taskId}`,
    type: "TASK",
    status: "PENDING",
    prdRef: `PRD#${taskId}`,
    milestoneId,
    dod: [`Complete ${taskId}`],
    isUI: false,
    affectedFiles: [`src/${taskId.toLowerCase()}.ts`],
    retryCount: 0,
    ...options,
  }
}

function createMilestone(id: string, tasks: Task[], status: Milestone["status"] = "IN_PROGRESS"): Milestone {
  return {
    id,
    name: `Milestone ${id}`,
    productStageId: "V1",
    branch: `milestone/${id.toLowerCase()}`,
    worktreePath: `../fixture-${id.toLowerCase()}`,
    status,
    tasks,
  }
}

function baseExecutingState(): ProjectState {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "launcher-fixture"
  state.projectInfo.displayName = "Launcher Fixture"
  state.projectInfo.concept = "Validate orchestrate launch cycles."
  state.projectInfo.problem = "Planning and launch contracts can drift."
  state.projectInfo.goal = "Keep launch reservations and lifecycle state aligned."
  state.projectInfo.types = ["web-app"]
  state.projectInfo.aiProvider = "none"
  state.projectInfo.teamSize = "solo"
  state.projectInfo.isGreenfield = true
  state.roadmap.currentStageId = "V1"
  state.roadmap.stages = [
    {
      id: "V1",
      name: "Initial Delivery",
      status: "ACTIVE",
      milestoneIds: ["M1", "M2"],
      prdVersion: "v1.0",
      architectureVersion: "v1.0",
    },
  ]
  state.docs.prd.version = "v1.0"
  state.docs.architecture.version = "v1.0"
  state.execution.stateVersion = 0
  return state
}

function seedWorkspace(state: ProjectState): void {
  write("agents/execution-engine.md", "# execution engine\n")
  write("agents/execution-engine/01-preflight.md", "# preflight\n")
  write("agents/execution-engine/02-task-loop.md", "# task loop\n")
  write("agents/frontend-designer.md", "# frontend designer\n")
  write("agents/code-reviewer.md", "# code reviewer\n")
  write("agents/design-reviewer.md", "# design reviewer\n")
  write("docs/PRD.md", "> **Version**: v1.0\n")
  write("docs/ARCHITECTURE.md", "> **Version**: v1.0\n")
  write("README.md", "# Fixture\n")
  writeProjectStateToDisk(state, STATE_PATH)
}

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-launcher-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("prepareLaunchCycle reserves a sequential task launch and persists the cycle file", () => {
  const state = baseExecutingState()
  const task = createTask("T101", "M1", { status: "IN_PROGRESS", startedAt: new Date().toISOString() })
  const milestone = createMilestone("M1", [task])
  state.execution.currentMilestone = "M1"
  state.execution.currentTask = "T101"
  state.execution.currentWorktree = milestone.worktreePath
  state.execution.milestones = [milestone]
  seedWorkspace(state)

  const result = prepareLaunchCycle(state, {
    launcherCommand: "bun .harness/orchestrate.ts",
    platform: "codex-cli",
  })

  expect(result.cycle).toBeDefined()
  expect(result.cyclePath).toBeDefined()
  expect(result.cycle?.launches).toHaveLength(1)
  expect(result.cycle?.launches[0]?.status).toBe("reserved")
  expect(result.cycle?.launches[0]?.kind).toBe("task-agent")
  expect(existsSync(result.cyclePath!)).toBe(true)

  const persisted = readProjectStateFromDisk(STATE_PATH)
  expect(persisted.execution.activeAgents?.[0]?.launchId).toBe(result.cycle?.launches[0]?.launchId)
  expect(persisted.execution.activeAgents?.[0]?.status).toBe("waiting")
})

test("confirmLaunch marks a reserved child as running and releaseLaunch cleans it up", () => {
  const state = baseExecutingState()
  const task = createTask("T101", "M1", { status: "IN_PROGRESS", startedAt: new Date().toISOString() })
  const milestone = createMilestone("M1", [task])
  state.execution.currentMilestone = "M1"
  state.execution.currentTask = "T101"
  state.execution.currentWorktree = milestone.worktreePath
  state.execution.milestones = [milestone]
  seedWorkspace(state)

  const prepared = prepareLaunchCycle(state, {
    launcherCommand: "bun .harness/orchestrate.ts",
    platform: "codex-cli",
  })
  const launchId = prepared.cycle!.launches[0]!.launchId

  const confirmed = confirmLaunch(launchId, "codex-agent-123")
  expect(confirmed.launch.status).toBe("running")

  let persisted = readProjectStateFromDisk(STATE_PATH)
  expect(persisted.execution.activeAgents?.[0]?.runtimeHandle).toBe("codex-agent-123")
  expect(persisted.execution.activeAgents?.[0]?.status).toBe("running")

  const released = releaseLaunch(launchId)
  expect(released.launch.status).toBe("released")

  persisted = readProjectStateFromDisk(STATE_PATH)
  expect(persisted.execution.activeAgents ?? []).toHaveLength(0)
})

test("rollbackLaunch restores a parallel task launch back to its pre-launch snapshot", () => {
  const state = baseExecutingState()
  state.projectInfo.concurrency = {
    maxParallelTasks: 2,
    maxParallelMilestones: 1,
    enableInterMilestone: false,
  }
  const taskA = createTask("T101", "M1")
  const taskB = createTask("T102", "M1")
  state.execution.milestones = [createMilestone("M1", [taskA, taskB], "PENDING")]
  state.execution.currentMilestone = ""
  state.execution.currentTask = ""
  state.execution.currentWorktree = ""
  seedWorkspace(state)

  const prepared = prepareLaunchCycle(state, {
    launcherCommand: "bun .harness/orchestrate.ts --parallel",
    parallel: true,
    platform: "codex-cli",
  })
  const launchId = prepared.cycle!.launches[0]!.launchId

  confirmLaunch(launchId, "codex-agent-parallel-1")
  let persisted = readProjectStateFromDisk(STATE_PATH)
  const runningTask = persisted.execution.milestones[0]!.tasks.find(task => task.id === "T101")
  expect(runningTask?.status).toBe("IN_PROGRESS")

  const rolledBack = rollbackLaunch(launchId, "spawn failed")
  expect(rolledBack.launch.status).toBe("rolled-back")

  persisted = readProjectStateFromDisk(STATE_PATH)
  const restoredTask = persisted.execution.milestones[0]!.tasks.find(task => task.id === "T101")
  expect(restoredTask?.status).toBe("PENDING")
  expect(persisted.execution.activeAgents?.some(agent => agent.launchId === launchId)).toBe(false)

  const latestCycle = JSON.parse(readFileSync(join(".harness", "launches", "latest.json"), "utf-8")) as {
    launches: Array<{ launchId: string; status: string }>
  }
  expect(latestCycle.launches.find(launch => launch.launchId === launchId)?.status).toBe("rolled-back")
})
