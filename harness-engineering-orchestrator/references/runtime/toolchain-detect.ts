/**
 * Toolchain Detection — RT-15
 *
 * Auto-detects project ecosystem from manifest files.
 */

import type { SupportedEcosystem, ToolchainCommand, ToolchainConfig } from "../harness-types.js"
import { TOOLCHAIN_PRESETS } from "./toolchain-registry.js"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

interface DetectionSignal {
  file: string
  ecosystem: SupportedEcosystem
  priority: number
}

const DETECTION_SIGNALS: DetectionSignal[] = [
  { file: "bun.lockb", ecosystem: "bun", priority: 10 },
  { file: "package-lock.json", ecosystem: "node-npm", priority: 8 },
  { file: "pnpm-lock.yaml", ecosystem: "node-pnpm", priority: 8 },
  { file: "yarn.lock", ecosystem: "node-yarn", priority: 8 },
  { file: "pyproject.toml", ecosystem: "python", priority: 9 },
  { file: "setup.py", ecosystem: "python", priority: 7 },
  { file: "go.mod", ecosystem: "go", priority: 9 },
  { file: "Cargo.toml", ecosystem: "rust", priority: 9 },
  { file: "build.gradle.kts", ecosystem: "kotlin-gradle", priority: 8 },
  { file: "build.gradle", ecosystem: "java-gradle", priority: 7 },
  { file: "pom.xml", ecosystem: "java-maven", priority: 8 },
  { file: "Gemfile", ecosystem: "ruby", priority: 8 },
  { file: "pubspec.yaml", ecosystem: "flutter", priority: 8 },
  { file: "Package.swift", ecosystem: "swift", priority: 8 },
]

export const UNCONFIGURED_TOOLCHAIN_SENTINEL = "__HARNESS_TOOLCHAIN_UNCONFIGURED__"

export function createUnconfiguredToolchainCommand(
  label: string,
  optional = false,
): ToolchainCommand {
  return {
    command: `echo "${UNCONFIGURED_TOOLCHAIN_SENTINEL}:${label}"`,
    label: `${label} (not configured)`,
    optional,
  }
}

export function isConfiguredToolchainCommand(command?: Pick<ToolchainCommand, "command"> | null): boolean {
  return Boolean(command?.command) && !command.command.includes(UNCONFIGURED_TOOLCHAIN_SENTINEL)
}

export function createUnconfiguredToolchainConfig(
  ecosystem: SupportedEcosystem = "custom",
): ToolchainConfig {
  return {
    ecosystem,
    language: "unknown",
    commands: {
      install: createUnconfiguredToolchainCommand("install"),
      typecheck: createUnconfiguredToolchainCommand("typecheck"),
      lint: createUnconfiguredToolchainCommand("lint"),
      format: createUnconfiguredToolchainCommand("format"),
      test: createUnconfiguredToolchainCommand("test"),
      build: createUnconfiguredToolchainCommand("build"),
    },
    sourceExtensions: [],
    sourceRoot: ".",
    manifestFile: "",
    forbiddenPatterns: [],
    ignorePatterns: [],
  }
}

function detectPackageManagerEcosystem(projectRoot: string): SupportedEcosystem | undefined {
  const packageJsonPath = join(projectRoot, "package.json")
  if (!existsSync(packageJsonPath)) return undefined

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { packageManager?: string }
    const packageManager = pkg.packageManager?.toLowerCase() ?? ""
    if (packageManager.startsWith("bun@")) return "bun"
    if (packageManager.startsWith("pnpm@")) return "node-pnpm"
    if (packageManager.startsWith("yarn@")) return "node-yarn"
    if (packageManager.startsWith("npm@")) return "node-npm"
    return "node-npm"
  } catch {
    return "node-npm"
  }
}

/** Detect ecosystem from project files. Returns highest-priority match. */
export function detectEcosystem(projectRoot: string): SupportedEcosystem | undefined {
  const matches = DETECTION_SIGNALS
    .filter(s => existsSync(join(projectRoot, s.file)))
    .sort((a, b) => b.priority - a.priority)
  return matches[0]?.ecosystem ?? detectPackageManagerEcosystem(projectRoot)
}

/** Build a ToolchainConfig from detected or specified ecosystem. */
export function buildToolchainConfig(
  ecosystem: SupportedEcosystem,
  _projectRoot: string,
): ToolchainConfig {
  const preset = TOOLCHAIN_PRESETS[ecosystem]
  if (!preset) {
    return createUnconfiguredToolchainConfig(ecosystem)
  }
  return { ...preset, ecosystem }
}

export function resolveToolchainConfig(
  projectRoot: string,
  options: { fallbackEcosystem?: SupportedEcosystem } = {},
): ToolchainConfig {
  const ecosystem = detectEcosystem(projectRoot) ?? options.fallbackEcosystem ?? "custom"
  return buildToolchainConfig(ecosystem, projectRoot)
}
