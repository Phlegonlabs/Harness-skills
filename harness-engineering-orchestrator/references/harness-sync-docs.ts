#!/usr/bin/env bun

import { getManagedDocSpecs, getManagedPublicDocSpecs, syncManagedFiles } from "./runtime/generated-files"
import { readState, writeState } from "./runtime/state-core"
import { appendWorkflowEvent, createPublicDocsSyncedEvent } from "./runtime/workflow-history"

const state = readState()
state.updatedAt = new Date().toISOString()
const results = syncManagedFiles(getManagedDocSpecs(state))
const publicDocPaths = new Set(getManagedPublicDocSpecs(state).map(spec => spec.path))
const changedPublicCount = results.filter(result => result.changed && publicDocPaths.has(result.path)).length
if (changedPublicCount > 0) {
  appendWorkflowEvent(
    state,
    createPublicDocsSyncedEvent(
      state.phase,
      `Public docs synced via bun harness:sync-docs (${changedPublicCount} file${changedPublicCount === 1 ? "" : "s"})`,
      { stageId: state.roadmap.currentStageId || undefined },
    ),
  )
}
const updated = writeState(state)

const changed = results.filter(result => result.changed).length
console.log(`✅ sync-docs complete (${changed}/${results.length} file(s) changed)`)
console.log(`   Phase: ${updated.phase}`)
