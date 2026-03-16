import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { initState } from "./state-core"
import { syncProgressDocuments } from "./progress"

let originalCwd = ""
let workspaceDir = ""

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-progress-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("progress docs record task lifecycle details and activity log", () => {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "progress-fixture"
  state.projectInfo.displayName = "Progress Fixture"
  state.docs.prd.version = "v1.0"
  state.docs.architecture.version = "v1.0"
  state.roadmap.currentStageId = "V1"
  state.roadmap.stages = [
    {
      id: "V1",
      name: "Initial Delivery",
      status: "ACTIVE",
      milestoneIds: ["M1"],
      prdVersion: "v1.0",
      architectureVersion: "v1.0",
    },
  ]
  state.execution.currentMilestone = "M1"
  state.execution.currentTask = "T102"
  state.execution.currentWorktree = "../progress-fixture-m1"
  state.updatedAt = "2026-03-15T12:30:00.000Z"
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../progress-fixture-m1",
      status: "IN_PROGRESS",
      tasks: [
        {
          id: "T101",
          name: "Complete setup",
          type: "TASK",
          status: "DONE",
          prdRef: "PRD#F101",
          milestoneId: "M1",
          dod: ["Setup complete"],
          isUI: false,
          affectedFiles: ["src/setup.ts"],
          retryCount: 0,
          commitHash: "abcdef1234567890",
          startedAt: "2026-03-15T09:30:00.000Z",
          completedAt: "2026-03-15T10:00:00.000Z",
        },
        {
          id: "T102",
          name: "Build current feature",
          type: "TASK",
          status: "IN_PROGRESS",
          prdRef: "PRD#F102",
          milestoneId: "M1",
          dod: ["Current feature built"],
          isUI: false,
          affectedFiles: ["src/current.ts"],
          retryCount: 0,
          startedAt: "2026-03-15T11:00:00.000Z",
        },
        {
          id: "T103",
          name: "Wait for external access",
          type: "TASK",
          status: "BLOCKED",
          prdRef: "PRD#F103",
          milestoneId: "M1",
          dod: ["Dependency unblocked"],
          isUI: false,
          affectedFiles: ["src/blocked.ts"],
          retryCount: 1,
          blockedReason: "Waiting for API key",
          blockedAt: "2026-03-15T12:00:00.000Z",
        },
      ],
    },
  ]
  state.history.events = [
    {
      at: "2026-03-15T08:00:00.000Z",
      kind: "phase_advanced",
      phase: "EXECUTING",
      stageId: "V1",
      summary: "Phase advanced: SCAFFOLD -> EXECUTING",
      visibility: "public",
    },
    {
      at: "2026-03-15T12:20:00.000Z",
      kind: "public_docs_synced",
      phase: "EXECUTING",
      stageId: "V1",
      summary: "Public docs synced after phase advanced to EXECUTING (5 files)",
      visibility: "public",
    },
  ]

  syncProgressDocuments(state)

  expect(readFileSync("docs/PROGRESS.md", "utf-8")).toContain("8. [08 Roadmap](./progress/08-roadmap.md)")
  expect(readFileSync("docs/PROGRESS.md", "utf-8")).toContain("Current Product Stage")
  expect(readFileSync("docs/PROGRESS.md", "utf-8")).toContain("Latest Workflow Event")

  const backlog = readFileSync("docs/progress/03-backlog.md", "utf-8")
  expect(backlog).toContain("[~] T102: Build current feature")
  expect(backlog).toContain("started 2026-03-15 11:00:00Z")
  expect(backlog).toContain("[!] T103: Wait for external access")
  expect(backlog).toContain("reason: Waiting for API key")

  const blockers = readFileSync("docs/progress/04-blockers.md", "utf-8")
  expect(blockers).toContain("Waiting for API key")
  expect(blockers).toContain("2026-03-15 12:00:00Z")

  const activity = readFileSync("docs/progress/07-activity.md", "utf-8")
  expect(activity).toContain("Phase advanced: SCAFFOLD -> EXECUTING")
  expect(activity).toContain("Public docs synced after phase advanced to EXECUTING")
  expect(activity).toContain("T103 became BLOCKED")
  expect(activity).toContain("T102 entered IN_PROGRESS")
  expect(activity).toContain("T101 completed (abcdef1)")

  const currentState = readFileSync("docs/progress/02-current-state.md", "utf-8")
  expect(currentState).toContain("Latest public-doc sync")
  expect(currentState).toContain("2026-03-15 12:20:00Z")

  const nextSession = readFileSync("docs/progress/06-next-session.md", "utf-8")
  expect(nextSession).toContain("Recent Decision Log")
  expect(nextSession).toContain("Phase advanced: SCAFFOLD -> EXECUTING")

  const roadmap = readFileSync("docs/progress/08-roadmap.md", "utf-8")
  expect(roadmap).toContain("V1: Initial Delivery [ACTIVE]")
})
