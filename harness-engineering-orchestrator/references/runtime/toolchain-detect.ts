/**
 * Toolchain Detection — RT-15
 *
 * Auto-detects project ecosystem from manifest files.
 */

import type { SupportedEcosystem, ToolchainConfig } from "../harness-types.js"
import { TOOLCHAIN_PRESETS } from "./toolchain-registry.js"
import { existsSync } from "node:fs"
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

/** Detect ecosystem from project files. Returns highest-priority match. */
export function detectEcosystem(projectRoot: string): SupportedEcosystem | undefined {
  const matches = DETECTION_SIGNALS
    .filter(s => existsSync(join(projectRoot, s.file)))
    .sort((a, b) => b.priority - a.priority)
  return matches[0]?.ecosystem
}

/** Build a ToolchainConfig from detected or specified ecosystem. */
export function buildToolchainConfig(
  ecosystem: SupportedEcosystem,
  projectRoot: string,
): ToolchainConfig {
  const preset = TOOLCHAIN_PRESETS[ecosystem]
  if (!preset) {
    return {
      ecosystem,
      language: "unknown",
      commands: {
        install: { command: "echo 'install not configured'", optional: true },
        typecheck: { command: "echo 'typecheck not configured'", optional: true },
        lint: { command: "echo 'lint not configured'", optional: true },
        format: { command: "echo 'format not configured'", optional: true },
        test: { command: "echo 'test not configured'", optional: true },
        build: { command: "echo 'build not configured'", optional: true },
      },
      sourceExtensions: [],
      sourceRoot: ".",
      manifestFile: "",
      forbiddenPatterns: [],
      ignorePatterns: [],
    }
  }
  return { ...preset, ecosystem }
}
