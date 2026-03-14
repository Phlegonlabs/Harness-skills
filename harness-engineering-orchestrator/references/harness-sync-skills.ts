#!/usr/bin/env bun

import { existsSync, mkdirSync, writeFileSync } from "fs"
import { getManagedSkillSpecs, syncManagedFiles } from "./runtime/generated-files"
import { syncLocalBootstrapManifest } from "./runtime/local-bootstrap"
import { readState, writeState } from "./runtime/state-core"
import { hasAgentSurface } from "./runtime/surfaces"

const state = readState()

if (!hasAgentSurface(state.projectInfo.types)) {
  console.log("ℹ️  No agent surface is enabled. sync-skills is a no-op.")
  process.exit(0)
}

mkdirSync("packages/shared/api", { recursive: true })
if (!existsSync("packages/shared/api/README.md")) {
  writeFileSync(
    "packages/shared/api/README.md",
    "# Shared API wrappers\n\nAdd agent-facing service wrappers under this directory.\n",
  )
}

const results = syncManagedFiles(getManagedSkillSpecs(state))
writeState(state)
syncLocalBootstrapManifest()

const changed = results.filter(result => result.changed).length
console.log(`✅ sync-skills complete (${changed}/${results.length} file(s) changed)`)
