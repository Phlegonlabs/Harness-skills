import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { syncPublicManagedDocs } from "./public-docs"
import { initState } from "./state-core"

let originalCwd = ""
let workspaceDir = ""

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-public-docs-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("public docs sync renders milestone-level delivery status and records sync events", () => {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "public-doc-fixture"
  state.projectInfo.displayName = "Public Doc Fixture"
  state.projectInfo.types = ["cli"]
  state.roadmap.currentStageId = "V1"
  state.roadmap.stages = [
    {
      id: "V1",
      name: "Initial Delivery",
      status: "DEPLOY_REVIEW",
      milestoneIds: ["M1"],
      prdVersion: "v1.0",
      architectureVersion: "v1.0",
      deployReviewStartedAt: "2026-03-15T11:30:00.000Z",
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
      worktreePath: "../public-doc-fixture-m1",
      status: "MERGED",
      mergeCommit: "abcdef1234567890",
      completedAt: "2026-03-15T11:00:00.000Z",
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
          commitHash: "abcdef1234567890",
          startedAt: "2026-03-15T10:00:00.000Z",
          completedAt: "2026-03-15T10:45:00.000Z",
        },
      ],
    },
  ]

  const firstSync = syncPublicManagedDocs(state, {
    stageId: "V1",
    milestoneId: "M1",
    summary: "Public docs synced after M1 merged",
  })

  expect(firstSync.state.history.events.some(event => event.kind === "public_docs_synced")).toBe(true)

  const readme = readFileSync("README.md", "utf-8")
  expect(readme).toContain("Public Delivery Status")
  expect(readme).toContain("EXECUTING")
  expect(readme).toContain("V1 — Initial Delivery (DEPLOY_REVIEW)")
  expect(readme).toContain("Latest merged milestone")
  expect(readme).toContain("M1 — Foundation")
  expect(readme).toContain("Deploy/test V1")

  const quickStart = readFileSync("docs/public/quick-start.md", "utf-8")
  expect(quickStart).toContain("Public Delivery Status")
  expect(quickStart).toContain("DEPLOY_REVIEW")

  const gitbookReadme = readFileSync("docs/gitbook/README.md", "utf-8")
  expect(gitbookReadme).toContain("Public Delivery Status")
  expect(gitbookReadme).toContain("M1 — Foundation")

  firstSync.state.phase = "COMPLETE"
  firstSync.state.docs.readme.isFinal = true
  const secondSync = syncPublicManagedDocs(firstSync.state, {
    stageId: "V1",
    summary: "Public docs synced after project completion",
  })

  expect(readFileSync("README.md", "utf-8")).toContain("Project delivery is complete and the final public-facing artifacts are locked.")
  expect(secondSync.state.history.events.filter(event => event.kind === "public_docs_synced").length).toBeGreaterThanOrEqual(2)
})
