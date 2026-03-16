import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { ProjectState } from "../types"
import { dispatch } from "./orchestrator/dispatcher"
import { initState } from "./state-core"
import { writeProjectStateToDisk } from "./state-io"

const STAGE_SCRIPT_PATH = join(import.meta.dir, "..", "harness-stage.ts").replace(/\\/g, "/")

let originalCwd = ""
let workspaceDir = ""

function write(path: string, content: string): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

function createDeployReviewState(): ProjectState {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "stage-fixture"
  state.projectInfo.displayName = "Stage Fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true
  state.docs.prd.version = "v1.0"
  state.docs.prd.milestoneCount = 1
  state.docs.architecture.exists = true
  state.docs.architecture.version = "v1.0"
  state.roadmap.currentStageId = "V1"
  state.roadmap.stages = [
    {
      id: "V1",
      name: "Initial Delivery",
      status: "DEPLOY_REVIEW",
      milestoneIds: ["M1"],
      prdVersion: "v1.0",
      architectureVersion: "v1.0",
      deployReviewStartedAt: "2026-03-15T12:00:00.000Z",
    },
    {
      id: "V2",
      name: "Expansion",
      status: "DEFERRED",
      milestoneIds: ["M2"],
    },
  ]
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../stage-fixture-m1",
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
          affectedFiles: ["src/foundation.ts"],
          retryCount: 0,
          commitHash: "abc1234",
          startedAt: "2026-03-15T10:00:00.000Z",
          completedAt: "2026-03-15T11:00:00.000Z",
        },
      ],
    },
  ]
  state.execution.allMilestonesComplete = true
  return state
}

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-stage-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("dispatch surfaces deploy review guidance when the current stage is waiting on real-world validation", () => {
  const state = createDeployReviewState()

  const result = dispatch(state)

  expect(result.type).toBe("manual")
  expect(result.message).toContain("DEPLOY_REVIEW")
  expect(result.message).toContain("bun harness:stage --promote V2")
})

test("stage promotion snapshots docs and resumes execution on the next deferred stage", () => {
  write(
    "docs/PRD.md",
    [
      "# PRD",
      "> **Version**: v2.0",
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
  write(
    "docs/ARCHITECTURE.md",
    [
      "# Architecture",
      "> **Version**: v2.0",
      "",
      "types -> config -> lib -> services -> app",
    ].join("\n"),
  )
  writeProjectStateToDisk(createDeployReviewState(), ".harness/state.json")

  const result = Bun.spawnSync(["bun", STAGE_SCRIPT_PATH, "--promote", "V2"], {
    cwd: workspaceDir,
    stdout: "pipe",
    stderr: "pipe",
  })

  expect(result.exitCode).toBe(0)

  const updated = JSON.parse(readFileSync(".harness/state.json", "utf-8")) as ProjectState
  expect(updated.roadmap.currentStageId).toBe("V2")
  expect(updated.roadmap.stages[0]?.status).toBe("COMPLETED")
  expect(updated.roadmap.stages[1]?.status).toBe("ACTIVE")
  expect(updated.roadmap.stages[1]?.prdVersion).toBe("v2.0")
  expect(updated.roadmap.stages[1]?.architectureVersion).toBe("v2.0")
  expect(updated.execution.currentMilestone).toBe("M2")
  expect(updated.execution.currentTask).toBe("T002")
  expect(updated.execution.milestones.map(milestone => milestone.id)).toEqual(["M1", "M2"])
  expect(updated.execution.milestones[1]?.productStageId).toBe("V2")
  expect(updated.history.events.some(event => event.kind === "stage_promoted")).toBe(true)
  expect(updated.history.events.some(event => event.kind === "public_docs_synced")).toBe(true)
  expect(existsSync("docs/prd/versions/prd-v2.md")).toBe(true)
  expect(existsSync("docs/architecture/versions/architecture-v2.md")).toBe(true)
  expect(readFileSync("docs/prd/versions/prd-v2.md", "utf-8")).toContain("Product Stage V2")
  expect(readFileSync("docs/architecture/versions/architecture-v2.md", "utf-8")).toContain("> **Version**: v2.0")
  expect(readFileSync("README.md", "utf-8")).toContain("V2 — Expansion (ACTIVE)")
  expect(readFileSync("README.md", "utf-8")).toContain("Continue the current milestone and merge it after review-ready closeout.")
  expect(readFileSync("docs/public/quick-start.md", "utf-8")).toContain("Public Delivery Status")
  expect(readFileSync("docs/public/quick-start.md", "utf-8")).toContain("V2 — Expansion (ACTIVE)")
})

test("stage promotion rejects stale document versions", () => {
  write(
    "docs/PRD.md",
    [
      "# PRD",
      "> **Version**: v1.0",
      "",
      "## Product Stage V1: Initial Delivery [ACTIVE]",
      "### Milestone 1: Foundation",
      "",
      "## Product Stage V2: Expansion [DEFERRED]",
      "### Milestone 2: Expansion",
      "",
    ].join("\n"),
  )
  write(
    "docs/ARCHITECTURE.md",
    [
      "# Architecture",
      "> **Version**: v1.0",
      "",
      "types -> config -> lib -> services -> app",
    ].join("\n"),
  )
  writeProjectStateToDisk(createDeployReviewState(), ".harness/state.json")

  const result = Bun.spawnSync(["bun", STAGE_SCRIPT_PATH, "--promote", "V2"], {
    cwd: workspaceDir,
    stdout: "pipe",
    stderr: "pipe",
  })

  expect(result.exitCode).toBe(1)
  expect(new TextDecoder().decode(result.stderr)).toContain("Update the main document to the V2 line")
})
