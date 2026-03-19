import { expect, test } from "bun:test"
import { initState } from "./state-core"
import { generatePrdDelta } from "./prd-delta"

test("generatePrdDelta appends feature entries to an open milestone using PRD-compatible headings", () => {
  const state = initState({})
  state.projectInfo.types = ["cli"]
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../fixture-m1",
      status: "IN_PROGRESS",
      tasks: [
        {
          id: "T001",
          name: "Ship foundation",
          type: "TASK",
          status: "IN_PROGRESS",
          prdRef: "PRD#F001",
          milestoneId: "M1",
          dod: ["finish setup"],
          isUI: false,
          affectedFiles: ["src/app"],
          retryCount: 0,
        },
      ],
    },
  ]

  const prd = [
    "### Milestone 1: Foundation",
    "#### F001: Ship foundation",
    "- [ ] finish setup",
    "",
  ].join("\n")

  const delta = generatePrdDelta(
    {
      id: "scope-1",
      description: "Follow-up scope",
      source: "user-request",
      priority: "urgent",
      targetMilestoneId: "M1",
      proposedTasks: [
        {
          name: "Patch the regression",
          dod: ["close the regression", "re-run validation"],
          isUI: true,
          affectedFiles: ["src/follow-up", "tests/follow-up"],
          dependsOn: ["T001"],
        },
      ],
      createdAt: "2026-03-18T12:00:00.000Z",
      status: "pending",
    },
    state,
    prd,
  )

  expect(delta.newMilestoneId).toBeUndefined()
  expect(delta.newTaskIds).toEqual(["T002"])
  expect(delta.content).toContain("#### F002: Patch the regression")
  expect(delta.content).toContain("**UI Task:** Yes")
  expect(delta.content).toContain("**Affected Files:** src/follow-up, tests/follow-up")
  expect(delta.content).toContain("**Depends On:** T001")
})

test("generatePrdDelta inserts new milestones inside the current stage instead of after later stages", () => {
  const state = initState({})
  state.roadmap.currentStageId = "V1"
  state.roadmap.stages = [
    {
      id: "V1",
      name: "Initial Delivery",
      status: "DEPLOY_REVIEW",
      milestoneIds: ["M1"],
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
      worktreePath: "../fixture-m1",
      status: "MERGED",
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

  const prd = [
    "## Product Stage V1: Initial Delivery [DEPLOY_REVIEW]",
    "### Milestone 1: Foundation",
    "#### F001: Ship foundation",
    "- [ ] finish setup",
    "",
    "## Product Stage V2: Expansion [DEFERRED]",
    "### Milestone 2: Expansion",
    "#### F010: Future work",
    "- [ ] keep deferred",
    "",
  ].join("\n")

  const delta = generatePrdDelta(
    {
      id: "scope-2",
      description: "Remediation",
      source: "plan-mode",
      priority: "normal",
      proposedTasks: [
        {
          name: "Patch post-release issue",
          dod: ["close the issue"],
          isUI: false,
        },
      ],
      createdAt: "2026-03-18T12:00:00.000Z",
      status: "pending",
    },
    state,
    prd,
  )

  const lines = prd.split("\n")
  lines.splice(delta.insertAfterLine + 1, 0, delta.content)
  const updatedPrd = lines.join("\n")

  expect(delta.newMilestoneId).toBe("M3")
  expect(updatedPrd.indexOf("### Milestone 3: Remediation")).toBeGreaterThan(-1)
  expect(updatedPrd.indexOf("### Milestone 3: Remediation")).toBeLessThan(updatedPrd.indexOf("## Product Stage V2: Expansion"))
  expect(updatedPrd).toContain("#### F011: Patch post-release issue")
})
