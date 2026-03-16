# Golden Principles

## Purpose

Mechanical rules beyond guardians that maintain code quality and project hygiene. Each principle has a detection method, severity, and remediation guidance.

## Principles

### P1 — Naming Consistency

- **Rule**: Follow the naming convention declared in the project's linter/formatter config. Do not mix camelCase, snake_case, or PascalCase within the same scope.
- **Detection**: Linter rules (e.g., `@typescript-eslint/naming-convention`, Biome naming rules, Ruff naming checks). Entropy scanner cross-checks naming patterns across files.
- **Severity**: warn
- **Remediation**: Rename to match the dominant convention. If no convention is declared, follow language community defaults.

### P2 — Doc Freshness

- **Rule**: README, PRD, and ARCHITECTURE must be updated within 2 milestones of a related code change.
- **Detection**: Entropy scanner compares last-modified timestamps of documentation files against the milestone in which related source files changed.
- **Severity**: warn
- **Remediation**: Update the stale document to reflect current state. If no material change occurred, add a version bump note.

### P3 — No Dead Code

- **Rule**: Unreachable functions, unused imports, commented-out code blocks, and unreferenced exports must not persist.
- **Detection**: Language-specific tools: TypeScript `noUnusedLocals` + `noUnusedParameters`, Biome `noUnusedImports`, Ruff `F401`. Entropy scanner flags commented-out blocks longer than 5 lines.
- **Severity**: warn
- **Remediation**: Delete the dead code. If it is intentionally preserved for reference, extract it to an ADR or design document instead.

### P4 — Function Size Limits

- **Rule**: Functions exceeding 50 lines are flagged for review. This is a signal, not an automatic block.
- **Detection**: Entropy scanner measures function body line counts. Language-specific linter rules where available.
- **Severity**: info
- **Remediation**: Extract helper functions or decompose into smaller units. Document exceptions in an inline comment if the function is inherently sequential.

### P5 — Pattern Consistency

- **Rule**: Do not mix competing abstractions for the same operation. For example, do not use raw `fetch` alongside an API client wrapper within the same codebase.
- **Detection**: Entropy scanner identifies competing import patterns for HTTP, state management, validation, and logging.
- **Severity**: warn
- **Remediation**: Consolidate on the project's declared abstraction. Update the architecture document if the abstraction choice has changed.

### P6 — Dependency Hygiene

- **Rule**: No unused dependencies in the manifest. Every declared dependency must have at least one import in the source tree.
- **Detection**: Language-specific tools: `depcheck` (npm), `cargo-udeps` (Rust), `go mod tidy` (Go). Entropy scanner cross-references manifest entries against source imports.
- **Severity**: warn
- **Remediation**: Remove the unused dependency from the manifest and lockfile.

## Integration

Golden principles are checked during:
1. **Entropy scan** (`bun harness:entropy-scan`) — runs all principle checks. See [agents/entropy-scanner.md](../agents/entropy-scanner.md) for the entropy scanner agent spec and its golden principles mapping.
2. **Milestone validation** — subset of principles checked as part of milestone score
3. **Code review** — the code reviewer agent references these principles during review

The entropy scanner maps each principle to a scan category and reports violations with severity and remediation guidance. See `runtime/entropy.ts` for the runtime implementation.
