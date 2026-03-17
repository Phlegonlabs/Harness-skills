# Architecture Document Template

Architecture uses a "thin entry + modules" structure:

- `docs/ARCHITECTURE.md`: entry point and stable links
- `docs/architecture/*.md`: system overview, structure, dependency rules, validation strategy, decisions
- `docs/architecture/versions/*.md`: version snapshots captured when a new delivery stage is promoted

The Orchestrator uses this content to determine which layers each Task touches and how to organize the code.

Treat the directory names, manifests, and commands below as reference defaults, not fixed requirements. The final Architecture must follow the confirmed stack in the PRD and the detected project toolchain.

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

### 1.2 Repository Shape
- [ ] Single repo (legacy / narrow-scope exception)
- [x] Monorepo (recommended when multiple surfaces or shared packages exist)
- [ ] Multi-package / service repo without app workspaces

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
├── src/                     ← Root scaffold / orchestration seed code (or domain modules for smaller repos)
│   ├── types/               ← Layer 1: Shared contracts / schemas (adapt per language)
│   ├── config/              ← Layer 2: Runtime configuration
│   ├── lib/                 ← Layer 3: Utilities / adapters
│   ├── services/            ← Layer 4: Business logic / use cases
│   └── app/                 ← Layer 5: Delivery surface (UI / API / CLI handlers)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/workflows/       ← CI/CD
├── [tooling config files]   ← e.g. biome.json / ruff.toml / Cargo.toml / build.gradle.kts
└── [manifest file]          ← e.g. package.json / pyproject.toml / Cargo.toml / go.mod
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
- Shared contracts, schemas, DTOs, or type aliases
- Contains no business logic
- Does not reference any higher layer
- Examples: `User`, `Project`, `ApiResponse<T>`, protocol structs, schema modules

### config/
- Environment and runtime configuration loading
- Constant definitions (API endpoints, configuration values)
- Examples: `env.ts`, `settings.py`, `config.rs`, `application.yml`

### lib/
- Utility helpers and infrastructure adapters with minimal domain knowledge
- Thin wrappers around third-party SDKs (logger, db client, HTTP client)
- Examples: `logger.ts`, `db.py`, `validators.go`, `client.rs`

### services/
- Core business logic
- Combines lib functions to perform business operations
- Each service corresponds to one business domain
- Examples: `userService.ts`, `auth_service.py`, `payments.rs`

### app/
- Delivery-layer code only
- Examples: UI components, API route handlers, CLI commands, job runners
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

| Layer | Test Type | Tooling Guidance | Target Coverage |
|-------|-----------|------------------|-----------------|
| contracts / types | Static checks / schema validation | Use the stack's type or compile command | 100% for critical contracts |
| lib | Unit tests | Use the project test command | > 80% |
| services | Unit + Integration | Use the project test command | > 70% |
| app / delivery surfaces | Integration + E2E | Use the project test / e2e command | > 50% |

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
