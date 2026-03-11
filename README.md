# Harness Engineering Skills

Public skill repository for Harness Engineering workflows.

This repo currently publishes one installable skill:

- `harness-engineer-cli`: bootstrap a new agent-first project or retrofit an existing repo with the Harness Engineering workflow

## What Is Harness Engineering?

### English

Harness Engineering is a practical way to build software with AI agents where the repository, not the chat, is the source of truth.

Instead of leaving planning and execution context trapped in a conversation, the important state gets written into versioned project files such as `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `docs/PRD.md`, `docs/PLAN.md`, and `docs/progress.json`. That makes agent work resumable, reviewable, and handoff-friendly across Claude Code and Codex.

### 中文

Harness Engineering 是一种面向 AI agent 的工程方法：真正的项目状态不留在聊天记录里，而是沉淀到仓库本身。

也就是说，规划、架构、任务状态、执行规则和交接信息都会写进可版本化的项目文件，例如 `AGENTS.md`、`CLAUDE.md`、`ARCHITECTURE.md`、`docs/PRD.md`、`docs/PLAN.md` 和 `docs/progress.json`。这样 Claude Code 和 Codex 都可以只依赖仓库状态继续工作，而不是反复依赖上下文记忆。

## Core Ideas

- Chat is input; repo files are state.
- `AGENTS.md` is a map, not an encyclopedia.
- Planning is not complete until repo-backed artifacts are updated.
- Execution is not complete until code, validation, and task state agree.
- Handoffs should work from repository state alone, without relying on chat memory.

## What This Skill Does

### English

`harness-engineer-cli` gives agents a closed-loop project workflow in two modes:

- `Greenfield`: start a new project from scratch with product discovery, PRD, scaffold, and execution rails
- `Retrofit`: analyze an existing repository and add the harness layer on top of it

The skill is designed for requests like:

- "Bootstrap a new project with Harness Engineering."
- "Add AGENTS.md and PLAN.md to my repo."
- "Retrofit this existing codebase for Claude Code and Codex."
- "Set up an agent-first scaffold with PRD, architecture, and task loop."

### 中文

`harness-engineer-cli` 这个 skill 提供两种闭环工作模式：

- `Greenfield`：从零开始做新项目，包含 discovery、PRD、scaffold 和执行框架
- `Retrofit`：分析已有仓库，在现有项目上加上 harness 层

适合这类请求：

- “帮我用 Harness Engineering 初始化一个新项目”
- “给我的仓库补 AGENTS.md 和 PLAN.md”
- “把这个现有项目 retrofit 成适合 Claude Code / Codex 协作的形式”
- “搭一个 agent-first 的项目脚手架，带 PRD、架构文档和任务闭环”

## What It Generates

Depending on the project type and stack, the skill can generate or retrofit:

- `AGENTS.md` and `CLAUDE.md` as the agent operating contract
- `ARCHITECTURE.md` as the system map
- `docs/PRD.md` for product requirements
- `docs/PLAN.md` plus `docs/progress.json` for milestone and task state
- execution-plan folders for resumable planning handoff
- product docs such as design references and GitBook-ready pages
- harness CLI/runtime files that enforce the task loop

## Why This Is Useful

### English

Most agent-assisted projects break down in the same places: plans stay trapped in chat, handoffs lose context, task state drifts away from reality, and a later session has to reconstruct everything from memory.

Harness Engineering addresses that by making project state explicit and versioned. The result is a workflow where humans and agents can both inspect the same artifacts, resume safely, and keep progress synchronized.

### 中文

很多 AI 协作项目最后都会卡在同样的问题上：计划只存在于聊天里，交接时上下文丢失，任务状态和代码现实脱节，下一次会话又得重新解释一遍。

Harness Engineering 解决的就是这类问题。它把项目状态显式写入仓库并纳入版本控制，让人和 agent 可以共同读取同一套事实来源，更稳定地继续推进工作。

## Install

This repository contains the published skill inside the `harness-engineer-cli/` directory, so the install command should target the repo and specify the skill name:

```bash
npx skills add https://github.com/Phlegonlabs/Harness-engineering-skills --skill harness-engineer-cli
```

## Quick Usage

After installing, prompts like these should trigger the skill:

- `Bootstrap a new TypeScript monorepo with Harness Engineering.`
- `Retrofit this existing repo with AGENTS.md, PLAN.md, and progress.json.`
- `Set up a project scaffold for Claude Code and Codex with PRD and task-loop automation.`
- `帮我给这个项目补一套 harness engineering 工作流。`

## Repository Layout

```text
Harness-engineering-skills/
├── README.md
└── harness-engineer-cli/
    ├── SKILL.md
    ├── README.md
    ├── docs/
    └── scripts/
```

- `README.md`: public landing page for GitHub and skills.sh users
- `harness-engineer-cli/SKILL.md`: the actual discovery contract used by the skill runtime
- `harness-engineer-cli/README.md`: deeper technical and maintainer-facing documentation
- `harness-engineer-cli/docs/`: agent references and maintainer navigation

## Read More

- [Skill Overview](./harness-engineer-cli/README.md)
- [SKILL.md](./harness-engineer-cli/SKILL.md)
- [Docs Index](./harness-engineer-cli/docs/index.md)
