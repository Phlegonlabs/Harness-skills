import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { initState } from "./state-core"
import {
  buildToolchainConfig,
  createUnconfiguredToolchainConfig,
  detectEcosystem,
  resolveToolchainConfig,
} from "./toolchain-detect"

let originalCwd = ""
let workspaceDir = ""

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-toolchain-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { recursive: true, force: true })
})

test("detectEcosystem infers node-npm from package.json when no lockfile exists", () => {
  writeFileSync("package.json", JSON.stringify({ name: "fixture" }, null, 2))
  expect(detectEcosystem(workspaceDir)).toBe("node-npm")
})

test("resolveToolchainConfig falls back to custom when no ecosystem is detected", () => {
  const toolchain = resolveToolchainConfig(workspaceDir)
  expect(toolchain.ecosystem).toBe("custom")
  expect(toolchain.commands.test.command).toContain("__HARNESS_TOOLCHAIN_UNCONFIGURED__")
})

test("initState uses detected ecosystem instead of forcing bun defaults", () => {
  writeFileSync("pyproject.toml", "[project]\nname = 'fixture'\nversion = '0.1.0'\n")
  const state = initState({})
  expect(state.toolchain.ecosystem).toBe("python")
  expect(state.toolchain.commands.test.command).toBe("pytest")
})

test("buildToolchainConfig provides yarn preset for yarn.lock projects", () => {
  const toolchain = buildToolchainConfig("node-yarn", workspaceDir)
  expect(toolchain.commands.install.command).toBe("yarn install")
  expect(toolchain.commands.test.command).toBe("yarn test")
})

test("createUnconfiguredToolchainConfig keeps commands blocking until configured", () => {
  const toolchain = createUnconfiguredToolchainConfig()
  expect(toolchain.commands.build.optional).toBeFalse()
  expect(toolchain.commands.build.command).toContain("__HARNESS_TOOLCHAIN_UNCONFIGURED__")
})
