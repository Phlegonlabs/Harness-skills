# Replay Protocol

Use this protocol when a change in one repo affects the workflow contract of other repos.

Typical triggers:
- harness CLI behavior changes
- CI / hook template changes
- `plan:apply`, `worktree:*`, `validate:full`, or finish-flow changes
- schema or scaffold contract changes

## Minimal SOP

1. Finish the upstream change normally.
   Run the usual plan, milestone, worktree, and validation flow in the source repo.

2. Prepare the handoff packet.
   Include changed files/contracts, downstream migration steps, expected behavior deltas, and rollback notes.

3. Select at least one downstream target.
   Use a real consumer repo or a fixture repo that exercises the same workflow surface.

4. Apply the delta downstream.
   Use scaffold update, manual migration, or a replay milestone if the rollout is larger than a trivial edit.

5. Run the downstream closed loop.
   Run `harness init`, then `harness plan:apply` if needed, then `harness worktree:start`, then `harness validate:full`.

6. Record the replay result.
   Capture repo name, commit SHA, pass/fail, migration notes, and any handoff gaps.

7. Close only if replay passed.
   If replay fails, fix the upstream contract or open an explicit downstream follow-up milestone. Do not call the change complete.

## Hard Rules

- No shared harness / CI / template change ships with only single-repo proof.
- If project A changes a workflow that project B depends on, project B needs an explicit replay or follow-up milestone.
- Local green is necessary but not sufficient for shared workflow changes.

## Replay Output Template

```md
Replay target: <repo-or-fixture>
Upstream change: <commit-or-branch>
Downstream replay commit: <sha>
Result: pass | fail
Observed deltas:
- <delta 1>
- <delta 2>
Follow-up:
- none
```
