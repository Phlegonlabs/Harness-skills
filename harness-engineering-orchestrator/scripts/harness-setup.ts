#!/usr/bin/env bun

import { dirname } from "path"
import { runSetup } from "./setup/core"
import { createContext, createLogger, parseArgs } from "./setup/shared"

const skillRoot = dirname(import.meta.dir)
const args = parseArgs(process.argv.slice(2))
const context = createContext(args, skillRoot)
const logger = createLogger()

await runSetup({ context, skillRoot, logger })
