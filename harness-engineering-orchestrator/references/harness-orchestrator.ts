#!/usr/bin/env bun
/**
 * .harness/orchestrator.ts
 *
 * Stateless CLI — reads state.json + filesystem, decides which Agent to execute next,
 * outputs formatted context for Claude Code or Codex to consume.
 *
 * No API calls, no state modification.
 */

import { existsSync } from "fs"
import { runAutoflow } from "./runtime/orchestrator/autoflow"
import { detectPlatform } from "./runtime/orchestrator/context-builder"
import { dispatch, dispatchCodeReview, dispatchDesignReview, dispatchParallel, getStatus } from "./runtime/orchestrator/dispatcher"
import { deriveStateFromFilesystem, STATE_PATH } from "./runtime/shared"
import { readProjectStateFromDisk } from "./runtime/state-io"

if (!existsSync(STATE_PATH)) {
  console.error("❌ .harness/state.json does not exist. Run bun .harness/init.ts to initialize.")
  process.exit(1)
}

const state = deriveStateFromFilesystem(readProjectStateFromDisk(STATE_PATH), {
  updateProgressTimestamp: false,
  updateValidationTimestamp: false,
})

const platform = detectPlatform()
const args = process.argv.slice(2)

if (args.includes("--auto")) {
  process.exit(await runAutoflow())
}

if (args.includes("--status")) {
  console.log(getStatus(state, platform))
  process.exit(0)
}

if (args.includes("--parallel")) {
  const parallelResult = dispatchParallel(state, platform)

  if (args.includes("--packet-json")) {
    console.log(JSON.stringify(parallelResult, null, 2))
    process.exit(parallelResult.dispatches.some(d => d.type === "agent") ? 0 : 1)
  }

  console.log(`Concurrency Mode: ${parallelResult.concurrencyMode}`)
  console.log(`State Version: ${parallelResult.stateVersion}`)
  console.log(`Dispatches: ${parallelResult.dispatches.length}`)
  console.log("")

  for (const [i, d] of parallelResult.dispatches.entries()) {
    if (parallelResult.dispatches.length > 1) {
      console.log(`${"─".repeat(40)} Dispatch ${i + 1}`)
    }
    if (d.type === "agent" && d.context) {
      console.log(d.context)
    } else {
      console.log(d.message)
    }
    console.log("")
  }

  process.exit(parallelResult.dispatches.some(d => d.type === "agent") ? 0 : 1)
}

if (args.includes("--review")) {
  const reviewResult = dispatchDesignReview(state, platform)
  if (args.includes("--packet-json")) {
    const payload =
      reviewResult.type === "agent" && reviewResult.packet
        ? reviewResult.packet
        : { message: reviewResult.message, type: reviewResult.type }
    console.log(JSON.stringify(payload, null, 2))
    process.exit(reviewResult.type === "agent" ? 0 : 1)
  }
  if (args.includes("--next")) {
    console.log(reviewResult.type === "agent" && reviewResult.agentId ? reviewResult.agentId : reviewResult.message)
    process.exit(reviewResult.type === "agent" ? 0 : 1)
  }
  if (reviewResult.type === "agent" && reviewResult.context) {
    console.log(reviewResult.context)
  } else {
    console.error(reviewResult.message)
    process.exit(1)
  }
  process.exit(0)
}

if (args.includes("--code-review")) {
  const codeReviewResult = dispatchCodeReview(state, platform)
  if (args.includes("--packet-json")) {
    const payload =
      codeReviewResult.type === "agent" && codeReviewResult.packet
        ? codeReviewResult.packet
        : { message: codeReviewResult.message, type: codeReviewResult.type }
    console.log(JSON.stringify(payload, null, 2))
    process.exit(codeReviewResult.type === "agent" ? 0 : 1)
  }
  if (args.includes("--next")) {
    console.log(codeReviewResult.type === "agent" && codeReviewResult.agentId ? codeReviewResult.agentId : codeReviewResult.message)
    process.exit(codeReviewResult.type === "agent" ? 0 : 1)
  }
  if (codeReviewResult.type === "agent" && codeReviewResult.context) {
    console.log(codeReviewResult.context)
  } else {
    console.error(codeReviewResult.message)
    process.exit(1)
  }
  process.exit(0)
}

const result = dispatch(state, platform)

if (args.includes("--packet-json")) {
  const payload =
    result.type === "agent" && result.packet
      ? result.packet
      : { message: result.message, type: result.type }
  console.log(JSON.stringify(payload, null, 2))
  process.exit(result.type === "agent" ? 0 : 1)
}

if (args.includes("--next")) {
  if (result.type === "agent" && result.agentId) {
    console.log(result.agentId)
  } else {
    console.log(result.message)
  }
  process.exit(result.type === "agent" ? 0 : 1)
}

if (result.type === "agent" && result.context) {
  console.log(result.context)
  if (result.postAction) {
    console.log(`\n${"─".repeat(40)} Post-Action`)
    console.log(result.postAction)
  }
} else {
  console.log(result.message)
  process.exit(1)
}
