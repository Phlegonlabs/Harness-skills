# Agent Interaction Model

## Agent Dependency Graph

```
Project Discovery → Market Research (via projectInfo)
Market Research → Tech Stack Advisor (via marketResearch, techTrends)
Tech Stack Advisor → PRD Architect (via techStack, ADRs)
PRD Architect → Scaffold Generator (via PRD.md, ARCHITECTURE.md)
Scaffold Generator → Execution Engine (via scaffold artifacts, .harness/)
PRD Architect → Fast Path Bootstrap (via PRD milestones)
Fast Path Bootstrap → Execution Engine (via inferred PRD, scaffold)

EXECUTING Phase:
  Frontend Designer → Execution Engine (via DESIGN_SYSTEM.md, UI specs)
  Execution Engine → Design Reviewer (via implemented code)
  Execution Engine → Code Reviewer (via implemented code)
  Design Reviewer → Execution Engine (via pass/fail verdict)
  Code Reviewer → Execution Engine (via pass/fail verdict)
  Entropy Scanner → Execution Engine (via scan report)

Execution Engine → Harness Validator (via all milestones complete)
Harness Validator → Context Compactor (via validation score)
```

## I/O Manifest

| Agent ID | Inputs (reads) | Outputs (produces) | State Mutations |
|----------|----------------|-------------------|-----------------|
| `project-discovery` | User responses | `state.projectInfo.*` | Sets name, concept, problem, goal, types, aiProvider, teamSize, designStyle, harnessLevel |
| `market-research` | `state.projectInfo`, user guidance | `state.marketResearch.*` | Sets summary, competitors, techTrends |
| `tech-stack-advisor` | `state.marketResearch`, `state.projectInfo` | `state.techStack.*`, `docs/adr/ADR-*.md` | Sets decisions[], confirmed; creates ADR files |
| `prd-architect` | `state.techStack`, `state.projectInfo` | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/gitbook/SUMMARY.md` | Sets docs.prd.*, docs.architecture.*, docs.gitbook.* |
| `scaffold-generator` | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `state.techStack` | `.harness/*.ts`, `AGENTS.md`, `CLAUDE.md`, CI/CD, monorepo structure | Sets scaffold.*, execution.milestones[], roadmap.stages[] |
| `fast-path-bootstrap` | User concept description | Minimal PRD, Architecture, scaffold | Same as prd-architect + scaffold-generator combined |
| `frontend-designer` | `docs/PRD.md` (design section), `state.execution.currentMilestone` | `docs/design/DESIGN_SYSTEM.md`, `docs/design/{milestone}-ui-spec.md` | Sets docs.design.* |
| `execution-engine` | Task definition, PRD, Architecture, design specs (UI) | Implemented code, atomic commit | Sets task.status, task.commitHash, task.checklist |
| `design-reviewer` | `docs/design/DESIGN_SYSTEM.md`, milestone UI spec, implemented code | Pass/fail verdict in commit message | Updates task.checklist (design review) |
| `code-reviewer` | PRD requirements, Architecture rules, implemented code | Pass/fail verdict in commit message | Updates task.checklist (code review) |
| `entropy-scanner` | Codebase, previous scan report | `.harness/reports/entropy-latest.md` | Appends `entropy_scan_completed` workflow event |
| `harness-validator` | `state.json`, all project artifacts | Validation score, critical checklist | Sets validation.score, validation.criticalPassed |
| `context-compactor` | `state.json`, `docs/PROGRESS.md` | `docs/progress/CONTEXT_SNAPSHOT.md` | Updates docs.progress.* |

## Shared Data Channels

No agent calls another agent directly. All communication flows through shared channels:

| Channel | Mechanism | Examples |
|---------|-----------|---------|
| **State** | `.harness/state.json` fields | `projectInfo`, `techStack`, `execution.milestones`, `validation.score` |
| **Filesystem** | Files on disk | `docs/PRD.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/adr/ADR-*.md` |
| **Commit history** | Git commit messages and diffs | `Design Review: pass`, `Code Review: pass`, task-ID in message |

## Dispatch Decision Tree

See [orchestrator.md](../agents/orchestrator.md) for the full dispatch decision tree and EXECUTING 8-priority routing.

## Level Routing

| Phase | Lite | Standard | Full |
|-------|------|----------|------|
| DISCOVERY | fast-path-bootstrap | project-discovery | project-discovery |
| MARKET_RESEARCH | (auto-skip) | market-research (optional) | market-research (required) |
| TECH_STACK | tech-stack-advisor (batch) | tech-stack-advisor (batch) | tech-stack-advisor (sequential) |
| PRD_ARCH | prd-architect (minimal) | prd-architect (single-file) | prd-architect (modular) |
| SCAFFOLD | scaffold-generator (~5-8 files) | scaffold-generator (~25-35 files) | scaffold-generator (60+ files) |
| EXECUTING | execution-engine (relaxed gates) | execution-engine (blocking gates) | execution-engine (blocking gates + CI) |
| VALIDATING | harness-validator (8 items) | harness-validator (15 items) | harness-validator (19 items, score≥80) |
