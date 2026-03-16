# Testing Strategy

## Overview

The Harness runtime uses a layered testing approach: unit tests for individual functions, integration tests for multi-step workflows, and an end-to-end matrix for cross-platform validation.

## Test Layers

### Unit Tests

Unit tests validate individual runtime functions in isolation. They use Bun's built-in test runner.

**Location:** Co-located with source files as `*.test.ts`

**Existing test files:**

| File | Coverage Area |
|------|--------------|
| `runtime/stage.test.ts` | Stage promotion and deploy review |
| `runtime/progress.test.ts` | Progress document generation |
| `runtime/orchestrator/phase-readiness.test.ts` | Phase gate validation |
| `runtime/orchestrator/milestone-closeout.test.ts` | Milestone closeout workflow |
| `runtime/validation/milestone-score.ts` | Milestone scoring algorithm |
| `runtime/public-docs.test.ts` | Public documentation sync |

**Running unit tests:**

```bash
bun test
```

**Running a specific test file:**

```bash
bun test runtime/stage.test.ts
```

### End-to-End Matrix

The E2E matrix validates the full Harness lifecycle across multiple project types and configurations.

**Location:** `e2e/run-matrix.ps1`

**Coverage:**
- Project type variations (web-app, CLI, API, agent)
- Harness levels (lite, standard, full)
- Ecosystem variations (bun, node-npm, python, go)
- Phase transitions from DISCOVERY through COMPLETE

**Running the E2E matrix:**

```powershell
./e2e/run-matrix.ps1
```

## Coverage Expectations

| Layer | Target | Enforcement |
|-------|--------|-------------|
| Unit tests | Critical runtime paths | CI blocks on failure |
| Phase gate tests | All phase transitions | CI blocks on failure |
| Validation tests | Scoring and checklist logic | CI blocks on failure |
| E2E matrix | Full lifecycle | Manual / nightly |

## Writing New Tests

### Adding a Unit Test

1. Create `<module>.test.ts` alongside the source file
2. Import the functions under test
3. Use `describe` / `test` / `expect` from Bun's test runner:

```typescript
import { describe, expect, test } from "bun:test"
import { myFunction } from "./my-module"

describe("myFunction", () => {
  test("returns expected result", () => {
    expect(myFunction("input")).toBe("output")
  })
})
```

4. For tests that need state, use `initState()` to create a minimal state fixture:

```typescript
import { initState } from "./state-core"

const state = initState({
  phase: "EXECUTING",
  execution: {
    currentMilestone: "M1",
    currentTask: "T001",
    milestones: [/* ... */],
  },
})
```

### Testing State Mutations

State mutation functions (`completeTask`, `blockTask`, etc.) read from disk. For unit tests:

1. Write a test state to `.harness/state.json` in a temp directory
2. Override `STATE_PATH` or use dependency injection
3. Assert the returned state matches expectations
4. Clean up the temp directory

### Testing Validation

Validation functions are pure — they take state and return results. No filesystem mocking needed:

```typescript
import { validatePhaseGate } from "./validation/phase"

test("EXECUTING gate requires CI workflow", () => {
  const result = validatePhaseGate(stateWithoutCi, "EXECUTING")
  expect(result.passed).toBe(false)
})
```

## CI Integration

Tests run in the GitHub Actions CI workflow (`.github/workflows/ci.yml`):

```yaml
- name: Run tests
  run: bun test
```

Test failures block PR merges when branch protection is enabled.
