import { existsSync } from "fs"
import type { ProjectState } from "../../types"
import { deriveStateFromFilesystem, STATE_PATH } from "../shared"
import { readProjectStateFromDisk, writeProjectStateToDisk } from "../state-io"
import { ensureWorkflowHistory } from "../workflow-history"

export function loadState(required = true): ProjectState | null {
  if (!existsSync(STATE_PATH)) {
    if (!required) return null
    console.error("❌ .harness/state.json not found. Run: bun .harness/init.ts")
    process.exit(1)
  }

  try {
    return ensureWorkflowHistory(readProjectStateFromDisk(STATE_PATH))
  } catch (error) {
    const backupPath = `${STATE_PATH}.backup`
    if (existsSync(backupPath)) {
      try {
        console.warn("⚠️  Primary state file is corrupt — recovering from backup.")
        const recovered = ensureWorkflowHistory(readProjectStateFromDisk(backupPath))
        writeProjectStateToDisk(recovered, STATE_PATH)
        return recovered
      } catch {
        // Backup also corrupt — fall through to exit
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ ${message}`)
    console.error("   Repair or regenerate .harness/state.json before running validation again.")
    process.exit(1)
  }
}

export function saveState(state: ProjectState): void {
  writeProjectStateToDisk(state, STATE_PATH)
}

export function syncStateFromFilesystem(state: ProjectState): ProjectState {
  return ensureWorkflowHistory(deriveStateFromFilesystem(state, {
    updateProgressTimestamp: true,
    updateValidationTimestamp: true,
  }))
}
