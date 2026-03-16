import type { ManagedWriteResult } from "./generated-files"
import { getManagedPublicDocSpecs, syncManagedFiles } from "./generated-files"
import { writeState } from "./state-core"
import { appendWorkflowEvent, createPublicDocsSyncedEvent } from "./workflow-history"
import type { ProjectState } from "../types"

type PublicDocSyncOptions = {
  milestoneId?: string
  stageId?: string
  summary: string
}

function changedPaths(results: ManagedWriteResult[]): string[] {
  return results.filter(result => result.changed).map(result => result.path)
}

export function syncPublicManagedDocs(
  state: ProjectState,
  options: PublicDocSyncOptions,
): {
  changedPaths: string[]
  results: ManagedWriteResult[]
  state: ProjectState
} {
  const syncAt = new Date().toISOString()
  state.updatedAt = syncAt
  const results = syncManagedFiles(getManagedPublicDocSpecs(state))
  const publicPaths = changedPaths(results)
  let nextState = state

  if (publicPaths.length > 0) {
    nextState = appendWorkflowEvent(
      nextState,
      createPublicDocsSyncedEvent(
        nextState.phase,
        `${options.summary} (${publicPaths.length} file${publicPaths.length === 1 ? "" : "s"})`,
        {
          milestoneId: options.milestoneId,
          stageId: options.stageId,
        },
      ),
    )
  }

  return {
    changedPaths: publicPaths,
    results,
    state: writeState(nextState),
  }
}
