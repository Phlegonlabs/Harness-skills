import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { ProjectState } from "../../types"
import { initState } from "../state-core"
import { writeProjectStateToDisk } from "../state-io"
import { deriveStateFromFilesystem } from "../shared"
import { runAutoflow } from "./autoflow"
import { dispatch } from "./dispatcher"
import { getPhaseReadiness } from "./phase-readiness"

let originalCwd = ""
let workspaceDir = ""

function createState(phase: ProjectState["phase"]): ProjectState {
  const state = initState({})
  state.phase = phase
  state.projectInfo.name = "phase-ready-project"
  state.projectInfo.displayName = "Phase Ready Project"
  state.projectInfo.concept = "A fixture project for orchestrator readiness tests."
  state.projectInfo.problem = "Phase work can be skipped when outputs are missing."
  state.projectInfo.goal = "Keep autoflow and dispatch aligned with actual phase artifacts."
  state.projectInfo.types = ["monorepo", "web-app"]
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
  state.docs.prd.exists = true
  state.docs.prd.milestoneCount = 1
  state.docs.architecture.exists = true
  state.docs.architecture.version = "v1.0"
  state.docs.gitbook.initialized = true
  state.docs.gitbook.summaryExists = true
  return state
}

function write(path: string, content = ""): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(join(fullPath, ".."), { recursive: true })
  writeFileSync(fullPath, content)
}

function writePlanningDocs(options?: {
  architecture?: string
  prd?: string
}): void {
  write(
    "docs/PRD.md",
    options?.prd
      ?? [
        "> **Version**: v1.0",
        "",
        "## Product Stage V1: Initial Delivery [ACTIVE]",
        "### Milestone 1: Foundation",
        "#### F001: Ship foundation",
        "- [ ] finish setup",
        "",
      ].join("\n"),
  )
  write(
    "docs/ARCHITECTURE.md",
    options?.architecture
      ?? [
        "> **Version**: v1.0",
        "",
        "## Dependency Direction",
        "types -> config -> lib -> services -> app",
        "",
      ].join("\n"),
  )
  write("docs/gitbook/SUMMARY.md", "# Summary\n")
}

function materializeScaffoldArtifacts(state: ProjectState): void {
  writePlanningDocs()
  write("AGENTS.md", "# AGENTS\n")
  write("CLAUDE.md", "# AGENTS\n")
  write(
    ".gitignore",
    [
      ".env",
      "node_modules/",
      ".harness/",
      "AGENTS.md",
      "CLAUDE.md",
      "agents/",
      "docs/ai/",
      "docs/progress/",
    ].join("\n") + "\n",
  )
  write(".env.example", "EXAMPLE=1\n")
  write(".env.local", "LOCAL=1\n")
  write("biome.json", "{}\n")
  write(".github/workflows/ci.yml", "name: ci\n")
  write("docs/PROGRESS.md", "# Progress\n")
  write("packages/shared/package.json", "{\n  \"name\": \"shared\"\n}\n")
  write("apps/web/package.json", "{\n  \"name\": \"web\"\n}\n")
  write("scripts/harness-local/restore.ts", "export {}\n")
  write("scripts/harness-local/manifest.json", "{}\n")

  for (const file of [
    "types.ts",
    "init.ts",
    "advance.ts",
    "state.ts",
    "validate.ts",
    "orchestrator.ts",
    "orchestrate.ts",
    "stage.ts",
    "compact.ts",
    "add-surface.ts",
    "audit.ts",
    "sync-docs.ts",
    "sync-skills.ts",
    "api-add.ts",
    "merge-milestone.ts",
    "resume.ts",
    "learn.ts",
    "metrics.ts",
    "entropy-scan.ts",
    "scope-change.ts",
  ]) {
    write(`.harness/${file}`, "export {}\n")
  }

  write(
    "package.json",
    JSON.stringify(
      {
        name: "phase-ready-project",
        private: true,
        workspaces: ["apps/*", "packages/*"],
        scripts: {
          "harness:init": "bun .harness/init.ts",
          "harness:init:prd": "bun .harness/init.ts --from-prd",
          "harness:advance": "bun .harness/advance.ts",
          "harness:stage": "bun .harness/stage.ts",
          "harness:state": "bun .harness/state.ts",
          "harness:env": "bun .harness/validate.ts --env",
          "harness:validate": "bun .harness/validate.ts",
          "harness:validate:phase": "bun .harness/validate.ts --phase",
          "harness:validate:task": "bun .harness/validate.ts --task",
          "harness:validate:milestone": "bun .harness/validate.ts --milestone",
          "harness:guardian": "bun .harness/validate.ts --guardian",
          "harness:sync-backlog": "bun .harness/init.ts --sync-from-prd",
          "harness:add-surface": "bun .harness/add-surface.ts",
          "harness:autoflow": "bun .harness/orchestrator.ts --auto",
          "harness:audit": "bun .harness/audit.ts",
          "harness:hooks:install": "bun scripts/harness-local/restore.ts",
          "harness:sync-docs": "bun .harness/sync-docs.ts",
          "harness:sync-skills": "bun .harness/sync-skills.ts",
          "harness:api:add": "bun .harness/api-add.ts",
          "harness:resume": "bun .harness/resume.ts",
          "harness:learn": "bun .harness/learn.ts",
          "harness:metrics": "bun .harness/metrics.ts",
          "harness:entropy-scan": "bun .harness/entropy-scan.ts",
          "harness:scope-change": "bun .harness/scope-change.ts",
          "harness:orchestrator": "bun .harness/orchestrator.ts",
          "harness:orchestrate": "bun .harness/orchestrate.ts",
          "harness:compact": "bun .harness/compact.ts",
          "harness:compact:milestone": "bun .harness/compact.ts --milestone",
          "harness:compact:status": "bun .harness/compact.ts --status",
          "harness:merge-milestone": "bun .harness/merge-milestone.ts",
        },
      },
      null,
      2,
    ) + "\n",
  )

  for (const path of [
    "agents/project-discovery.md",
    "agents/market-research.md",
    "agents/tech-stack-advisor.md",
    "agents/prd-architect.md",
    "agents/scaffold-generator.md",
    "agents/frontend-designer.md",
    "agents/execution-engine.md",
    "agents/execution-engine/01-preflight.md",
    "agents/execution-engine/02-task-loop.md",
    "agents/execution-engine/03-spike-workflow.md",
    "agents/execution-engine/04-stack-scaffolds.md",
    "agents/execution-engine/05-debug-and-learning.md",
    "agents/design-reviewer.md",
    "agents/code-reviewer.md",
    "agents/harness-validator.md",
    "agents/context-compactor.md",
    "agents/entropy-scanner.md",
    "agents/fast-path-bootstrap.md",
    "agents/execution-engine/06-observability.md",
  ]) {
    write(path, "# agent\n")
  }

  writeProjectStateToDisk(state, join(workspaceDir, ".harness/state.json"))
}

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-phase-readiness-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { force: true, recursive: true })
})

test("scaffold readiness reports missing scaffold outputs", () => {
  const state = createState("SCAFFOLD")
  writeProjectStateToDisk(state, ".harness/state.json")

  const readiness = getPhaseReadiness(state)

  expect(readiness.ready).toBe(false)
  expect(readiness.missingOutputs).toContain("AGENTS.md is present")
  expect(readiness.missingOutputs).toContain(".harness/advance.ts is present")
})

test("dispatch sends scaffold-generator when scaffold outputs are missing", () => {
  const state = createState("SCAFFOLD")
  writePlanningDocs()
  writeProjectStateToDisk(state, ".harness/state.json")

  const result = dispatch(state)

  expect(result.type).toBe("agent")
  expect(result.agentId).toBe("scaffold-generator")
  expect(result.packet?.missingOutputs).toContain("AGENTS.md is present")
})

test("dispatch switches to manual advance guidance once scaffold outputs are ready", () => {
  const state = createState("SCAFFOLD")
  materializeScaffoldArtifacts(state)
  const syncedState = deriveStateFromFilesystem(state)

  const result = dispatch(syncedState)

  expect(result.type).toBe("manual")
  expect(result.message).toContain("Scaffold outputs are ready.")
  expect(result.message).toContain("bun harness:advance")
})

test("autoflow stops at scaffold when artifacts are missing instead of running commands", async () => {
  const state = createState("SCAFFOLD")
  writePlanningDocs()
  writeProjectStateToDisk(state, ".harness/state.json")

  const exitCode = await runAutoflow()

  expect(exitCode).toBe(0)
})

test("dispatch routes back to prd-architect when planning docs are still scaffold placeholders", () => {
  const state = createState("SCAFFOLD")
  writePlanningDocs({
    prd: [
      "### Milestone 1: Foundation",
      "#### F001: Harness Base Scaffold",
      "- [ ] keep placeholder scaffold scope",
      "",
      "#### F002: Backlog and Validation Closed Loop",
      "- [ ] keep placeholder orchestration scope",
      "",
    ].join("\n"),
  })
  writeProjectStateToDisk(state, ".harness/state.json")

  const result = dispatch(state)

  expect(result.type).toBe("agent")
  expect(result.agentId).toBe("prd-architect")
  expect(result.packet?.missingOutputs.some(item => item.includes("stock scaffold feature"))).toBe(true)
})

test("discovery readiness stays false for UI projects until designStyle is captured", () => {
  const state = createState("DISCOVERY")
  state.projectInfo.designStyle = undefined

  const readiness = getPhaseReadiness(state)

  expect(readiness.ready).toBe(false)
  expect(readiness.missingOutputs).toContain("designStyle is selected [Q9] (required for UI projects)")
})
