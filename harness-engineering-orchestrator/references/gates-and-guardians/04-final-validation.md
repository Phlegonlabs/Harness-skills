## 04. Final Validation

### Level-Scoped Critical Checklist

Final validation is level-aware:

| Level | Critical items | Score behavior | Gate behavior |
|------|----------------|----------------|---------------|
| Lite | 8 | reported only | score does not block |
| Standard | 15 | reported only | warnings surfaced, critical failures still matter |
| Full | 19 | must be `>= 80` | score threshold blocks |

Critical item groups:

- Lite: AGENTS/CLAUDE, PRD, state, env example, `.gitignore`, milestones complete
- Standard: Lite + Architecture, Progress, README final, CI, linter/formatter, manifest, confirmed stack
- Full: Standard + GitBook summary, PR template, ecosystem `.gitignore` entries, ADR presence

### Pass Threshold

- Lite: score is informational; all applicable critical checks should still be reported
- Standard: score is informational; unresolved critical failures still fail the final gate contract
- Full: all applicable critical checks must pass and Harness Score must be `>= 80`

Recommended grading display:

- `>= 90` and no critical failures: Excellent
- `>= 80` and all critical checks pass: Final Gate Passed
- `>= 80` but critical failures remain: Score meets target, gate still fails
- `< 80`: Not Passed

### Score Formula

Use the level-appropriate denominator:

```text
Lite:     score = round((passing / 8) * 100)
Standard: score = round((passing / 15) * 100)
Full:     score = round((passing / 19) * 100)
```

Examples:

- Lite: 7/8 = 88
- Standard: 13/15 = 87
- Full: 16/19 = 84

### Output

Persist:

- `state.validation.score`
- `state.validation.criticalPassed`
- `state.validation.criticalTotal`
- final validation report output

The final report should always state both the score and whether any critical checks still failed.
