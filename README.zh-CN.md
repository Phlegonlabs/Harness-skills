# Harness Engineering Skills

这是一个公开的 Harness Engineering skill 仓库。

当前仓库仅发布一个可安装 skill：

- `harness-engineering-orchestrator`：将软件项目通过从 discovery 到验证闭环的流程，转为仓库状态驱动的交付方式。

Harness Engineering 的目标是让 AI 辅助开发可恢复、可交接。项目规划不会停留在聊天里，而是写入可版本化的仓库文件（如 `AGENTS.md`、`CLAUDE.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/PROGRESS.md`、`.harness/state.json` 等），保证不同会话和不同 Agent 之间不丢上下文。

## 仓库内容

- `README.md`：当前入口页与快速上手说明。
- `README.en.md`：英文说明。
- `README.zh-CN.md`：中文说明。
- `harness-engineering-orchestrator/`：已发布的 skill 包。
  - `SKILL.md`：skill 的运行契约。
  - `agents/`：各角色提示词与操作指南。
  - `references/`：模板与参考文档。
  - `scripts/`：可选的自动化脚本。
  - `templates/`：脚手架模板与示例结构。

## Language

- English: [README.en.md](README.en.md)
- 中文: [README.zh-CN.md](README.zh-CN.md)

## 安装

```bash
npx skills add https://github.com/Phlegonlabs/Harness-skills --skill harness-engineering-orchestrator
```

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

## 工作流简图

```text
DISCOVERY -> MARKET_RESEARCH -> TECH_STACK -> PRD_ARCH -> SCAFFOLD -> EXECUTING -> VALIDATING -> COMPLETE
```

核心原则是：仓库文件没更新的规划不算完成；代码、验证结果与任务状态三者不一致的执行不算完成。

### 节奏纪律

Orchestrator 强制逐步执行：

- **每次响应只问一个问题** — Discovery 阶段的每个问题都是独立的消息轮次，等待用户回答后才继续。
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

本仓库故意保持精简聚焦。若你在实际项目里发现新场景，可补充缺失模板、完善验证门禁、优化执行手册。欢迎提交 PR 或 issue 建议。

## 更多阅读

- [English documentation](./README.en.md)
- [中文说明文档](./README.zh-CN.md)
- [Skill 合同](./harness-engineering-orchestrator/SKILL.md)
