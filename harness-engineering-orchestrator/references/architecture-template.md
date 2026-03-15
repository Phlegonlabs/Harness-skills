# Architecture Document Template

Architecture uses a "thin entry + modules" structure:

- `docs/ARCHITECTURE.md`: entry point and stable links
- `docs/architecture/*.md`: system overview, structure, dependency rules, validation strategy, decisions
- `docs/architecture/versions/*.md`: version snapshots captured when a new delivery stage is promoted

The Orchestrator uses this content to determine which layers each Task touches and how to organize the code.

---

```markdown
# Architecture — [PROJECT_DISPLAY_NAME]

> **Version**: v1.0
> **Last updated**: [DATE]
> **Related documents**: [PRD.md](./PRD.md) | [../AGENTS.md](../AGENTS.md)

---

## 1. System Overview

### 1.1 High-Level Architecture Diagram

```
[CLIENT]          [EDGE/CDN]       [SERVER]          [INFRA]
  │                   │                │                 │
Browser/App ──→ Cloudflare/Vercel ──→ API Layer ──→ Database
                                       │            File Storage
                                   AI Services      Cache
```

### 1.2 Project Type
- [ ] Single Repo (legacy / exception only)
- [x] Monorepo (Bun Workspaces default)

---

## 2. Directory Structure

```
[PROJECT_NAME]/
├── AGENTS.md                ← Codex instructions (identical to CLAUDE.md)
├── CLAUDE.md                ← Claude Code instructions
├── apps/                    ← Product surfaces added over time (web / ios / cli / agent / desktop)
├── packages/                ← Shared packages, types, and utilities
│   └── shared/
├── docs/
│   ├── PRD.md               ← Requirements entry point
│   ├── ARCHITECTURE.md      ← Architecture entry point
│   ├── PROGRESS.md          ← Session recovery entry point
│   ├── prd/                 ← Requirements modules
│   ├── architecture/        ← Architecture modules
│   ├── progress/            ← Progress modules
│   ├── ai/                  ← AI work specification modules
│   └── adr/                 ← Architecture Decision Records
│       ├── README.md
│       └── ADR-001-xxx.md
│
│ # Note: LEARNING.md is global (~/.codex/ and ~/.claude/), not in the repo
│
├── src/                     ← Root scaffold / orchestration seed code
│   ├── types/               ← Layer 1: Type definitions (no dependencies)
│   ├── config/              ← Layer 2: Configuration (depends only on types)
│   ├── lib/                 ← Layer 3: Utility functions (depends only on types/config)
│   ├── services/            ← Layer 4: Business logic (depends only on types/config/lib)
│   └── app/                 ← Layer 5: UI / API (can depend on all layers)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/workflows/       ← CI/CD
├── biome.json               ← Linter + Formatter
├── tsconfig.json
└── package.json             ← Bun
```

---

## 3. Dependency Direction (Enforced)

```
types → config → lib → services → app
  ↑        ↑       ↑       ↑        ↑
Layer 1  Layer 2  Layer 3  Layer 4  Layer 5
```

**Rules**:
- Higher layers may reference lower layers (app can use services)
- Lower layers **must never** reference higher layers (lib cannot reference services)
- Circular dependencies are prohibited
- Violations: CI tests automatically fail

---

## 4. Layer Responsibilities

### types/
- All shared TypeScript Interfaces and Types
- Contains no business logic
- Does not reference any other layer
- Examples: `User`, `Project`, `ApiResponse<T>`

### config/
- Environment variable reading (the only place that reads `process.env`)
- Constant definitions (API endpoints, configuration values)
- Examples: `env.ts`, `constants.ts`

### lib/
- Pure utility functions (prefer no side effects)
- Thin wrappers around third-party SDKs (logger, db client)
- Examples: `logger.ts`, `db.ts`, `validators.ts`

### services/
- Core business logic
- Combines lib functions to perform business operations
- Each service corresponds to one business domain
- Examples: `userService.ts`, `authService.ts`

### app/
- UI components (React/Vue components)
- API Route Handlers
- Pages (Next.js pages)
- Orchestration only — no business logic

---

## 5. Data Flow

```
[User Action]
    ↓
[UI Component] — initiates API call
    ↓
[API Route Handler] — validates request
    ↓
[Service Layer] — business logic
    ↓
[Lib Layer] — DB query / external API call
    ↓
[Database / External Service]
    ↓
[Return result, propagating back up through each layer]
```

---

## 6. Error Handling Strategy

All layers use a unified Result type (or throw + global handler) for errors:

```typescript
// Recommended: Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

// Service layer example
async function getUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) return { success: false, error: new Error('User not found') }
    return { success: true, data: user }
  } catch (err) {
    logger.error({ err, userId: id }, 'Failed to get user')
    return { success: false, error: err as Error }
  }
}
```

---

## 7. Testing Strategy

| Layer | Test Type | Tool | Target Coverage |
|-------|-----------|------|-----------------|
| types | Type tests | tsc | 100% |
| lib | Unit tests | bun test | > 80% |
| services | Unit + Integration | bun test | > 70% |
| app/API | Integration + E2E | bun test | > 50% |

---

## 8. Git Branch Strategy

```
main              ← Always deployable
  │
  ├── milestone/[name]    ← Worktree for each Milestone
  │     │
  │     ├── feat/T001-xxx  ← Branch per Task (atomic commit then merge)
  │     └── feat/T002-xxx
  │
  └── fix/[issue-id]      ← Hotfix
```

After each Task is completed, atomic commit to the corresponding milestone branch.
After all Tasks in a Milestone are completed, merge to main.

See `references/worktree-workflow.md` for worktree usage.

---

## 9. Change Log

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | [DATE] | Initial architecture design |
```

When a new delivery stage (`V2+`) is promoted, update the main Architecture document in place and archive a snapshot under `docs/architecture/versions/`.
