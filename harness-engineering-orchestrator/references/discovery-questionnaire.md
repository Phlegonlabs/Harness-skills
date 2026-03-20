# Discovery Questionnaire

Use this file only during **Phase 0: Discovery**.

## Team Configuration Defaults

If a `config.json` file exists in the skill directory, its `defaults` block pre-fills several discovery answers. When a config default is present, surface it as a suggested answer (e.g. "Suggested: `standard` — change?") rather than leaving the field blank. CLI flags always override config defaults; user answers during discovery override both. See [SKILL.md — Team Configuration](../SKILL.md#team-configuration) for the full precedence chain.

## Rules

- Use level-aware pacing:
  - Lite: batch 1-2 questions per turn, then hand off to `fast-path-bootstrap`
  - Standard: group 2-3 related questions per turn
  - Full: ask one question per response turn
- Wait for the user's answer before asking the next question or batch
- Persist each answer immediately into the runtime state
- Do not invent fields outside the schema
- Skip questions that are irrelevant to the chosen project type

## Question Sequence

### Q-1: Harness Level

```text
Which Harness level should this project use?

1. Lite — minimal overhead, fast bootstrap
2. Standard — balanced default
3. Full — comprehensive, question-heavy
```

If the user does not specify, auto-detect from project scope, team size, and compliance signals before continuing.

### Q0: Starting Point

```text
This project is:

1. Greenfield — starting from scratch
2. Existing codebase — continue a work-in-progress with the Harness workflow
```

If the user selects an existing codebase:

- skip or compress market research when appropriate
- audit the current repo before scaffolding
- still require PRD, Architecture, scaffold, and phase gates

### Q1: Project Name

```text
What is the name of your project?
Use the package-safe English name and the display name if branding differs.
```

### Q2: Project Concept

```text
Briefly describe what this project is.
Two or three sentences are enough.
```

### Q3: Users and Problem

```text
What problem does this project solve, and who is it for?
```

### Q4: Goals and Success

```text
What do you want this project to achieve within the target time frame?
What is the target delivery timeline, and are there specific success metrics?
```

### Q5: Project Type

Multi-select is allowed. A monorepo workspace is assumed by default; this question defines which product surfaces live inside that workspace today.

```text
What type of project is this?

1. Web App
2. iOS App
3. Android App
4. Cross-Platform Mobile App
5. CLI Tool
6. Agent Project
7. Desktop App
8. API / Backend Service
9. Combination / multi-surface workspace
```

### Q6: AI Needs

Ask this when the project includes agent behavior or may require AI features.

```text
Does this project need AI features?

1. OpenAI / Codex
2. Anthropic Claude
3. Google Gemini
4. Open Source (Ollama / vLLM)
5. Both (OpenAI + Anthropic)
6. Multi-Provider
7. Vercel AI SDK
8. No AI needed for now
```

### Q7: Feature Modules

Only show the options relevant to the selected project type.

| Project Type | Typical module prompts |
|------|------|
| Web App | Auth, Database, Realtime, File upload, Payments, i18n, Analytics |
| iOS App | Local data, iCloud sync, Push notifications, Apple Pay, i18n |
| CLI Tool | Config persistence, Plugin system, Auto-update |
| Agent Project | Memory, MCP / tools, Rate limiting, Logging |
| Android App | Local data, Push notifications, Google Pay, i18n, Analytics |
| API / Backend | Auth, Database, Rate limiting, Caching, Logging, Queues |
| Cross-Platform Mobile | Local data, Push notifications, In-app purchases, i18n |
| Desktop App | Local DB, Auto-update, Notifications, File system access |

Example prompt:

```text
Which feature modules does this project need?
Select all that apply, or say "none of the above".
```

Treat localization or i18n as part of this question when it is relevant to the chosen surface instead of introducing a separate numbered question.

### Q8: Team Size

```text
Who is developing this project?

1. Solo developer
2. Small team (2-5)
3. Larger team (6+)
```

Use the answer to tune branch protection, review expectations, and process strictness.

### Q9: Design Language

Ask this only for projects with a UI.

```text
What visual style should this product follow?
You can choose one or more, or describe a reference product.

1. Dark and modern
2. Clean and minimal
3. Bold and expressive
4. Professional and trustworthy
5. Soft and friendly
6. Custom / reference-driven
```

Capture any design references as part of the same question so the frontend design work can align with the PRD and stack decisions.

For existing codebases, capture required integrations or immovable external constraints as follow-up notes under Q0 or Q5 instead of inventing extra numbered questions.

## Discovery Exit Criteria

Discovery is complete when the workflow has enough information to do one of the following safely:

- enter Market Research
- skip research and enter Tech Stack
- write the first valid PRD draft

At minimum, the runtime state should know:

- whether the project is greenfield or existing
- project name
- project type(s)
- goals
- team size
- design language for UI projects
