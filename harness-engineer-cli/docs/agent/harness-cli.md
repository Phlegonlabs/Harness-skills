# Harness CLI — Modular Structure

Single entry point for all harness automation. Replaces 7 separate scripts + manual
JSON editing. Agent runs commands, CLI handles state.

**The CLI itself follows the 500-line rule.** No single module exceeds 500 lines.
The entry point is a thin router; all logic lives in focused sub-modules under
`scripts/harness/`.

**Dependency:** `tsx` (dev dependency, zero-config TS executor)

**Package.json scripts:**
```json
{
  "scripts": {
    "harness": "tsx scripts/harness.ts",
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run tests/integration --passWithNoTests",
    "test:e2e": "vitest run tests/e2e --passWithNoTests",
    "prepare": "husky"
  }
}
```

Agent uses: `<pkg-mgr> run harness <command>`

---

## Commands

```
# ─── Commands the agent runs ─────────────────────────────────────────────────
# The agent only needs these 3 commands in the task loop:

harness init              Session boot → auto: sync plans → apply → recover → start task
harness validate          Run lint:fix → lint → type-check → test
harness done <id>         Complete task → verify git state clean → auto: next → start → (merge-gate → close milestone in the active execution mode)

# Everything below is auto-cascaded or for special situations:

harness status            Print current milestone, task, blockers, progress
harness next              Find next unblocked task (auto-called by done — rarely manual)
harness start <id>        Claim a task → 🟡 (auto-called by done — rarely manual)
harness validate:full     + integration/e2e when matching test files exist + file-guard (auto-called by merge-gate)
harness block <id> <reason>   Mark task blocked → 🚫 → auto next → auto start
harness reset <id>        Revert task to ⬜ (undo start or unblock)
harness learn <cat> <msg>  Log a learning (dependency, config, architecture, etc.)
harness merge-gate        Full gate (auto-called by done when milestone complete)
harness worktree:start <M-id>   Enter isolated / parallel milestone mode → auto: install → init → start task
harness worktree:finish <M-id>  Serialized root-side rebase → merge → archive → push → cleanup → auto: continue next milestone when worktree mode stays active
harness worktree:rebase          Rebase current worktree onto latest main
harness worktree:reclaim <M-id>  Reclaim a stale/abandoned milestone
harness worktree:status          Show all worktrees, agents, auto-finish jobs, merge readiness
harness stale-check       Detect stale docs, env, plans
harness file-guard        Check 500-line limit (--staged for hooks)
harness changelog [from] [to]  Generate release notes
harness schema            Validate progress.json against schema
harness recover           Close milestones whose PLAN rows are all ✅ and whose branch is already merged/removed
harness plan:apply [file] Parse plan → analyze state → insert milestones + task mirrors + deps (run during planning handoff; auto-called by init only for recovery)
harness plan:status       Show project progress overview for planning context
harness scaffold <type>   Inject capability templates (16 types — run without args to see list)
```

**Auto-cascade chains:**
```
init (main/root) → syncPlans → plan:apply (if new plans) → recover → serial start/resume OR suggest worktree:start
init (worktree) → warn on pending plans → recover → resume task / next / start
done → verify git state clean → next → start (or: merge-gate → close milestone in serial mode OR queue serialized root-side finish)
block → next → start next unblocked task
worktree:finish → auto worktree:start next eligible milestone → install → init → start
worktree:start → dep check → install → init → next → start
```

Planning handoff rule: before leaving plan mode, materialize `docs/PLAN.md` + `docs/progress.json`.
If the approved plan changes module boundaries, integrations, deployment topology, or core data flow,
update `ARCHITECTURE.md` as part of the same handoff and sync `docs/gitbook/architecture.md`
when present.
Fallback rule: if planning already happened in another chat or the session ended before sync,
paste the full approved plan output, transcript, or sufficiently detailed prior planning content
back into the current session, rewrite it to
`docs/exec-plans/active/*.md`, then run `harness plan:apply` (or manually mirror it for native shell)
before resuming execution.

The agent's entire loop reduces to:
``` 
harness init          ← once per session
# repeat:
  write code
  harness validate
  git commit
  harness done <id>   ← auto-cascades to next task
```

---

## Modular File Structure

```
scripts/
├── harness.ts                  # Entry point: imports + command router (~85 lines)
├── maintenance/
│   └── check-commit-msg.ts     # Commit message validator (standalone — needs msg file path)
└── harness/
    ├── config.ts               # Constants, paths, colors, output helpers (~40 lines)
    ├── types.ts                # All interfaces: Progress, AgentEntry, WorktreeInfo (~60 lines)
    ├── state.ts                # loadProgress, saveProgress, loadPlan, savePlan (~35 lines)
    ├── plan-utils.ts           # Row-level PLAN.md table parser — shared by tasks/quality/recovery (~330 lines)
    ├── recovery.ts             # installWithRetry + recoverMilestoneBoard (~150 lines)
    ├── worktree-helpers.ts     # Path normalization, finish-job state, worktree cleanup (~120 lines)
    ├── worktree.ts             # Worktree detection, enforcement, agent lifecycle, worktree:* commands (~340 lines)
    ├── task-helpers.ts         # Pending-plan detection, next-task selection, milestone sync (~140 lines)
    ├── tasks.ts                # init, status, next, start, done, block, reset (~320 lines)
    ├── validate.ts             # validate, validate:full, file-guard (~120 lines)
    ├── quality.ts              # merge-gate, stale-check, sync-plans, schema, changelog (~270 lines)
    ├── plan-apply.ts           # plan:apply + plan:status — parse plans, insert milestones (~280 lines)
    └── scaffold-templates.ts   # scaffold command: inject MCP, SKILL.md, Cloudflare templates (~250 lines)
```

Every module stays well under 500 lines. When `tasks.ts` or `worktree.ts` approaches
~300 lines, extract helper modules immediately instead of waiting for the staged
file guard to fail. This is the same principle the CLI enforces on project code.

---

## Implementation — Module by Module

### scripts/harness/config.ts

```typescript
// Shared constants and output helpers — imported by every other module.
import process from 'node:process';

export const PKG = process.env.PKG_MGR ?? 'pnpm';
export const PROGRESS_FILE = 'docs/progress.json';
export const PLAN_FILE = 'docs/PLAN.md';
export const SCHEMA_FILE = 'schemas/progress.schema.json';
export const PLANS_DIR = 'docs/exec-plans/active';
export const FINISH_LOCK_FILE = '.git/harness-finish.lock';
export const FILE_LIMIT = 500;
export const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.vue', '.svelte']);
export const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'out', 'coverage', '.git']);
export const STALE_AGENT_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Colors ──────────────────────────────────────────────────────────────────
export const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[34m', D = '\x1b[2m', N = '\x1b[0m';
export const ok = (m: string) => console.log(`${G}✓${N} ${m}`);
export const warn = (m: string) => console.warn(`${Y}⚠${N} ${m}`);
export const fail = (m: string): never => { console.error(`${R}✗${N} ${m}`); process.exit(1); };
export const step = (m: string) => console.log(`${Y}▶${N} ${m}`);
export const info = (m: string) => console.log(`${B}ℹ${N} ${m}`);
```

### scripts/harness/types.ts

```typescript
// All shared interfaces. No runtime code — types only.

export interface Progress {
  project: string;
  last_updated: string;
  last_agent: string;
  current_milestone: {
    id: string; name: string; branch: string; worktree: string;
    status: string; tasks_total: number; tasks_done: number;
    tasks_in_progress: number; tasks_blocked: number; tasks_remaining: number;
  } | null;
  current_task: {
    id: string; story: string; description: string;
    status: string; started_at: string; files_touched: string[]; notes: string;
  } | null;
  active_milestones: ActiveMilestone[];
  completed_milestones: Array<{ id: string; name: string; completed_at: string; tag?: string }>;
  blockers: Array<{ task_id: string; description: string; error?: string; added_at: string }>;
  learnings: Array<Record<string, unknown>>;
  dependency_graph: Record<string, { depends_on: string[]; blocks: string[] }>;
  synced_plans: string[];
  agents: AgentEntry[];
  finish_jobs: FinishJobEntry[];
  [key: string]: unknown;
}

export interface ActiveMilestone {
  id: string;
  title: string;
  status?: string;
  branch?: string;
  worktree?: string;
  depends_on?: string[];
  started_at?: string;
  completed_at?: string | null;
  tasks_total?: number;
  tasks_done?: number;
  tasks_in_progress?: number;
  tasks_blocked?: number;
  tasks_remaining?: number;
  tasks?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface AgentEntry {
  id: string;
  milestone: string | null;
  worktree: string;
  branch: string;
  started_at: string;
  heartbeat: string;
}

export interface FinishJobEntry {
  milestone: string;
  status: 'queued' | 'running' | 'failed' | 'succeeded';
  requested_at: string;
  started_at?: string;
  finished_at?: string;
  requested_by?: string;
  error?: string;
  last_update: string;
}

export interface WorktreeInfo {
  isWorktree: boolean;
  cwd: string;
  mainRoot: string;
  currentBranch: string;
  milestoneId: string | null;  // e.g. "milestone/m1" → "M1"
}
```

### scripts/harness/state.ts

```typescript
// Read/write progress.json and PLAN.md — thin wrappers, no business logic.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PROGRESS_FILE, PLAN_FILE, fail } from './config.js';
import type { Progress } from './types.js';

export function loadProgress(): Progress {
  if (!existsSync(PROGRESS_FILE)) fail(`${PROGRESS_FILE} not found`);
  return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
}

export function saveProgress(p: Progress): void {
  p.last_updated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2) + '\n');
}

export function loadPlan(): string {
  if (!existsSync(PLAN_FILE)) fail(`${PLAN_FILE} not found`);
  return readFileSync(PLAN_FILE, 'utf-8');
}

export function savePlan(content: string): void {
  writeFileSync(PLAN_FILE, content);
}
```

### scripts/harness/progress.ts

```typescript
// Centralized state normalization — counters, dedup, sort, issue detection.
// Pure functions: read PLAN.md for source of truth, never call saveProgress().
import type { CompletedMilestone, Progress } from './types.js';
import { loadPlan } from './state.js';
import { parsePlanTaskRows, countTaskStatuses } from './plan-utils.js';

/** Sort milestone list by numeric M-id (M1 < M2 < M10). */
export function sortMilestones<T extends { id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const na = Number(a.id.replace(/^M/i, ''));
    const nb = Number(b.id.replace(/^M/i, ''));
    return na - nb;
  });
}

/**
 * Dedup completed milestones — keep the entry with the EARLIEST completed_at.
 * @param list    Raw completed_milestones array (may have duplicates).
 * @param fallback ISO timestamp to use when completed_at is absent.
 */
export function dedupeCompletedMilestones(
  list: CompletedMilestone[],
  fallback: string,
): CompletedMilestone[] {
  const seen = new Map<string, CompletedMilestone>();
  for (const m of list) {
    const normalized: CompletedMilestone = { ...m, completed_at: m.completed_at ?? fallback };
    const existing = seen.get(m.id);
    if (!existing) { seen.set(m.id, normalized); continue; }
    const existTs = Date.parse(existing.completed_at ?? '');
    const newTs   = Date.parse(normalized.completed_at ?? '');
    // Prefer the earlier timestamp — first completion wins
    if (!Number.isNaN(newTs) && (Number.isNaN(existTs) || newTs < existTs)) {
      seen.set(m.id, normalized);
    }
  }
  return [...seen.values()];
}

/**
 * Recalculate task counters and status for all active milestones from PLAN.md,
 * then sort + dedup both lists. Mutates p in-place and returns it.
 * Does NOT call saveProgress — callers decide whether to persist.
 */
export function syncProgressState(p: Progress): Progress {
  let plan: string;
  try { plan = loadPlan(); } catch { return p; }

  for (const ms of p.active_milestones) {
    const rows = parsePlanTaskRows(plan, ms.id);
    if (rows.length === 0) continue;
    const counts = countTaskStatuses(plan, ms.id);
    ms.tasks_total       = counts.total;
    ms.tasks_done        = counts.done;
    ms.tasks_in_progress = counts.wip;
    ms.tasks_blocked     = counts.blocked;
    ms.tasks_remaining   = counts.total - counts.done;
    ms.status = counts.done === counts.total ? 'complete'
      : (counts.wip > 0 || counts.done > 0 ? 'in_progress' : 'not_started');
  }

  p.active_milestones    = sortMilestones(p.active_milestones);
  p.completed_milestones = sortMilestones(
    dedupeCompletedMilestones(p.completed_milestones, new Date().toISOString()),
  );

  return p;
}

/**
 * Detect common consistency problems in progress.json.
 * Returns a list of human-readable issue strings (empty = no problems).
 */
export function getProgressIssues(p: Progress): string[] {
  const issues: string[] = [];
  const completedIds = new Set(p.completed_milestones.map((m) => m.id));

  for (const ms of p.active_milestones) {
    if (completedIds.has(ms.id)) {
      issues.push(`${ms.id} appears in both active_milestones and completed_milestones`);
    }
  }

  if (p.current_milestone && completedIds.has(p.current_milestone.id)) {
    issues.push(`current_milestone ${p.current_milestone.id} is already in completed_milestones`);
  }

  if (p.current_task) {
    const taskMs = p.current_task.id.match(/^(M\d+)-/i)?.[1];
    if (taskMs && completedIds.has(taskMs)) {
      issues.push(`current_task ${p.current_task.id} belongs to completed milestone ${taskMs}`);
    }
  }

  return issues;
}
```

### scripts/harness/plan-utils.ts

```typescript
// Row-level PLAN.md table parser.
// Detects Status/Commit column positions from the header row,
// then operates on the correct column — never scans across the whole row.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TableLayout {
  /** Index in the raw parts[] array (line.split('|')) for Status column. */
  statusIdx: number;
  /** Index in the raw parts[] array for Commit column (null if absent). */
  commitIdx: number | null;
  /** Index in the raw parts[] array for Story column (null if absent). */
  storyIdx: number | null;
  /** Index in the raw parts[] array for Task/Description column. */
  descIdx: number | null;
  /** Index in the raw parts[] array for Done When column (null if absent). */
  doneWhenIdx: number | null;
}

export interface TaskRow {
  lineIndex: number;
  taskId: string;
  statusEmoji: string;      // ⬜ | 🟡 | ✅ | 🚫
  statusText: string;       // full cell text, e.g. "⬜ Todo"
  story: string;
  description: string;
  doneWhen: string;
  commit: string | null;
  rawLine: string;
}

// ─── STATUS_EMOJIS ───────────────────────────────────────────────────────────

export const STATUS = {
  TODO:    '⬜',
  WIP:     '🟡',
  DONE:    '✅',
  BLOCKED: '🚫',
} as const;

export type StatusEmoji = typeof STATUS[keyof typeof STATUS];

// ─── Layout detection ────────────────────────────────────────────────────────
// Scans the plan text for the first header row containing "Status" and caches
// the column positions. All task tables in a single PLAN.md use the same layout.

let cachedLayout: TableLayout | null = null;
let cachedPlanHash = '';

function hashPlan(plan: string): string {
  return `${String(plan.length)}:${plan.slice(0, 200)}`;
}

export function detectLayout(plan: string): TableLayout {
  const h = hashPlan(plan);
  if (cachedLayout && cachedPlanHash === h) return cachedLayout;

  const lines = plan.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|');
    const lower = parts.map((p) => p.trim().toLowerCase());

    const statusIdx = lower.findIndex((c) => c === 'status');
    if (statusIdx === -1) continue;

    cachedLayout = {
      statusIdx,
      commitIdx: lower.findIndex((c) => c === 'commit') > 0
        ? lower.findIndex((c) => c === 'commit')
        : null,
      storyIdx: lower.findIndex((c) => c === 'story') > 0
        ? lower.findIndex((c) => c === 'story')
        : null,
      descIdx: lower.findIndex((c) => c === 'task' || c === 'description') > 0
        ? lower.findIndex((c) => c === 'task' || c === 'description')
        : null,
      doneWhenIdx: lower.findIndex((c) => c === 'done when') > 0
        ? lower.findIndex((c) => c === 'done when')
        : null,
    };
    cachedPlanHash = h;
    return cachedLayout;
  }

  // Fallback: harness default
  // | Task ID(1) | Story(2) | Task(3) | Done When(4) | Status(5) | Commit(6) |
  cachedLayout = { statusIdx: 5, commitIdx: 6, storyIdx: 2, descIdx: 3, doneWhenIdx: 4 };
  cachedPlanHash = h;
  return cachedLayout;
}

export function invalidateLayoutCache(): void {
  cachedLayout = null;
  cachedPlanHash = '';
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

/**
 * Parse all task rows from PLAN.md.
 * @param milestoneFilter  e.g. "M1" — only return tasks starting with "M1-"
 */
export function parsePlanTaskRows(plan: string, milestoneFilter?: string): TaskRow[] {
  const layout = detectLayout(plan);
  const lines = plan.split('\n');
  const rows: TaskRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;

    const parts = line.split('|');
    if (parts.length < layout.statusIdx + 1) continue;

    // parts[1] = first column = Task ID
    const taskId = (parts[1] ?? '').trim();
    if (!/^M\d+-\d+$/.test(taskId)) continue;

    if (milestoneFilter && !taskId.startsWith(`${milestoneFilter}-`)) continue;

    const statusCell = (parts[layout.statusIdx] ?? '').trim();
    const emojiMatch = statusCell.match(/^(⬜|🟡|✅|🚫)/);

    const desc = layout.descIdx !== null
      ? (parts[layout.descIdx] ?? '').trim()
      : '';
    const story = layout.storyIdx !== null
      ? (parts[layout.storyIdx] ?? '').trim()
      : '—';
    const doneWhen = layout.doneWhenIdx !== null
      ? (parts[layout.doneWhenIdx] ?? '').trim()
      : '';
    const commit = layout.commitIdx !== null
      ? (parts[layout.commitIdx] ?? '').trim()
      : null;

    rows.push({
      lineIndex: i,
      taskId,
      statusEmoji: (emojiMatch?.[1] ?? '') as string,
      statusText: statusCell,
      story,
      description: desc,
      doneWhen,
      commit,
      rawLine: line,
    });
  }

  return rows;
}

// ─── Status replacement ─────────────────────────────────────────────────────

export interface ReplaceResult {
  plan: string;
  changed: boolean;
}

/**
 * Replace the status emoji for a specific task in PLAN.md.
 *
 * @param plan         Full PLAN.md content
 * @param taskId       e.g. "M1-003"
 * @param fromEmoji    Emoji to replace (or null = match any)
 * @param toEmoji      Emoji to set
 * @param commitHash   Optional — fills the Commit column if present
 */
export function replaceTaskStatus(
  plan: string,
  taskId: string,
  fromEmoji: StatusEmoji | null,
  toEmoji: StatusEmoji,
  commitHash?: string,
): ReplaceResult {
  const layout = detectLayout(plan);
  const lines = plan.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;

    const parts = line.split('|');
    if (parts.length < layout.statusIdx + 1) continue;

    const cellTaskId = (parts[1] ?? '').trim();
    if (cellTaskId !== taskId) continue;

    // Found the row — check status column
    const statusCell = (parts[layout.statusIdx] ?? '').trim();

    if (fromEmoji !== null && !statusCell.startsWith(fromEmoji)) {
      // Status doesn't match — don't change
      return { plan, changed: false };
    }

    // Replace emoji in the status cell, preserving any suffix text
    const newStatus = fromEmoji !== null
      ? statusCell.replace(fromEmoji, toEmoji)
      : toEmoji;

    parts[layout.statusIdx] = preservePadding(parts[layout.statusIdx], newStatus);

    // Optionally fill commit column
    if (commitHash && layout.commitIdx !== null && layout.commitIdx < parts.length) {
      const commitCell = (parts[layout.commitIdx] ?? '').trim();
      if (commitCell === '—' || commitCell === '-' || commitCell === '') {
        parts[layout.commitIdx] = preservePadding(
          parts[layout.commitIdx],
          `\`${commitHash}\``,
        );
      }
    }

    lines[i] = parts.join('|');
    return { plan: lines.join('\n'), changed: true };
  }

  return { plan, changed: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function preservePadding(rawCell: string, newContent: string): string {
  const leadMatch = rawCell.match(/^(\s+)/);
  const trailMatch = rawCell.match(/(\s+)$/);
  const lead = leadMatch ? leadMatch[1] : ' ';
  const trail = trailMatch ? trailMatch[1] : ' ';
  return `${lead}${newContent}${trail}`;
}

/**
 * Get the status emoji of a specific task. Returns null if not found.
 */
export function getTaskStatus(plan: string, taskId: string): StatusEmoji | null {
  const layout = detectLayout(plan);
  const lines = plan.split('\n');

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|');
    if (parts.length < layout.statusIdx + 1) continue;
    if ((parts[1] ?? '').trim() !== taskId) continue;

    const statusCell = (parts[layout.statusIdx] ?? '').trim();
    const m = statusCell.match(/^(⬜|🟡|✅|🚫)/);
    return (m?.[1] ?? null) as StatusEmoji | null;
  }

  return null;
}

/**
 * Count tasks by status for a given milestone.
 */
export function countTaskStatuses(plan: string, milestoneId: string): {
  todo: number; wip: number; done: number; blocked: number; total: number;
} {
  const rows = parsePlanTaskRows(plan, milestoneId);
  const result = { todo: 0, wip: 0, done: 0, blocked: 0, total: rows.length };

  for (const row of rows) {
    switch (row.statusEmoji) {
      case STATUS.TODO:    result.todo++; break;
      case STATUS.WIP:     result.wip++; break;
      case STATUS.DONE:    result.done++; break;
      case STATUS.BLOCKED: result.blocked++; break;
    }
  }

  return result;
}

/**
 * Check if a task exists in PLAN.md (by Task ID in column 1).
 */
export function taskExistsInPlan(plan: string, taskId: string): boolean {
  const lines = plan.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|');
    if ((parts[1] ?? '').trim() === taskId) return true;
  }
  return false;
}

// ─── Milestone header parsing ────────────────────────────────────────────────
// Scans PLAN.md for `### M<n>: <title>` blocks and extracts metadata.
// Used by worktree:start to backfill missing active_milestones.

export interface MilestoneHeader {
  id: string;           // e.g. "M1"
  title: string;        // e.g. "Foundation"
  status: string;       // e.g. "🟡 In Progress" or "⬜ Not Started"
  branch: string;       // e.g. "milestone/m1"
  dependsOn: string[];  // e.g. ["M1"]
}

/**
 * Parse milestone header blocks from PLAN.md.
 *
 * Expected format:
 * ```
 * ### M1: Foundation (Target: Week 1-2)
 * **Status:** 🟡 In Progress
 * **Branch:** `milestone/m1`
 * **Depends on:** M1, M2
 * ```
 */
export function parseMilestoneHeaders(plan: string): MilestoneHeader[] {
  const results: MilestoneHeader[] = [];
  const lines = plan.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Match: ### M1: Foundation (Target: ...)
    const headerMatch = lines[i].match(/^###\s+(M\d+):\s*(.+?)(?:\s*\(.*\))?\s*$/);
    if (!headerMatch) continue;

    const id = headerMatch[1];
    const title = headerMatch[2].trim();
    let status = '';
    let branch = `milestone/${id.toLowerCase()}`;
    const dependsOn: string[] = [];

    // Scan the next ~10 lines for metadata fields
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const line = lines[j];
      // Stop at next heading or task table
      if (line.startsWith('###') || line.startsWith('| Task')) break;

      const statusMatch = line.match(/\*\*Status:\*\*\s*(.+)/);
      if (statusMatch) status = statusMatch[1].trim();

      const branchMatch = line.match(/\*\*Branch:\*\*\s*`?([^`\s]+)`?/);
      if (branchMatch) branch = branchMatch[1];

      const depsMatch = line.match(/\*\*Depends\s+on:\*\*\s*(.+)/i);
      if (depsMatch) {
        const depsText = depsMatch[1].trim();
        if (depsText.toLowerCase() !== 'none' && depsText !== '—') {
          dependsOn.push(
            ...depsText.split(/[,\s]+/).filter((d) => /^M\d+$/.test(d))
          );
        }
      }
    }

    results.push({ id, title, status, branch, dependsOn });
  }

  return results;
}

```

### scripts/harness/recovery.ts

```typescript
// Milestone board recovery and install retry logic.
// Split from worktree.ts to keep both modules under 500 lines.
import { execSync } from 'node:child_process';
import process from 'node:process';
import { PKG, ok, warn, step, info } from './config.js';
import type { Progress } from './types.js';
import { loadProgress, saveProgress, loadPlan, savePlan } from './state.js';
import { STATUS, parsePlanTaskRows, countTaskStatuses } from './plan-utils.js';

// ─── Install with retry (Windows EBUSY fix) ─────────────────────────────────

export function installWithRetry(cwd: string, maxAttempts = 3): boolean {
  const isWindows = process.platform === 'win32';
  const delayMs = isWindows ? 5000 : 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const useForce = attempt > 1;
    const cmd = `${PKG} install${useForce ? ' --force' : ''}`;

    step(`Installing dependencies (attempt ${String(attempt)}/${String(maxAttempts)})...`);
    try {
      execSync(cmd, { cwd, shell: true, stdio: 'inherit' });
      ok('Dependencies installed successfully.');
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isEBUSY = errMsg.includes('EBUSY') || errMsg.includes('resource busy');
      const isLock = errMsg.includes('EPERM') || errMsg.includes('lock') || errMsg.includes('EACCES');

      if (attempt < maxAttempts && (isEBUSY || isLock || isWindows)) {
        warn(
          `Install attempt ${String(attempt)} failed` +
          `${isEBUSY ? ' (EBUSY — file locked by another process)' : ''}` +
          `${isLock ? ' (EPERM/lock — permission or lock conflict)' : ''}.\n` +
          `  Waiting ${String(delayMs / 1000)}s before retry with --force...`
        );

        try {
          if (isWindows) {
            execSync(`ping -n ${String(Math.ceil(delayMs / 1000) + 1)} 127.0.0.1 >nul`, { shell: true, stdio: 'pipe' });
          } else {
            execSync(`sleep ${String(delayMs / 1000)}`, { shell: true, stdio: 'pipe' });
          }
        } catch { /* sleep failed, continue anyway */ }
      } else if (attempt < maxAttempts) {
        warn(`Install attempt ${String(attempt)} failed. Retrying with --force...`);
      } else {
        warn(
          `Install failed after ${String(maxAttempts)} attempts.\n` +
          `  Try manually:\n` +
          `    cd "${cwd}"\n` +
          `    ${PKG} install --force\n` +
          (isWindows
            ? `\n  Windows tips:\n` +
              `    • Close VS Code / editors that may lock node_modules\n` +
              `    • Close any terminal sessions in the worktree directory\n` +
              `    • Run: taskkill /im node.exe /f (kill stale node processes)\n` +
              `    • Then retry: ${PKG} install --force`
            : '')
        );
        return false;
      }
    }
  }
  return false;
}

// ─── Milestone board recovery ───────────────────────────────────────────────
// Scans PLAN.md + progress.json for inconsistencies.
// If all tasks in a milestone are ✅ but it's still in active_milestones,
// auto-move it to completed_milestones.

export function recoverMilestoneBoard(p: Progress): { recovered: number; ids: string[] } {
  const result = { recovered: 0, ids: [] as string[] };

  let plan: string;
  try { plan = loadPlan(); } catch { return result; }

  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  const toRecover: number[] = [];

  for (let i = 0; i < p.active_milestones.length; i++) {
    const ms = p.active_milestones[i];
    if (completedIds.has(ms.id)) continue;

    // Row-level: parse tasks for this milestone by Status column
    const rows = parsePlanTaskRows(plan, ms.id);
    if (rows.length === 0) continue;

    const allDone = rows.every((r) => r.statusEmoji === STATUS.DONE);
    if (!allDone) continue;

    // Verify git branch is merged or gone
    let branchExists = false;
    const branch = ms.branch ?? `milestone/${ms.id.toLowerCase()}`;
    try {
      execSync(`git rev-parse --verify "${branch}"`, { shell: true, stdio: 'pipe' });
      branchExists = true;
    } catch { /* branch doesn't exist — already merged/deleted */ }

    let branchMerged = false;
    if (branchExists) {
      try {
        // Detect default branch dynamically — repos may use 'master', 'develop', etc.
        let defaultBranch = 'main';
        try {
          defaultBranch = execSync(
            'git symbolic-ref refs/remotes/origin/HEAD',
            { encoding: 'utf-8', shell: true, stdio: 'pipe' }
          ).trim().replace('refs/remotes/origin/', '');
        } catch { /* no remote HEAD — use 'main' */ }
        const merged = execSync(`git branch --merged ${defaultBranch}`, { encoding: 'utf-8', shell: true });
        branchMerged = merged.includes(branch);
      } catch { /* can't check */ }
    }

    if (!branchExists || branchMerged) {
      toRecover.push(i);
      step(`Auto-recovering ${ms.id}: all ${String(rows.length)} tasks ✅, branch ${branchExists ? 'merged' : 'removed'}`);
    } else {
      info(
        `${ms.id} has all tasks ✅ but branch '${branch}' exists and is not merged.\n` +
        `  Run: ${PKG} run harness worktree:finish ${ms.id}`
      );
    }
  }

  // Recalculate aggregate fields for active milestones NOT being recovered
  const toRecoverSet = new Set(toRecover);
  for (let j = 0; j < p.active_milestones.length; j++) {
    if (toRecoverSet.has(j)) continue;
    const ms = p.active_milestones[j];
    const rows = parsePlanTaskRows(plan, ms.id);
    if (rows.length === 0) continue;
    const counts = countTaskStatuses(plan, ms.id);
    ms.tasks_total       = counts.total;
    ms.tasks_done        = counts.done;
    ms.tasks_in_progress = counts.wip;
    ms.tasks_blocked     = counts.blocked;
    ms.tasks_remaining   = counts.total - counts.done;
    ms.status = counts.done === counts.total ? 'complete'
      : (counts.wip > 0 || counts.done > 0 ? 'in_progress' : 'not_started');
  }

  // Move recovered milestones from active → completed (reverse to preserve indices)
  for (const idx of toRecover.reverse()) {
    const ms = p.active_milestones.splice(idx, 1)[0];
    p.completed_milestones.push({
      id: ms.id,
      name: ms.title,
      completed_at: new Date().toISOString(),
    });
    result.recovered++;
    result.ids.push(ms.id);

    // Update PLAN.md milestone header status
    try {
      let currentPlan = loadPlan();
      const statusRe = new RegExp(
        `(### ${ms.id}:[^\\n]*\\n\\*\\*Status:\\*\\*\\s*)(?:⬜[^\\n]*|🟡[^\\n]*)`,
      );
      const updated = currentPlan.replace(statusRe, `$1✅ Complete (auto-recovered)`);
      if (updated !== currentPlan) savePlan(updated);
    } catch { /* best effort */ }
  }

  if (result.recovered > 0) {
    // Dedup completed_milestones by id — earliest completed_at wins
    const seen = new Map<string, typeof p.completed_milestones[0]>();
    for (const m of p.completed_milestones) {
      const existing = seen.get(m.id);
      if (!existing) { seen.set(m.id, m); continue; }
      const existTs = Date.parse(existing.completed_at ?? '');
      const newTs   = Date.parse(m.completed_at ?? '');
      if (!Number.isNaN(newTs) && (Number.isNaN(existTs) || newTs < existTs)) {
        seen.set(m.id, m); // keep the earlier completion timestamp
      }
    }
    p.completed_milestones = [...seen.values()];

    // Null out current_milestone / current_task if their milestone is now completed
    const nowCompletedIds = new Set(p.completed_milestones.map((m) => m.id));
    if (p.current_milestone && nowCompletedIds.has(p.current_milestone.id)) {
      p.current_milestone = null;
    }
    if (p.current_task && nowCompletedIds.has(p.current_task.id.split('.')[0])) {
      p.current_task = null;
    }

    // Do NOT set p.current_milestone here — it is a global singleton that would
    // clobber parallel-worktree state. Each command resolves its milestone via
    // wt.milestoneId + active_milestones[] lookup.
    saveProgress(p);
  }

  return result;
}

// ─── cmdRecover ──────────────────────────────────────────────────────────────
// Standalone exported command: recalculate all counters + auto-move completed
// milestones. Delegates here from harness.ts router.

export function cmdRecover(): void {
  console.log('\n\x1b[34m═══ Milestone Closeout Recovery ═══\x1b[0m\n');
  const p = loadProgress();
  const result = recoverMilestoneBoard(p);
  if (result.recovered > 0) {
    console.log(`\x1b[32m✓\x1b[0m Recovered ${String(result.recovered)} milestone(s): ${result.ids.join(', ')}`);
    console.log('  Counter fields recalculated for all remaining active milestones.');
  } else {
    console.log('\x1b[32m✓\x1b[0m Milestone board is consistent — nothing to recover.');
    console.log('  Counter fields recalculated for all active milestones.');
  }
}
```

### scripts/harness/worktree.ts

```typescript
// Worktree detection, enforcement, agent lifecycle, and all worktree:* commands.
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import process from 'node:process';
import { PKG, STALE_AGENT_MS, PLANS_DIR, PROGRESS_FILE, FINISH_LOCK_FILE, ok, warn, fail, step, info, R, G, Y, B, N } from './config.js';
import type { Progress, ActiveMilestone, WorktreeInfo, FinishJobEntry } from './types.js';
import { loadProgress, saveProgress, loadPlan, savePlan } from './state.js';
import { installWithRetry, recoverMilestoneBoard } from './recovery.js';
import { parseMilestoneHeaders, countTaskStatuses, parsePlanTaskRows, STATUS } from './plan-utils.js';

// ─── Cross-platform path normalization ──────────────────────────────────────
// Windows resolve() → "C:\Users\foo\project"
// Git for Windows worktree list → "C:/Users/foo/project"
// Git Bash/MSYS worktree list → "/c/Users/foo/project"

function normalizePath(p: string): string {
  let s = resolve(p);
  s = s.replace(/\\/g, '/');
  s = s.replace(/\/$/, '');
  s = s.replace(/^([A-Z]):\//, (_, d) => `${(d as string).toLowerCase()}:/`);
  s = s.replace(/^\/([a-z])\//, (_, d) => `${d as string}:/`);
  return s;
}

// ─── Worktree detection ──────────────────────────────────────────────────────

export function getMainRoot(): string {
  const wtList = execSync('git worktree list --porcelain', { encoding: 'utf-8', shell: true });
  const first = wtList.match(/^worktree\s+(.+)$/m)?.[1]?.trim();
  if (!first) {
    fail('Could not determine main git root from git worktree list');
    return process.cwd();
  }
  return first;
}

export function getWorktreeInfo(): WorktreeInfo {
  const cwd = process.cwd();
  const mainRoot = getMainRoot();
  const isWorktree = normalizePath(cwd) !== normalizePath(mainRoot);

  let currentBranch = '';
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', shell: true }).trim();
  } catch { /* detached HEAD */ }

  let milestoneId: string | null = null;
  const branchMatch = currentBranch.match(/^milestone\/(m\d+)$/i);
  if (branchMatch) milestoneId = branchMatch[1].toUpperCase();

  return { isWorktree, cwd, mainRoot, currentBranch, milestoneId };
}

function getEligibleMilestones(p: Progress): ActiveMilestone[] {
  const completedIds = new Set((p.completed_milestones ?? []).map((m) => m.id));
  return [...(p.active_milestones ?? [])]
    .filter((m) => !completedIds.has(m.id))
    .filter((m) => (m.depends_on ?? []).every((d) => completedIds.has(d)))
    .sort((a, b) => Number.parseInt(a.id.slice(1), 10) - Number.parseInt(b.id.slice(1), 10));
}

export function enforceWorktree(command: string): WorktreeInfo {
  const wt = getWorktreeInfo();
  if (!wt.isWorktree) {
    fail(
      `'${command}' must run inside a milestone worktree, not on main.\n\n` +
      `  You are in: ${wt.cwd} (main repo root)\n\n` +
      `  To start a milestone worktree:\n` +
      `    ${PKG} run harness worktree:start <M-id>\n` +
      `  (worktree:start auto-installs deps, runs init, and starts the first task when possible)`
    );
  }
  return wt;
}

export function resolveTaskContext(command: string, taskId?: string): WorktreeInfo {
  const wt = getWorktreeInfo();
  if (wt.isWorktree) return wt;

  const p = loadProgress();
  const eligible = getEligibleMilestones(p);
  const taskMilestone = taskId?.match(/^(M\d+)-/)?.[1]
    ?? p.current_task?.id?.match(/^(M\d+)-/)?.[1]
    ?? null;

  if (taskMilestone) {
    const matching = eligible.find((m) => m.id === taskMilestone);
    if (matching) {
      return { ...wt, milestoneId: taskMilestone };
    }

    fail(
      `Task ${taskId ?? p.current_task?.id ?? '?'} belongs to ${taskMilestone}, but that milestone is not startable from main/root right now.\n` +
      `  If the milestone already has its own branch, resume it with:\n` +
      `  ${PKG} run harness worktree:start ${taskMilestone}`
    );
  }

  if (eligible.length === 1) {
    return { ...wt, milestoneId: eligible[0].id };
  }

  if (eligible.length === 0) {
    fail(
      `No eligible milestone is ready on main/root.\n` +
      `  Add new work via plan mode or finish the dependency chain first.`
    );
  }

  fail(
    `Multiple milestones are ready from main/root:\n` +
    eligible.map((m) => `  ${Y}•${N} ${m.id} — ${m.title}`).join('\n') +
    `\n\n  Choose one explicitly with:\n` +
    eligible.map((m) => `  ${PKG} run harness worktree:start ${m.id}`).join('\n')
  );
}

// ─── Agent lifecycle ─────────────────────────────────────────────────────────

export function getAgentId(): string {
  if (process.env.HARNESS_AGENT_ID) return process.env.HARNESS_AGENT_ID;
  return `agent-${hostname().slice(0, 12)}-${String(process.pid)}`;
}

export function registerAgent(p: Progress, wt: WorktreeInfo): void {
  const agentId = getAgentId();
  const now = new Date().toISOString();
  p.agents = p.agents.filter((a) => a.id !== agentId && a.worktree !== wt.cwd);
  p.agents.push({
    id: agentId, milestone: wt.milestoneId, worktree: wt.cwd,
    branch: wt.currentBranch, started_at: now, heartbeat: now,
  });
}

export function updateHeartbeat(p: Progress): void {
  const agent = p.agents.find((a) => a.id === getAgentId());
  if (agent) agent.heartbeat = new Date().toISOString();
}

export function deregisterAgent(p: Progress, worktreePath: string): void {
  p.agents = p.agents.filter((a) => a.worktree !== worktreePath);
}

export function setFinishJobState(
  p: Progress,
  milestoneId: string,
  status: FinishJobEntry['status'],
  error?: string,
): void {
  const now = new Date().toISOString();
  p.finish_jobs ??= [];
  const existing = p.finish_jobs.find((j) => j.milestone === milestoneId);

  if (!existing) {
    p.finish_jobs.push({
      milestone: milestoneId,
      status,
      requested_at: now,
      started_at: status === 'running' ? now : undefined,
      finished_at: status === 'failed' || status === 'succeeded' ? now : undefined,
      requested_by: getAgentId(),
      error,
      last_update: now,
    });
    return;
  }

  existing.status = status;
  existing.error = error;
  existing.last_update = now;
  if (status === 'running' && !existing.started_at) existing.started_at = now;
  if (status === 'failed' || status === 'succeeded') existing.finished_at = now;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function extractPlanMilestones(content: string): string[] {
  return [...content.matchAll(/^###\s+(M\d+):/gm)].map((m) => m[1]);
}

function archiveCompletedPlans(completedIds: Set<string>): string[] {
  if (!existsSync(PLANS_DIR)) return [];

  const completedDir = resolve(PLANS_DIR, '..', 'completed');
  mkdirSync(completedDir, { recursive: true });

  const archived: string[] = [];
  for (const name of readdirSync(PLANS_DIR)) {
    const source = join(PLANS_DIR, name);
    const content = readFileSync(source, 'utf-8');
    const milestones = extractPlanMilestones(content);
    if (milestones.length === 0) continue;
    if (!milestones.every((id) => completedIds.has(id))) continue;

    const destination = join(completedDir, name);
    if (existsSync(destination)) {
      warn(`Plan archive target already exists: ${destination}`);
      continue;
    }

    renameSync(source, destination);
    archived.push(name);
  }

  return archived;
}

function removeWorktreeWithRetry(worktreeDir: string, attempts = 20, delayMs = 500): boolean {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      execSync(`git worktree remove "${worktreeDir}" --force`, { shell: true, stdio: 'inherit' });
      return true;
    } catch {
      if (attempt === attempts) return false;
      sleep(delayMs);
    }
  }
  return false;
}

function loadProgressFromRoot(rootDir: string): Progress {
  return JSON.parse(readFileSync(join(rootDir, PROGRESS_FILE), 'utf-8')) as Progress;
}

function saveProgressToRoot(rootDir: string, p: Progress): void {
  p.last_updated = new Date().toISOString();
  writeFileSync(join(rootDir, PROGRESS_FILE), JSON.stringify(p, null, 2) + '\n');
}

function mergeFinishJobs(existing: FinishJobEntry[] = [], incoming: FinishJobEntry[] = []): FinishJobEntry[] {
  const merged = new Map<string, FinishJobEntry>();
  for (const job of existing) merged.set(job.milestone, job);
  for (const job of incoming) merged.set(job.milestone, job);
  return [...merged.values()];
}

function saveRootProgressMerged(rootDir: string, next: Progress): void {
  const latest = loadProgressFromRoot(rootDir);
  const merged: Progress = {
    ...latest,
    ...next,
    finish_jobs: mergeFinishJobs(latest.finish_jobs ?? [], next.finish_jobs ?? []),
  };
  merged.last_updated = new Date().toISOString();
  writeFileSync(join(rootDir, PROGRESS_FILE), JSON.stringify(merged, null, 2) + '\n');
}

function finishLockPath(rootDir: string): string {
  return join(rootDir, FINISH_LOCK_FILE);
}

function tryAcquireFinishLock(rootDir: string, milestoneId: string): string | null {
  const lockPath = finishLockPath(rootDir);
  try {
    writeFileSync(lockPath, `${milestoneId}\n`, { flag: 'wx' });
    return null;
  } catch {
    try {
      return readFileSync(lockPath, 'utf-8').trim() || 'another finish job';
    } catch {
      return 'another finish job';
    }
  }
}

function releaseFinishLock(rootDir: string): void {
  try { unlinkSync(finishLockPath(rootDir)); } catch { /* already released */ }
}

function spawnFinishProcess(milestoneId: string, mainRoot: string): void {
  const child = spawn(`${PKG} run harness worktree:finish ${milestoneId} --from-worktree`, [], {
    cwd: mainRoot,
    shell: true,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function dispatchQueuedFinish(mainRoot: string): void {
  const p = loadProgressFromRoot(mainRoot);
  if ((p.finish_jobs ?? []).some((j) => j.status === 'running')) return;
  const next = (p.finish_jobs ?? []).find((j) => j.status === 'queued');
  if (!next) return;
  step(`Dispatching queued finish for ${next.milestone}...`);
  spawnFinishProcess(next.milestone, mainRoot);
}

function buildTaskMirror(p: Progress, rows: ReturnType<typeof parsePlanTaskRows>): Array<Record<string, unknown>> {
  return rows.map((row, index) => {
    const deps = p.dependency_graph?.[row.taskId]?.depends_on
      ?? (index > 0 ? [rows[index - 1].taskId] : []);
    return {
      id: row.taskId,
      story: row.story || '—',
      title: row.description,
      status: (row.statusEmoji || STATUS.TODO),
      done_when: row.doneWhen,
      started_at: null,
      completed_at: row.statusEmoji === STATUS.DONE ? new Date().toISOString() : null,
      commit: row.commit && row.commit !== '—' ? row.commit : null,
      blocked_reason: row.statusEmoji === STATUS.BLOCKED ? 'See blockers[]' : null,
      depends_on: deps,
    };
  });
}

export function enqueueAutoFinish(milestoneId: string, mainRoot: string): void {
  step(`Queueing automatic finish for ${milestoneId} from main root...`);
  const p = loadProgressFromRoot(mainRoot);
  setFinishJobState(p, milestoneId, 'queued');
  saveProgressToRoot(mainRoot, p);
  dispatchQueuedFinish(mainRoot);
  const refreshed = loadProgressFromRoot(mainRoot);
  const job = (refreshed.finish_jobs ?? []).find((j) => j.milestone === milestoneId);
  if (job?.status === 'running') ok(`Automatic finish queued for ${milestoneId} and started immediately.`);
  else ok(`Automatic finish queued for ${milestoneId}. Another finish job is already mutating main.`);
}

// ─── PLAN.md milestone backfill ─────────────────────────────────────────────

function backfillMilestone(p: Progress, milestoneId: string): ActiveMilestone | null {
  let plan: string;
  try { plan = loadPlan(); } catch { return null; }

  const headers = parseMilestoneHeaders(plan);
  const header = headers.find((h) => h.id === milestoneId);
  if (!header) return null;

  const counts = countTaskStatuses(plan, milestoneId);
  if (counts.total === 0) return null;
  const rows = parsePlanTaskRows(plan, milestoneId);

  const ms: ActiveMilestone = {
    id: milestoneId, title: header.title,
    status: counts.done === counts.total ? 'complete' : (counts.wip > 0 || counts.done > 0 ? 'in_progress' : 'not_started'),
    branch: header.branch,
    depends_on: header.dependsOn.length > 0 ? header.dependsOn : undefined,
    started_at: new Date().toISOString(),
    completed_at: counts.done === counts.total ? new Date().toISOString() : null,
    tasks_total: counts.total,
    tasks_done: counts.done,
    tasks_in_progress: counts.wip,
    tasks_blocked: counts.blocked,
    tasks_remaining: counts.total - counts.done,
    tasks: buildTaskMirror(p, rows),
  };

  p.active_milestones = p.active_milestones ?? [];
  p.active_milestones.push(ms);
  // Do NOT set p.current_milestone — global singleton is not safe in parallel-worktree mode.
  // Callers resolve the active milestone via wt.milestoneId + active_milestones[] lookup.
  saveProgress(p);
  ok(`Backfilled ${milestoneId} from PLAN.md (${String(counts.total)} tasks, ${String(counts.done)} done)`);
  return ms;
}

// ─── worktree:start ──────────────────────────────────────────────────────────

export function cmdWorktreeStart(milestoneId: string): void {
  if (!milestoneId) { fail('Usage: harness worktree:start <milestone-id>  (e.g. M1)'); return; }

  const p = loadProgress();

  const recoveryResult = recoverMilestoneBoard(p);
  if (recoveryResult.recovered > 0) {
    ok(`Auto-recovered ${String(recoveryResult.recovered)} milestone(s): ${recoveryResult.ids.join(', ')}`);
  }

  // Find or backfill milestone
  let ms = (p.active_milestones ?? []).find((m) => m.id === milestoneId);
  if (!ms) {
    if (p.completed_milestones.some((m) => m.id === milestoneId)) {
      fail(`Milestone ${milestoneId} is already completed.`); return;
    }
    step(`${milestoneId} not in progress.json. Scanning PLAN.md...`);
    ms = backfillMilestone(p, milestoneId) ?? undefined;
    if (!ms) {
      fail(
        `Milestone ${milestoneId} not found in progress.json or PLAN.md.\n` +
        `  Make sure PLAN.md has a "### ${milestoneId}: <title>" section with tasks.`
      );
      return;
    }
  }

  // ── Dependency merge guard ──────────────────────────────────────────────
  // Block starting a milestone if its dependencies aren't actually merged.
  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  const msDeps = ms.depends_on ?? [];
  const unmergedDeps = msDeps.filter((d) => !completedIds.has(d));
  if (unmergedDeps.length > 0) {
    // Try auto-recovery first (maybe they're done but not marked)
    const recovery = recoverMilestoneBoard(p);
    if (recovery.recovered > 0) {
      ok(`Auto-recovered ${String(recovery.recovered)} milestone(s): ${recovery.ids.join(', ')}`);
      const nowCompleted = new Set(p.completed_milestones.map((m) => m.id));
      const stillUnmerged = msDeps.filter((d) => !nowCompleted.has(d));
      if (stillUnmerged.length > 0) {
        fail(
          `Cannot start ${milestoneId} — dependency milestone(s) not yet merged:\n` +
          stillUnmerged.map((d) => `  ${R}•${N} ${d} must be merged first`).join('\n') +
          `\n\n  Merge them first:\n` +
          stillUnmerged.map((d) => `  ${PKG} run harness worktree:finish ${d}`).join('\n')
        );
        return;
      }
    } else {
      fail(
        `Cannot start ${milestoneId} — dependency milestone(s) not yet merged:\n` +
        unmergedDeps.map((d) => `  ${R}•${N} ${d} must be merged first`).join('\n') +
        `\n\n  Merge them first:\n` +
        unmergedDeps.map((d) => `  ${PKG} run harness worktree:finish ${d}`).join('\n')
      );
      return;
    }
  }

  // Agent claim check
  const now = Date.now();
  const staleClaims = p.agents.filter(
    (a) => a.milestone === milestoneId && (now - new Date(a.heartbeat).getTime()) >= STALE_AGENT_MS
  );
  if (staleClaims.length > 0) {
    p.agents = p.agents.filter(
      (a) => !(a.milestone === milestoneId && (now - new Date(a.heartbeat).getTime()) >= STALE_AGENT_MS)
    );
    saveProgress(p);
    ok(`Cleared ${String(staleClaims.length)} stale claim(s) for ${milestoneId}.`);
  }

  const existingAgent = p.agents.find(
    (a) => a.milestone === milestoneId && (now - new Date(a.heartbeat).getTime()) < STALE_AGENT_MS
  );
  if (existingAgent) {
    warn(
      `Milestone ${milestoneId} is already claimed by agent ${existingAgent.id}\n` +
      `  Worktree: ${existingAgent.worktree}\n` +
      `  Last heartbeat: ${existingAgent.heartbeat}\n\n` +
      `  If that agent is dead, wait for heartbeat to expire (>2h) or remove from progress.json.`
    );
    process.exit(1); return;
  }

  const branch = ms.branch ?? `milestone/${milestoneId.toLowerCase()}`;
  const rootDir = getMainRoot();
  const worktreeDir = `${rootDir}/../${p.project ?? 'project'}-${milestoneId.toLowerCase()}`;
  const absWorktree = resolve(worktreeDir);
  const normalAbs = normalizePath(absWorktree);

  // Check if worktree already exists (normalized comparison)
  const existingList = execSync('git worktree list', { encoding: 'utf-8', shell: true });
  const wtAlreadyExists = existingList.split('\n')
    .some((line) => normalizePath(line.split(/\s+/)[0] ?? '') === normalAbs);

  if (wtAlreadyExists) {
    info(`Worktree already exists: ${absWorktree}`);
    ms.branch = branch;
    ms.worktree = absWorktree;
    saveProgress(p);
    ok(`Restored milestone context for ${milestoneId}`);

    step('Auto-initializing in existing worktree...');
    try {
      execSync(`${PKG} run harness init --auto-start`, {
        cwd: absWorktree, shell: true, stdio: 'inherit',
      });
    } catch {
      warn(`Auto-init failed. Run manually:\n  cd "${absWorktree}"\n  ${PKG} run harness init`);
    }
    return;
  }

  step(`Creating branch ${branch}...`);
  // Use try/catch instead of "2>/dev/null || true" — POSIX shell redirects are not portable on Windows cmd.exe.
  try { execSync(`git branch ${branch}`, { shell: true, stdio: 'pipe' }); }
  catch { /* branch may already exist — safe to ignore */ }

  step(`Adding worktree at ${absWorktree}...`);
  try {
    execSync(`git worktree add "${absWorktree}" "${branch}"`, { shell: true, stdio: 'inherit' });
  } catch (err) {
    // Clean up the branch created moments ago so progress.json isn't left in a half-committed state.
    try { execSync(`git branch -D ${branch}`, { shell: true, stdio: 'pipe' }); } catch { /* best effort */ }
    fail(`Failed to create worktree at "${absWorktree}": ${(err as Error).message}`);
  }

  ms.branch = branch;
  ms.worktree = absWorktree;
  // NOTE: Do NOT set p.current_milestone here — it is a global singleton that would
  // overwrite state from parallel worktrees running other milestones simultaneously.
  // Every command that needs the active milestone resolves it from wt.milestoneId
  // (derived from the branch name) and looks up active_milestones[] by id.
  saveProgress(p);
  ok(`Worktree ready: ${absWorktree}`);

  const installOk = installWithRetry(absWorktree);

  if (installOk) {
    step('Auto-initializing harness session...');
    try {
      execSync(`${PKG} run harness init --auto-start`, {
        cwd: absWorktree, shell: true, stdio: 'inherit',
      });
    } catch {
      warn(`Auto-init failed. Run manually:\n  cd "${absWorktree}"\n  ${PKG} run harness init`);
    }
  } else {
    console.log(`\nNext:\n  cd "${absWorktree}"\n  ${PKG} install --force\n  ${PKG} run harness init`);
  }
}

// ─── worktree:finish ─────────────────────────────────────────────────────────

export function cmdWorktreeFinish(milestoneId: string): void {
  if (!milestoneId) { fail('Usage: harness worktree:finish <milestone-id>  (e.g. M1)'); return; }

  const rootDir = getMainRoot();
  const p = loadProgressFromRoot(rootDir);
  const ms = (p.active_milestones ?? []).find((m) => m.id === milestoneId);
  if (!ms) {
    setFinishJobState(p, milestoneId, 'failed', `Milestone ${milestoneId} not found in active_milestones`);
    saveRootProgressMerged(rootDir, p);
    fail(`Milestone ${milestoneId} not found in active_milestones`);
  }

  const branch = ms.branch ?? `milestone/${milestoneId.toLowerCase()}`;
  const worktreeDir = ms.worktree ?? '';
  const finishFail = (message: string): never => {
    releaseFinishLock(rootDir);
    setFinishJobState(p, milestoneId, 'failed', message);
    saveRootProgressMerged(rootDir, p);
    fail(message);
  };

  if (normalizePath(process.cwd()) !== normalizePath(rootDir)) {
    finishFail(`Run worktree:finish from the main repo root:\n  cd "${rootDir}"\n  ${PKG} run harness worktree:finish ${milestoneId}`);
  }

  if (!worktreeDir || !existsSync(worktreeDir)) {
    finishFail(`Worktree for ${milestoneId} not found at ${worktreeDir || '(missing path)'}`);
  }

  const lockOwner = tryAcquireFinishLock(rootDir, milestoneId);
  if (lockOwner) {
    setFinishJobState(p, milestoneId, 'queued');
    saveRootProgressMerged(rootDir, p);
    fail(
      `Another root-side worktree:finish is already running (${lockOwner}). ${milestoneId} remains queued.\n` +
      `  Re-run harness init or harness worktree:status from main/root after the current finish completes.`
    );
  }

  setFinishJobState(p, milestoneId, 'running');
  saveRootProgressMerged(rootDir, p);

  // Dependency order check
  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  const milestoneDeps = ms.depends_on ?? [];
  const graph = p.dependency_graph ?? {};
  const crossMilestoneDeps = new Set<string>();

  for (const [taskId, deps] of Object.entries(graph)) {
    if (!taskId.startsWith(`${milestoneId}-`)) continue;
    for (const depId of deps.depends_on) {
      const depMs = depId.match(/^(M\d+)-/)?.[1];
      if (depMs && depMs !== milestoneId) crossMilestoneDeps.add(depMs);
    }
  }

  const allDeps = [...new Set([...milestoneDeps, ...crossMilestoneDeps])];
  let unmergedDeps = allDeps.filter((d) => !completedIds.has(d));

  if (unmergedDeps.length > 0) {
    const recovery = recoverMilestoneBoard(p);
    if (recovery.recovered > 0) {
      ok(`Auto-recovered ${String(recovery.recovered)} milestone(s): ${recovery.ids.join(', ')}`);
      const nowCompleted = new Set(p.completed_milestones.map((m) => m.id));
      unmergedDeps = allDeps.filter((d) => !nowCompleted.has(d));
    }
    if (unmergedDeps.length > 0) {
      finishFail(
        `Cannot merge ${milestoneId} — dependent milestone(s) not yet merged:\n` +
        unmergedDeps.map((d) => `  ${R}•${N} ${d} must be merged first`).join('\n') +
        `\n\nMerge order must follow dependency order.`
      );
    }
    ok('Dependencies resolved after auto-recovery. Continuing...');
  }

  // Refresh main
  step('Refreshing main from origin...');
  try {
    execSync('git fetch origin main', { shell: true, stdio: 'inherit' });
    execSync('git checkout main', { shell: true, stdio: 'inherit' });
    execSync('git pull --ff-only origin main', { shell: true, stdio: 'inherit' });
    ok('main is up to date.');
  } catch {
    finishFail('Could not refresh main with git fetch/pull --ff-only. Resolve manually, then rerun worktree:finish.');
  }

  // Rebase the live worktree branch onto main
  step(`Rebasing ${branch} in ${worktreeDir} onto latest main...`);
  try {
    execSync(`git -C "${worktreeDir}" rebase main`, { shell: true, stdio: 'inherit' });
    ok(`${branch} rebased onto main — no conflicts.`);
  } catch {
    try { execSync(`git -C "${worktreeDir}" rebase --abort`, { shell: true, stdio: 'pipe' }); } catch { /* clean */ }
    finishFail(
      `Automatic rebase failed.\n` +
      `  Resolve inside the worktree:\n` +
      `  cd "${worktreeDir}"\n` +
      `  git rebase main\n` +
      `  # resolve conflicts, then: git rebase --continue\n` +
      `  ${PKG} run harness validate:full\n` +
      `  ${PKG} run harness worktree:finish ${milestoneId}`
    );
  }

  // Re-run the full merge gate on the rebased worktree
  step('Re-running merge gate on the rebased worktree...');
  try {
    execSync(`${PKG} run harness merge-gate --no-auto-finish`, {
      cwd: worktreeDir,
      shell: true,
      stdio: 'inherit',
    });
  } catch {
    finishFail(`Merge gate failed after rebasing ${branch}. Fix inside ${worktreeDir} and rerun worktree:finish.`);
  }

  // Merge without committing yet so milestone metadata lands in the same merge commit
  step(`Merging ${branch} into main (no-commit)...`);
  try {
    execSync(`git merge --no-ff --no-commit "${branch}"`, { shell: true, stdio: 'inherit' });
  } catch {
    finishFail(`Merge conflict. Resolve manually on main, then commit with message:\n  merge: ${milestoneId} complete`);
  }

  // Update PLAN.md + progress.json before creating the merge commit
  step('Updating milestone metadata...');
  try {
    let plan = loadPlan();
    const statusRe = new RegExp(`(### ${milestoneId}:[^\\n]*\\n\\*\\*Status:\\*\\*\\s*)(?:⬜[^\\n]*|🟡[^\\n]*|In Progress|Not Started)`);
    const updated = plan.replace(statusRe, `$1✅ Complete`);
    if (updated !== plan) { savePlan(updated); ok(`PLAN.md: ${milestoneId} marked ✅ Complete`); }
  } catch { /* best-effort */ }

  deregisterAgent(p, worktreeDir);
  const idx = p.active_milestones.findIndex((m) => m.id === milestoneId);
  if (idx !== -1) {
    const completed = p.active_milestones.splice(idx, 1)[0];
    p.completed_milestones.push({ id: completed.id, name: completed.title, completed_at: new Date().toISOString() });
    // Do NOT set p.current_milestone — global singleton is not safe in parallel-worktree mode.
  }
  if (p.current_task?.id?.startsWith(`${milestoneId}-`)) p.current_task = null;

  const nowCompleted = new Set(p.completed_milestones.map((m) => m.id));
  const archivedPlans = archiveCompletedPlans(nowCompleted);
  if (archivedPlans.length > 0) {
    p.synced_plans = (p.synced_plans ?? []).filter((name) => !archivedPlans.includes(name));
    ok(`Archived completed plan file(s): ${archivedPlans.join(', ')}`);
  }
  saveRootProgressMerged(rootDir, p);

  step('Creating merge commit with metadata updates...');
  try {
    execSync('git add -A docs/PLAN.md docs/progress.json docs/exec-plans', { shell: true, stdio: 'inherit' });
    execSync(`git commit -m "merge: ${milestoneId} complete"`, { shell: true, stdio: 'inherit' });
  } catch {
    finishFail(
      `Could not create the merge commit for ${milestoneId}.\n` +
      `  Resolve on main, then commit with:\n` +
      `  git add -A\n` +
      `  git commit -m "merge: ${milestoneId} complete"`
    );
  }

  step('Pushing main to remote...');
  try {
    execSync('git push origin main', { shell: true, stdio: 'inherit' });
    ok('Pushed to remote.');
  } catch {
    finishFail('Could not push to remote. main contains the merge locally; push manually before starting the next milestone.');
  }

  // Cleanup after the merge commit is safely on remote
  step('Removing worktree...');
  if (!removeWorktreeWithRetry(worktreeDir)) {
    warn(`Could not remove worktree at ${worktreeDir} after multiple attempts — remove manually`);
  }
  info(`Branch '${branch}' preserved after merge. Delete manually when no longer needed:\n  git branch -d "${branch}"`);

  setFinishJobState(p, milestoneId, 'succeeded');
  saveRootProgressMerged(rootDir, p);
  releaseFinishLock(rootDir);
  ok(`${milestoneId} merged, pushed, archived, and cleaned up.`);
  dispatchQueuedFinish(rootDir);

  if (p.active_milestones.length > 0) {
    // Find first milestone whose deps are all met (just-finished milestone counts as completed now)
    const eligible = p.active_milestones.find((ms) => {
      const deps = ms.depends_on ?? [];
      return deps.every((d) => nowCompleted.has(d));
    });

    if (eligible) {
      console.log(`\n${G}Next milestone:${N} ${eligible.id} — ${eligible.title}`);

      // Auto-start next milestone (safe — we're in main root)
      step(`Auto-starting worktree for ${eligible.id}...`);
      try {
        execSync(`${PKG} run harness worktree:start ${eligible.id}`, { shell: true, stdio: 'inherit' });
      } catch {
        warn(`Auto worktree:start failed. Run manually:\n  ${PKG} run harness worktree:start ${eligible.id}`);
      }
    } else {
      // Remaining milestones have unmet deps — need other milestones merged first
      info('Remaining milestones have unmet dependencies:');
      for (const ms of p.active_milestones) {
        const unmet = (ms.depends_on ?? []).filter((d) => !nowCompleted.has(d));
        if (unmet.length > 0) console.log(`  ${Y}•${N} ${ms.id}: needs ${unmet.join(', ')} merged first`);
      }
    }
  } else {
    info('All milestones complete! Ready for release/tagging if needed.');
  }
}

// ─── worktree:rebase ─────────────────────────────────────────────────────────

export function cmdWorktreeRebase(): void {
  const wt = enforceWorktree('worktree:rebase');
  step('Fetching latest main...');
  // stdio: 'pipe' already suppresses output — no shell redirect needed (not portable on Windows).
  try { execSync('git fetch origin main', { shell: true, stdio: 'pipe' }); } catch { /* offline */ }
  step(`Rebasing ${wt.currentBranch} onto main...`);
  try {
    execSync('git rebase main', { shell: true, stdio: 'inherit' });
    ok('Rebase successful — no conflicts.');
    info(`Run: ${PKG} run harness validate`);
  } catch {
    warn(`Rebase has conflicts. Resolve:\n  git status → edit → git add → git rebase --continue\n  Or abort: git rebase --abort\n  After resolving: ${PKG} run harness validate`);
    process.exit(1);
  }
}

// ─── worktree:reclaim ────────────────────────────────────────────────────────

export function cmdWorktreeReclaim(milestoneId: string): void {
  if (!milestoneId) { fail('Usage: harness worktree:reclaim <milestone-id>'); return; }

  const p = loadProgress();
  const ms = (p.active_milestones ?? []).find((m) => m.id === milestoneId);
  if (!ms) { fail(`Milestone ${milestoneId} not found in active_milestones`); return; }

  const now = Date.now();
  const force = process.argv.includes('--force');
  const claimant = p.agents.find((a) => a.milestone === milestoneId);

  if (!claimant) {
    info(`No agent currently claims ${milestoneId}. Re-opening the worktree...`);
    cmdWorktreeStart(milestoneId);
    return;
  }

  const age = now - new Date(claimant.heartbeat).getTime();
  const stale = age >= STALE_AGENT_MS;
  if (!stale && !force) {
    fail(
      `${milestoneId} is still actively claimed by ${claimant.id}.\n` +
      `  Use --force only if you are certain that session is gone.`
    );
    return;
  }

  p.agents = p.agents.filter((a) => a.milestone !== milestoneId);
  saveProgress(p);
  ok(`Reclaimed ${milestoneId} from ${claimant.id}${stale ? ' (stale claim)' : ' (--force)'}.`);
  cmdWorktreeStart(milestoneId);
}

// ─── worktree:status ─────────────────────────────────────────────────────────

export function cmdWorktreeList(): void {
  console.log(`\n${B}═══ Worktree Status ═══${N}\n`);
  const wtList = execSync('git worktree list', { encoding: 'utf-8', shell: true }).trim();
  step('Git worktrees:');
  console.log(wtList.split('\n').map((l: string) => `  ${l}`).join('\n'));

  const p = loadProgress();
  const now = Date.now();
  if (p.agents.length > 0) {
    console.log(`\n${Y}Registered agents:${N}`);
    for (const a of p.agents) {
      const age = now - new Date(a.heartbeat).getTime();
      const stale = age > STALE_AGENT_MS;
      const ageStr = age < 60000 ? '<1m' : age < 3600000 ? `${String(Math.floor(age / 60000))}m` : `${String(Math.floor(age / 3600000))}h`;
      const status = stale ? `${R}STALE${N}` : `${G}ACTIVE${N}`;
      console.log(`  ${status} ${a.id} → ${a.milestone ?? '?'} (heartbeat: ${ageStr} ago)`);
    }
  } else { info('No agents registered.'); }

  if ((p.finish_jobs ?? []).length > 0) {
    console.log(`\n${Y}Auto-finish jobs:${N}`);
    for (const job of p.finish_jobs) {
      const status =
        job.status === 'succeeded' ? `${G}SUCCEEDED${N}` :
        job.status === 'failed' ? `${R}FAILED${N}` :
        job.status === 'running' ? `${Y}RUNNING${N}` :
        `${B}QUEUED${N}`;
      const suffix = job.error ? ` — ${job.error}` : '';
      console.log(`  ${status} ${job.milestone} (updated ${job.last_update})${suffix}`);
    }
  }

  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  if (p.active_milestones.length > 0) {
    console.log(`\n${Y}Milestone merge readiness:${N}`);
    for (const ms of p.active_milestones) {
      const deps = ms.depends_on ?? [];
      const unmerged = deps.filter((d) => !completedIds.has(d));
      if (unmerged.length === 0) console.log(`  ${G}●${N} ${ms.id} — ready to merge`);
      else console.log(`  ${R}●${N} ${ms.id} — blocked by: ${unmerged.join(', ')}`);
    }
  }
  console.log('');
}
```

### scripts/harness/tasks.ts

```typescript
// Session init, status display, memory reminders, and the task execution loop: next, start, done, block.
// Auto-cascading: done → next → start → merge-gate → finish. Agent only calls init + validate + done.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { PKG, STALE_AGENT_MS, PLANS_DIR, ok, warn, fail, step, info, R, G, Y, B, D, N } from './config.js';
import type { Progress } from './types.js';
import { loadProgress, saveProgress, loadPlan, savePlan } from './state.js';
import { getWorktreeInfo, resolveTaskContext, getAgentId, registerAgent, updateHeartbeat } from './worktree.js';
import { recoverMilestoneBoard } from './recovery.js';
import { syncProgressState } from './progress.js';
import { cmdStaleCheck, cmdSyncPlans } from './quality.js';
import {
  STATUS, parsePlanTaskRows, replaceTaskStatus, getTaskStatus,
  taskExistsInPlan,
  type StatusEmoji, type TaskRow,
} from './plan-utils.js';

// ─── init ────────────────────────────────────────────────────────────────────
// Auto-cascading: detect plans → apply → recover → register → auto-start task.

export function cmdInit(): void {
  console.log(`\n${B}═══ Harness Init ═══${N}\n`);

  const wt = getWorktreeInfo();

  // ── 1. Auto-detect and apply pending plans ────────────────────────────
  step('Checking for new plan files...');
  const pendingPlans = detectPendingPlans();
  if (pendingPlans > 0) {
    if (wt.isWorktree) {
      warn(
        `Found ${String(pendingPlans)} new plan file(s), but plan application is main-root only.\n` +
        `  Finish or leave ${wt.milestoneId ?? wt.currentBranch}, then run:\n` +
        `  cd "${wt.mainRoot}"\n` +
        `  ${PKG} run harness plan:apply`
      );
    } else {
      step(`Found ${String(pendingPlans)} new plan file(s). Auto-applying from main root...`);
      try {
        execSync(`${PKG} run harness plan:apply`, { shell: true, stdio: 'inherit' });
      } catch { warn('plan:apply failed — rerun from main root: harness plan:apply'); }
    }
  } else {
    cmdSyncPlans(true);
  }

  // ── 2. Stale check + milestone recovery ───────────────────────────────
  step('Running stale check...');
  cmdStaleCheck(true);
  printMemoryStatus();

  step('Validating milestone board...');
  const p = loadProgress();
  const recovery = recoverMilestoneBoard(p);
  if (recovery.recovered > 0) {
    ok(`Auto-recovered ${String(recovery.recovered)} milestone(s): ${recovery.ids.join(', ')}`);
  }

  // ── 3. Agent registration (worktree only) ─────────────────────────────
  if (wt.isWorktree) {
    step('Registering agent...');
    const p2 = loadProgress();
    const failedFinishJobs = (p2.finish_jobs ?? []).filter((j) => j.status === 'failed');
    if (failedFinishJobs.length > 0) {
      warn(`Detected failed auto-finish job(s): ${failedFinishJobs.map((j) => `${j.milestone}`).join(', ')}`);
      info('Resolve from main/root with: harness worktree:status, then rerun harness worktree:finish <M-id>.');
    }
    registerAgent(p2, wt);
    saveProgress(p2);
    ok(`Agent registered: ${getAgentId()} on ${wt.milestoneId ?? wt.currentBranch}`);

    const now = Date.now();
    const staleAgents = p2.agents.filter(
      (a) => (now - new Date(a.heartbeat).getTime()) > STALE_AGENT_MS && a.id !== getAgentId()
    );
    if (staleAgents.length > 0) {
      warn('Stale agents detected (heartbeat >2h):');
      staleAgents.forEach((a) => console.log(`  ${Y}•${N} ${a.id} on ${a.milestone} — last seen ${a.heartbeat}`));
      info('These milestones may be reclaimable.');
    }
  } else {
    // Not in worktree — smart detection of what to do next
    const p2 = loadProgress();
    const failedFinishJobs = (p2.finish_jobs ?? []).filter((j) => j.status === 'failed');
    if (failedFinishJobs.length > 0) {
      warn(`Detected failed auto-finish job(s): ${failedFinishJobs.map((j) => `${j.milestone}`).join(', ')}`);
      info('Inspect with harness worktree:status, fix the issue, then rerun harness worktree:finish <M-id>.');
    }
    const completedSet = new Set(p2.completed_milestones.map((c) => c.id));
    const active = (p2.active_milestones ?? []).filter((m) => !completedSet.has(m.id));

    if (active.length > 0) {
      // Check each active milestone: is it done-but-not-merged?
      let plan: string | null = null;
      try { plan = loadPlan(); } catch { /* ok */ }

      for (const ms of active) {
        if (!plan) break;
        const rows = parsePlanTaskRows(plan, ms.id);
        const allDone = rows.length > 0 && rows.every((r) => r.statusEmoji === STATUS.DONE);

        if (allDone) {
          console.log(`\n${Y}⚠${N} ${B}${ms.id}${N}: All tasks ✅ and ready to close.\n`);
          let wtExists = false;
          try {
            const wtList = execSync('git worktree list', { encoding: 'utf-8', shell: true });
            wtExists = wtList.toLowerCase().includes(ms.id.toLowerCase());
          } catch { /* ok */ }

          if (wtExists) {
            step(`Auto-finishing ${ms.id} from main root...`);
            try {
              execSync(`${PKG} run harness worktree:finish ${ms.id}`, { shell: true, stdio: 'inherit' });
            } catch {
              warn(`Auto-finish failed. Resolve and rerun: ${PKG} run harness worktree:finish ${ms.id}`);
            }
          } else {
            step(`Auto-closing ${ms.id} in serial mode from main root...`);
            try {
              execSync(`${PKG} run harness merge-gate`, { shell: true, stdio: 'inherit' });
            } catch {
              warn(`Serial closeout failed. Resolve and rerun: ${PKG} run harness merge-gate`);
            }
          }
          return;
        }
      }

      // Find first milestone that can be started (deps met)
      const eligible = active.filter((ms) => {
        const deps = ms.depends_on ?? [];
        return deps.every((d) => completedSet.has(d));
      });

      if (eligible.length === 1) {
        const only = eligible[0];
        // Check if worktree already exists
        let wtExists = false;
        try {
          const wtList = execSync('git worktree list', { encoding: 'utf-8', shell: true });
          wtExists = wtList.includes(only.id.toLowerCase());
        } catch { /* ok */ }

        if (wtExists) {
          const wtDir = `../${p2.project ?? 'project'}-${only.id.toLowerCase()}`;
          info(`Worktree for ${only.id} already exists.`);
          console.log(`\n  ${Y}Run:${N} ${PKG} run harness worktree:start ${only.id}\n`);
          info(`worktree:start will reuse ${wtDir}, restore context, and auto-init there.`);
        } else {
          info(`Serial mode active: continuing ${only.id} from main/root.`);
          cmdStatus();

          if (p2.current_task?.status === 'in_progress') {
            const taskId = p2.current_task.id;
            let dirty = false;
            try { dirty = execSync('git status --porcelain', { encoding: 'utf-8', shell: true }).trim().length > 0; } catch { /* ok */ }

            if (dirty) {
              info(`Resuming task ${Y}${taskId}${N} on main/root — uncommitted changes detected.`);
              info(`Write code → ${PKG} run harness validate → git commit → harness done ${taskId}`);
            } else {
              info(`Task ${taskId} in progress but no uncommitted changes. Auto-completing...`);
              try {
                execSync(`${PKG} run harness done ${taskId}`, { shell: true, stdio: 'inherit' });
              } catch {
                warn(`Could not auto-complete ${taskId}. Run: harness done ${taskId}`);
              }
            }
            return;
          }

          console.log(`\n${Y}▶${N} Looking for next available task...`);
          const nextTaskId = findNextTaskId(only.id);
          if (nextTaskId) {
            console.log(`${G}▶${N} Auto-starting task: ${Y}${nextTaskId}${N}`);
            cmdStart(nextTaskId);
          } else {
            autoCascadeNext(only.id);
          }
        }
        return;
      } else if (eligible.length > 1) {
        warn('Multiple milestones are ready from main/root. Use managed worktrees to choose explicitly:');
        for (const ms of eligible) {
          console.log(`  ${Y}•${N} ${ms.id} — ${ms.title}`);
          console.log(`    ${PKG} run harness worktree:start ${ms.id}`);
        }
      } else {
        // All active milestones have unmet deps
        warn('Active milestones have unmet dependencies. Merge pending milestones first:');
        for (const ms of active) {
          const deps = ms.depends_on ?? [];
          const unmet = deps.filter((d) => !completedSet.has(d));
          if (unmet.length > 0) {
            console.log(`  ${R}•${N} ${ms.id} blocked by: ${unmet.join(', ')}`);
          }
        }
      }
    } else {
      info('All milestones complete. Ready for new work (use plan mode or scaffold).');
    }
    cmdStatus();
    return;
  }

  cmdStatus();

  // ── 4. Clear stale current_task ───────────────────────────────────────
  const p3 = loadProgress();
  if (p3.current_task && wt.isWorktree && wt.milestoneId) {
    const taskMs = p3.current_task.id.match(/^(M\d+)-/)?.[1];
    if (taskMs && taskMs !== wt.milestoneId) {
      warn(`current_task ${p3.current_task.id} belongs to ${taskMs}, but this worktree is for ${wt.milestoneId}. Clearing.`);
      p3.current_task = null;
      saveProgress(p3);
    }
  }

  // ── 5. Merge guard — if milestone all done but not merged, guide to merge ─
  if (wt.isWorktree && wt.milestoneId) {
    let plan: string | null = null;
    try { plan = loadPlan(); } catch { /* ok */ }
    if (plan) {
      const msRows = parsePlanTaskRows(plan, wt.milestoneId);
      const allDone = msRows.length > 0 && msRows.every((r) => r.statusEmoji === STATUS.DONE);
      const isCompleted = p3.completed_milestones?.some((m) => m.id === wt.milestoneId);

      if (allDone && !isCompleted) {
        console.log(`\n${G}═══ ${wt.milestoneId} — all tasks complete, ready to merge ═══${N}\n`);
        step('Auto-running merge gate...');
        let gateOk = false;
        try {
          execSync(`${PKG} run harness merge-gate`, { shell: true, stdio: 'inherit' });
          gateOk = true;
        } catch { warn('Merge gate failed. Fix issues and re-run.'); }

        if (gateOk) {
          console.log(`\n${G}Merge gate passed!${N} Now merge this milestone:\n`);
          console.log(`  ${Y}cd "${wt.mainRoot}"${N}`);
          console.log(`  ${Y}${PKG} run harness worktree:finish ${wt.milestoneId}${N}\n`);
          info('worktree:finish will merge, then auto-start the next milestone.');
        }
        return; // Don't try to auto-start tasks — there are none left
      }
    }
  }

  // ── 6. Resume or auto-start ───────────────────────────────────────────
  if (p3.current_task?.status === 'in_progress') {
    const taskId = p3.current_task.id;
    let dirty = false;
    try { dirty = execSync('git status --porcelain', { encoding: 'utf-8', shell: true }).trim().length > 0; } catch { /* ok */ }

    if (dirty) {
      // Has uncommitted changes — agent should continue working on this task
      info(`Resuming task ${Y}${taskId}${N} — uncommitted changes detected.`);
      info(`Write code → ${PKG} run harness validate → git commit → harness done ${taskId}`);
    } else {
      // No changes — task was probably committed but not marked done
      info(`Task ${taskId} in progress but no uncommitted changes. Auto-completing...`);
      try {
        execSync(`${PKG} run harness done ${taskId}`, { shell: true, stdio: 'inherit' });
        // done will auto-cascade to next → start
      } catch {
        warn(`Could not auto-complete ${taskId}. Run: harness done ${taskId}`);
      }
    }
    return;
  }

  // No current task — auto-start the next one
  console.log(`\n${Y}▶${N} Looking for next available task...`);
  const nextTaskId = findNextTaskId(wt.milestoneId);
  if (nextTaskId) {
    console.log(`${G}▶${N} Auto-starting task: ${Y}${nextTaskId}${N}`);
    cmdStart(nextTaskId);
  } else {
    // Check if milestone is fully done
    autoCascadeNext(wt.milestoneId);
  }
}

/** Count pending (unsynced) plan files */
function detectPendingPlans(): number {
  if (!existsSync(PLANS_DIR)) return 0;
  try {
    const p = loadProgress();
    const synced = new Set(p.synced_plans ?? []);
    return readdirSync(PLANS_DIR).filter((f) => f.endsWith('.md') && f !== '.gitkeep' && !synced.has(f)).length;
  } catch { return 0; }
}

function printMemoryStatus(): void {
  const memoryDir = join('docs', 'memory');
  if (!existsSync(memoryDir)) return;

  const memoryFile = join(memoryDir, 'MEMORY.md');
  if (existsSync(memoryFile)) {
    const lines = readFileSync(memoryFile, 'utf-8').split('\n').length;
    info(`Memory loaded: ${memoryFile} (${String(lines)} lines)`);
  }

  const today = new Date().toISOString().split('T')[0];
  const todayLog = join(memoryDir, `${today}.md`);
  if (existsSync(todayLog)) {
    const lines = readFileSync(todayLog, 'utf-8').split('\n').length;
    info(`Today's log: ${todayLog} (${String(lines)} lines)`);
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  const cutoffId = cutoff.toISOString().split('T')[0];
  const staleLogs = readdirSync(memoryDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name) && name.slice(0, 10) < cutoffId)
    .sort();

  if (staleLogs.length > 0) {
    warn(
      `${String(staleLogs.length)} daily log(s) are older than 14 days.\n` +
      `  Summarize them into ${join(memoryDir, 'MEMORY.md')} and archive or delete the stale logs.`
    );
  }
}

// ── Helper — find next task without exiting process ─────────────────────────
// Uses row-level parsing. Returns task ID or null.

function findNextTaskId(milestonePrefix: string | null): string | null {
  if (!milestonePrefix) return null;

  const p = loadProgress();
  const graph = p.dependency_graph;
  let plan: string;
  try { plan = loadPlan(); } catch { return null; }

  const rows = parsePlanTaskRows(plan, milestonePrefix);
  const doneSet = new Set(
    rows.filter((r) => r.statusEmoji === STATUS.DONE).map((r) => r.taskId),
  );
  // Also collect done tasks from OTHER milestones (for cross-milestone deps)
  const allRows = parsePlanTaskRows(plan);
  for (const r of allRows) {
    if (r.statusEmoji === STATUS.DONE) doneSet.add(r.taskId);
  }

  const blockedIds = new Set(p.blockers.map((b) => b.task_id));

  for (const row of rows) {
    if (row.statusEmoji !== STATUS.TODO) continue;
    if (blockedIds.has(row.taskId)) continue;

    const deps = graph[row.taskId]?.depends_on ?? [];
    const allDepsDone = deps.every((d) => doneSet.has(d));
    if (allDepsDone) return row.taskId;
  }

  return null;
}

// ─── Sync task status in progress.json ──────────────────────────────────────
// Updates the task object inside active_milestones[].tasks[] AND
// keeps current_milestone.status in sync (not_started → in_progress → complete).
// This was missing — only PLAN.md and counters were being updated.

function syncTaskInMilestone(p: Progress, taskId: string, newStatus: string, commitHash?: string): void {
  const taskMs = taskId.match(/^(M\d+)-/)?.[1];
  if (!taskMs) return;

  // Find the milestone in active_milestones
  const ms = (p.active_milestones ?? []).find((m) => m.id === taskMs);
  if (!ms || !ms.tasks) return;

  // Update the task object
  const task = ms.tasks.find((t) => (t as any).id === taskId) as Record<string, unknown> | undefined;
  if (task) {
    task.status = newStatus;
    if (commitHash && commitHash !== '—') task.commit = commitHash;
    if (newStatus === '🟡') task.blocked_reason = null;
  }

  // Update milestone-level status
  const allTasks = ms.tasks as Array<Record<string, unknown>>;
  const allDone = allTasks.length > 0 && allTasks.every((t) => t.status === '✅');
  const anyWip = allTasks.some((t) => t.status === '🟡');

  if (allDone) {
    ms.status = 'complete';
    if (p.current_milestone && p.current_milestone.id === taskMs) {
      p.current_milestone.status = 'complete';
    }
  } else if (anyWip || allTasks.some((t) => t.status === '✅')) {
    ms.status = 'in_progress';
    if (p.current_milestone && p.current_milestone.id === taskMs) {
      p.current_milestone.status = 'in_progress';
    }
  } else {
    ms.status = 'not_started';
    if (p.current_milestone && p.current_milestone.id === taskMs) {
      p.current_milestone.status = 'not_started';
    }
  }
}

// ─── status ──────────────────────────────────────────────────────────────────

export function cmdStatus(): void {
  // syncProgressState recalculates counters from PLAN.md — does not save
  const p = syncProgressState(loadProgress());
  console.log(`\n${B}═══ Project: ${p.project} ═══${N}`);
  console.log(`Last updated: ${D}${p.last_updated}${N}`);

  const completedIds = new Set((p.completed_milestones ?? []).map((m) => m.id));
  const derivedSerialMilestone =
    p.current_milestone
    ?? ((p.active_milestones ?? []).filter((m) => !completedIds.has(m.id) && (m.depends_on ?? []).every((d) => completedIds.has(d))).length === 1
      ? (p.active_milestones ?? []).filter((m) => !completedIds.has(m.id) && (m.depends_on ?? []).every((d) => completedIds.has(d)))[0]
      : null);

  if (derivedSerialMilestone) {
    const m = derivedSerialMilestone as any;
    const pct = m.tasks_total > 0 ? Math.round((m.tasks_done / m.tasks_total) * 100) : 0;
    console.log(`\nMilestone: ${B}${m.id}${N} — ${m.name ?? m.title ?? '—'}`);
    console.log(`  Status: ${m.status} | Progress: ${String(m.tasks_done)}/${String(m.tasks_total)} (${String(pct)}%)`);
    console.log(`  Done: ${String(m.tasks_done)} | In Progress: ${String(m.tasks_in_progress)} | Blocked: ${String(m.tasks_blocked)} | Remaining: ${String(m.tasks_remaining)}`);
    console.log(`  Branch: ${m.branch ?? 'main/root (serial mode)'}`);
  } else {
    info('No active milestone. Ready for new work.');
  }

  if (p.current_task) {
    console.log(`\nCurrent task: ${Y}${p.current_task.id}${N} — ${p.current_task.description}`);
  }

  if (p.blockers.length > 0) {
    console.log(`\n${R}Blockers (${String(p.blockers.length)}):${N}`);
    p.blockers.forEach((b) => console.log(`  ${R}•${N} ${b.task_id}: ${b.description}`));
  }

  if (p.completed_milestones.length > 0) {
    console.log(`\nCompleted: ${p.completed_milestones.map((m) => m.id).join(', ')}`);
  }
  console.log('');
}

// ─── next ────────────────────────────────────────────────────────────────────

export function cmdNext(): void {
  const wt = resolveTaskContext('next');

  const p = loadProgress();
  updateHeartbeat(p);
  saveProgress(p);

  const graph = p.dependency_graph;
  const plan = loadPlan();

  const milestonePrefix = wt.milestoneId;
  if (!milestonePrefix) {
    fail(
      `Cannot determine milestone from branch '${wt.currentBranch}'.\n` +
      `  Expected branch format: milestone/m<n> (e.g. milestone/m1)`
    );
    return;
  }

  // Row-level parsing — status comes from the Status column only
  const msRows = parsePlanTaskRows(plan, milestonePrefix);
  const allRows = parsePlanTaskRows(plan);

  const doneSet = new Set<string>();
  for (const r of allRows) {
    if (r.statusEmoji === STATUS.DONE) doneSet.add(r.taskId);
  }

  const wipSet = new Set<string>();
  const todoTasks: TaskRow[] = [];

  for (const row of msRows) {
    if (row.statusEmoji === STATUS.WIP) wipSet.add(row.taskId);
    if (row.statusEmoji === STATUS.TODO) todoTasks.push(row);
  }

  const blockedIds = new Set(p.blockers.map((b) => b.task_id));

  for (const row of todoTasks) {
    if (blockedIds.has(row.taskId)) continue;
    const deps = graph[row.taskId]?.depends_on ?? [];
    const allDepsDone = deps.every((d) => doneSet.has(d));
    if (allDepsDone) {
      console.log(`\n${G}Next task:${N} ${Y}${row.taskId}${N} — ${row.description}`);
      console.log(`\nRun: ${D}${PKG} run harness start ${row.taskId}${N}`);
      return;
    }
  }

  const allDone = msRows.length > 0 && msRows.every((r) => r.statusEmoji === STATUS.DONE);

  if (allDone) {
    ok(`All ${milestonePrefix} tasks complete! Run: ${PKG} run harness merge-gate`);
  } else if (todoTasks.length === 0 && wipSet.size === 0) {
    ok('All tasks complete! Run: ' + PKG + ' run harness merge-gate');
  } else if (todoTasks.length > 0) {
    warn('All remaining tasks are blocked. Requires human input.');
    p.blockers.forEach((b) => console.log(`  ${R}•${N} ${b.task_id}: ${b.description}`));
  } else {
    const milestoneWip = [...wipSet];
    info('Tasks in progress: ' + milestoneWip.join(', '));
  }
}

// ─── start ───────────────────────────────────────────────────────────────────
// Row-level: match task ID in column 1, check/replace status in Status column.
// Preserves "resume 不重複累加 in_progress" behaviour.

export function cmdStart(taskId: string): void {
  if (!taskId) fail('Usage: harness start <task-id>  (e.g., harness start M1-003)');

  const wt = resolveTaskContext('start', taskId);

  const taskMilestone = taskId.match(/^(M\d+)-/)?.[1];
  if (wt.milestoneId && taskMilestone && taskMilestone !== wt.milestoneId) {
    fail(
      `Task ${taskId} belongs to ${taskMilestone}, but this worktree is for ${wt.milestoneId}.\n` +
      `  Switch to the correct worktree or create one:\n` +
      `  ${PKG} run harness worktree:start ${taskMilestone}`
    );
  }

  const p = loadProgress();
  updateHeartbeat(p);
  let plan = loadPlan();

  if (!taskExistsInPlan(plan, taskId)) {
    fail(`Task ${taskId} not found in PLAN.md`);
  }

  // Check current status via column-level lookup
  const currentStatus = getTaskStatus(plan, taskId);
  let freshStart = false;

  if (currentStatus === STATUS.TODO) {
    // Normal flow: ⬜ → 🟡
    const result = replaceTaskStatus(plan, taskId, STATUS.TODO, STATUS.WIP);
    if (result.changed) {
      savePlan(result.plan);
      freshStart = true;
    } else {
      warn(`Could not update ⬜ status for ${taskId} in PLAN.md. Check formatting.`);
    }
  } else if (currentStatus === STATUS.WIP) {
    // Resume — already 🟡, don't touch PLAN.md, don't increment counter
    info(`${taskId} is already in progress (🟡). Resuming.`);
  } else if (currentStatus === STATUS.DONE) {
    fail(`${taskId} is already marked done (✅). Use 'harness next' to pick a new task.`);
    return;
  } else {
    warn(`Unexpected status '${currentStatus ?? 'unknown'}' for ${taskId} in PLAN.md.`);
  }

  // Read description from parsed row
  const rows = parsePlanTaskRows(plan);
  const row = rows.find((r) => r.taskId === taskId);
  const desc = row?.description ?? taskId;

  p.current_task = {
    id: taskId, story: '', description: desc,
    status: 'in_progress', started_at: new Date().toISOString(),
    files_touched: [], notes: '',
  };
  // Only increment counter on fresh start (⬜→🟡), not on resume (already 🟡).
  // Use active_milestones[] by wt.milestoneId — parallel-worktree safe.
  if (freshStart) {
    const activeMs = (p.active_milestones ?? []).find((m) => m.id === wt.milestoneId);
    if (activeMs) activeMs.tasks_in_progress = (activeMs.tasks_in_progress ?? 0) + 1;
  }

  // Sync task status in active_milestones[].tasks[]
  syncTaskInMilestone(p, taskId, '🟡');

  saveProgress(p);

  ok(`Started: ${taskId} — ${desc}`);
  info(`Write code, then run: ${PKG} run harness validate`);
}

// ─── done ────────────────────────────────────────────────────────────────────
// Row-level: match task ID in column 1, replace Status column, fill Commit column.

export function cmdDone(taskId: string): void {
  if (!taskId) fail('Usage: harness done <task-id>');
  const wt = resolveTaskContext('done', taskId);

  const p = loadProgress();
  updateHeartbeat(p);
  let plan = loadPlan();

  let commitHash = '—';
  try { commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', shell: true }).trim(); }
  catch { /* no git */ }

  const currentStatus = getTaskStatus(plan, taskId);
  let wasInProgress = false;
  let planUpdated = false;

  if (currentStatus === STATUS.WIP) {
    // Normal flow: 🟡 → ✅
    const result = replaceTaskStatus(plan, taskId, STATUS.WIP, STATUS.DONE, commitHash);
    if (result.changed) {
      savePlan(result.plan);
      wasInProgress = true;
      planUpdated = true;
    } else {
      warn(`Could not update 🟡 status for ${taskId}. Check PLAN.md formatting.`);
    }
  } else if (currentStatus === STATUS.TODO) {
    // Start was missed — skip directly ⬜ → ✅
    warn(`${taskId} was still ⬜ (start may have failed). Marking ✅ directly.`);
    const result = replaceTaskStatus(plan, taskId, STATUS.TODO, STATUS.DONE, commitHash);
    if (result.changed) {
      savePlan(result.plan);
      wasInProgress = false;
      planUpdated = true;
    }
  } else if (currentStatus === STATUS.DONE) {
    warn(`${taskId} is already marked ✅. Skipping PLAN.md update and counter increment.`);
  } else if (currentStatus === STATUS.BLOCKED) {
    // Unblock + complete in one step
    warn(`${taskId} was 🚫 blocked. Marking ✅ directly.`);
    const result = replaceTaskStatus(plan, taskId, STATUS.BLOCKED, STATUS.DONE, commitHash);
    if (result.changed) {
      savePlan(result.plan);
      planUpdated = true;
    }
  } else {
    warn(`Could not find or update status for ${taskId} in PLAN.md. Check table formatting.`);
  }

  // Update progress.json counters — only if PLAN.md was actually updated.
  // Use wt.milestoneId (from branch name) instead of p.current_milestone (global singleton)
  // so parallel worktrees each increment their own milestone's counters correctly.
  const taskMilestone = taskId.match(/^(M\d+)-/)?.[1];
  const activeMs = (p.active_milestones ?? []).find((m) => m.id === wt.milestoneId);

  p.current_task = null;
  if (planUpdated && taskMilestone === wt.milestoneId && activeMs) {
    activeMs.tasks_done = (activeMs.tasks_done ?? 0) + 1;
    if (wasInProgress) {
      activeMs.tasks_in_progress = Math.max(0, (activeMs.tasks_in_progress ?? 0) - 1);
    }
    activeMs.tasks_remaining = Math.max(0, (activeMs.tasks_remaining ?? 0) - 1);
  } else if (planUpdated && taskMilestone && taskMilestone !== wt.milestoneId) {
    warn(
      `${taskId} belongs to ${taskMilestone}, but this worktree is for ${wt.milestoneId ?? '?'}.\n` +
      `  Counter NOT incremented — run this command from the correct worktree.`
    );
  }

  // Sync task status in active_milestones[].tasks[]
  if (planUpdated) syncTaskInMilestone(p, taskId, '✅', commitHash);

  saveProgress(p);

  ok(`Completed: ${taskId} (commit: ${commitHash})`);

  // Task is committed — only auto-cascade when the worktree is already clean.
  step('Checking working tree is clean...');
  try {
    const dirty = execSync('git status --porcelain', { shell: true, encoding: 'utf-8' }).trim();
    if (dirty.length > 0) {
      warn('Working tree still has uncommitted changes. Commit, stash, or discard them before continuing.');
      info(`Auto-cascade paused. Run: ${PKG} run harness init after the worktree is clean.`);
      return;
    }
    ok('Working tree clean.');
  } catch {
    warn('Could not verify working tree cleanliness — resolve git state manually before continuing.');
    return;
  }

  // ── Auto-cascade: done → next → start (or merge-gate) ────────────────
  autoCascadeNext(wt.milestoneId);
}

// ─── block ───────────────────────────────────────────────────────────────────

export function cmdBlock(taskId: string, reason: string): void {
  if (!taskId || !reason) fail('Usage: harness block <task-id> <reason>');
  const wt = resolveTaskContext('block', taskId);

  const p = loadProgress();
  // Resolve milestone from branch, not from p.current_milestone (parallel-worktree safe).
  const activeMs = (p.active_milestones ?? []).find((m) => m.id === wt.milestoneId);
  p.blockers.push({ task_id: taskId, description: reason, added_at: new Date().toISOString() });

  if (p.current_task?.id === taskId) {
    p.current_task = null;
    if (activeMs) {
      activeMs.tasks_in_progress = Math.max(0, (activeMs.tasks_in_progress ?? 0) - 1);
      activeMs.tasks_blocked = (activeMs.tasks_blocked ?? 0) + 1;
    }
  }

  // Row-level: 🟡 → 🚫 in Status column only
  let plan = loadPlan();
  const result = replaceTaskStatus(plan, taskId, STATUS.WIP, STATUS.BLOCKED);
  if (result.changed) savePlan(result.plan);

  // Sync task status in active_milestones[].tasks[]
  syncTaskInMilestone(p, taskId, '🚫');

  saveProgress(p);

  warn(`Blocked: ${taskId} — ${reason}`);

  // ── Auto-cascade: block → next → start ────────────────────────────────
  // wt already resolved at top of function via enforceWorktree('block').
  autoCascadeNext(wt.milestoneId);
}

// ─── reset ───────────────────────────────────────────────────────────────────

export function cmdReset(taskId: string): void {
  if (!taskId) fail('Usage: harness reset <task-id>  (reverts 🟡 or 🚫 back to ⬜)');
  const wt = resolveTaskContext('reset', taskId);

  const p = loadProgress();
  // Resolve milestone from branch, not from p.current_milestone (parallel-worktree safe).
  const activeMs = (p.active_milestones ?? []).find((m) => m.id === wt.milestoneId);
  let plan = loadPlan();

  const currentStatus = getTaskStatus(plan, taskId);

  if (currentStatus === STATUS.DONE) {
    fail(`${taskId} is already ✅. Cannot reset completed tasks — create a fix task instead.`);
  }

  // Try 🟡 → ⬜
  let result = replaceTaskStatus(plan, taskId, STATUS.WIP, STATUS.TODO);
  if (!result.changed) {
    // Try 🚫 → ⬜
    result = replaceTaskStatus(plan, taskId, STATUS.BLOCKED, STATUS.TODO);
  }

  if (result.changed) {
    savePlan(result.plan);
  } else if (currentStatus === STATUS.TODO) {
    warn(`${taskId} is already ⬜.`);
  } else {
    warn(`${taskId} not found or status unrecognised in PLAN.md.`);
  }

  // Clear current_task if it's the one being reset
  if (p.current_task?.id === taskId) {
    p.current_task = null;
    if (activeMs) {
      activeMs.tasks_in_progress = Math.max(0, (activeMs.tasks_in_progress ?? 0) - 1);
    }
  }

  // Remove from blockers if it was blocked
  const blockerIdx = p.blockers.findIndex((b) => b.task_id === taskId);
  if (blockerIdx !== -1) {
    p.blockers.splice(blockerIdx, 1);
    if (activeMs) {
      activeMs.tasks_blocked = Math.max(0, (activeMs.tasks_blocked ?? 0) - 1);
    }
  }

  // Sync task status in active_milestones[].tasks[]
  syncTaskInMilestone(p, taskId, '⬜');

  saveProgress(p);
  ok(`Reset: ${taskId} → ⬜`);

  // ── Auto-cascade: reset → next → start ────────────────────────────────
  autoCascadeNext(wt.milestoneId);
}

// ─── Auto-cascade helper ─────────────────────────────────────────────────────
// After done/block/reset: auto find next → auto start → or auto merge-gate.
// The agent never needs to manually run `harness next` or `harness start`.

function autoCascadeNext(milestonePrefix: string | null): void {
  if (!milestonePrefix) return;

  const nextTaskId = findNextTaskId(milestonePrefix);

  if (nextTaskId) {
    // Found a task → auto-start it
    console.log(`\n${G}▶${N} Auto-advancing to next task...`);
    cmdStart(nextTaskId);
  } else {
    // No next task — check if milestone is complete
    let plan: string;
    try { plan = loadPlan(); } catch { return; }
    const rows = parsePlanTaskRows(plan, milestonePrefix);
    const allDone = rows.length > 0 && rows.every((r) => r.statusEmoji === STATUS.DONE);

    if (allDone) {
      console.log(`\n${G}═══ All ${milestonePrefix} tasks complete ═══${N}\n`);

      // ── Auto merge-gate (safe to run from inside worktree) ────────────
      step('Auto-running merge gate...');
      let gateOk = false;
      try {
        execSync(`${PKG} run harness merge-gate`, { shell: true, stdio: 'inherit' });
        gateOk = true;
      } catch {
        warn('Merge gate failed. Fix issues and re-run: harness merge-gate');
        return;
      }

      if (gateOk) {
        const runtime = getWorktreeInfo();
        if (runtime.isWorktree) info('Merge gate passed. Automatic finish has been queued in the main repo root.');
        else info('Merge gate passed. Serial closeout completed on main/root.');
      }
    } else {
      const blocked = rows.filter((r) => r.statusEmoji === STATUS.BLOCKED);
      if (blocked.length > 0) {
        warn(`All remaining tasks are blocked (${String(blocked.length)}). Waiting for human input.`);
        blocked.forEach((r) => console.log(`  ${R}•${N} ${r.taskId}: ${r.description}`));
      }
    }
  }
}
```

### scripts/harness/validate.ts

```typescript
// Validation commands: lint → type-check → test, and file-guard (500-line check).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { PKG, FILE_LIMIT, SOURCE_EXTS, IGNORE_DIRS, ok, fail, step, Y, G, N } from './config.js';

export function cmdValidate(full = false): void {
  const hasRunnableTests = (dir: string): boolean => {
    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && hasRunnableTests(fullPath)) return true;
      if (entry.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return true;
    }
    return false;
  };

  const run = (cmd: string, label: string): void => {
    step(label);
    try {
      execSync(cmd, { stdio: 'inherit', shell: true });
      ok(label);
    } catch { fail(`${label} failed`); }
  };

  console.log(`\n${Y}═══ ${full ? 'Full Validation' : 'Validation'} ═══${N}\n`);

  step('Lint auto-fix');
  try { execSync(`${PKG} run lint:fix`, { stdio: 'inherit', shell: true }); } catch { /* ok */ }
  ok('Lint auto-fix complete');

  run(`${PKG} run lint`, 'Lint check (strict)');
  run(`${PKG} run type-check`, 'Type check');
  run(`${PKG} run test`, 'Unit tests');

  if (full) {
    if (hasRunnableTests('tests/integration')) {
      run(`${PKG} run test:integration`, 'Integration tests');
    }
    if (hasRunnableTests('tests/e2e')) {
      run(`${PKG} run test:e2e`, 'E2E tests');
    }
    cmdFileGuard();
  }

  console.log(`\n${G}═══ ${full ? 'Full validation' : 'Validation'} passed ═══${N}`);
}

export function cmdFileGuard(stagedOnly = false): void {
  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walk(full));
      else if (SOURCE_EXTS.has(extname(entry.name))) results.push(full);
    }
    return results;
  };

  let files: string[];
  if (stagedOnly) {
    const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8', shell: true }).trim();
    files = staged.split('\n').filter((f) => f && SOURCE_EXTS.has(extname(f)));
  } else {
    files = [...walk('src'), ...walk('tests'), ...walk('scripts')];
  }

  const violations: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf-8').split('\n').length;
    if (lines > FILE_LIMIT) violations.push(`  ${String(lines)} lines: ${file}`);
  }

  if (violations.length > 0) {
    console.error(`\n\x1b[31m✗ ${String(violations.length)} file(s) exceed ${String(FILE_LIMIT)} lines:${N}\n`);
    violations.forEach((v) => console.error(v));
    fail('Split files before committing. (Iron Rule 1)');
  }
  ok(`All files within ${String(FILE_LIMIT)}-line limit.`);
}
```

### scripts/harness/quality.ts

```typescript
// merge-gate, migrate, stale-check, sync-plans, schema validation, changelog generation.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';
import { PKG, PROGRESS_FILE, PLAN_FILE, SCHEMA_FILE, PLANS_DIR, ok, warn, fail, step, info, R, G, Y, B, N } from './config.js';
import { loadProgress, saveProgress, loadPlan } from './state.js';
import { getWorktreeInfo, enqueueAutoFinish, resolveTaskContext } from './worktree.js';
import { recoverMilestoneBoard } from './recovery.js';
import { cmdValidate } from './validate.js';
import {
  STATUS, countTaskStatuses, parsePlanTaskRows, parseMilestoneHeaders,
} from './plan-utils.js';

const PROGRESS_SCHEMA_TEMPLATE = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Project Progress",
  "type": "object",
  "required": ["project", "last_updated", "last_agent", "current_milestone"],
  "properties": {
    "project": { "type": "string", "minLength": 1 },
    "last_updated": { "type": "string", "format": "date-time" },
    "last_agent": { "type": "string", "enum": ["claude-code", "codex", "human"] },
    "current_milestone": { "type": ["object", "null"] },
    "current_task": { "type": ["object", "null"] },
    "active_milestones": { "type": "array" },
    "completed_milestones": { "type": "array" },
    "dependency_graph": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["depends_on", "blocks"],
        "properties": {
          "depends_on": { "type": "array", "items": { "type": "string" } },
          "blocks": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "synced_plans": { "type": "array", "items": { "type": "string" } },
    "learnings": { "type": "array" },
    "blockers": { "type": "array" },
    "agents": { "type": "array" },
    "finish_jobs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["milestone", "status", "requested_at", "last_update"],
        "properties": {
          "milestone": { "type": "string" },
          "status": { "type": "string", "enum": ["queued", "running", "failed", "succeeded"] },
          "requested_at": { "type": "string", "format": "date-time" },
          "started_at": { "type": "string", "format": "date-time" },
          "finished_at": { "type": "string", "format": "date-time" },
          "requested_by": { "type": "string" },
          "error": { "type": "string" },
          "last_update": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
} as const;

// ─── merge-gate ──────────────────────────────────────────────────────────────
// PATCHED: uses row-level parsing via countTaskStatuses instead of cross-row regex.

export function cmdMergeGate(): void {
  console.log(`\n${B}═══ Milestone Merge Gate ═══${N}\n`);

  const wt = resolveTaskContext('merge-gate');
  const noAutoFinish = process.argv.includes('--no-auto-finish');

  // ── Check all tasks in this milestone are done ─────────────────────────
  step('Checking all milestone tasks are complete...');
  const p = loadProgress();
  // Resolve milestone from branch name (wt.milestoneId), not from p.current_milestone.
  // p.current_milestone is a shared singleton — reading it in a parallel-worktree setup
  // would produce the wrong milestone ID if another worktree wrote to it after us.
  const milestoneId = wt.milestoneId;
  if (!milestoneId) { fail('Cannot determine milestone from current branch. Expected: milestone/m<n>'); return; }
  const ms = (p.active_milestones ?? []).find((m) => m.id === milestoneId);
  if (!ms) { fail(`Milestone ${milestoneId} not found in progress.json active_milestones`); return; }

  const plan = loadPlan();

  // Row-level: count statuses by parsing each row's Status column
  const counts = countTaskStatuses(plan, milestoneId);
  const incomplete = counts.todo + counts.wip + counts.blocked;

  if (incomplete > 0) {
    fail(
      `${milestoneId} has ${String(incomplete)} incomplete task(s) in PLAN.md:\n` +
      `  ⬜ todo: ${String(counts.todo)}  |  🟡 in progress: ${String(counts.wip)}  |  🚫 blocked: ${String(counts.blocked)}\n\n` +
      `  Complete all tasks before running merge-gate.\n` +
      `  Run: ${PKG} run harness next`
    );
    return;
  }

  if (counts.total === 0) {
    fail(`No tasks found for ${milestoneId} in PLAN.md. Check table formatting.`);
    return;
  }

  ok(`All ${milestoneId} tasks are ✅ (${String(counts.done)}/${String(counts.total)})`);

  // ── Full validation ────────────────────────────────────────────────────
  cmdValidate(true);

  step('Running stale check...');
  cmdStaleCheck(true);

  step('Generating changelog...');
  cmdChangelog();

  console.log(`\n${G}═══ Merge gate passed ═══${N}\n`);

  if (wt.isWorktree) {
    info(`You are inside worktree: ${wt.cwd}`);
    info(`Main repo root: ${wt.mainRoot}`);
    if (noAutoFinish) {
      info('Auto-finish suppressed for this invocation; returning to caller.');
      return;
    }
    enqueueAutoFinish(ms.id, wt.mainRoot);
    info('Finish will enter the serialized main-root queue, then rebase on the latest main, archive completed plans, push, and auto-start the next eligible milestone.');
    info('Use harness worktree:status or rerun harness init from main/root to inspect queued/running/failed finish state.');
  } else {
    step('Closing milestone in serial mode on main/root...');
    const result = recoverMilestoneBoard(p);
    if (result.ids.includes(ms.id)) {
      ok(`${ms.id} closed on main/root. PLAN/progress are now in sync.`);
    } else {
      warn(`${ms.id} passed merge-gate, but closeout did not complete automatically. Run: ${PKG} run harness recover`);
    }
    if (!noAutoFinish) {
      const refreshed = loadProgress();
      const completedIds = new Set(refreshed.completed_milestones.map((m) => m.id));
      const nextEligible = (refreshed.active_milestones ?? []).find((m) => (m.depends_on ?? []).every((d) => completedIds.has(d)));
      if (nextEligible) {
        info(`Continuing in serial mode with ${nextEligible.id}...`);
        try {
          execSync(`${PKG} run harness init`, { shell: true, stdio: 'inherit' });
        } catch {
          warn(`Could not auto-enter the next serial milestone. Run: ${PKG} run harness init`);
        }
      } else {
        info('No further serial milestone is ready. Add new work via plan mode or choose a worktree explicitly.');
      }
    }
  }
}

export function cmdMigrate(): void {
  console.log(`\n${B}═══ Harness Runtime Migration ═══${N}\n`);

  const cwd = process.cwd();
  const activeDir = join(cwd, 'docs', 'exec-plans', 'active');
  const completedDir = join(cwd, 'docs', 'exec-plans', 'completed');
  const schemaDir = join(cwd, 'schemas');
  const schemaPath = join(schemaDir, 'progress.schema.json');
  const progressPath = join(cwd, 'docs', 'progress.json');
  const changes: string[] = [];

  for (const dir of [activeDir, completedDir, schemaDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      changes.push(`created ${dir}`);
    }
  }

  for (const keep of [join(activeDir, '.gitkeep'), join(completedDir, '.gitkeep')]) {
    if (!existsSync(keep)) {
      writeFileSync(keep, '');
      changes.push(`created ${keep}`);
    }
  }

  if (!existsSync(schemaPath)) {
    // Only create schema on first run. Subsequent runs preserve the richer schema
    // generated by Phase 3 scaffold (which has typed required/properties for every field).
    writeFileSync(schemaPath, JSON.stringify(PROGRESS_SCHEMA_TEMPLATE, null, 2) + '\n');
    changes.push(`created ${schemaPath}`);
  }

  if (existsSync(progressPath)) {
    const progress = JSON.parse(readFileSync(progressPath, 'utf-8'));
    let mutated = false;

    if (!progress.dependency_graph || typeof progress.dependency_graph !== 'object') {
      progress.dependency_graph = {};
      mutated = true;
    }

    for (const key of ['synced_plans', 'agents', 'finish_jobs', 'learnings', 'blockers', 'active_milestones', 'completed_milestones']) {
      if (!Array.isArray(progress[key])) {
        progress[key] = [];
        mutated = true;
      }
    }

    if (mutated) {
      writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n');
      changes.push(`backfilled runtime fields in ${progressPath}`);
    }
  }

  if (changes.length > 0) {
    ok('Applied harness runtime migration:');
    for (const change of changes) console.log(`  - ${change}`);
  } else {
    ok('Harness runtime already matches the latest managed layout.');
  }

  info('This command updates harness-managed runtime files only.');
  info('This command does not rewrite AGENTS.md / CLAUDE.md or workflow prose.');
  info('If workflow docs or agent rules changed, copy the latest harness files into the project first, then rerun migrate from main/root.');
}

// ─── stale-check ─────────────────────────────────────────────────────────────
// PATCHED: uses row-level parsing for task count comparison and WIP detection.

export function cmdStaleCheck(quiet = false): void {
  let count = 0;
  const w = (msg: string) => { warn(msg); count++; };

  if (existsSync('.env.example') && existsSync('src')) {
    const example = readFileSync('.env.example', 'utf-8');
    const exampleVars = new Set(
      example.split('\n').map((l) => l.split('=')[0]?.trim()).filter((v) => v && !v.startsWith('#')),
    );
    const envPat = [/process\.env\.(\w+)/g, /Bun\.env\.(\w+)/g, /env\(['"](\w+)['"]\)/g];
    const scanDir = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
        if (!e.isFile() || e.name.endsWith('.d.ts')) continue;
        const ext = e.name.split('.').pop();
        if (!['ts', 'tsx', 'js', 'jsx'].includes(ext ?? '')) continue;
        // e.parentPath is Node 20.12+; e.path is the Node 18 equivalent. Fall back to dir.
        const content = readFileSync(join(e.parentPath ?? (e as any).path ?? dir, e.name), 'utf-8');
        for (const pat of envPat) {
          let m; while ((m = pat.exec(content)) !== null) {
            if (!exampleVars.has(m[1])) w(`.env.example missing: ${m[1] ?? ''}`);
          }
        }
      }
    };
    scanDir('src');
  }

  if (existsSync(PROGRESS_FILE) && existsSync(PLAN_FILE)) {
    const plan = loadPlan();
    const p = loadProgress();

    // Row-level: count done tasks for the current milestone by Status column
    const msId = p.current_milestone?.id;
    if (msId) {
      const counts = countTaskStatuses(plan, msId);
      const progDone = p.current_milestone?.tasks_done ?? 0;

      if (counts.done !== progDone) {
        w(`PLAN.md has ${String(counts.done)} tasks ✅ for ${msId} but progress.json says tasks_done=${String(progDone)}`);
      }
    }

    // Row-level: check for 🟡 tasks in PLAN.md vs current_task in progress.json
    const allRows = parsePlanTaskRows(plan);
    const wipRows = allRows.filter((r) => r.statusEmoji === STATUS.WIP);
    for (const row of wipRows) {
      if (!p.current_task || p.current_task.id !== row.taskId) {
        w(`PLAN.md shows ${row.taskId} as 🟡 but progress.json current_task is ${p.current_task?.id ?? 'null'}`);
      }
    }

    // Drift 1-3: per-milestone counter accuracy
    for (const ms of p.active_milestones ?? []) {
      const counts = countTaskStatuses(plan, ms.id);

      if (counts.total > 0 && counts.done === counts.total) {
        w(`${ms.id}: all ${String(counts.total)} tasks ✅ in PLAN.md but still in active_milestones — run: harness recover`);
      }

      if ((ms.tasks_done ?? 0) !== counts.done) {
        w(`${ms.id}: tasks_done=${String(ms.tasks_done ?? 0)} but PLAN.md has ${String(counts.done)} ✅ — run: harness recover`);
      }

      if ((ms.tasks_remaining ?? 0) > 0 && counts.todo === 0) {
        w(`${ms.id}: tasks_remaining=${String(ms.tasks_remaining ?? 0)} but no ⬜ tasks in PLAN.md — run: harness recover`);
      }
    }

    // Drift 4: PLAN.md milestone header ✅ Complete but not in completed_milestones
    const completedIds = new Set(p.completed_milestones.map((m) => m.id));
    const headers = parseMilestoneHeaders(plan);
    for (const h of headers) {
      if (h.status.includes('✅') && !completedIds.has(h.id)) {
        w(`${h.id}: PLAN.md shows ✅ Complete but not in completed_milestones — run: harness recover`);
      }
    }
  }

  if (existsSync('ARCHITECTURE.md') && existsSync('src/modules')) {
    const arch = readFileSync('ARCHITECTURE.md', 'utf-8').toLowerCase();
    for (const d of readdirSync('src/modules', { withFileTypes: true })) {
      if (d.isDirectory() && !arch.includes(d.name.toLowerCase())) {
        w(`Module '${d.name}' not in ARCHITECTURE.md`);
      }
    }
  }

  if (existsSync('ARCHITECTURE.md') && existsSync(join('docs', 'gitbook')) && !existsSync(join('docs', 'gitbook', 'architecture.md'))) {
    w('docs/gitbook/architecture.md missing while ARCHITECTURE.md exists');
  }

  cmdSyncPlans(quiet);

  if (count === 0) { if (!quiet) ok('No stale items.'); }
  else if (!quiet) console.error(`\n${String(count)} stale item(s) found.`);
}

// ─── sync-plans ──────────────────────────────────────────────────────────────

export function cmdSyncPlans(quiet = false): void {
  if (!existsSync(PLANS_DIR) || !existsSync(PROGRESS_FILE)) return;
  const p = loadProgress();
  const synced = new Set(p.synced_plans ?? []);
  let count = 0;
  for (const file of readdirSync(PLANS_DIR)) {
    if (!file.endsWith('.md') || file === '.gitkeep' || synced.has(file)) continue;
    count++;
    if (!quiet) {
      console.log(`\n${Y}New plan:${N} ${file}`);
      const content = readFileSync(join(PLANS_DIR, file), 'utf-8');
      console.log(content.slice(0, 500));
      if (content.length > 500) console.log('...(truncated)');
      info('Apply this plan from the main repo root so PLAN.md/progress.json land on main.');
      info(`Run: ${PKG} run harness plan:apply`);
    }
  }
  if (count === 0 && !quiet) ok('All plans synced.');
  else if (count > 0) warn(`${String(count)} unsynced plan(s).`);
}

// ─── schema ──────────────────────────────────────────────────────────────────

export function cmdSchema(): void {
  // NOTE: This command performs structural integrity checks derived from the schema's
  // required fields and ID patterns. Full JSON Schema validation (ajv) is not bundled
  // to avoid adding a runtime dependency — add ajv as a devDependency if strict
  // schema compliance is required for CI.
  if (!existsSync(PROGRESS_FILE)) { ok('No progress.json (skip).'); return; }
  if (!existsSync(SCHEMA_FILE)) { warn('No schema file (skip).'); return; }

  // Parse the schema to extract the required fields list — this drives the checks below.
  let requiredFields: string[] = [];
  try {
    const schemaJson = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
    requiredFields = Array.isArray(schemaJson.required) ? schemaJson.required as string[] : [];
  } catch {
    warn(`Could not parse ${SCHEMA_FILE} — skipping schema-driven checks.`);
  }

  const data = loadProgress();
  const errors: string[] = [];
  const check = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };

  // Required top-level fields (driven by schema.required if available, else hardcoded fallback)
  const required = requiredFields.length > 0 ? requiredFields : ['project', 'last_updated', 'last_agent'];
  for (const field of required) {
    check((data as Record<string, unknown>)[field] !== undefined && (data as Record<string, unknown>)[field] !== null || field === 'current_milestone', `missing required field: ${field}`);
  }
  check(!!data.project, 'missing: project');
  check(!!data.last_updated, 'missing: last_updated');
  check(!!data.last_agent, 'missing: last_agent');

  // current_milestone shape (deprecated singleton — should be null in new projects)
  if (data.current_milestone) {
    check(/^M\d+$/.test(data.current_milestone.id), `current_milestone.id '${data.current_milestone.id}' invalid (expected M<n>)`);
    if (data.current_milestone.branch) {
      check(/^milestone\/m\d+$/.test(data.current_milestone.branch), `current_milestone.branch '${data.current_milestone.branch}' should be lowercase milestone/m<n>`);
    }
  }

  // current_task shape
  if (data.current_task) {
    check(/^M\d+-\d+$/.test(data.current_task.id), `current_task.id '${data.current_task.id}' invalid (expected M<n>-<n>)`);
  }

  // active_milestones — each entry must have an id, branch must be lowercase
  for (const ms of data.active_milestones ?? []) {
    check(typeof ms.id === 'string' && /^M\d+$/.test(ms.id), `active_milestones: invalid id '${String(ms.id)}'`);
    if (ms.branch) {
      check(/^milestone\/m\d+$/.test(ms.branch), `active_milestones[${ms.id}].branch '${ms.branch}' should be lowercase milestone/m<n>`);
    }
    check(typeof ms.title === 'string' && ms.title.length > 0, `active_milestones[${ms.id}] missing title`);
  }

  // dependency_graph keys must match M<n>-<n>
  for (const key of Object.keys(data.dependency_graph ?? {})) {
    check(/^M\d+-\d+$/.test(key), `dependency_graph key '${key}' invalid (expected M<n>-<n>)`);
  }

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`  ${R}•${N} ${e}`));
    fail('progress.json validation failed');
  }
  ok('progress.json valid.');
}

// ─── learn ───────────────────────────────────────────────────────────────────

export function cmdLearn(category: string, message: string): void {
  if (!category || !message) {
    fail(
      'Usage: harness learn <category> <message>\n' +
      '  Categories: dependency, config, architecture, testing, deploy, performance, security, tooling'
    );
    return;
  }

  const validCategories = ['dependency', 'config', 'architecture', 'testing', 'deploy', 'performance', 'security', 'tooling'];
  if (!validCategories.includes(category)) {
    warn(`Unknown category '${category}'. Valid: ${validCategories.join(', ')}`);
  }

  const p = loadProgress();
  const taskId = p.current_task?.id ?? 'unknown';

  p.learnings.push({
    date: new Date().toISOString().split('T')[0],
    context: taskId,
    category,
    problem: message,
    solution: '',
    affected_files: [],
    prevention: '',
  });
  saveProgress(p);

  const learningsFile = 'docs/learnings.md';
  if (existsSync(learningsFile)) {
    const entry = `\n### ${new Date().toISOString().split('T')[0]} — ${taskId} (${category})\n${message}\n`;
    const content = readFileSync(learningsFile, 'utf-8');
    writeFileSync(learningsFile, content + entry);
  }

  ok(`Learning logged: [${category}] ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`);
}

// ─── changelog ───────────────────────────────────────────────────────────────

// Accept from/to as parameters so internal callers (cmdMergeGate) don't accidentally
// pick up their own argv[3] (e.g. "--no-auto-finish") as a git range.
export function cmdChangelog(from = '', to = 'HEAD'): void {

  if (!from) {
    try { from = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8', shell: true }).trim(); } catch { /* no tags */ }
  }

  const range = from ? `${from}..${to}` : to;
  let log: string;
  try { log = execSync(`git log --oneline --pretty=format:"%s|%h" ${range}`, { encoding: 'utf-8', shell: true }).trim(); }
  catch { log = ''; }

  if (!log) { console.log('No commits in range.'); return; }

  const groups = new Map<string, string[]>();
  const order: string[] = [];

  for (const line of log.split('\n')) {
    const [msg, hash] = line.split('|');
    if (!msg) continue;
    let group: string, entry: string;
    const tm = msg.match(/^\[(M\d+)-(\d+)\]\s+(.+)/);
    const dm = msg.match(/^\[docs\]\s+(.+)/);
    const om = msg.match(/^\[(scaffold|fix|refactor|ci)\]\s+(.+)/);
    if (tm) { group = tm[1] ?? ''; entry = `- \`${tm[1] ?? ''}-${tm[2] ?? ''}\` ${tm[3] ?? ''} (\`${hash}\`)`; }
    else if (dm) { group = 'Docs'; entry = `- ${dm[1] ?? ''} (\`${hash}\`)`; }
    else if (om) { group = (om[1] ?? '')[0].toUpperCase() + (om[1] ?? '').slice(1); entry = `- ${om[2] ?? ''} (\`${hash}\`)`; }
    else { group = 'Other'; entry = `- ${msg} (\`${hash}\`)`; }
    if (!groups.has(group)) { groups.set(group, []); order.push(group); }
    groups.get(group)!.push(entry);
  }

  console.log(`# Changelog${from ? ` (${from} → ${to})` : ''}\n`);
  for (const g of order) {
    console.log(`## ${g}\n`);
    groups.get(g)!.forEach((e) => console.log(e));
    console.log('');
  }
}
```

### scripts/harness/plan-apply.ts

```typescript
// Plan application: parse plan files → analyze project state → insert milestones + tasks.
// This closes the loop: plan mode → plan file → harness plan:apply → repo state is ready for serial init or worktree:start.
//
// The plan file can be:
// A) Structured — contains PLAN.md-format milestone tables (auto-parsed)
// B) Freeform — prose description (agent rewrites to structured before applying)
//
// The CLI handles: where to insert, milestone numbering, dependency wiring, progress.json.
// Architecture docs remain an agent responsibility during planning handoff:
// if the approved plan changes system shape, update ARCHITECTURE.md
// (and docs/gitbook/architecture.md when present) before leaving plan mode.
// If planning happened in another chat, first rewrite the approved plan, transcript,
// or sufficiently detailed prior planning content into docs/exec-plans/active
// before running plan:apply.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { PKG, PLANS_DIR, ok, warn, fail, step, info, R, G, Y, B, D, N } from './config.js';
import { loadProgress, saveProgress, loadPlan, savePlan } from './state.js';
import { getWorktreeInfo } from './worktree.js';
import {
  parseMilestoneHeaders, parsePlanTaskRows, countTaskStatuses, STATUS,
} from './plan-utils.js';

function buildPlanTaskMirror(
  taskRows: ReturnType<typeof parsePlanTaskRows>,
  dependencyGraph: Record<string, { depends_on: string[]; blocks: string[] }>,
): Array<Record<string, unknown>> {
  return taskRows.map((row) => ({
    id: row.taskId,
    story: row.story || '—',
    title: row.description,
    status: row.statusEmoji || STATUS.TODO,
    done_when: row.doneWhen,
    started_at: null,
    completed_at: row.statusEmoji === STATUS.DONE ? new Date().toISOString() : null,
    commit: row.commit && row.commit !== '—' ? row.commit : null,
    blocked_reason: row.statusEmoji === STATUS.BLOCKED ? 'See blockers[]' : null,
    depends_on: dependencyGraph[row.taskId]?.depends_on ?? [],
  }));
}

// ─── plan:status — project overview for planning context ─────────────────────

export function cmdPlanStatus(): void {
  console.log(`\n${B}═══ Project Progress Overview ═══${N}\n`);

  const p = loadProgress();
  let plan: string;
  try { plan = loadPlan(); } catch { fail('PLAN.md not found'); return; }

  const allHeaders = parseMilestoneHeaders(plan);
  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  const activeIds = new Set((p.active_milestones ?? []).map((m) => m.id));

  // ── Milestone summary ────────────────────────────────────────────────
  console.log(`${Y}Milestones:${N}\n`);

  for (const ms of allHeaders) {
    const counts = countTaskStatuses(plan, ms.id);
    const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;

    let statusIcon: string;
    if (completedIds.has(ms.id)) statusIcon = `${G}✅${N}`;
    else if (activeIds.has(ms.id)) statusIcon = `${Y}🟡${N}`;
    else statusIcon = `${D}⬜${N}`;

    const deps = ms.dependsOn.length > 0 ? ` (depends: ${ms.dependsOn.join(', ')})` : '';
    console.log(`  ${statusIcon} ${B}${ms.id}${N}: ${ms.title} — ${String(counts.done)}/${String(counts.total)} (${String(pct)}%)${deps}`);

    // Show incomplete tasks for active milestones
    if (activeIds.has(ms.id) && counts.total - counts.done > 0) {
      const rows = parsePlanTaskRows(plan, ms.id);
      const incomplete = rows.filter((r) => r.statusEmoji !== STATUS.DONE);
      for (const row of incomplete.slice(0, 5)) {
        console.log(`    ${row.statusEmoji} ${D}${row.taskId}${N} ${row.description}`);
      }
      if (incomplete.length > 5) console.log(`    ${D}... and ${String(incomplete.length - 5)} more${N}`);
    }
  }

  // ── Numbering context ────────────────────────────────────────────────
  const maxN = allHeaders.length > 0
    ? Math.max(...allHeaders.map((h) => parseInt(h.id.slice(1))))
    : 0;
  console.log(`\n${Y}Next available milestone:${N} M${String(maxN + 1)}`);
  console.log(`${Y}Completed:${N} ${p.completed_milestones.map((m) => m.id).join(', ') || 'none'}`);
  console.log(`${Y}Active:${N} ${(p.active_milestones ?? []).map((m) => m.id).join(', ') || 'none'}`);

  // ── Pending plans ────────────────────────────────────────────────────
  if (existsSync(PLANS_DIR)) {
    const synced = new Set(p.synced_plans ?? []);
    const pending = readdirSync(PLANS_DIR)
      .filter((f) => f.endsWith('.md') && f !== '.gitkeep' && !synced.has(f));

    if (pending.length > 0) {
      console.log(`\n${Y}Pending plan files (not yet applied):${N}`);
      for (const f of pending) console.log(`  ${R}•${N} ${f}`);
      console.log(`\n  Run: ${B}${PKG} run harness plan:apply${N} to apply them.`);
    }
  }

  console.log('');
}

// ─── plan:apply — parse + insert milestones ──────────────────────────────────

export function cmdPlanApply(filePath?: string): void {
  console.log(`\n${B}═══ Plan Apply ═══${N}\n`);

  const wt = getWorktreeInfo();
  if (wt.isWorktree) {
    fail(
      `Run plan:apply from the main repo root so planning changes land on main, not ${wt.milestoneId ?? wt.currentBranch}.\n` +
      `  cd "${wt.mainRoot}"\n` +
      `  ${PKG} run harness plan:apply`
    );
    return;
  }

  // ── 1. Find plan file(s) to apply ────────────────────────────────────
  const files: string[] = [];

  if (filePath) {
    // Explicit file path
    if (!existsSync(filePath)) { fail(`File not found: ${filePath}`); return; }
    files.push(filePath);
  } else {
    // Auto-detect from exec-plans/active/
    if (!existsSync(PLANS_DIR)) { fail(`No plan files found. Write a plan to ${PLANS_DIR}/`); return; }
    const p = loadProgress();
    const synced = new Set(p.synced_plans ?? []);
    for (const f of readdirSync(PLANS_DIR)) {
      if (f.endsWith('.md') && f !== '.gitkeep' && !synced.has(f)) {
        files.push(join(PLANS_DIR, f));
      }
    }
    if (files.length === 0) { info('All plans already applied. No new plan files found.'); return; }
  }

  const p = loadProgress();
  let plan = loadPlan();

  // ── 2. Current state analysis ────────────────────────────────────────
  step('Analyzing current project state...');

  const existingHeaders = parseMilestoneHeaders(plan);
  const completedIds = new Set(p.completed_milestones.map((m) => m.id));
  let maxMilestoneN = existingHeaders.length > 0
    ? Math.max(...existingHeaders.map((h) => parseInt(h.id.slice(1))))
    : 0;

  const activeMs = (p.active_milestones ?? []).filter((m) => !completedIds.has(m.id));

  info(`Current state: ${String(existingHeaders.length)} milestone(s), ${String(completedIds.size)} completed, ${String(activeMs.length)} active`);
  info(`Next available milestone number: M${String(maxMilestoneN + 1)}`);

  // ── 3. Process each plan file ────────────────────────────────────────
  let totalMilestonesAdded = 0;
  let totalTasksAdded = 0;
  const addedMilestoneIds: string[] = [];

  for (const file of files) {
    step(`Processing: ${file}`);
    const content = readFileSync(file, 'utf-8');

    // Guard: skip empty files — they would trigger the freeform warning on every run
    // since an empty file never becomes "synced" and init would re-detect it indefinitely.
    if (content.trim() === '') {
      warn(`Plan file is empty: ${basename(file)}. Add milestone tables or delete the file.`);
      continue;
    }

    const planIdMap = new Map<string, string>();
    const newlyAddedIds: string[] = [];

    // Try to extract milestone tables from the plan
    const planMilestones = parseMilestoneHeaders(content);

    if (planMilestones.length > 0) {
      // ── Structured plan — has milestone headers + task tables ─────
      info(`Found ${String(planMilestones.length)} milestone(s) in plan file`);

      for (const pm of planMilestones) {
        maxMilestoneN++;
        const newId = `M${String(maxMilestoneN)}`;

        // Renumber tasks from plan file to new milestone ID
        let milestoneBlock = extractMilestoneBlock(content, pm.id);
        const oldPrefix = pm.id;
        milestoneBlock = renumberMilestone(milestoneBlock, oldPrefix, newId);

        // Determine dependencies
        const dependsOn = resolveDependencies(pm, existingHeaders, activeMs, completedIds, planIdMap, newlyAddedIds);

        // Update milestone header with correct metadata
        milestoneBlock = ensureMilestoneHeader(milestoneBlock, newId, pm.title, dependsOn, p.project ?? 'project');

        // Append to PLAN.md
        plan += '\n' + milestoneBlock;

        // Build dependency graph for tasks
        const taskRows = parsePlanTaskRows(milestoneBlock, newId);
        p.dependency_graph = p.dependency_graph ?? {};
        for (let i = 0; i < taskRows.length; i++) {
          const taskId = taskRows[i].taskId;
          p.dependency_graph[taskId] = {
            depends_on: i > 0 ? [taskRows[i - 1].taskId] : [],
            blocks: i < taskRows.length - 1 ? [taskRows[i + 1].taskId] : [],
          };
          // Wire first task to depend on last task of dependency milestone
          if (i === 0 && dependsOn.length > 0) {
            const depMs = dependsOn[dependsOn.length - 1];
            const depTasks = parsePlanTaskRows(plan, depMs);
            if (depTasks.length > 0) {
              p.dependency_graph[taskId].depends_on.push(depTasks[depTasks.length - 1].taskId);
            }
          }
        }

        const counts = countTaskStatuses(milestoneBlock, newId);

        // Update progress.json
        p.active_milestones = p.active_milestones ?? [];
        p.active_milestones.push({
          id: newId,
          title: pm.title,
          status: counts.done === counts.total ? 'complete' : (counts.wip > 0 || counts.done > 0 ? 'in_progress' : 'not_started'),
          branch: `milestone/${newId.toLowerCase()}`,
          depends_on: dependsOn.length > 0 ? dependsOn : undefined,
          started_at: null as any,
          completed_at: null,
          tasks_total: counts.total,
          tasks_done: counts.done,
          tasks_in_progress: counts.wip,
          tasks_blocked: counts.blocked,
          tasks_remaining: counts.total - counts.done,
          tasks: buildPlanTaskMirror(taskRows, p.dependency_graph),
        });

        totalMilestonesAdded++;
        totalTasksAdded += taskRows.length;
        addedMilestoneIds.push(newId);
        newlyAddedIds.push(newId);
        planIdMap.set(oldPrefix, newId);
        existingHeaders.push({ id: newId, dependsOn });
        activeMs.push({ id: newId });

        ok(`Added ${newId}: ${pm.title} (${String(taskRows.length)} tasks, depends on: ${dependsOn.join(', ') || 'none'})`);
      }
    } else {
      // ── Freeform plan — no milestone tables found ─────────────────
      warn(
        `Plan file has no structured milestones (no "### M<n>:" headers with task tables).\n\n` +
        `  The plan needs milestone tables in PLAN.md format. Example:\n\n` +
        `  ${D}### M1: Feature Name${N}\n` +
        `  ${D}**Status:** ⬜ Not Started${N}\n` +
        `  ${D}| Task ID | Story | Task | Done When | Status | Commit |${N}\n` +
        `  ${D}|---------|-------|------|-----------|--------|--------|${N}\n` +
        `  ${D}| M1-001  | —     | Set up X | X works | ⬜ | — |${N}\n\n` +
        `  Ask the agent to rewrite the plan in this format, then re-run plan:apply.`
      );
      continue;
    }

    // Mark plan as synced — use basename() to normalise cross-platform separators (Windows \ vs POSIX /).
    const fileName = basename(file);
    p.synced_plans = p.synced_plans ?? [];
    if (!p.synced_plans.includes(fileName)) p.synced_plans.push(fileName);
  }

  if (totalMilestonesAdded > 0) {
    savePlan(plan);
    // Do NOT set p.current_milestone — global singleton is not safe in parallel-worktree mode.
    // Commands resolve the active milestone via wt.milestoneId + active_milestones[] lookup.
    saveProgress(p);

    console.log(`\n${G}═══ Plan applied ═══${N}`);
    console.log(`  Milestones added: ${String(totalMilestonesAdded)}`);
    console.log(`  Tasks added: ${String(totalTasksAdded)}`);

    // Suggest next steps
    const nextMs = p.active_milestones.find(
      (m) => addedMilestoneIds.includes(m.id) && (m.depends_on ?? []).every((d) => completedIds.has(d))
    );
    if (nextMs) {
      console.log(`\n${Y}Next:${N} ${PKG} run harness init    ${D}# serial-first default${N}`);
      console.log(`       ${PKG} run harness worktree:start ${nextMs.id}    ${D}# use if isolation / parallel execution is needed${N}`);
    } else if (addedMilestoneIds.length > 0) {
      info(`New milestones added: ${addedMilestoneIds.join(', ')}`);
      info('None are startable yet from main — finish the dependency chain first, then start the first eligible new milestone.');
    }
  } else {
    warn('No milestones were added. Check plan file format.');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the full text block for a milestone (header → next header or EOF) */
function extractMilestoneBlock(content: string, milestoneId: string): string {
  const lines = content.split('\n');
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].match(new RegExp(`^###\\s+${milestoneId}:`))) {
      start = i;
    } else if (start !== -1 && lines[i].match(/^###\s+M\d+:/)) {
      end = i;
      break;
    }
  }

  if (start === -1) return '';
  return lines.slice(start, end).join('\n').trimEnd();
}

/** Renumber milestone and task IDs: M1 → M5, M1-001 → M5-001, etc. */
function renumberMilestone(block: string, oldId: string, newId: string): string {
  // Replace milestone header: ### M1: → ### M5:
  let result = block.replace(
    new RegExp(`(###\\s+)${oldId}(:.*)`, 'g'),
    `$1${newId}$2`,
  );
  // Replace task IDs: M1-001 → M5-001
  // Negative lookahead (?!\d) prevents "M1" matching inside "M10", "M11", etc.
  result = result.replace(
    new RegExp(`${oldId}(?!\\d)-(\\d+)`, 'g'),
    `${newId}-$1`,
  );
  // Replace branch reference
  result = result.replace(
    new RegExp(`milestone/${oldId.toLowerCase()}`, 'g'),
    `milestone/${newId.toLowerCase()}`,
  );
  return result;
}

/** Ensure a milestone block has proper header metadata */
function ensureMilestoneHeader(block: string, id: string, title: string, dependsOn: string[], project: string): string {
  const hasStatus = /\*\*Status:\*\*/.test(block);
  const hasBranch = /\*\*Branch:\*\*/.test(block);
  const hasDepends = /\*\*Depends on:\*\*/.test(block);
  const hasWorktree = /\*\*Worktree:\*\*/.test(block);

  const lines = block.split('\n');
  const headerIdx = lines.findIndex((l) => l.match(/^###\s+M\d+:/));
  if (headerIdx === -1) return block;

  // Find insertion point (after the header line)
  let insertAt = headerIdx + 1;

  // Skip any existing metadata lines
  while (insertAt < lines.length && (
    lines[insertAt].startsWith('**Status:') ||
    lines[insertAt].startsWith('**Branch:') ||
    lines[insertAt].startsWith('**Worktree:') ||
    lines[insertAt].startsWith('**Depends on:') ||
    lines[insertAt].startsWith('**Covers:') ||
    lines[insertAt].trim() === ''
  )) { insertAt++; }

  const meta: string[] = [];
  if (!hasStatus) meta.push(`**Status:** ⬜ Not Started`);
  if (!hasBranch) meta.push(`**Branch:** \`milestone/${id.toLowerCase()}\``);
  if (!hasWorktree) meta.push(`**Worktree:** \`../${project}-${id.toLowerCase()}\``);
  if (!hasDepends) meta.push(`**Depends on:** ${dependsOn.length > 0 ? dependsOn.join(', ') : 'None'}`);

  if (meta.length > 0) {
    lines.splice(headerIdx + 1, 0, ...meta, '');
  }

  return lines.join('\n');
}

/** Figure out what milestone(s) this new one should depend on */
function resolveDependencies(
  planMs: { id: string; dependsOn: string[] },
  existingHeaders: Array<{ id: string; dependsOn: string[] }>,
  activeMs: Array<{ id: string }>,
  completedIds: Set<string>,
  planIdMap = new Map<string, string>(),
  newlyAddedIds: string[] = [],
): string[] {
  // If the plan explicitly declares dependencies, use them
  if (planMs.dependsOn.length > 0) {
    return [...new Set(planMs.dependsOn.map((dep) => planIdMap.get(dep) ?? dep))];
  }

  // If multiple milestones are being added in one apply, chain them by default
  if (newlyAddedIds.length > 0) {
    return [newlyAddedIds[newlyAddedIds.length - 1]];
  }

  // Otherwise: depend on the last active or most recently completed milestone
  // Logic: new work should come after whatever is currently in flight
  if (activeMs.length > 0) {
    // Depend on the latest active milestone
    return [activeMs[activeMs.length - 1].id];
  }

  if (completedIds.size > 0) {
    // Depend on the most recently completed
    const sorted = existingHeaders
      .filter((h) => completedIds.has(h.id))
      .sort((a, b) => parseInt(b.id.slice(1)) - parseInt(a.id.slice(1)));
    if (sorted.length > 0) return [sorted[0].id];
  }

  return []; // First milestone — no deps
}
```

### scripts/harness/scaffold-templates.ts

**This module is in a separate reference file: `docs/agent/scaffold-templates.md`**

The scaffold-templates module (~1300 lines) contains 16+ injectable capability templates
(MCP server, SKILL.md, Cloudflare config, agent card, auth, observability, etc.).
It is extracted to reduce context window usage — load it only when generating the
scaffold command for a new project.

Read `docs/agent/scaffold-templates.md` when:
- Generating a greenfield project's `scripts/harness/scaffold-templates.ts`
- The user asks to add MCP, agent, or Cloudflare capabilities to an existing project
- Debugging or modifying scaffold template output

### scripts/harness.ts (Entry Point)

```typescript
#!/usr/bin/env tsx
// Thin router — all logic lives in scripts/harness/ modules.
// Lazy-loaded so each command only imports what it needs (faster startup).
// This file should stay under 60 lines.
import process from 'node:process';
import { fail, B, Y, G, N } from './harness/config.js';

const cmd = process.argv[2];
const arg1 = process.argv[3] ?? '';
const argRest = process.argv.slice(4).join(' ');

// Each handler is an async thunk — imported on demand.
const COMMANDS: Record<string, () => Promise<void>> = {
  'init':             async () => { const m = await import('./harness/tasks.js'); await m.cmdInit(); },
  'status':           async () => { const m = await import('./harness/tasks.js'); await m.cmdStatus(); },
  'next':             async () => { const m = await import('./harness/tasks.js'); await m.cmdNext(); },
  'start':            async () => { const m = await import('./harness/tasks.js'); await m.cmdStart(arg1); },
  'done':             async () => { const m = await import('./harness/tasks.js'); await m.cmdDone(arg1); },
  'block':            async () => { const m = await import('./harness/tasks.js'); await m.cmdBlock(arg1, argRest); },
  'reset':            async () => { const m = await import('./harness/tasks.js'); await m.cmdReset(arg1); },
  'learn':            async () => { const m = await import('./harness/quality.js'); await m.cmdLearn(arg1, argRest); },
  'validate':         async () => { const m = await import('./harness/validate.js'); await m.cmdValidate(false); },
  'validate:full':    async () => { const m = await import('./harness/validate.js'); await m.cmdValidate(true); },
  'merge-gate':       async () => { const m = await import('./harness/quality.js'); await m.cmdMergeGate(); },
  'migrate':          async () => { const m = await import('./harness/quality.js'); await m.cmdMigrate(); },
  'stale-check':      async () => { const m = await import('./harness/quality.js'); await m.cmdStaleCheck(); },
  'file-guard':       async () => { const m = await import('./harness/validate.js'); await m.cmdFileGuard(process.argv.includes('--staged')); },
  'changelog':        async () => { const m = await import('./harness/quality.js'); await m.cmdChangelog(process.argv[3] ?? '', process.argv[4] ?? 'HEAD'); },
  'schema':           async () => { const m = await import('./harness/quality.js'); await m.cmdSchema(); },
  'recover':          async () => { const m = await import('./harness/recovery.js'); await m.cmdRecover(); },
  'worktree:start':   async () => { const m = await import('./harness/worktree.js'); await m.cmdWorktreeStart(arg1); },
  'worktree:finish':  async () => { const m = await import('./harness/worktree.js'); await m.cmdWorktreeFinish(arg1); },
  'worktree:rebase':  async () => { const m = await import('./harness/worktree.js'); await m.cmdWorktreeRebase(); },
  'worktree:reclaim': async () => { const m = await import('./harness/worktree.js'); await m.cmdWorktreeReclaim(arg1); },
  'worktree:status':  async () => { const m = await import('./harness/worktree.js'); await m.cmdWorktreeList(); },
  'scaffold':         async () => { const m = await import('./harness/scaffold-templates.js'); await m.cmdScaffold(arg1); },
  'plan:apply':       async () => { const m = await import('./harness/plan-apply.js'); await m.cmdPlanApply(arg1 || undefined); },
  'plan:status':      async () => { const m = await import('./harness/plan-apply.js'); await m.cmdPlanStatus(); },
};

const handler = COMMANDS[cmd];
if (handler) {
  handler().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
} else {
  // Unknown command — print help
  if (cmd) console.error(`\x1b[31m✗\x1b[0m Unknown command: ${cmd}\n`);
  console.log(`
${B}harness${N} — project automation CLI

${Y}Session:${N}
  init                    Boot session: sync plans, stale check, memory reminders, register agent, status
  status                  Print current state

${Y}Worktrees (milestone isolation):${N}
  worktree:start <M-id>   Create branch + worktree + install + init + auto-start (use for isolation / parallel work)
  worktree:finish <M-id>  Serialized root-side rebase + merge + archive + push + cleanup
  worktree:rebase          Rebase current worktree onto latest main (run inside worktree)
  worktree:reclaim <M-id> Reclaim a stale/abandoned milestone and reopen its worktree
  worktree:status          Show all worktrees, agents, auto-finish jobs, and merge readiness

${Y}Task loop (serial on main/root when exactly one milestone is eligible; otherwise use a worktree):${N}
  next                    Find next unblocked task
  start <id>              Claim task → 🟡
  done <id>               Complete task → ✅
  block <id> <msg>        Mark task blocked → 🚫
  reset <id>              Revert task to ⬜ (undo start or unblock)
  learn <cat> <msg>       Log a learning (dependency, config, architecture, etc.)

${Y}Validation:${N}
  validate                Lint → type-check → test
  validate:full           + integration/e2e when matching test files exist + file-guard

${Y}Quality:${N}
  merge-gate              Full gate check before serial closeout or worktree:finish
  migrate                 Refresh harness-managed runtime files + schema
  stale-check             Detect stale docs/env/plans
  file-guard              500-line limit check (--staged)
  schema                  Validate progress.json
  changelog [from]        Generate release notes
  recover                 Close milestones whose PLAN rows are complete and whose branch is already merged/removed

${Y}Planning (add new work mid-project):${N}
  plan:status             Show project progress overview + pending plans
  plan:apply [file]       Parse plan → analyze state → insert milestones + task mirrors + deps

${Y}Scaffold (inject capability templates):${N}
  scaffold mcp            MCP server: tools/, server.ts, transport, tests
  scaffold skill           SKILL.md agent discovery file at project root
  scaffold llms-txt        llms.txt for LLM/agent discoverability (llmstxt.org spec)
  scaffold milestone:agent Pre-built milestone for agent work → appends to PLAN.md
  scaffold agent-card      A2A Agent Card (/.well-known/agent.json)
  scaffold agent-observe   Tool observability: metrics, latency, error tracking
  scaffold agent-auth      Auth + rate limit middleware for remote SSE deployments
  scaffold agent-pay       Payment: x402 micropayments + Stripe metered billing
  scaffold agent-test      MCP protocol compliance tests (lifecycle + errors)
  scaffold agent-schema-ci CI step: detect SKILL.md vs code schema drift
  scaffold agent-version   Tool versioning: v1/v2 coexistence + deprecation
  scaffold agent-client    Multi-agent client: discover + connect + call remotes
  scaffold agent-prompts   MCP Prompts: pre-built prompt templates for callers
  scaffold agent-webhook   Long-running tasks: async queue + webhook callback
  scaffold agent-cost      Per-call cost estimation + audit log for paid APIs
  scaffold cloudflare      wrangler.toml + .dev.vars + CI deploy step
`);
}
```

---

### scripts/maintenance/check-commit-msg.ts

```typescript
#!/usr/bin/env tsx
// Commit message format enforcer — called by .husky/commit-msg hook.
// Kept standalone (not in harness/ modules) because it needs the msg file path argument.
import { readFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', N = '\x1b[0m';

const msgFile = process.argv[2];
if (!msgFile) {
  console.error(`${R}✗${N} Usage: check-commit-msg <commit-msg-file>`);
  process.exit(1);
}

if (!existsSync(msgFile)) {
  console.error(`${R}✗${N} Commit message file not found: ${msgFile}`);
  process.exit(1);
}

const msg = readFileSync(msgFile, 'utf-8').trim().split('\n')[0]; // first line only

// Valid formats:
// [M1-001] description          ← task commit (most common)
// [M1-001-fix] description      ← fix for a completed task
// [docs] description            ← documentation update
// [scaffold] description        ← initial scaffold / setup
// [fix] description             ← hotfix outside a task
// [refactor] description        ← refactor outside a task
// [ci] description              ← CI/CD changes
// [WIP: M1-001] description     ← work in progress (blocked task)
// merge: M1 complete            ← auto-generated by worktree:finish

const validPatterns = [
  /^\[M\d+-\d+\]\s+.+/,              // [M1-001] description
  /^\[M\d+-\d+-fix\]\s+.+/,          // [M1-001-fix] description
  /^\[(docs|scaffold|fix|refactor|ci)\]\s+.+/,  // [docs] description
  /^\[WIP:\s*M\d+-\d+\]\s+.+/,       // [WIP: M1-001] description
  /^merge:\s+M\d+\s+complete$/,      // merge: M1 complete
];

const isValid = validPatterns.some((p) => p.test(msg));

if (!isValid) {
  console.error(`\n${R}✗ Invalid commit message:${N} "${msg}"\n`);
  console.error(`${Y}Valid formats:${N}`);
  console.error(`  ${G}[M1-001] implement login form${N}         ← task commit`);
  console.error(`  ${G}[M1-001-fix] fix email validation${N}     ← fix for completed task`);
  console.error(`  ${G}[docs] update getting-started.md${N}      ← documentation`);
  console.error(`  ${G}[scaffold] initial project setup${N}      ← setup / scaffold`);
  console.error(`  ${G}[fix] patch CORS header${N}               ← hotfix`);
  console.error(`  ${G}[refactor] extract auth module${N}        ← refactor`);
  console.error(`  ${G}[ci] add staging deploy workflow${N}      ← CI/CD`);
  console.error(`  ${G}[WIP: M1-003] partial implementation${N}  ← blocked / in progress`);
  console.error('');
  process.exit(1);
}
```

---

## Git Hooks (use harness commands)

### .husky/pre-commit
```bash
npx lint-staged
npx tsx scripts/harness.ts file-guard --staged
npx tsx scripts/harness.ts schema
```

### .husky/commit-msg
```bash
npx tsx scripts/maintenance/check-commit-msg.ts "$1"
```

Note: invoke `scripts/maintenance/check-commit-msg.ts` directly — it is standalone and reads the msg file path
from `process.argv[2]`. Do NOT route it through `scripts/harness.ts`; there is no
`check-commit-msg` case in the router, so routing through harness.ts would silently pass
every commit message without validation.

### .husky/pre-push
```bash
npx tsx scripts/harness.ts validate
```

---

## What this replaces

| Before (7 scripts + prose) | After (modular CLI) |
|---|---|
| `scripts/validate.ts` | `harness validate` |
| `scripts/validate-full.ts` | `harness validate:full` |
| `scripts/file-guard.ts` | `harness file-guard` |
| `scripts/stale-check.ts` | `harness stale-check` |
| `scripts/progress-sync.ts` | `harness init` (includes sync) |
| `scripts/validate-schema.ts` | `harness schema` |
| `scripts/changelog.ts` | `harness changelog` |
| Manual progress.json editing | `harness start/done/block` |
| Manual PLAN.md status editing | `harness start/done` |
| ~80 lines of prose in AGENTS.md | ~10 lines of commands |

---

## JSON Schema — schemas/progress.schema.json

Validate progress.json on every write. Built into `harness schema` command.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Project Progress",
  "type": "object",
  "required": ["project", "last_updated", "last_agent", "current_milestone"],
  "properties": {
    "project": { "type": "string", "minLength": 1 },
    "last_updated": { "type": "string", "format": "date-time" },
    "last_agent": { "type": "string", "enum": ["claude-code", "codex", "human"] },
    "current_milestone": {
      "type": ["object", "null"],
      "required": ["id", "name", "status", "tasks_total", "tasks_done"],
      "properties": {
        "id": { "type": "string", "pattern": "^M[0-9]+$" },
        "name": { "type": "string" },
        "branch": { "type": "string", "pattern": "^milestone/m[0-9]+$" },
        "status": { "type": "string", "enum": ["not_started", "in_progress", "complete"] },
        "tasks_total": { "type": "integer", "minimum": 0 },
        "tasks_done": { "type": "integer", "minimum": 0 },
        "tasks_in_progress": { "type": "integer", "minimum": 0 },
        "tasks_blocked": { "type": "integer", "minimum": 0 },
        "tasks_remaining": { "type": "integer", "minimum": 0 }
      }
    },
    "current_task": {
      "type": ["object", "null"],
      "required": ["id", "description", "status"],
      "properties": {
        "id": { "type": "string", "pattern": "^M[0-9]+-[0-9]+$" },
        "description": { "type": "string" },
        "status": { "type": "string", "enum": ["in_progress", "blocked"] }
      }
    },
    "completed_milestones": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "completed_at"],
        "properties": {
          "id": { "type": "string", "pattern": "^M[0-9]+$" },
          "name": { "type": "string" },
          "completed_at": { "type": "string", "format": "date-time" }
        }
      }
    },
    "dependency_graph": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["depends_on", "blocks"],
        "properties": {
          "depends_on": { "type": "array", "items": { "type": "string" } },
          "blocks": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "synced_plans": { "type": "array", "items": { "type": "string" } },
    "learnings": { "type": "array" },
    "blockers": { "type": "array" },
    "agents": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "milestone", "worktree", "branch", "heartbeat"],
        "properties": {
          "id": { "type": "string" },
          "milestone": { "type": ["string", "null"] },
          "worktree": { "type": "string" },
          "branch": { "type": "string" },
          "started_at": { "type": "string", "format": "date-time" },
          "heartbeat": { "type": "string", "format": "date-time" }
        }
      }
    },
    "finish_jobs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["milestone", "status", "requested_at", "last_update"],
        "properties": {
          "milestone": { "type": "string" },
          "status": { "type": "string", "enum": ["queued", "running", "failed", "succeeded"] },
          "requested_at": { "type": "string", "format": "date-time" },
          "started_at": { "type": "string", "format": "date-time" },
          "finished_at": { "type": "string", "format": "date-time" },
          "requested_by": { "type": "string" },
          "error": { "type": "string" },
          "last_update": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

---

## lint-staged config (in package.json)

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"],
    "docs/progress.json": ["npx tsx scripts/harness.ts schema"]
  }
}
```

With the modular structure, all files (including `scripts/`) go through eslint + prettier
normally. No exclusions needed — keep `tasks.ts` and `worktree.ts` split into helper-backed
modules so the staged file guard never becomes the first place you discover oversize files.

---

## Assembly Checklist

1. Generate `scripts/harness.ts` (entry point router) + `scripts/harness/*.ts` (10 focused modules, including `task-helpers.ts` and `worktree-helpers.ts`)
2. Generate `scripts/maintenance/check-commit-msg.ts`
3. Generate `schemas/progress.schema.json`
4. Generate `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`
5. Add `"harness": "tsx scripts/harness.ts"` + `"prepare": "husky"` to package.json
6. Add `tsx` as dev dependency
7. Wire lint-staged to call `harness schema` on progress.json changes
8. **No prettierignore needed** — all modules are small enough for standard formatting
9. **No lint-staged exclusions** — `scripts/` participates in lint + format like everything else
10. **Agents run commands, not edit JSON.** The CLI is the only writer of progress.json.

