# Harness Engineering Skills

[![CI](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/ci.yml)
[![Release](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml/badge.svg)](https://github.com/Phlegonlabs/Harness-Engineering-skills/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Published Skills](https://img.shields.io/badge/Published%20skills-1-1f6feb)
![Agents](https://img.shields.io/badge/Agents-Claude%20%2B%20Codex-0a7ea4)
![Workflow](https://img.shields.io/badge/Workflow-PRD--to--Code-111827)

> 面向 Claude 与 Codex 的 AI 原生工程工作流 skill 仓库。
>
> 安装 `harness-engineering-orchestrator` 后，可以把软件项目放进一个 repo-backed 的交付闭环：
> `PRD -> Architecture -> Scaffold -> Milestone -> Task -> Validation`

Harness Engineering 的核心思想很直接：规划和执行不应该只存在于聊天记录里。重要决策会被持续写回仓库里的版本化文件，例如 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/PROGRESS.md`、`AGENTS.md`、`CLAUDE.md` 和 `.harness/state.json`。这样一来，项目状态就能在不同会话、不同 Agent、以及人与 Agent 之间稳定传递。

## 1 分钟 Demo

```bash
# 1. 安装 skill
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator

# 2. 进入目标仓库
cd my-project

# 3. 生成 Harness 工作流
bun <path-to-installed-skill>/scripts/harness-setup.ts

# 4. 启动编排器
bun harness:orchestrate
```

大约 1 分钟内你应该能拿到：

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `.harness/state.json`
- 一个可以继续推进的 orchestrator 入口

如果是已有仓库，把第 3 步改成：

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

## 从这里开始

- 安装：`npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator`
- 最适合：希望 AI 编码 Agent 在受控 PRD-to-code 交付系统里工作，而不是依赖自由提示链的团队
- 主力 skill：`harness-engineering-orchestrator`，覆盖 discovery、技术栈确认、PRD、架构、里程碑/任务执行和验证
- 下一步阅读：[harness-engineering-orchestrator/README.md](./harness-engineering-orchestrator/README.md)

## 核心 Skill

| Skill | 能做什么 | 适合什么场景 |
|---|---|---|
| `harness-engineering-orchestrator` | 把一个想法或已有仓库推进成带文档、runtime state、backlog、执行和验证的 repo-backed 交付工作流 | 新项目 bootstrap、既有仓库 hydration、按里程碑推进的 agent 协作交付 |

## 为什么团队会安装它

Harness Engineering 面向那些希望 AI 编码 Agent 在“受控交付系统”里工作，而不是依赖自由提示链的团队。

- 以 PRD 为先，而不是只靠聊天规划
- 里程碑和任务执行始终绑定仓库状态
- 每个阶段都有明确 gate，而不是直接跳进实现
- 支持 `V1 -> deploy review -> V2` 的 staged delivery
- 支持跨会话、跨 Agent、跨人协作的可恢复执行

这个仓库的结构是按“可持续扩展多个领域 skill”来设计的。`harness-engineering-orchestrator` 是当前第一个公开 skill，后续可以继续在根目录下新增其他 skill 包。

## 仓库内容

- `README.md`：当前入口页与快速上手说明。
- `README.en.md`：英文说明。
- `README.zh-CN.md`：中文说明。
- `AGENTS.md` + `CLAUDE.md`：贡献者 Agent 指令，Claude Code 与 Codex 进入此仓库时自动加载。
- `SKILLS.md`：所有已发布 skill 的目录与安装命令。
- `docs/`：贡献者指南，包含 `new-skill-guide.md`（新增 skill 说明）。
- `LICENSE`、`CONTRIBUTING.md`、`SECURITY.md`：仓库级开源元信息与贡献/安全策略。
- `harness-engineering-orchestrator/`：已发布的 skill 包。
  - `SKILL.md`：skill 的运行契约。
  - `agents/`：各角色提示词与操作指南。
  - `references/`：模板、参考文档与类型定义。
  - `scripts/`：setup 与验证自动化脚本。
  - `templates/`：脚手架模板与示例结构。
  - `config.example.json`：团队配置模板（复制为 `config.json` 以设置团队默认值）。

## Language

- English: [README.en.md](README.en.md)
- 中文: [README.zh-CN.md](README.zh-CN.md)

## 安装

### 前置要求

- `git`
- `bun`
- 支持 `skills add` 的客户端

### 安装 skill 包

```bash
npx skills add https://github.com/Phlegonlabs/Harness-Engineering-skills --skill harness-engineering-orchestrator
```

### 在目标仓库中使用

新仓库：

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts
```

已有仓库：

```bash
bun <path-to-installed-skill>/scripts/harness-setup.ts --isGreenfield=false --skipGithub=true
```

完成 setup 或 hydration 后，在目标仓库内继续执行：

```bash
bun .harness/orchestrator.ts
bun harness:orchestrate
bun harness:advance
```

如果之后你重新 clone 或 hard-reset 了一个 Harness 管理中的仓库，继续工作前先恢复本地专属的 Harness 文件：

```bash
bun harness:hooks:install
```

更完整的 skill 级操作说明请看 [harness-engineering-orchestrator/README.md](./harness-engineering-orchestrator/README.md)。

## 适用场景

当你希望 AI 助手在可控的仓库化流程中协作，而不是依赖零散提示时，使用这个 orchestrator。

- 新项目启动（Greenfield）：想法 → discovery → 技术栈确认 → PRD → 架构 → scaffold → 执行 → 验证。
- 既有项目：将旧仓库或半成体系仓库补齐为一致的 Harness 工作流。
- 团队交接：使人和 Agent 都可仅凭仓库文件接续任务，无需依赖聊天上下文。

常见示例提示：

- `Bootstrap a new TypeScript monorepo with Harness Engineering.`
- `Turn this existing repo into a repo-backed workflow with PRD, architecture, and progress tracking.`
- `Set up Harness validation gates and execution loop for this codebase.`

## 可生成内容

- `docs/PRD.md`：记录范围、里程碑、需求和验收标准。
- `docs/ARCHITECTURE.md`：记录系统结构、依赖方向、数据流和技术约束。
- `docs/PROGRESS.md`：记录里程碑和任务进度。
- `.harness/state.json`：编排器运行的核心状态文件。
- `AGENTS.md` + `CLAUDE.md`：给人和 Agent 使用的协作约定文件。
- `docs/adr/`、`docs/gitbook/`：执行阶段使用的辅助文档结构。
- 用于可复现构建/测试的验证与 scaffold 文件。

## 它和普通提示式开发的区别

- 仓库本身就是工作记忆，不再把聊天记录当唯一上下文。
- 新 scope 必须先回写 PRD，再恢复实现。
- 执行按 milestone 和 review gate 推进，而不是一次性长跑。
- 验证结果会写回 runtime state，下一次进入时可以从事实继续，而不是从记忆继续。

## 工作流简图

```text
DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE
```

核心原则是：仓库文件没更新的规划不算完成；代码、验证结果与任务状态三者不一致的执行不算完成。

### 节奏纪律

Orchestrator 强制逐步执行：

- **按等级控制 Discovery 节奏** — Lite 会批量提问或直接走 Fast Path，Standard 每轮 2-3 个问题，Full 每轮只问 1 个问题。
- **每次响应只完成一个阶段** — 不会在同一条消息中混合两个阶段的工作。
- **每个阶段边界强制检查点** — Orchestrator 会总结、验证并请求用户确认后才推进。
- **细粒度 scaffold 验证** — 每个 `.harness/` 运行时文件、配置、文档和构建脚本在进入 EXECUTING 前都会被逐项检查。

这样可以防止 LLM 跳过阶段、略过验证、或在 scaffold 不完整的情况下进入执行的常见失败模式。

## 安装后的快速校验

安装到目标仓库后，可先确认以下文件是否存在且可读：

- `AGENTS.md`
- `CLAUDE.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `.harness/state.json`

如果这些文件都已生成，说明仓库已进入 Harness 执行循环的正确轨道。

## 参与改进

本仓库故意保持精简聚焦。贡献者可以补充参考模板、完善验证门禁、改进执行手册，或在 orchestrator 旁边发布新的 skill 包。

- 一般贡献：阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 新增 skill：阅读 [docs/new-skill-guide.md](./docs/new-skill-guide.md)
- AI Agent 贡献者（Claude Code、Codex）：仓库根目录的 `AGENTS.md` 与 `CLAUDE.md` 会自动加载，包含项目约定、关键命令与禁止操作

## 更多阅读

- [English documentation](./README.en.md)
- [中文说明文档](./README.zh-CN.md)
- [Skill 目录](./SKILLS.md)
- [新增 skill 指南](./docs/new-skill-guide.md)
- [Skill 合同](./harness-engineering-orchestrator/SKILL.md)
- [License](./LICENSE)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
