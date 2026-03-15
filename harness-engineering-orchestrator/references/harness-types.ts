/**
 * harness-types.ts
 *
 * Core type definitions for Harness Engineering and Orchestrator.
 * Every generated project will have a copy of this file at .harness/types.ts.
 *
 * Purpose:
 * - Constrain the data structure of PROGRESS.md (JSON front-matter)
 * - Enable type checking in the harness-validate script
 * - Give Agents an explicit schema to reference, without relying on prose descriptions
 */

// ─── Phase ────────────────────────────────────────────────────────────────────

export type Phase =
  | "DISCOVERY"       // Phase 0: Gather requirements
  | "MARKET_RESEARCH" // Phase 1: Competitive research
  | "TECH_STACK"      // Phase 2: Tech negotiation
  | "PRD_ARCH"        // Phase 3: PRD + Architecture
  | "SCAFFOLD"        // Phase 4: Repo initialization
  | "EXECUTING"       // Phase 5: Task Loop
  | "VALIDATING"      // Phase 6: Harness Validation
  | "COMPLETE"        // All done

// Phase transition gate: conditions that must be met before entering the next Phase
export const PHASE_GATES: Record<Phase, string[]> = {
  DISCOVERY:       [],
  MARKET_RESEARCH: [
    "projectInfo.name",
    "projectInfo.displayName",
    "projectInfo.concept",
    "projectInfo.problem",
    "projectInfo.goal",
    "projectInfo.types",
    "projectInfo.aiProvider",
  ],
  TECH_STACK:      ["marketResearch.summary", "techStack.decisions[].adrFile"],
  PRD_ARCH:        ["techStack.confirmed === true", "techStack.decisions[].adrFile"],
  SCAFFOLD:        ["docs.prd.exists", "docs.architecture.exists", "docs.gitbook.initialized", "docs.gitbook.summaryExists"],
  EXECUTING:       ["scaffold.ciExists", "scaffold.agentsMdExists"],
  VALIDATING:      ["execution.allMilestonesComplete"],
  COMPLETE:        ["validation.score >= 80", "docs.readme.isFinal", "git worktree list -> main only", "harness:compact --status"],
}

// ─── Project Info ─────────────────────────────────────────────────────────────

export type ProjectType =
  | "web-app"
  | "ios-app"
  | "android-app"
  | "api"
  | "mobile-cross-platform"
  | "cli"
  | "agent"
  | "desktop"
  | "monorepo"

export type AIProvider =
  | "openai"
  | "anthropic"
  | "both"
  | "vercel-ai-sdk"
  | "google"
  | "open-source"
  | "multi"
  | "none"

export type TeamSize = "solo" | "small" | "large"

export type DesignStyle =
  | "dark-modern"
  | "clean-minimal"
  | "bold-expressive"
  | "professional"
  | "soft-friendly"
  | "custom"

export interface ProjectInfo {
  name: string              // package name (kebab-case)
  displayName: string       // Display name
  concept: string           // 2-3 sentence description
  problem: string           // What problem it solves
  goal: string              // Success criteria
  types: ProjectType[]
  aiProvider: AIProvider
  teamSize: TeamSize
  isGreenfield: boolean     // Q0: greenfield or existing codebase
  designStyle?: DesignStyle // Q9: only for UI projects
  designReference?: string  // User-provided reference App/website
}

// ─── Tech Stack ───────────────────────────────────────────────────────────────

export interface TechStackDecision {
  layer: string             // e.g. "frontend", "database", "auth"
  choice: string            // e.g. "Next.js 15"
  version?: string
  reason: string            // Why this was chosen
  rejectedOptions: string[] // What was rejected, corresponding ADR
  adrFile: string           // e.g. "docs/adr/ADR-001-chose-nextjs.md"
  confirmedAt: string       // ISO timestamp
}

export interface TechStack {
  confirmed: boolean
  decisions: TechStackDecision[]
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export type TaskType = "TASK" | "SPIKE"

export type TaskStatus =
  | "PENDING"       // Not started yet
  | "IN_PROGRESS"   // Currently executing
  | "BLOCKED"       // External dependency, cannot continue
  | "DONE"          // Completed and committed
  | "SKIPPED"       // Explicitly skipped (reason required)

export interface TaskChecklist {
  prdDodMet: boolean
  typecheckPassed: boolean
  lintPassed: boolean
  formatPassed: boolean
  testsPassed: boolean
  buildPassed: boolean
  fileSizeOk: boolean         // All modified files ≤ 400 lines
  noForbiddenPatterns: boolean // No blocking forbidden patterns (console.log / : any / @ts-ignore / secrets)
  atomicCommitDone: boolean
  progressUpdated: boolean
}

export interface SpikeChecklist {
  evaluationNoteWritten: boolean  // Written to LEARNING.md
  adrGenerated: boolean           // ADR document generated
}

export interface Task {
  id: string              // e.g. "T001"
  name: string
  type: TaskType
  status: TaskStatus
  prdRef: string          // e.g. "PRD#F001"
  milestoneId: string     // e.g. "M1"
  dod: string[]           // Definition of Done checklist
  isUI: boolean           // Whether UI is involved (determines whether Frontend Designer is triggered)
  affectedFiles: string[] // Expected affected files (max 5)
  commitHash?: string     // Filled in after completion
  retryCount: number      // Debug Loop retry count (max 3)
  blockedReason?: string  // Reason when BLOCKED
  checklist?: TaskChecklist | SpikeChecklist
  completedAt?: string    // ISO timestamp
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export type MilestoneStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "REVIEW"          // All Tasks done, awaiting Milestone Review
  | "MERGED"          // Merged to main
  | "COMPLETE"        // CHANGELOG + GitBook update complete

export interface Milestone {
  id: string            // e.g. "M1"
  name: string
  branch: string        // e.g. "milestone/m1-foundation"
  worktreePath: string  // e.g. "../my-app-m1"
  status: MilestoneStatus
  tasks: Task[]
  mergeCommit?: string
  completedAt?: string
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface HarnessDocuments {
  prd: {
    path: "docs/PRD.md"
    exists: boolean
    version: string       // e.g. "v1.2"
    milestoneCount: number
  }
  architecture: {
    path: "docs/ARCHITECTURE.md"
    exists: boolean
    dependencyLayers: string[]
    ciValidated: boolean  // dependency-cruiser runs in CI
  }
  progress: {
    path: "docs/PROGRESS.md"
    exists: boolean
    lastUpdated: string
  }
  gitbook: {
    path: "docs/gitbook/"
    initialized: boolean
    summaryExists: boolean
  }
  readme: {
    path: "README.md"
    exists: boolean
    isFinal: boolean      // Only true after Phase 6 is complete
  }
  design?: {
    systemPath: "docs/design/DESIGN_SYSTEM.md"
    exists: boolean
    milestoneSpecs: string[]
  }
  adrs: string[]          // e.g. ["docs/adr/ADR-001-xxx.md"]
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

export interface ScaffoldState {
  agentsMdExists: boolean
  claudeMdExists: boolean
  envExampleExists: boolean
  ciExists: boolean
  cdExists: boolean
  prTemplateExists: boolean
  depCruiserConfigured: boolean
  githubSetup: boolean
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export interface GitHubState {
  repoCreated: boolean       // gh repo create succeeded (or repo already existed)
  remoteAdded: boolean       // git remote add origin done
  pushed: boolean            // initial push done
  remoteUrl: string          // "https://github.com/org/repo"
  orgName: string
  repoName: string
  visibility: "public" | "private"
  branchProtection: boolean
  labelsCreated: boolean
  issueTemplatesCreated: boolean
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface ExecutionState {
  currentMilestone: string    // e.g. "M2"
  currentTask: string         // e.g. "T007"
  currentWorktree: string
  milestones: Milestone[]
  allMilestonesComplete: boolean
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationState {
  score: number               // 0-100
  criticalPassed: number
  criticalTotal: number
  lastRun?: string
}

// ─── Root ProjectState ────────────────────────────────────────────────────────

/**
 * ProjectState is the complete state maintained by the Orchestrator.
 * Serialized to .harness/state.json, updated after each Task completes.
 * The harness-validate script reads this file for phase gate checks.
 */
export interface ProjectState {
  version: "1.0"
  phase: Phase
  projectInfo: ProjectInfo
  marketResearch: {
    summary: string
    competitors: string[]
    techTrends: string[]
  }
  techStack: TechStack
  docs: HarnessDocuments
  scaffold: ScaffoldState
  execution: ExecutionState
  validation: ValidationState
  github: GitHubState
  createdAt: string
  updatedAt: string
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export type AgentId =
  | "project-discovery"
  | "market-research"
  | "tech-stack-advisor"
  | "prd-architect"
  | "scaffold-generator"
  | "frontend-designer"
  | "execution-engine"
  | "design-reviewer"
  | "code-reviewer"
  | "harness-validator"
  | "context-compactor"

export interface AgentDispatch {
  agentId: AgentId
  specPath: string
  context: string
  validationCommand: string
  postAction?: string
}

export interface AgentMaterialPolicy {
  agentId: AgentId
  conditions?: string[]
  inlineConstraints: string[]
  optionalRefs: string[]
  requiredRefs: string[]
}

export interface AgentPacketMilestone {
  id: string
  name: string
  status: MilestoneStatus
}

export interface AgentPacketTask {
  affectedFiles: string[]
  id: string
  isUI: boolean
  name: string
  prdRef: string
  retryCount: number
  status: TaskStatus
  type: TaskType
}

export interface AgentTaskPacket {
  agentId: AgentId
  agentName: string
  afterCompletion: string[]
  currentMilestone?: AgentPacketMilestone
  currentTask?: AgentPacketTask
  inlineConstraints: string[]
  missingOutputs: string[]
  optionalRefs: string[]
  phase: Phase
  requiredOutputs: string[]
  requiredRefs: string[]
  specPath: string
  taskDod: string[]
  validationCommand: string
  worktree?: string
}
