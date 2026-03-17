## 02. Phase Gates

### Purpose

Define the transition conditions between phases.

### Gates

- `MARKET_RESEARCH`
  - `projectInfo.name`
  - `projectInfo.displayName`
  - `projectInfo.concept`
  - `projectInfo.problem`
  - `projectInfo.goal`
  - `projectInfo.types`
  - `aiProvider`
  - `teamSize`
  - `isGreenfield`
  - UI projects require `designStyle`

- `TECH_STACK`
  - `marketResearch.summary`
  - `marketResearch.competitors.length > 0`
  - Each `techStack.decision` has an `adrFile`

- `PRD_ARCH`
  - `techStack.confirmed = true`
  - At least one ADR / stack decision
  - Each stack decision maps to a corresponding `docs/adr/ADR-xxx.md`

- `SCAFFOLD`
  - `docs/PRD.md` or `docs/prd/` exists
  - `docs/ARCHITECTURE.md` or `docs/architecture/` exists
  - GitBook is initialized when required by the current harness level
  - `docs/gitbook/SUMMARY.md` exists when GitBook is part of the chosen template set
  - Architecture explicitly defines dependency direction (`types → config → lib → services → app`)
  - PRD has at least one milestone

- `EXECUTING`
  - AGENTS / CLAUDE / `.harness/state.json` / `.harness/advance.ts` / `.harness/compact.ts` / CI / `.env.example` / Biome in place
  - `agents/*.md` specs required by the orchestrator exist
  - `harness:advance` / `harness:compact*` scripts exist
  - `docs/PROGRESS.md` or `docs/progress/` exists
  - `typecheck` and `build` succeed

- `VALIDATING`
  - All milestones completed
  - All milestone statuses are `COMPLETE` / `MERGED`

- `COMPLETE`
  - Harness Score behavior is level-aware (`Lite`: reported, `Standard`: reported, `Full`: must be `>= 80`)
  - `README.md` final version completed
  - `git worktree list --porcelain` shows only the main worktree
  - `bun harness:compact --status` is executable
