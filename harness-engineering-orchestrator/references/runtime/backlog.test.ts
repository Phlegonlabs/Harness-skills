import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { initState } from "./state-core"
import { syncExecutionFromPrd } from "./backlog"

let originalCwd = ""
let workspaceDir = ""

function write(path: string, content: string): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-backlog-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

function writePlanningDocs(prdContent: string, architectureContent?: string): void {
  write("docs/PRD.md", prdContent)
  write(
    "docs/ARCHITECTURE.md",
    architectureContent
      ?? [
        "> **Version**: v1.0",
        "",
        "## Dependency Direction",
        "types -> config -> lib -> services -> app",
        "",
      ].join("\n"),
  )
}

test("syncExecutionFromPrd appends new milestones and reopens EXECUTING", () => {
  writePlanningDocs(
    [
      "### Milestone 1: Foundation",
      "#### F001: Ship foundation",
      "- [ ] finish setup",
      "",
      "### Milestone 2: Expansion",
      "#### F002: Add expansion flow",
      "- [ ] add expansion",
      "",
    ].join("\n"),
  )

  const state = initState({})
  state.phase = "COMPLETE"
  state.projectInfo.name = "sync-backlog-fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true
  state.docs.prd.milestoneCount = 2
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../sync-backlog-fixture-m1",
      status: "MERGED",
      mergeCommit: "abc1234",
      tasks: [
        {
          id: "T001",
          name: "Ship foundation",
          type: "TASK",
          status: "DONE",
          prdRef: "PRD#F001",
          milestoneId: "M1",
          dod: ["finish setup"],
          isUI: false,
          affectedFiles: ["src/app"],
          retryCount: 0,
          commitHash: "abc1234",
          startedAt: "2026-03-15T10:00:00.000Z",
          completedAt: "2026-03-15T11:00:00.000Z",
        },
      ],
    },
  ]
  state.execution.allMilestonesComplete = true

  const result = syncExecutionFromPrd(state)

  expect(result.addedMilestones).toBe(1)
  expect(result.addedStages).toBe(1)
  expect(result.addedTasks).toBe(1)
  expect(result.state.phase).toBe("EXECUTING")
  expect(result.state.roadmap.currentStageId).toBe("V1")
  expect(result.state.execution.currentMilestone).toBe("M2")
  expect(result.state.execution.currentTask).toBe("T002")
  expect(result.state.execution.milestones[0]?.status).toBe("MERGED")
  expect(result.state.execution.milestones[0]?.tasks[0]?.id).toBe("T001")
  expect(result.state.execution.milestones[1]?.tasks[0]?.status).toBe("IN_PROGRESS")
})

test("syncExecutionFromPrd rejects new scope added to a merged milestone", () => {
  writePlanningDocs(
    [
      "### Milestone 1: Foundation",
      "#### F001: Ship foundation",
      "- [ ] finish setup",
      "#### F002: Retroactive extra scope",
      "- [ ] should not be added to merged milestone",
      "",
    ].join("\n"),
  )

  const state = initState({})
  state.phase = "COMPLETE"
  state.projectInfo.name = "sync-backlog-fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../sync-backlog-fixture-m1",
      status: "MERGED",
      mergeCommit: "abc1234",
      tasks: [
        {
          id: "T001",
          name: "Ship foundation",
          type: "TASK",
          status: "DONE",
          prdRef: "PRD#F001",
          milestoneId: "M1",
          dod: ["finish setup"],
          isUI: false,
          affectedFiles: ["src/app"],
          retryCount: 0,
          commitHash: "abc1234",
        },
      ],
    },
  ]

  expect(() => syncExecutionFromPrd(state)).toThrow(/new scope as a new milestone/i)
})

test("syncExecutionFromPrd only materializes the ACTIVE product stage", () => {
  writePlanningDocs(
    [
      "> **Version**: v1.0",
      "",
      "## Product Stage V1: Initial Delivery [ACTIVE]",
      "### Milestone 1: Foundation",
      "#### F001: Ship foundation",
      "- [ ] finish setup",
      "",
      "## Product Stage V2: Expansion [DEFERRED]",
      "### Milestone 2: Expansion",
      "#### F002: Add expansion flow",
      "- [ ] add expansion",
      "",
    ].join("\n"),
  )

  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "stage-aware-fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true

  const result = syncExecutionFromPrd(state)

  expect(result.state.roadmap.currentStageId).toBe("V1")
  expect(result.state.roadmap.stages).toHaveLength(2)
  expect(result.state.roadmap.stages[0]?.status).toBe("ACTIVE")
  expect(result.state.roadmap.stages[1]?.status).toBe("DEFERRED")
  expect(result.state.execution.milestones.map(milestone => milestone.id)).toEqual(["M1"])
  expect(result.state.execution.milestones[0]?.productStageId).toBe("V1")
  expect(result.state.execution.currentTask).toBe("T001")
})

test("syncExecutionFromPrd rejects scaffold placeholder planning docs", () => {
  writePlanningDocs(
    [
      "### Milestone 1: Foundation",
      "#### F001: Harness Base Scaffold",
      "- [ ] keep placeholder scaffold scope",
      "",
      "#### F002: Backlog and Validation Closed Loop",
      "- [ ] keep placeholder orchestration scope",
      "",
      "#### F003: Next Version Placeholder",
      "- [ ] keep placeholder future scope",
      "",
    ].join("\n"),
  )

  const state = initState({})
  state.phase = "SCAFFOLD"
  state.projectInfo.name = "placeholder-fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true
  state.docs.architecture.exists = true

  expect(() => syncExecutionFromPrd(state)).toThrow(/Planning docs are still using scaffold placeholder content/i)
})
