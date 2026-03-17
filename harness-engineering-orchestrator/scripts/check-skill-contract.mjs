import { readFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const manifest = JSON.parse(
  readFileSync(path.join(scriptDir, "contract-manifest.json"), "utf8"),
)

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function collectEntryBlocks(registryText) {
  const markers = [...registryText.matchAll(/id: "([^"]+)"/g)].map(match => ({
    id: match[1],
    index: match.index,
  }))

  return markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].index : registryText.indexOf("]\n", marker.index)
    return {
      id: marker.id,
      block: registryText.slice(marker.index, end === -1 ? undefined : end),
    }
  })
}

const errors = []

for (const check of manifest.requiredText) {
  if (!read(check.file).includes(check.text)) {
    errors.push(`Missing required text in ${check.file}: ${check.text}`)
  }
}

for (const check of manifest.forbiddenText) {
  if (read(check.file).includes(check.text)) {
    errors.push(`Found forbidden text in ${check.file}: ${check.text}`)
  }
}

const setupText = read("scripts/setup/core.ts")
for (const runtimeEntry of manifest.requiredRuntimeEntries) {
  if (!setupText.includes(`"${runtimeEntry}"`)) {
    errors.push(`copyHarnessRuntime is missing ${runtimeEntry}`)
  }
}

for (const scriptName of manifest.requiredPackageScripts) {
  if (!setupText.includes(`"${scriptName}":`)) {
    errors.push(`updatePackageJson is missing ${scriptName}`)
  }
}

const registryText = read("references/runtime/orchestrator/agent-registry.ts")
const entryBlocks = collectEntryBlocks(registryText)
const actualAgentIds = entryBlocks.map(entry => entry.id)

if (JSON.stringify(actualAgentIds) !== JSON.stringify(manifest.agentIds)) {
  errors.push(
    `Agent registry drift. Expected ${manifest.agentIds.join(", ")} but found ${actualAgentIds.join(", ")}`,
  )
}

for (const entry of entryBlocks) {
  const expectedMinutes = manifest.timeoutMinutes[entry.id]
  if (expectedMinutes != null) {
    const expectedSnippet = `timeoutMs: ${expectedMinutes} * 60_000`
    if (!entry.block.includes(expectedSnippet)) {
      errors.push(`Timeout drift for ${entry.id}. Expected ${expectedSnippet}`)
    }
    continue
  }

  if (entry.block.includes("timeoutMs:")) {
    errors.push(`Unexpected timeout contract for ${entry.id}`)
  }
}

const executionBlock = entryBlocks.find(entry => entry.id === "execution-engine")?.block ?? ""
for (const subSpec of manifest.executionEngineSubSpecs) {
  if (!executionBlock.includes(subSpec)) {
    errors.push(`Execution engine sub-spec drift. Missing ${subSpec}`)
  }
}

if (errors.length > 0) {
  console.error("Skill contract check failed:\n")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log("Skill contract check passed.")
