#!/usr/bin/env bun

import { createApiWrapperService } from "./runtime/automation"
import { readState, writeState } from "./runtime/state-core"
import { getManagedSkillSpecs, syncManagedFiles } from "./runtime/generated-files"
import { syncLocalBootstrapManifest } from "./runtime/local-bootstrap"

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const inline = args.find(arg => arg.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)

  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const next = args[index + 1]
  return next && !next.startsWith("--") ? next : undefined
}

const name = getArg("--name")
const source = (getArg("--source") ?? "manual") as "manual" | "openapi"
const spec = getArg("--spec")

if (!name) {
  console.error("Usage: bun .harness/api-add.ts --name <service> [--source openapi|manual] [--spec <path>]")
  process.exit(1)
}

if (!["manual", "openapi"].includes(source)) {
  console.error('Unsupported --source value. Use "manual" or "openapi".')
  process.exit(1)
}

const state = readState()
const result = createApiWrapperService(state, name, source, spec)
syncManagedFiles(getManagedSkillSpecs(state))
writeState(state)
syncLocalBootstrapManifest()

console.log(`✅ api wrapper ${result.created ? "created" : "already present"}: ${result.path}`)
