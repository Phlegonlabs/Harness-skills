import { existsSync } from "fs"
import type { AgentId, Milestone, Phase, ProjectState } from "../../types"
import { isUiProject } from "../shared"

export interface AgentEntry {
  id: AgentId
  name: string
  specPath: string
  subSpecs?: string[]
  /** Soft time limit in milliseconds. Rendered as an instruction constraint in the task packet. */
  timeoutMs?: number
}

const AGENT_ENTRIES: AgentEntry[] = [
  {
    id: "project-discovery",
    name: "Project Discovery Agent",
    specPath: "agents/project-discovery.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "market-research",
    name: "Market Research Agent",
    specPath: "agents/market-research.md",
    timeoutMs: 15 * 60_000, // 15 min
  },
  {
    id: "tech-stack-advisor",
    name: "Tech Stack Advisor Agent",
    specPath: "agents/tech-stack-advisor.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "prd-architect",
    name: "PRD Architect Agent",
    specPath: "agents/prd-architect.md",
    timeoutMs: 20 * 60_000, // 20 min
  },
  {
    id: "scaffold-generator",
    name: "Scaffold Generator Agent",
    specPath: "agents/scaffold-generator.md",
    timeoutMs: 15 * 60_000, // 15 min
  },
  {
    id: "frontend-designer",
    name: "Frontend Designer Agent",
    specPath: "agents/frontend-designer.md",
    timeoutMs: 15 * 60_000, // 15 min
  },
  {
    id: "execution-engine",
    name: "Execution Engine Agent",
    specPath: "agents/execution-engine.md",
    timeoutMs: 30 * 60_000, // 30 min
    subSpecs: [
      "agents/execution-engine/01-preflight.md",
      "agents/execution-engine/02-task-loop.md",
      "agents/execution-engine/03-spike-workflow.md",
      "agents/execution-engine/04-stack-scaffolds.md",
      "agents/execution-engine/05-debug-and-learning.md",
      "agents/execution-engine/06-observability.md",
    ],
  },
  {
    id: "design-reviewer",
    name: "Design Reviewer Agent",
    specPath: "agents/design-reviewer.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer Agent",
    specPath: "agents/code-reviewer.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "harness-validator",
    name: "Harness Validator Agent",
    specPath: "agents/harness-validator.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "context-compactor",
    name: "Context Compactor Agent",
    specPath: "agents/context-compactor.md",
    timeoutMs: 10 * 60_000, // 10 min
  },
  {
    id: "entropy-scanner",
    name: "Entropy Scanner Agent",
    specPath: "agents/entropy-scanner.md",
    timeoutMs: 5 * 60_000, // 5 min
  },
  {
    id: "fast-path-bootstrap",
    name: "Fast Path Bootstrap Agent",
    specPath: "agents/fast-path-bootstrap.md",
    timeoutMs: 20 * 60_000, // 20 min
  },
]

export function getAgentEntry(agentId: AgentId): AgentEntry | undefined {
  return AGENT_ENTRIES.find(entry => entry.id === agentId)
}

export function getAllAgentEntries(): AgentEntry[] {
  return AGENT_ENTRIES
}

const V1_UNSUPPORTED_PHASES: Partial<Record<Phase, string>> = {}

export function getUnsupportedPhaseGuidance(phase: Phase): string | undefined {
  return V1_UNSUPPORTED_PHASES[phase]
}

export function needsDesignSystem(): boolean {
  return !existsSync("docs/design/DESIGN_SYSTEM.md")
}

export function needsMilestoneSpec(milestone: Milestone): boolean {
  if (!milestone.tasks.some(task => task.isUI)) return false
  const specPath = `docs/design/${milestone.id.toLowerCase()}-ui-spec.md`
  return !existsSync(specPath)
}

export function needsFrontendDesigner(state: ProjectState): boolean {
  if (!isUiProject(state.projectInfo.types)) return false
  const milestone = state.execution.milestones.find(
    m => m.id === state.execution.currentMilestone,
  )
  if (!milestone) return false
  return needsDesignSystem() || needsMilestoneSpec(milestone)
}
