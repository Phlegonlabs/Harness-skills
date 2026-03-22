import { execFileSync } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")

function runStep(label, file, args) {
  console.log(`\n==> ${label}`)
  execFileSync(file, args, {
    cwd: repoRoot,
    stdio: "inherit",
  })
}

runStep("Check whitespace and conflict markers", "git", ["diff", "--check"])
runStep("Run tracked tests", process.execPath, ["harness-engineering-orchestrator/scripts/run-tracked-tests.mjs"])
runStep("Run skill contract check", process.execPath, ["harness-engineering-orchestrator/scripts/check-skill-contract.mjs"])
