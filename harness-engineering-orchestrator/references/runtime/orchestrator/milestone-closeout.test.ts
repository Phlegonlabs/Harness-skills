import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { MilestoneChecklist, ProjectState } from "../../types"
import { completeTask } from "../execution"
import { initState } from "../state-core"
import { writeProjectStateToDisk } from "../state-io"
import { runAutoflow } from "./autoflow"

const MERGE_SCRIPT_PATH = join(import.meta.dir, "..", "..", "harness-merge-milestone.ts").replace(/\\/g, "/")
const COMPACT_SCRIPT_SOURCE = join(import.meta.dir, "..", "..", "harness-compact.ts")

function passingMilestoneChecklist(): MilestoneChecklist {
  return {
    allTasksComplete: true,
    typecheckPassed: true,
    lintPassed: true,
    formatPassed: true,
    testsPassed: true,
    buildPassed: true,
    coverageMet: true,
    fileSizeOk: true,
    noBlockingForbiddenPatterns: true,
    agentsMdSynced: true,
    changelogUpdated: true,
    gitbookGuidePresent: true,
    compactCompleted: true,
  }
}

let originalCwd = ""
let workspaceDir = ""

function runGit(args: string[]): { ok: boolean; output: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd: workspaceDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = new TextDecoder().decode(proc.stdout).trim()
  const stderr = new TextDecoder().decode(proc.stderr).trim()
  return { ok: proc.exitCode === 0, output: proc.exitCode === 0 ? stdout : stderr }
}

function write(path: string, content = ""): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

function createExecutingState(): ProjectState {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "closeout-fixture"
  state.projectInfo.displayName = "Closeout Fixture"
  state.projectInfo.concept = "Validate milestone closeout behavior."
  state.projectInfo.problem = "Review milestones should not require manual merge commands."
  state.projectInfo.goal = "Auto-merge, compact, and continue to the next milestone."
  state.projectInfo.types = ["cli"]
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
  state.execution.currentMilestone = "M2"
  state.execution.currentTask = "T201"
  state.execution.currentWorktree = "../closeout-fixture-m2"
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "",
      status: "REVIEW",
      checklist: passingMilestoneChecklist(),
      tasks: [
        {
          id: "T101",
          name: "Ship foundation",
          type: "TASK",
          status: "DONE",
          prdRef: "PRD#F101",
          milestoneId: "M1",
          dod: ["Foundation delivered"],
          isUI: false,
          affectedFiles: ["feature.txt"],
          retryCount: 0,
          commitHash: "deadbeef",
        },
      ],
    },
    {
      id: "M2",
      name: "Iteration Two",
      productStageId: "V1",
      branch: "milestone/m2-iteration-two",
      worktreePath: "../closeout-fixture-m2",
      status: "IN_PROGRESS",
      tasks: [
        {
          id: "T201",
          name: "Start next milestone",
          type: "TASK",
          status: "IN_PROGRESS",
          prdRef: "PRD#F201",
          milestoneId: "M2",
          dod: ["Next milestone started"],
          isUI: false,
          affectedFiles: ["next.txt"],
          retryCount: 0,
        },
      ],
    },
  ]
  state.execution.allMilestonesComplete = false
  return state
}

function createStageBoundaryState(): ProjectState {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "stage-boundary-fixture"
  state.projectInfo.displayName = "Stage Boundary Fixture"
  state.projectInfo.concept = "Validate deploy-review boundaries."
  state.projectInfo.problem = "Autoflow must stop when a delivery version is fully merged."
  state.projectInfo.goal = "Merge V1 automatically, then stop at deploy review before V2 starts."
  state.projectInfo.types = ["cli"]
  state.projectInfo.aiProvider = "none"
  state.projectInfo.teamSize = "solo"
  state.projectInfo.isGreenfield = true
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
    {
      id: "V2",
      name: "Expansion",
      status: "DEFERRED",
      milestoneIds: ["M2"],
    },
  ]
  state.execution.currentMilestone = "M1"
  state.execution.currentTask = "T101"
  state.execution.currentWorktree = "../stage-boundary-fixture-m1"
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../stage-boundary-fixture-m1",
      status: "REVIEW",
      checklist: passingMilestoneChecklist(),
      tasks: [
        {
          id: "T101",
          name: "Ship V1 foundation",
          type: "TASK",
          status: "DONE",
          prdRef: "PRD#F101",
          milestoneId: "M1",
          dod: ["Foundation delivered"],
          isUI: false,
          affectedFiles: ["feature.txt"],
          retryCount: 0,
          commitHash: "deadbeef",
        },
      ],
    },
  ]
  state.execution.allMilestonesComplete = false
  return state
}

function createAtomicCommitState(): ProjectState {
  const state = initState({})
  state.phase = "EXECUTING"
  state.projectInfo.name = "atomic-fixture"
  state.projectInfo.displayName = "Atomic Fixture"
  state.projectInfo.concept = "Validate atomic task commit enforcement."
  state.projectInfo.problem = "Tasks can currently be closed with multiple commits."
  state.projectInfo.goal = "Reject non-atomic task completion."
  state.projectInfo.types = ["cli"]
  state.projectInfo.aiProvider = "none"
  state.projectInfo.teamSize = "solo"
  state.projectInfo.isGreenfield = true
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
  state.execution.currentTask = "T101"
  state.execution.currentWorktree = "../atomic-fixture-m1"
  state.execution.milestones = [
    {
      id: "M1",
      name: "Foundation",
      productStageId: "V1",
      branch: "milestone/m1-foundation",
      worktreePath: "../atomic-fixture-m1",
      status: "IN_PROGRESS",
      tasks: [
        {
          id: "T101",
          name: "One task, one commit",
          type: "TASK",
          status: "IN_PROGRESS",
          prdRef: "PRD#F101",
          milestoneId: "M1",
          dod: ["Exactly one commit lands this task"],
          isUI: false,
          affectedFiles: ["one.txt", "two.txt"],
          retryCount: 0,
        },
      ],
    },
  ]
  state.execution.allMilestonesComplete = false
  return state
}

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-milestone-closeout-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("autoflow auto-merges review milestones, compacts, and continues to the next milestone", async () => {
  write(".harness/compact.ts", readFileSync(COMPACT_SCRIPT_SOURCE, "utf-8"))
  write(
    "package.json",
    JSON.stringify(
      {
        name: "closeout-fixture",
        private: true,
        scripts: {
          "harness:merge-milestone": `bun ${MERGE_SCRIPT_PATH}`,
        },
      },
      null,
      2,
    ) + "\n",
  )
  write("docs/PRD.md", "# PRD\n")
  write("docs/ARCHITECTURE.md", "# Architecture\n")
  write("docs/PROGRESS.md", "# Progress\n")
  write("baseline.txt", "main\n")
  write("feature.txt", "baseline\n")
  write("next.txt", "next milestone\n")

  const state = createExecutingState()
  writeProjectStateToDisk(state, ".harness/state.json")

  expect(runGit(["init", "-b", "main"]).ok).toBe(true)
  expect(runGit(["config", "user.name", "Harness Test"]).ok).toBe(true)
  expect(runGit(["config", "user.email", "harness@example.com"]).ok).toBe(true)
  expect(runGit(["add", "."]).ok).toBe(true)
  expect(runGit(["commit", "-m", "chore: bootstrap"]).ok).toBe(true)

  expect(runGit(["checkout", "-b", "milestone/m1-foundation"]).ok).toBe(true)
  write("feature.txt", "merged from review milestone\n")
  expect(runGit(["add", "feature.txt"]).ok).toBe(true)
  const taskCommit = runGit([
    "commit",
    "-m",
    "feat(T101): ship foundation",
    "-m",
    "Closes: PRD#F101",
    "-m",
    "Code Review: ✅",
  ])
  expect(taskCommit.ok).toBe(true)
  const reviewCommit = runGit(["rev-parse", "HEAD"])
  expect(reviewCommit.ok).toBe(true)

  const persisted = JSON.parse(readFileSync(".harness/state.json", "utf-8")) as ProjectState
  persisted.execution.milestones[0]!.tasks[0]!.commitHash = reviewCommit.output
  writeProjectStateToDisk(persisted, ".harness/state.json")

  expect(runGit(["checkout", "main"]).ok).toBe(true)

  const exitCode = await runAutoflow()
  expect(exitCode).toBe(0)

  const updated = JSON.parse(readFileSync(".harness/state.json", "utf-8")) as ProjectState
  expect(updated.execution.milestones[0]!.status).toBe("MERGED")
  expect(updated.execution.currentMilestone).toBe("M2")
  expect(updated.execution.currentTask).toBe("T201")
  expect(existsSync(join(workspaceDir, "docs/progress/CONTEXT_SNAPSHOT.md"))).toBe(true)

  const snapshot = readFileSync(join(workspaceDir, "docs/progress/CONTEXT_SNAPSHOT.md"), "utf-8")
  expect(snapshot).toContain("> Mode: milestone")
  expect(snapshot).toContain("- **Milestone**: M1")
  expect(snapshot).toContain("Target milestone: M1")

  const readme = readFileSync(join(workspaceDir, "README.md"), "utf-8")
  expect(readme).toContain("Public Delivery Status")
  expect(readme).toContain("Latest merged milestone")
  expect(readme).toContain("M1 — Foundation")
  expect(readme).toContain("V1 — Initial Delivery (ACTIVE)")

  expect(readFileSync(join(workspaceDir, "feature.txt"), "utf-8")).toContain("merged from review milestone")
  expect(runGit(["branch", "--list", "milestone/m1-foundation"]).output).toBe("")
})

test("autoflow stops at deploy review when the current delivery version is fully merged", async () => {
  write(".harness/compact.ts", readFileSync(COMPACT_SCRIPT_SOURCE, "utf-8"))
  write(
    "package.json",
    JSON.stringify(
      {
        name: "stage-boundary-fixture",
        private: true,
        scripts: {
          "harness:merge-milestone": `bun ${MERGE_SCRIPT_PATH}`,
        },
      },
      null,
      2,
    ) + "\n",
  )
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
  write("docs/ARCHITECTURE.md", "# Architecture\n> **Version**: v1.0\n")
  write("docs/PROGRESS.md", "# Progress\n")
  write("baseline.txt", "main\n")
  write("feature.txt", "baseline\n")

  const state = createStageBoundaryState()
  writeProjectStateToDisk(state, ".harness/state.json")

  expect(runGit(["init", "-b", "main"]).ok).toBe(true)
  expect(runGit(["config", "user.name", "Harness Test"]).ok).toBe(true)
  expect(runGit(["config", "user.email", "harness@example.com"]).ok).toBe(true)
  expect(runGit(["add", "."]).ok).toBe(true)
  expect(runGit(["commit", "-m", "chore: bootstrap"]).ok).toBe(true)

  expect(runGit(["checkout", "-b", "milestone/m1-foundation"]).ok).toBe(true)
  write("feature.txt", "merged from review milestone\n")
  expect(runGit(["add", "feature.txt"]).ok).toBe(true)
  const taskCommit = runGit([
    "commit",
    "-m",
    "feat(T101): ship V1 foundation",
    "-m",
    "Closes: PRD#F101",
    "-m",
    "Code Review: ✅",
  ])
  expect(taskCommit.ok).toBe(true)
  const reviewCommit = runGit(["rev-parse", "HEAD"])
  expect(reviewCommit.ok).toBe(true)

  const persisted = JSON.parse(readFileSync(".harness/state.json", "utf-8")) as ProjectState
  persisted.execution.milestones[0]!.tasks[0]!.commitHash = reviewCommit.output
  writeProjectStateToDisk(persisted, ".harness/state.json")

  expect(runGit(["checkout", "main"]).ok).toBe(true)

  const exitCode = await runAutoflow()
  expect(exitCode).toBe(0)

  const updated = JSON.parse(readFileSync(".harness/state.json", "utf-8")) as ProjectState
  expect(updated.execution.milestones[0]!.status).toBe("MERGED")
  expect(updated.execution.currentMilestone).toBe("")
  expect(updated.execution.currentTask).toBe("")
  expect(updated.roadmap.currentStageId).toBe("V1")
  expect(updated.roadmap.stages[0]?.status).toBe("DEPLOY_REVIEW")
  expect(updated.roadmap.stages[1]?.status).toBe("DEFERRED")

  const readme = readFileSync(join(workspaceDir, "README.md"), "utf-8")
  expect(readme).toContain("V1 — Initial Delivery (DEPLOY_REVIEW)")
  expect(readme).toContain("Deploy/test V1")

  const gitbookReadme = readFileSync(join(workspaceDir, "docs/gitbook/README.md"), "utf-8")
  expect(gitbookReadme).toContain("Public Delivery Status")
  expect(gitbookReadme).toContain("Latest merged milestone")
  expect(gitbookReadme).toContain("M1 — Foundation")

  expect(runGit(["branch", "--list", "milestone/m1-foundation"]).output).toBe("")
})

test("autoflow runs final compact before stopping in COMPLETE", async () => {
  write(".harness/compact.ts", readFileSync(COMPACT_SCRIPT_SOURCE, "utf-8"))
  write(
    "package.json",
    JSON.stringify(
      {
        name: "complete-closeout-fixture",
        private: true,
        scripts: {
          "harness:compact": "bun .harness/compact.ts",
          "harness:compact:status": "bun .harness/compact.ts --status",
        },
      },
      null,
      2,
    ) + "\n",
  )
  write("docs/PRD.md", "# PRD\n> **Version**: v1.0\n")
  write("docs/ARCHITECTURE.md", "# Architecture\n> **Version**: v1.0\n")
  write("docs/PROGRESS.md", "# Progress\n")

  const state = initState({})
  state.phase = "COMPLETE"
  state.projectInfo.name = "complete-closeout-fixture"
  state.projectInfo.displayName = "Complete Closeout Fixture"
  state.projectInfo.types = ["cli"]
  state.docs.prd.exists = true
  state.docs.architecture.exists = true
  state.docs.readme.isFinal = true
  state.techStack.confirmed = true
  writeProjectStateToDisk(state, ".harness/state.json")

  const exitCode = await runAutoflow()
  expect(exitCode).toBe(0)

  const snapshotPath = join(workspaceDir, "docs/progress/CONTEXT_SNAPSHOT.md")
  expect(existsSync(snapshotPath)).toBe(true)
  expect(readFileSync(snapshotPath, "utf-8")).toContain("> Mode: task")
})

test("completeTask auto-writes a task-level context snapshot when compact runtime is present", () => {
  write(".harness/compact.ts", readFileSync(COMPACT_SCRIPT_SOURCE, "utf-8"))
  write("docs/PROGRESS.md", "# Progress\n")
  write("baseline.txt", "main\n")

  const state = createAtomicCommitState()
  state.execution.milestones[0]!.tasks[0]!.checklist = {
    prdDodMet: false,
    typecheckPassed: true,
    lintPassed: true,
    formatPassed: true,
    testsPassed: true,
    buildPassed: true,
    fileSizeOk: true,
    noForbiddenPatterns: true,
    dependencyChangeApproved: true,
    atomicCommitDone: false,
    progressUpdated: false,
  }
  writeProjectStateToDisk(state, ".harness/state.json")

  expect(runGit(["init", "-b", "main"]).ok).toBe(true)
  expect(runGit(["config", "user.name", "Harness Test"]).ok).toBe(true)
  expect(runGit(["config", "user.email", "harness@example.com"]).ok).toBe(true)
  expect(runGit(["add", "."]).ok).toBe(true)
  expect(runGit(["commit", "-m", "chore: bootstrap"]).ok).toBe(true)

  expect(runGit(["checkout", "-b", "milestone/m1-foundation"]).ok).toBe(true)
  write("one.txt", "first and only change\n")
  expect(runGit(["add", "one.txt"]).ok).toBe(true)
  expect(
    runGit([
      "commit",
      "-m",
      "feat(T101): ship atomic task",
      "-m",
      "Closes: PRD#F101",
      "-m",
      "Code Review: ✅",
    ]).ok,
  ).toBe(true)

  const head = runGit(["rev-parse", "HEAD"])
  expect(head.ok).toBe(true)

  completeTask("T101", head.output)

  const snapshotPath = join(workspaceDir, "docs/progress/CONTEXT_SNAPSHOT.md")
  expect(existsSync(snapshotPath)).toBe(true)
  const snapshot = readFileSync(snapshotPath, "utf-8")
  expect(snapshot).toContain("> Mode: task")
  expect(snapshot).toContain("## 🔴 RETAIN — Must Keep")
})

test("completeTask rejects multi-commit task histories", () => {
  write("docs/PROGRESS.md", "# Progress\n")
  write("baseline.txt", "main\n")
  writeProjectStateToDisk(createAtomicCommitState(), ".harness/state.json")

  expect(runGit(["init", "-b", "main"]).ok).toBe(true)
  expect(runGit(["config", "user.name", "Harness Test"]).ok).toBe(true)
  expect(runGit(["config", "user.email", "harness@example.com"]).ok).toBe(true)
  expect(runGit(["add", "."]).ok).toBe(true)
  expect(runGit(["commit", "-m", "chore: bootstrap"]).ok).toBe(true)

  expect(runGit(["checkout", "-b", "milestone/m1-foundation"]).ok).toBe(true)

  write("one.txt", "first change\n")
  expect(runGit(["add", "one.txt"]).ok).toBe(true)
  expect(
    runGit([
      "commit",
      "-m",
      "feat(T101): first part",
      "-m",
      "Closes: PRD#F101",
      "-m",
      "Code Review: ✅",
    ]).ok,
  ).toBe(true)

  write("two.txt", "second change\n")
  expect(runGit(["add", "two.txt"]).ok).toBe(true)
  expect(
    runGit([
      "commit",
      "-m",
      "feat(T101): second part",
      "-m",
      "Closes: PRD#F101",
      "-m",
      "Code Review: ✅",
    ]).ok,
  ).toBe(true)

  const head = runGit(["rev-parse", "HEAD"])
  expect(head.ok).toBe(true)
  expect(() => completeTask("T101", head.output)).toThrow(/exactly 1 commit/i)
})
