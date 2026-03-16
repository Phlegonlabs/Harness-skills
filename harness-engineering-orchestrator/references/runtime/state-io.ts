import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs"
import { dirname } from "path"
import type { ProjectState } from "../types"
import { STATE_PATH } from "./shared"

export class ConcurrencyConflictError extends Error {
  constructor(public expected: number, public actual: number) {
    super(`State version conflict: expected ${expected}, got ${actual}`)
    this.name = "ConcurrencyConflictError"
  }
}

const STATE_READ_RETRIES = 3

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath)
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true })
}

function readStateText(filePath: string): string {
  let lastError: unknown

  for (let attempt = 0; attempt < STATE_READ_RETRIES; attempt++) {
    try {
      return readFileSync(filePath, "utf-8")
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function replaceFile(targetPath: string, content: string): void {
  ensureParentDir(targetPath)

  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  const backupPath = `${targetPath}.${process.pid}.${Date.now()}.bak`
  writeFileSync(tempPath, content)

  let movedCurrentAside = false

  try {
    if (existsSync(targetPath)) {
      rmSync(backupPath, { force: true })
      renameSync(targetPath, backupPath)
      movedCurrentAside = true
    }

    renameSync(tempPath, targetPath)

    if (movedCurrentAside && existsSync(backupPath)) {
      const stableBackupPath = `${targetPath}.backup`
      try {
        rmSync(stableBackupPath, { force: true })
        renameSync(backupPath, stableBackupPath)
      } catch {
        rmSync(backupPath, { force: true })
      }
    }
  } catch (error) {
    if (existsSync(tempPath)) {
      rmSync(tempPath, { force: true })
    }

    if (movedCurrentAside && !existsSync(targetPath) && existsSync(backupPath)) {
      renameSync(backupPath, targetPath)
    }

    throw error
  }
}

export function readProjectStateFromDisk(filePath = STATE_PATH): ProjectState {
  for (let attempt = 0; attempt < STATE_READ_RETRIES; attempt++) {
    try {
      return JSON.parse(readStateText(filePath)) as ProjectState
    } catch (error) {
      if (attempt === STATE_READ_RETRIES - 1) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(
          `State file is unreadable (${filePath}). The JSON is invalid or was interrupted during a previous write. ${detail}`,
        )
      }
    }
  }

  throw new Error(`State file is unreadable (${filePath}).`)
}

export function writeProjectStateToDisk(state: ProjectState, filePath = STATE_PATH): void {
  // OCC: if stateVersion is set, verify it matches the version on disk
  if (state.execution.stateVersion != null) {
    try {
      const current = JSON.parse(readStateText(filePath)) as ProjectState
      const diskVersion = current.execution.stateVersion ?? 0
      if (diskVersion !== state.execution.stateVersion) {
        throw new ConcurrencyConflictError(state.execution.stateVersion, diskVersion)
      }
    } catch (error) {
      if (error instanceof ConcurrencyConflictError) throw error
      // File doesn't exist or is unreadable — first write, no conflict possible
    }
    state.execution.stateVersion = (state.execution.stateVersion ?? 0) + 1
  }

  replaceFile(filePath, `${JSON.stringify(state, null, 2)}\n`)
}

export function withStateTransaction<T>(
  mutate: (state: ProjectState) => T,
  filePath = STATE_PATH,
  maxRetries = 3,
): T {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const state = readProjectStateFromDisk(filePath)
      // Ensure stateVersion is initialized for OCC
      if (state.execution.stateVersion == null) {
        state.execution.stateVersion = 0
      }
      const result = mutate(state)
      writeProjectStateToDisk(state, filePath)
      return result
    } catch (error) {
      if (error instanceof ConcurrencyConflictError && attempt < maxRetries) {
        lastError = error
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
