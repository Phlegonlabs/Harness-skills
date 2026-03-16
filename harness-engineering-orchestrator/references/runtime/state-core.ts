import { existsSync, mkdirSync } from "fs"
import type { ProjectState } from "../types"
import { deriveStateFromFilesystem, HARNESS_CRITICAL_TOTAL, PROGRESS_DIR, STATE_PATH } from "./shared"
import { syncProgressDocuments } from "./progress"
import { readProjectStateFromDisk, writeProjectStateToDisk } from "./state-io"
import { ensureWorkflowHistory } from "./workflow-history"

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export function ensureProjectDirs(): void {
  mkdirSync(".harness", { recursive: true })
  mkdirSync("docs", { recursive: true })
  mkdirSync(PROGRESS_DIR, { recursive: true })
}

export function readState(): ProjectState {
  if (!existsSync(STATE_PATH)) {
    throw new Error("State not initialized. Run harness-init first.")
  }
  try {
    return ensureWorkflowHistory(readProjectStateFromDisk(STATE_PATH))
  } catch (error) {
    const backupPath = `${STATE_PATH}.backup`
    if (existsSync(backupPath)) {
      console.warn("⚠️  Primary state file is corrupt — recovering from backup.")
      const recovered = ensureWorkflowHistory(readProjectStateFromDisk(backupPath))
      writeProjectStateToDisk(recovered, STATE_PATH)
      return recovered
    }
    throw error
  }
}

export function refreshDerivedState(state: ProjectState): ProjectState {
  return ensureWorkflowHistory(deriveStateFromFilesystem(state, { updateProgressTimestamp: true }))
}

export function writeState(state: ProjectState): ProjectState {
  ensureProjectDirs()
  state.execution.stateVersion = (state.execution.stateVersion ?? 0) + 1
  const normalized = refreshDerivedState(state)
  syncProgressDocuments(normalized)
  normalized.docs.progress.exists = true
  normalized.docs.progress.lastUpdated = new Date().toISOString()
  normalized.updatedAt = normalized.docs.progress.lastUpdated
  writeProjectStateToDisk(normalized, STATE_PATH)
  return normalized
}

export function initState(partial: Partial<ProjectState>): ProjectState {
  return refreshDerivedState({
    version: "1.0",
    phase: "DISCOVERY",
    projectInfo: {
      name: "",
      displayName: "",
      concept: "",
      problem: "",
      goal: "",
      types: [],
      aiProvider: "none",
      teamSize: "solo",
      isGreenfield: true,
      harnessLevel: { level: "standard", autoDetected: true, detectedAt: new Date().toISOString() },
    },
    marketResearch: { summary: "", competitors: [], techTrends: [] },
    techStack: { confirmed: false, decisions: [] },
    docs: {
      prd: {
        path: "docs/PRD.md",
        exists: false,
        version: "v1.0",
        milestoneCount: 0,
      },
      architecture: {
        path: "docs/ARCHITECTURE.md",
        exists: false,
        version: "v1.0",
        dependencyLayers: ["types", "config", "lib", "services", "app"],
        ciValidated: false,
      },
      progress: {
        path: "docs/PROGRESS.md",
        exists: false,
        lastUpdated: "",
      },
      gitbook: {
        path: "docs/gitbook/",
        initialized: false,
        summaryExists: false,
      },
      readme: {
        path: "README.md",
        exists: false,
        isFinal: false,
      },
      adrs: [],
    },
    scaffold: {
      agentsMdExists: false,
      claudeMdExists: false,
      envExampleExists: false,
      ciExists: false,
      cdExists: false,
      prTemplateExists: false,
      depCheckConfigured: false,
      linterConfigured: false,
      manifestExists: false,
      githubSetup: false,
    },
    roadmap: {
      currentStageId: "",
      stages: [],
    },
    execution: {
      currentMilestone: "",
      currentTask: "",
      currentWorktree: "",
      milestones: [],
      allMilestonesComplete: false,
    },
    history: {
      events: [],
    },
    validation: { score: 0, criticalPassed: 0, criticalTotal: HARNESS_CRITICAL_TOTAL },
    github: {
      repoCreated: false,
      remoteAdded: false,
      pushed: false,
      remoteUrl: "",
      orgName: "",
      repoName: "",
      visibility: "private",
      branchProtection: false,
      labelsCreated: false,
      issueTemplatesCreated: false,
    },
    toolchain: {
      ecosystem: "bun",
      packageManager: "bun",
      language: "typescript",
      commands: {
        install: { command: "bun install" },
        typecheck: { command: "bun run typecheck" },
        lint: { command: "bun run lint" },
        format: { command: "bun run format" },
        test: { command: "bun test" },
        build: { command: "bun run build" },
      },
      sourceExtensions: [".ts", ".tsx", ".js", ".jsx"],
      sourceRoot: "src",
      manifestFile: "package.json",
      lockFile: "bun.lockb",
      forbiddenPatterns: [],
      ignorePatterns: ["node_modules/", "dist/", ".harness/"],
    },
    metrics: { entries: [], lastCollectedAt: undefined },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  })
}

function deepMerge<T>(target: T, source: DeepPartial<T>): T {
  const result = { ...target } as Record<string, unknown>

  for (const key in source) {
    const nextValue = source[key]
    const currentValue = result[key]

    if (
      nextValue !== undefined &&
      nextValue !== null &&
      typeof nextValue === "object" &&
      !Array.isArray(nextValue)
    ) {
      result[key] = deepMerge(
        (currentValue as Record<string, unknown> | undefined) ?? {},
        nextValue as Record<string, unknown>,
      )
    } else if (nextValue !== undefined) {
      result[key] = nextValue as unknown
    }
  }

  return result as T
}

export function updateState(updates: DeepPartial<ProjectState>): ProjectState {
  return writeState(deepMerge(readState(), updates))
}
