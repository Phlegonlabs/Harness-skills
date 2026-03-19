import { existsSync } from "fs"
import type { AgentId, AgentMaterialPolicy, AgentPlatform, Milestone, ProjectState, Task } from "../../types"
import { getAgentEntry } from "./agent-registry"

const CONTEXT_SNAPSHOT_PATH = "docs/progress/CONTEXT_SNAPSHOT.md"
const DESIGN_SYSTEM_PATH = "docs/design/DESIGN_SYSTEM.md"

function existingRefs(paths: Array<string | undefined>): string[] {
  const refs: string[] = []
  for (const path of paths) {
    if (!path) continue
    if (!existsSync(path)) continue
    refs.push(path)
  }
  return refs
}

function existingRef(path: string): string | undefined {
  return existsSync(path) ? path : undefined
}

function getCurrentTask(state: ProjectState): Task | undefined {
  return state.execution.milestones
    .flatMap(milestone => milestone.tasks)
    .find(task => task.id === state.execution.currentTask)
}

function getTaskContext(state: ProjectState, taskOverride?: Task): Task | undefined {
  return taskOverride ?? getCurrentTask(state)
}

function currentMilestoneSpecPath(state: ProjectState, milestoneOverride?: Milestone): string | undefined {
  const milestoneId = (milestoneOverride?.id ?? state.execution.currentMilestone)?.toLowerCase()
  if (!milestoneId) return undefined
  return existingRef(`docs/design/${milestoneId}-ui-spec.md`)
}

function prdRef(kind: "index" | "requirements" | "design"): string | undefined {
  switch (kind) {
    case "index":
      return existingRef("docs/PRD.md") ?? existingRef("docs/prd/01-overview.md")
    case "requirements":
      return existingRef("docs/prd/03-requirements.md") ?? existingRef("docs/PRD.md")
    case "design":
      return (
        existingRef("docs/prd/02-users-and-design.md") ??
        existingRef("docs/prd/03-requirements.md") ??
        existingRef("docs/PRD.md")
      )
  }
}

function architectureRef(kind: "index" | "frontend" | "rules"): string | undefined {
  switch (kind) {
    case "index":
      return existingRef("docs/ARCHITECTURE.md") ?? existingRef("docs/architecture/01-system-overview.md")
    case "frontend":
      return (
        existingRef("docs/architecture/01-system-overview.md") ??
        existingRef("docs/architecture/02-project-structure.md") ??
        existingRef("docs/ARCHITECTURE.md")
      )
    case "rules":
      return (
        existingRef("docs/architecture/03-dependency-rules.md") ??
        existingRef("docs/architecture/04-state-and-validation.md") ??
        existingRef("docs/ARCHITECTURE.md")
      )
  }
}

function commonConstraints(): string[] {
  return [
    "Keep AGENTS.md and CLAUDE.md synchronized [G8].",
    "Do not introduce forbidden patterns or secret-like values in source code [G4/G6].",
    "No single source file may exceed 400 lines; split immediately if exceeded [G3].",
    "Dependency direction: types → config → lib → services → app. Reverse imports are forbidden [G5].",
    "LEARNING.md must not enter the repo; use ~/.codex/LEARNING.md or ~/.claude/LEARNING.md [G9].",
    "Use explicit validation gates before progression; do not hand-wave completion.",
  ]
}

function platformConstraints(platform: AgentPlatform): string[] {
  switch (platform) {
    case "claude-code":
      return ["PreToolUse hooks enforce guardians at write time — if a write is rejected, fix the pattern and retry. Use worktree isolation for write-capable parallel children when needed."]
    case "codex-cli":
      return ["Codex native subagents inherit parent approvals and sandbox posture. Notify hooks and Git hooks are guardrails only — integrate results, verify guardian compliance, then close the child."]
    default:
      return []
  }
}

function executionConstraints(task?: Task): string[] {
  const constraints = [
    "Implement only work that maps to the current task and PRD reference [G1].",
    "If the user asks for new scope outside the current task / PRD reference, stop implementation, update PRD first, then use bun harness:scope-change --apply or run bun harness:sync-backlog before coding.",
    "Do not land feature work directly on main/master [G2].",
    "Create exactly one Atomic Commit per task with Task-ID and PRD mapping [G10].",
    "After task completion, synchronize .harness/state.json and docs/PROGRESS.md.",
  ]

  if (task?.isUI) {
    constraints.push("UI work requires a design spec before implementation and Design Review approval before commit [G7].")
  }

  return constraints
}

function progressRefs(): string[] {
  return existingRefs(["docs/PROGRESS.md", CONTEXT_SNAPSHOT_PATH])
}

function packetRefsFor(
  agentId: AgentId,
  state: ProjectState,
  context?: { milestone?: Milestone; task?: Task },
): { optionalRefs: string[]; requiredRefs: string[] } {
  const entry = getAgentEntry(agentId)
  const task = getTaskContext(state, context?.task)
  const milestone = context?.milestone
  const base = [entry?.specPath, ".harness/state.json"]

  switch (agentId) {
    case "project-discovery":
      return {
        requiredRefs: existingRefs(base),
        optionalRefs: existingRefs(["README.md", ...progressRefs()]),
      }

    case "market-research":
      return {
        requiredRefs: existingRefs(base),
        optionalRefs: existingRefs([prdRef("index"), "README.md"]),
      }

    case "tech-stack-advisor":
      return {
        requiredRefs: existingRefs(base),
        optionalRefs: existingRefs([prdRef("index"), architectureRef("index")]),
      }

    case "prd-architect":
      return {
        requiredRefs: existingRefs(base),
        optionalRefs: existingRefs([prdRef("index"), architectureRef("index")]),
      }

    case "scaffold-generator":
      return {
        requiredRefs: existingRefs([
          ...base,
          prdRef("requirements"),
          architectureRef("rules"),
        ]),
        optionalRefs: existingRefs(progressRefs()),
      }

    case "frontend-designer":
      return {
        requiredRefs: existingRefs([
          ...base,
          prdRef("design"),
          prdRef("requirements"),
          architectureRef("frontend"),
        ]),
        optionalRefs: existingRefs([DESIGN_SYSTEM_PATH, currentMilestoneSpecPath(state, milestone), ...progressRefs()]),
      }

    case "execution-engine": {
      const requiredRefs = [...base]
      if (entry?.subSpecs) {
        requiredRefs.push(
          ...(task?.type === "SPIKE"
            ? ["agents/execution-engine/03-spike-workflow.md"]
            : ["agents/execution-engine/01-preflight.md", "agents/execution-engine/02-task-loop.md"]),
        )
      }

      return {
        requiredRefs: existingRefs([
          ...requiredRefs,
          prdRef("requirements"),
          architectureRef("rules"),
        ]),
        optionalRefs: existingRefs([
          ...progressRefs(),
          task?.isUI ? DESIGN_SYSTEM_PATH : undefined,
          task?.isUI ? currentMilestoneSpecPath(state, milestone) : undefined,
        ]),
      }
    }

    case "design-reviewer":
      return {
        requiredRefs: existingRefs([
          ...base,
          DESIGN_SYSTEM_PATH,
          currentMilestoneSpecPath(state, milestone),
        ]),
        optionalRefs: existingRefs(progressRefs()),
      }

    case "harness-validator":
      return {
        requiredRefs: existingRefs([...base, "docs/PROGRESS.md"]),
        optionalRefs: existingRefs([CONTEXT_SNAPSHOT_PATH]),
      }

    case "context-compactor":
      return {
        requiredRefs: existingRefs([...base, "docs/PROGRESS.md"]),
        optionalRefs: existingRefs([CONTEXT_SNAPSHOT_PATH]),
      }

    case "code-reviewer":
      return {
        requiredRefs: existingRefs([
          ...base,
          prdRef("requirements"),
          architectureRef("rules"),
        ]),
        optionalRefs: existingRefs(progressRefs()),
      }

    case "entropy-scanner":
    case "fast-path-bootstrap":
      return {
        requiredRefs: existingRefs(base),
        optionalRefs: existingRefs(progressRefs()),
      }

    default:
      return { optionalRefs: [], requiredRefs: [] }
  }
}

export function getAgentMaterialPolicy(
  agentId: AgentId,
  state: ProjectState,
  platform: AgentPlatform = "unknown",
  context?: { milestone?: Milestone; task?: Task },
): AgentMaterialPolicy {
  const task = getTaskContext(state, context?.task)
  const milestone = context?.milestone
  const { optionalRefs, requiredRefs } = packetRefsFor(agentId, state, context)

  switch (agentId) {
    case "execution-engine": {
      const conditions = task?.isUI ? ["Attach design materials only for UI tasks."] : undefined
      if (task?.isUI) {
        const designSystemExists = existsSync(DESIGN_SYSTEM_PATH)
        const milestoneSpec = currentMilestoneSpecPath(state, milestone)
        if (!designSystemExists || !milestoneSpec) {
          const warnings = conditions ?? []
          warnings.push("WARNING: Design materials incomplete for UI task — implementation may lack visual guidance.")
          return {
            agentId,
            conditions: warnings,
            inlineConstraints: [...commonConstraints(), ...platformConstraints(platform), ...executionConstraints(task)],
            optionalRefs,
            requiredRefs,
          }
        }
      }
      return {
        agentId,
        conditions: task?.isUI ? ["Attach design materials only for UI tasks."] : undefined,
        inlineConstraints: [...commonConstraints(), ...platformConstraints(platform), ...executionConstraints(task)],
        optionalRefs,
        requiredRefs,
      }
    }

    case "design-reviewer": {
      const conditions = ["Only valid for IN_PROGRESS UI tasks."]
      const designSystemExists = existsSync(DESIGN_SYSTEM_PATH)
      const milestoneSpec = currentMilestoneSpecPath(state, milestone)
      if (!designSystemExists) {
        conditions.push("WARNING: DESIGN_SYSTEM.md is missing — design review should wait for frontend-designer.")
      }
      if (!milestoneSpec) {
        conditions.push("WARNING: Milestone UI spec is missing — design review should wait for frontend-designer.")
      }
      return {
        agentId,
        conditions,
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Review against the current milestone UI spec only; do not fan out into unrelated docs.",
          "Block commit if Design Review approval is missing for a UI task [G7].",
        ],
        optionalRefs,
        requiredRefs,
      }
    }

    case "frontend-designer": {
      const conditions = ["Attach design materials only for the active UI milestone."]
      if (!prdRef("design")) {
        conditions.push("WARNING: PRD design section is missing — design output will rely on inferred requirements.")
      }
      return {
        agentId,
        conditions,
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Define or update the design system only for the active product surface.",
          "Design output must cover loading, empty, error, responsive, and accessibility states.",
        ],
        optionalRefs,
        requiredRefs,
      }
    }

    case "harness-validator":
      return {
        agentId,
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Validate against runtime gates and current state, not against broad documentation scans.",
        ],
        optionalRefs,
        requiredRefs,
      }

    case "context-compactor":
      return {
        agentId,
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Use docs/PROGRESS.md and CONTEXT_SNAPSHOT for recovery guidance; do not scan docs/progress/ by default.",
        ],
        optionalRefs,
        requiredRefs,
      }

    case "scaffold-generator":
      return {
        agentId,
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Do not bootstrap product frameworks during scaffold setup; stay at the Harness baseline.",
        ],
        optionalRefs,
        requiredRefs,
      }

    case "code-reviewer":
      return {
        agentId,
        conditions: ["Only valid for non-UI IN_PROGRESS tasks."],
        inlineConstraints: [
          ...commonConstraints(),
          ...platformConstraints(platform),
          "Review security practices: no hardcoded secrets, proper input validation, safe dependency usage.",
          "Review performance: avoid unnecessary re-renders, O(n²) loops, unbounded queries, and memory leaks.",
          "Review architecture: verify dependency direction, layer separation, and adherence to project conventions.",
        ],
        optionalRefs,
        requiredRefs,
      }

    default:
      return {
        agentId,
        inlineConstraints: [...commonConstraints(), ...platformConstraints(platform)],
        optionalRefs,
        requiredRefs,
      }
  }
}
