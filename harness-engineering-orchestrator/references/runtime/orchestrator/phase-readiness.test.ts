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
  state.docs.prd.exists = true
  state.docs.prd.milestoneCount = 1
  state.docs.architecture.exists = true
  state.docs.gitbook.initialized = true
  state.docs.gitbook.summaryExists = true
  return state
}

function write(path: string, content = ""): void {
  const fullPath = join(workspaceDir, path)
  mkdirSync(join(fullPath, ".."), { recursive: true })
  writeFileSync(fullPath, content)
}

function materializeScaffoldArtifacts(state: ProjectState): void {
  write("AGENTS.md", "# AGENTS\n")
  write("CLAUDE.md", "# AGENTS\n")
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
    "advance.ts",
    "compact.ts",
    "add-surface.ts",
    "audit.ts",
    "sync-docs.ts",
    "sync-skills.ts",
    "api-add.ts",
    "merge-milestone.ts",
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
          "harness:advance": "bun .harness/advance.ts",
          "harness:autoflow": "bun .harness/orchestrator.ts --auto",
          "harness:merge-milestone": "bun .harness/merge-milestone.ts",
        },
      },
      null,
      2,
    ) + "\n",
  )

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
  writeProjectStateToDisk(state, ".harness/state.json")

  const exitCode = await runAutoflow()

  expect(exitCode).toBe(0)
})
