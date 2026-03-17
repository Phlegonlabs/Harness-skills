import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import type { Milestone, ProjectState, Task, WorkflowEvent } from "../types"
import { PROGRESS_DIR, PROGRESS_PATH } from "./shared"
import { getCurrentProductStage, getNextDeferredProductStage } from "./stages"
import { collectWorkflowEvents, findLatestWorkflowEvent } from "./workflow-history"

function statusIcon(status: Task["status"]): string {
  switch (status) {
    case "DONE":
      return "[x]"
    case "SKIPPED":
      return "[-]"
    case "BLOCKED":
      return "[!]"
    case "IN_PROGRESS":
      return "[~]"
    default:
      return "[ ]"
  }
}

function formatTimestamp(value?: string): string | undefined {
  if (!value) return undefined
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "Z")
}

function taskLifecycleSuffix(task: Task): string {
  const details: string[] = []

  if (task.commitHash) {
    details.push(`commit \`${task.commitHash.slice(0, 7)}\``)
  }
  if (task.status === "IN_PROGRESS" && task.startedAt) {
    details.push(`started ${formatTimestamp(task.startedAt)}`)
  }
  if (task.status === "BLOCKED") {
    details.push(`blocked ${formatTimestamp(task.blockedAt) ?? "time not recorded"}`)
    if (task.blockedReason) {
      details.push(`reason: ${task.blockedReason}`)
    }
  }
  if (task.status === "DONE" && task.completedAt) {
    details.push(`completed ${formatTimestamp(task.completedAt)}`)
  }

  return details.length > 0 ? ` — ${details.join(" — ")}` : ""
}

function taskLabel(task: Task, currentTaskId: string): string {
  const suffix = task.id === currentTaskId ? " — <- Current Task" : ""
  return `${statusIcon(task.status)} ${task.id}: ${task.name}${taskLifecycleSuffix(task)}${suffix}`
}

function milestoneHeading(milestone: Milestone): string {
  const icon =
    milestone.status === "COMPLETE" || milestone.status === "MERGED"
      ? "✅ Complete"
      : milestone.status === "IN_PROGRESS"
        ? "🔄 In Progress"
        : milestone.status === "REVIEW"
          ? "🟡 Awaiting Review"
          : "⏳ Not Started"
  return `### ${milestone.id}: ${milestone.name} ${icon}`
}

function progressBar(done: number, total: number): string {
  const ratio = total === 0 ? 0 : done / total
  const filled = Math.min(10, Math.round(ratio * 10))
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`
}

function findCurrentTask(state: ProjectState): Task | undefined {
  const explicitTask = state.execution.milestones
    .flatMap(milestone => milestone.tasks)
    .find(task => task.id === state.execution.currentTask)
  if (explicitTask) return explicitTask

  return state.execution.milestones
    .flatMap(milestone => milestone.tasks)
    .find(task => task.status === "IN_PROGRESS")
    ?? state.execution.milestones.flatMap(milestone => milestone.tasks).find(task => task.status === "PENDING")
}

function findCurrentMilestone(state: ProjectState, currentTask?: Task): Milestone | undefined {
  const explicitMilestone = state.execution.milestones.find(milestone => milestone.id === state.execution.currentMilestone)
  if (explicitMilestone) return explicitMilestone

  if (currentTask) {
    const taskMilestone = state.execution.milestones.find(milestone => milestone.tasks.some(task => task.id === currentTask.id))
    if (taskMilestone) return taskMilestone
  }

  return state.execution.milestones.find(milestone => milestone.status === "IN_PROGRESS")
    ?? state.execution.milestones.find(milestone => milestone.status === "REVIEW")
    ?? state.execution.milestones.find(milestone => milestone.status === "PENDING")
}

function nextWorktreePath(state: ProjectState, currentMilestone?: Milestone): string {
  if (state.execution.currentWorktree) return state.execution.currentWorktree
  if (currentMilestone?.worktreePath) return currentMilestone.worktreePath
  if (state.projectInfo.name) return `../${state.projectInfo.name}-m1`
  return "../project-m1"
}

function workflowEventLine(event: WorkflowEvent): string {
  return `- ${formatTimestamp(event.at) ?? event.at}: ${event.summary}`
}

function buildWorkflowActivityLog(state: ProjectState): string[] {
  return collectWorkflowEvents(state).map(workflowEventLine)
}

function formatEventSummary(event?: WorkflowEvent): string {
  if (!event) return "No workflow events recorded yet."
  return `${formatTimestamp(event.at) ?? event.at} — ${event.summary}`
}

function buildProgressSnapshot(state: ProjectState) {
  const tasks = state.execution.milestones.flatMap(milestone => milestone.tasks)
  const doneTasks = tasks.filter(task => task.status === "DONE").length
  const totalTasks = tasks.length
  const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
  const currentTask = findCurrentTask(state)
  const currentMilestone = findCurrentMilestone(state, currentTask) ?? state.execution.milestones[0]
  const currentStage = getCurrentProductStage(state)
  const nextDeferredStage = getNextDeferredProductStage(state)
  const blockedTasks = tasks.filter(task => task.status === "BLOCKED")
  const activityLog = buildWorkflowActivityLog(state)
  const latestEvent = findLatestWorkflowEvent(state)
  const latestPhaseEvent = findLatestWorkflowEvent(state, event => event.kind === "phase_advanced")
  const latestMilestoneEvent = findLatestWorkflowEvent(state, event =>
    ["milestone_review_ready", "milestone_merged"].includes(event.kind),
  )
  const latestStageEvent = findLatestWorkflowEvent(state, event =>
    ["stage_deploy_review", "stage_promoted"].includes(event.kind),
  )
  const latestPublicSync = findLatestWorkflowEvent(state, event => event.kind === "public_docs_synced")
  const recentEvents = collectWorkflowEvents(state)
    .filter(event => event.kind !== "task_started")
    .slice(0, 5)

  const backlog =
    state.execution.milestones.length === 0
      ? [
          "### Task Backlog not yet initialized",
          "- [ ] Run `bun harness:advance` to advance from the current phase to the execution backlog",
        ].join("\n")
      : state.execution.milestones
          .map(milestone =>
            [
              milestoneHeading(milestone),
              ...milestone.tasks.map(task => `- ${taskLabel(task, state.execution.currentTask)}`),
            ].join("\n"),
          )
          .join("\n\n")

  const blockedTable =
    blockedTasks.length === 0
      ? "| — | — | — | — |\n"
      : `${blockedTasks
          .map(
            task =>
              `| ${task.id} | ${task.blockedReason ?? "Not recorded"} | Requires user or external dependency | ${formatTimestamp(task.blockedAt) ?? formatTimestamp(state.updatedAt)} |`,
          )
          .join("\n")}\n`

  const worktreeLines =
    state.execution.milestones.length === 0
      ? `./                main / current\n${nextWorktreePath(state)}    milestone/m1-foundation`
      : state.execution.milestones
          .map(milestone => `${milestone.worktreePath}    ${milestone.branch}`)
          .join("\n")

  const currentTaskLabel = currentTask
    ? `${currentTask.id} — ${currentTask.name} (${currentTask.status})`
    : "Not started (use harness:advance to create backlog)"

  const stageLabel = currentStage
    ? `${currentStage.id} — ${currentStage.name} (${currentStage.status})`
    : "Not yet defined"
  const roadmapLines =
    state.roadmap.stages.length === 0
      ? "- No product stages have been parsed from the PRD yet."
      : state.roadmap.stages.map(stage => {
          const versions = [stage.prdVersion, stage.architectureVersion].filter(Boolean).join(" / ")
          const suffix = stage.id === state.roadmap.currentStageId ? " — <- Current Stage" : ""
          return `- ${stage.id}: ${stage.name} [${stage.status}]${versions ? ` — ${versions}` : ""}${suffix}`
        })
  const nextAction =
    currentStage?.status === "DEPLOY_REVIEW"
      ? nextDeferredStage
        ? `Deploy/test the current version, then update PRD / Architecture and run \`bun harness:stage --promote ${nextDeferredStage.id}\`.`
        : "Deploy/test the current version. If this is the final release, run `bun harness:advance` after review."
      : currentTask
        ? `Continue ${currentTask.id} in ${currentStage?.id ?? "the current product stage"}.`
        : "Run `bun .harness/orchestrator.ts` to determine the next step."

  return {
    doneTasks,
    totalTasks,
    percent,
    currentTask,
    currentMilestone,
    currentStage,
    backlog,
    blockedTable,
    worktreeLines,
    currentTaskLabel,
    activityLog,
    latestEvent,
    latestMilestoneEvent,
    latestPhaseEvent,
    latestPublicSync,
    recentEvents,
    latestStageEvent,
    roadmapLines,
    stageLabel,
    nextAction,
  }
}

function generateProgressIndexMarkdown(state: ProjectState): string {
  const snapshot = buildProgressSnapshot(state)

  return `# PROGRESS.md — ${state.projectInfo.displayName || state.projectInfo.name || "Project"}

> **For the next session's Agent**: Read this index first, then read \`docs/progress/\`, \`AGENTS.md\`, and the relevant user-level LEARNING file (\`~/.codex/LEARNING.md\` or \`~/.claude/LEARNING.md\`), then pick up from the Current Task.

---

## Current Summary

**Current Phase**: ${state.phase}
**Current Product Stage**: ${snapshot.stageLabel}
**PRD Version**: ${state.docs.prd.version}
**Architecture Version**: ${state.docs.architecture.version}
**Current Milestone**: ${snapshot.currentMilestone ? `${snapshot.currentMilestone.id} — ${snapshot.currentMilestone.name}` : "Not yet created"}
**Current Worktree**: \`${nextWorktreePath(state, snapshot.currentMilestone)}\`
**Current Task**: ${snapshot.currentTaskLabel}
**Overall Progress**: [${progressBar(snapshot.doneTasks, snapshot.totalTasks)}] ${snapshot.doneTasks}/${snapshot.totalTasks} Tasks (${snapshot.percent}%)
**Latest Workflow Event**: ${formatEventSummary(snapshot.latestEvent)}
**Last Updated**: ${state.updatedAt}

---

## Module Index

1. [01 Summary](./progress/01-summary.md)
2. [02 Current State](./progress/02-current-state.md)
3. [03 Backlog](./progress/03-backlog.md)
4. [04 Blockers](./progress/04-blockers.md)
5. [05 Worktrees](./progress/05-worktrees.md)
6. [06 Next Session](./progress/06-next-session.md)
7. [07 Activity](./progress/07-activity.md)
8. [08 Roadmap](./progress/08-roadmap.md)
9. [09 Metrics](./progress/09-metrics.md)
`
}

function generateProgressModules(state: ProjectState): Record<string, string> {
  const snapshot = buildProgressSnapshot(state)

  return {
    "01-summary.md": `## 1. Summary

- **Current phase**: ${state.phase}
- **Current product stage**: ${snapshot.stageLabel}
- **PRD version**: ${state.docs.prd.version}
- **Architecture version**: ${state.docs.architecture.version}
- **Current milestone**: ${snapshot.currentMilestone ? `${snapshot.currentMilestone.id} — ${snapshot.currentMilestone.name}` : "Not yet created"}
- **Current task**: ${snapshot.currentTaskLabel}
- **Progress**: [${progressBar(snapshot.doneTasks, snapshot.totalTasks)}] ${snapshot.doneTasks}/${snapshot.totalTasks} Tasks (${snapshot.percent}%)
- **Latest workflow event**: ${formatEventSummary(snapshot.latestEvent)}
- **Latest phase transition**: ${formatEventSummary(snapshot.latestPhaseEvent)}
- **Latest milestone event**: ${formatEventSummary(snapshot.latestMilestoneEvent)}`,
    "02-current-state.md": `## 2. Current State

- **Worktree**: \`${nextWorktreePath(state, snapshot.currentMilestone)}\`
- **Last updated**: ${state.updatedAt}
- **Execution source of truth**: \`.harness/state.json\`
- **Current product stage**: ${snapshot.stageLabel}
- **Current phase gate**: Run \`bun harness:validate --phase ${state.phase}\` (if applicable)
- **Latest stage transition**: ${formatEventSummary(snapshot.latestStageEvent)}
- **Latest public-doc sync**: ${formatEventSummary(snapshot.latestPublicSync)}`,
    "03-backlog.md": `## 3. Task Backlog

${snapshot.backlog}`,
    "04-blockers.md": `## 4. Blockers

| Task | Reason | What is needed | Created at |
|------|--------|----------------|------------|
${snapshot.blockedTable}`,
    "05-worktrees.md": `## 5. Worktrees

\`\`\`text
./    current workspace
${snapshot.worktreeLines}
\`\`\``,
    "06-next-session.md": `## 6. Next Session

### Using Claude Code

\`\`\`bash
claude "Read docs/PROGRESS.md, docs/progress/, AGENTS.md, ~/.claude/LEARNING.md, then continue ${snapshot.currentTask?.id ?? "the next Task"}"
\`\`\`

### Using Codex CLI

\`\`\`bash
codex "Read docs/PROGRESS.md, docs/progress/, AGENTS.md, ~/.codex/LEARNING.md, then continue ${snapshot.currentTask?.id ?? "the next Task"}"
\`\`\`

---

## Recent Decision Log

${snapshot.recentEvents.length > 0
  ? snapshot.recentEvents.map(event => `- ${formatEventSummary(event)}`).join("\n")
  : "- No workflow events recorded yet."}
- Next action: ${snapshot.nextAction}
`,
    "07-activity.md": `## 7. Workflow Activity

${snapshot.activityLog.length > 0 ? snapshot.activityLog.join("\n") : "- No workflow events recorded yet."}
`,
    "08-roadmap.md": `## 8. Product Roadmap

- **Current stage**: ${snapshot.stageLabel}
- **PRD version**: ${state.docs.prd.version}
- **Architecture version**: ${state.docs.architecture.version}
- **Latest stage transition**: ${formatEventSummary(snapshot.latestStageEvent)}

${snapshot.roadmapLines.join("\n")}
`,
    "09-metrics.md": `## 9. Metrics

${state.metrics && state.metrics.entries.length > 0
  ? `- **Last collected**: ${state.metrics.lastCollectedAt ?? "never"}
- **Total entries**: ${state.metrics.entries.length}

Run \`bun harness:metrics\` for a full summary by category.`
  : "No metrics recorded yet. Run `bun harness:metrics` to collect."}
`,
  }
}

export function syncProgressDocuments(state: ProjectState): void {
  mkdirSync(PROGRESS_DIR, { recursive: true })
  writeFileSync(PROGRESS_PATH, generateProgressIndexMarkdown(state))

  for (const [file, content] of Object.entries(generateProgressModules(state))) {
    writeFileSync(join(PROGRESS_DIR, file), `${content}\n`)
  }
}
