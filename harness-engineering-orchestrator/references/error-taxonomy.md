# Error Taxonomy

11 error categories with severity levels and recovery strategies.

## Error Categories

| Category | Examples | Severity | Default Recovery |
|----------|----------|----------|-----------------|
| `build_failure` | Compilation error, missing dependency, type error | High | Retry with fix (up to 3 retries) |
| `test_failure` | Unit test fails, integration test fails | High | Retry with fix; if persistent, split task |
| `lint_failure` | Formatting error, style violation | Medium | Auto-fix via formatter; retry |
| `timeout` | Agent exceeds soft time limit | Medium | Save partial progress; block task; escalate |
| `state_corruption` | Invalid JSON in `state.json`, missing required fields | Critical | Invoke state recovery; escalate if unrecoverable |
| `dependency_failure` | External API unavailable, package registry down | Medium | Block task; advance to next; retry later |
| `merge_conflict` | Conflicting changes during milestone merge | High | Present conflict to user; never auto-resolve |
| `doom_loop` | Cycling behavior detected (see [doom-loop-detection.md](./doom-loop-detection.md)) | Medium | Auto-pause; escalate with evidence |
| `hallucination` | Agent references non-existent files or APIs | High | Trigger compaction; retry with fresh context |
| `gate_failure` | Phase/task/milestone gate check fails | Medium | Present failing items; fix before proceeding |
| `permission_failure` | Git push rejected, file write permission denied | Medium | Escalate to user with specific permission needed |

## Recovery Decision Tree

```
Error occurs
├── state_corruption? → Invoke state recovery → Success: resume / Fail: ESCALATE
├── merge_conflict? → ESCALATE (never auto-resolve)
├── permission_failure? → ESCALATE with required action
├── retryCount < 3?
│   YES → Apply category-specific fix → Retry
│     build_failure → Analyze error output; fix code
│     test_failure → Analyze test output; fix test or code
│     lint_failure → Run auto-formatter; retry
│     hallucination → Run compaction; reload context; retry
│     gate_failure → Fix failing gate items; re-validate
│   NO → Is task splittable?
│     YES → Split into subtasks; mark original BLOCKED
│     NO → Mark BLOCKED; advance; ESCALATE
├── timeout or dependency_failure? → Block; advance; revisit
└── doom_loop? → Auto-pause; ESCALATE with heuristic evidence
```

## Error-to-WorkflowEvent Mapping

| Error Category | WorkflowEventKind | Visibility |
|---------------|-------------------|------------|
| `build_failure` | `task_blocked` | internal |
| `test_failure` | `task_blocked` | internal |
| `state_corruption` | `safety_flag_raised` | public |
| `merge_conflict` | `task_blocked` | public |
| `doom_loop` | `task_blocked` | internal |
| `hallucination` | `task_blocked` | internal |

See also: [doom-loop-detection.md](./doom-loop-detection.md), [state-recovery.md](./state-recovery.md)
