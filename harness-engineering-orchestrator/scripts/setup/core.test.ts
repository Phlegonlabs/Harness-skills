import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"
import { inspectCommandVersion, resolveInitialToolchain } from "./core"
import { createContext } from "./shared"

let originalCwd = ""
let workspaceDir = ""

beforeEach(() => {
  originalCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "harness-setup-core-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(workspaceDir, { recursive: true, force: true })
})

test("inspectCommandVersion returns a clean failure result for missing executables", () => {
  const result = inspectCommandVersion("definitely-not-a-real-command-xyz")

  expect(result.ok).toBe(false)
  expect(result.version).toBe("")
})

test("resolveInitialToolchain honors the explicit ecosystem for greenfield setup", () => {
  const context = createContext({
    aiProvider: "none",
    ecosystem: "node-npm",
    isGreenfield: "true",
    name: "fixture",
    teamSize: "solo",
    type: "cli",
  })

  const toolchain = resolveInitialToolchain(context)

  expect(toolchain.ecosystem).toBe("node-npm")
  expect(toolchain.packageManager).toBe("npm")
  expect(toolchain.commands.test.command).toBe("npm test")
  expect(toolchain.sourceRoot).toBe(".")
})

test("resolveInitialToolchain keeps bun workspace-first overrides for bun greenfield repos", () => {
  const context = createContext({
    aiProvider: "none",
    ecosystem: "bun",
    isGreenfield: "true",
    name: "fixture",
    teamSize: "solo",
    type: "cli",
  })

  const toolchain = resolveInitialToolchain(context)

  expect(toolchain.ecosystem).toBe("bun")
  expect(toolchain.commands.test.command).toBe("bun run test")
  expect(toolchain.sourceRoot).toBe(".")
})

test("node-npm setup scaffolds a local workspace runner instead of turbo defaults", () => {
  const setupPath = resolve(join(import.meta.dir, "..", "harness-setup.ts"))
  const result = Bun.spawnSync(
    [
      "bun",
      setupPath,
      "--name=fixture-node-npm",
      "--type=cli",
      "--ecosystem=node-npm",
      "--skipGithub=true",
      "--isGreenfield=true",
      "--aiProvider=none",
      "--teamSize=solo",
    ],
    {
      cwd: workspaceDir,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  expect(result.exitCode).toBe(0)

  const pkg = JSON.parse(readFileSync(join(workspaceDir, "package.json"), "utf-8")) as {
    devDependencies?: Record<string, string>
    packageManager?: string
    scripts?: Record<string, string>
  }
  const state = JSON.parse(readFileSync(join(workspaceDir, ".harness", "state.json"), "utf-8")) as {
    toolchain?: { ecosystem?: string }
  }

  expect(state.toolchain?.ecosystem).toBe("node-npm")
  expect(pkg.packageManager?.startsWith("npm@")).toBe(true)
  expect(pkg.scripts?.test).toBe("bun scripts/harness-local/workspace-runner.mjs test")
  expect(pkg.scripts?.build).toBe("bun scripts/harness-local/workspace-runner.mjs build")
  expect(pkg.devDependencies?.turbo).toBeUndefined()
  expect(pkg.devDependencies?.["bun-types"]).toBeUndefined()
  expect(existsSync(join(workspaceDir, "scripts", "harness-local", "workspace-runner.mjs"))).toBe(true)
  expect(existsSync(join(workspaceDir, "turbo.json"))).toBe(false)
})

test("node-pnpm setup writes pnpm-workspace.yaml alongside the workspace runner", () => {
  if (!inspectCommandVersion("pnpm").ok) {
    console.log("Skipping node-pnpm setup smoke: pnpm is not installed in this environment.")
    return
  }

  const setupPath = resolve(join(import.meta.dir, "..", "harness-setup.ts"))
  const result = Bun.spawnSync(
    [
      "bun",
      setupPath,
      "--name=fixture-node-pnpm",
      "--type=cli",
      "--ecosystem=node-pnpm",
      "--skipGithub=true",
      "--isGreenfield=true",
      "--aiProvider=none",
      "--teamSize=solo",
    ],
    {
      cwd: workspaceDir,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  expect(result.exitCode).toBe(0)
  expect(existsSync(join(workspaceDir, "scripts", "harness-local", "workspace-runner.mjs"))).toBe(true)
  expect(existsSync(join(workspaceDir, "pnpm-workspace.yaml"))).toBe(true)
})
