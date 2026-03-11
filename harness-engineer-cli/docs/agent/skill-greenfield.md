## Greenfield Workflow

For new projects from scratch. Full product discovery → PRD → scaffold → execution.

### Greenfield Workflow Overview

```
Phase 1: Product Discovery (interactive — 5 steps)
  Step 1: Project Name + Intro → ask for the project name and a short product intro
  Step 2: Research Pass 1 → quick web scan to establish market/category context
  Step 3: Product Deep Dive → PM-style follow-up interview based on the brief + pass 1
  Step 4: Research Pass 2 → targeted web search + recommendation summary after the interview
  Step 5: Tech Stack Choices → ask_user_input informed by both research passes

Phase 2: Product Requirements Review (generate PRD)
  → FRs with acceptance criteria, NFRs, MoSCoW prioritization
  → User journeys decomposed into epics → stories
  → Traceability: Requirement → Epic → Story → Task

Phase 3: Generate Project Artifacts
  → AGENTS.md + CLAUDE.md, ARCHITECTURE.md, PLAN.md, progress.json
  → Scaffold with full lint/test/CI/Docker/env infrastructure
  → Dependency graph, learnings log skeleton

Phase 4: Execution Runtime (long-task loop — see docs/agent/execution-runtime.md)
  → Session init protocol (progressive context loading)
  → Task execution loop (pick → execute → validate → commit → update)
  → Progress tracking via progress.json (cross-session memory)
  → Parallel worktree coordination (multi-agent)
  → Context budget management (≤40% utilization)
  → Quality checkpoints (auto vs human review gates)
  → Stale detection + agent learnings log
  → Dependency graph for task parallelism

Phase 5: Automated Testing (embedded in Phase 4 task loop)
  → Per-task: lint:fix → lint → type-check → unit test (validate)
  → Per-milestone: + integration + e2e tests (validate:full)
  → Product acceptance: verify PRD criteria covered by tests
  → CI: validate on PR, validate:full + deploy on merge to main
  → Harness/runtime template changes: replay against at least one fixture or downstream
    project before calling the template change complete

Phase 6: Documentation Site (evolves with project)
  → docs/gitbook/ in GitBook-compatible format
  → Updated every milestone — doc tasks tracked in PLAN.md

Ongoing: Perpetual Development Loop
  → All milestones done → Idle Protocol → wait for user
  → User adds new work (in Claude Code / Codex or via claude.ai)
  → Update PLAN + progress.json, and PRD/docs when the approved work changes them → new milestone
  → Same Phase 4-6 loop restarts. Repeat forever.
```

---

## Phase 1: Product Discovery (Interactive)

Phase 1 is mandatory. Do NOT write repo files, generate scaffolds, emit setup commands, or draft
the PRD/PLAN until this phase is complete. If the user already front-loaded part of the brief,
confirm the known pieces and ask only for the missing ones.

### Step 1: Project Name + Intro

Start with the project name and a short introduction before anything else. Do NOT begin with
stack questions or a category menu. The first user-facing turn in greenfield mode should feel
like a PM asking for the product pitch, not a framework selector.

Whenever this guide says `ask_user_input`, use it if your runtime supports structured prompts.
If your runtime does not provide `ask_user_input` (for example Codex in a plain terminal session),
ask the same question in normal prose and continue from the user's answer.

Ask for the name and intro first. Only use `ask_user_input` to disambiguate the product family
if the intro does not already make it obvious.
Do NOT merge Step 1 and Step 3 into one mega-prompt; ask Step 1, wait, then move into research.
Sound like a product manager steering discovery, not a survey bot reading categories.

Suggested PM-style lead-in:
> "First, what’s the project called, and how would you describe it in a few sentences? I want the name and the product pitch before I narrow anything else."

Ask in prose first:
> "What’s the project name, and how would you describe it in 2-4 sentences? If you already know whether this is a web app, mobile app, desktop app, CLI, or agent/MCP tool, include that too."

Wait for the user's response. Extract:
- project name
- short product intro / positioning
- any already-known product family or surface

If the product family is already clear from the intro, skip the structured prompt entirely and
proceed to Step 2. If it is still ambiguous, use the short disambiguation flow below.

Suggested PM-style disambiguation lead-in:
> "I have the name and the pitch. I just want to place it in the right product bucket before I do a quick market scan."

**ask_user_input disambiguation flow (keep each question to 2-3 curated choices):**
1. **Project family** (single_select): Which bucket is this closest to?
   - Options: `UI product`, `Developer / CLI tool`, `Agent / MCP server`

2. **UI surface** (single_select, only if `UI product` was selected): Which surface are we designing first?
   - Options: `Web app`, `Mobile app`, `Desktop app`

Mapping:
- `UI product` + `Web app` → `Web App`
- `UI product` + `Mobile app` → `Mobile (Expo / React Native)`
- `UI product` + `Desktop app` → `Desktop App`
- `Developer / CLI tool` → `CLI Tool`
- `Agent / MCP server` → `Agent Tool / MCP Server`

If **Mobile** is selected → read `docs/agent/skill-mobile.md` now before proceeding.
If **Desktop App** is selected → read `docs/agent/skill-desktop.md` now before proceeding.

### Step 2: Research Pass 1 — Early Market Scan

After Step 1, run a quick first-pass web search before asking deeper PM questions. The goal is
not to lock the stack yet. The goal is to build context so the next questions are sharper.

Run **2–4 web searches** based on the project name, product intro, and category. Search by:
- the project name (if distinctive / already public)
- the problem category (if the project is new and the name is not useful yet)
- close competitors or analog products
- language users use to describe this category

Gather:
- likely competitors / adjacent products
- common expectations for a v1 in this category
- obvious product patterns or positioning angles
- any early red flags or over-saturated directions

Then send a short recap in prose, for example:
> "I did a quick first pass on the category so I’m not asking blind questions. Here’s what looks common, what seems differentiated, and what I want to clarify with you next."

Do NOT jump into stack choices yet. Use this pass to improve the quality of Step 3.

### Step 3: Product Deep Dive

Based on the user's vision, conduct a structured product review interview. The goal is to
extract enough information to write a rigorous PRD. Ask in prose — this is a conversation,
not a form.
Your job here is to sound like a PM narrowing ambiguity: short follow-ups, clear reframing,
and only the next missing question.
Use the output of Step 2 to ask sharper questions and reference relevant analogs when useful.

Cover these areas (adapt based on what the user already told you — skip what's known):

**Users & Value:**
- Who are the primary user types? (e.g., end user, admin, API consumer)
- For each user type, what's the #1 thing they need to accomplish?
- What's the current alternative? (competitors, manual process, nothing)

**Core Journeys:**
- Walk me through the main thing a user does, step by step
- What are the critical decision points or error states?
- What does "done" look like for the user?

**Scope & Priority:**
- What are the absolute must-haves for v1? (things you'd delay launch for)
- What would be nice but can wait for v2?
- What are you explicitly NOT building?

**Constraints:**
- Any hard technical constraints? (must run offline, must support X platform, etc.)
- Performance requirements? (response time, concurrent users, data volume)
- Security/compliance needs? (auth, encryption, GDPR, HIPAA, etc.)

Don't ask all of these at once — have a natural conversation. Usually 2-3 exchanges
cover everything. Extract what you can from earlier messages and only ask what's missing.
If the brief is still underspecified, keep interviewing instead of skipping ahead to research
or scaffold generation.

Suggested PM-style follow-ups:
- "Who is the first real user you care about here, and what’s the one thing they need to get done without friction?"
- "If we cut this down to a believable v1, what would you refuse to launch without?"
- "What’s the part you explicitly do not want me to design or build into v1 yet?"
- "Are there any hard constraints I should treat as non-negotiable before I recommend stack or architecture?"

**Design inventory (Web App / Mobile / Desktop only):**

After mapping core journeys, ask in prose:

> "Do you have a design document or wireframes that show the overall app structure and list your pages/screens?
> If so, share the file path and I'll read it now.
> If not — describe the overall layout/wireframe in a few lines, then list your main pages/screens with a one-line description of each.
> Example: 'Dashboard — shows active projects and stats;
>            Settings — user profile and billing preferences;
>            Project Detail — view and edit tasks for one project'"

- If the user provides a **file path**: read the file immediately and extract the page list.
  Accepted formats: Markdown, plain text, or any structured list. Look for headings,
  bullet points, or numbered lists that describe screens/pages/routes.
- If the user provides an **inline description**: parse it directly.
- If the user says **"not sure yet"**: use the core journeys from Step 2 to infer a
  minimal design inventory: an app shell / wireframe summary plus a minimal page list
  (1 page per primary journey + a settings page). Confirm with the user before proceeding.

Store the result as an internal **design inventory bundle**:
- `wireframe_summary`: `{ app_shell, nav_model, global_regions, primary_flows, responsive_notes }`
- `style_application_summary`: `{ visual_summary, hierarchy_notes, interaction_tone, emphasis_rules }`
- `pages[]`: `{ route, name, purpose, accessible_to, key_elements, primary_action, critical_states, layout_notes }`
This bundle drives Phase 3 scaffold and `docs/product/design.md` generation.

> Skip this page inventory collection entirely for **CLI Tool** and **Agent/MCP Server**
> project types.

### Step 4: Research Pass 2 — Targeted Recommendations

After the user has answered the deep-dive questions and shared any page lists, materials, or
constraints, run a second, more targeted research pass.

Run **2–5 web searches** to gather:
- **Competitors / similar products**: What exists? What do users love/hate? What patterns repeat?
- **Architecture patterns**: What is the proven approach for this refined product shape?
- **Tech stack recommendations**: What is current, well-supported, and actually fits the constraints?
- **Relevant APIs / services**: Auth, payments, search, analytics, hosting, edge services, etc.

Synthesize into a conversational recommendation summary. The output should sound like:
- what looks promising now that the scope is clearer
- what looks risky / overbuilt / unnecessary for v1
- what stack or architecture directions now seem strongest
- what you would recommend the user choose next

This is the step where you tell the user, in plain language, "Given what you told me and what I
found, here are the best options and why." Only after that move into structured choices.

For **Desktop App** projects, `docs/agent/skill-desktop.md` is the primary reference.
Use web search only for version-sensitive items such as packaging, updater/signing,
notarization, or plugin-specific setup for the chosen desktop framework.

### Step 5: Refine — Tech Stack Choices

Use `ask_user_input` with options tailored by research when available. If your runtime does
not provide `ask_user_input`, ask the same questions in prose. No generic lists.

Global structured-prompt rule:

- Every `ask_user_input` question in Step 5 should expose only **2-3 curated options**.
- Start each structured prompt with one short PM-style lead-in in prose.
- If you have a larger internal option pool, narrow it first using the user's earlier answers
  and research summary. Do NOT dump the whole pool into the prompt.
- If the choice set is still too broad, ask a prose narrowing question first, then show the
  final 2-3 options.

Question delivery rule:

- Never present all of Step 5 in one message.
- Ask one stage, wait for the answer, summarize the decision, then ask the next stage.
- For **Web App / Mobile / Desktop** projects, the order is mandatory:
  1. frontend shape (`Q1` + `Q2`)
  2. UI brief (`Q11`–`Q16`, asked one by one)
  3. backend / API / database (`Q3` + targeted follow-ups)
  4. package manager / monorepo (`Q4` + `Q5`)
  5. deploy / CI / ops (`Q6`–`Q10`)
  6. companion skill (`Q17`)
- For **CLI Tool / Agent Tool / MCP Server** projects, skip the frontend/UI stages and start
  with the backend/runtime stages.
- Do NOT show the user the full numbered list up front. Use the numbering here as internal
  structure for the skill, not as a form to paste verbatim.

Suggested conversational delivery:

- Start the frontend stage with natural prose, for example:
  - "I’ll lock the frontend direction first. Is this more like a dashboard, a content-heavy site, or a product app shell?"
  - "On the frontend, are you leaning toward something like Next.js / Remix / Nuxt / Vite, or do you want me to narrow the best 3 options for you?"
- Move into the UI brief in the next turn, for example:
  - "Before we touch backend choices, I want to lock the UI direction one decision at a time so we can react to each choice."
  - "I’ll start with the component/style system, then layout, then references, then density and theme."
- Only after that ask backend/data questions tied to the frontend answer, for example:
  - "Given that frontend choice, do you want the backend inside the same app, a separate API, or a hosted backend like Supabase?"
- Keep each stage to 1-3 questions/prompts. For the UI brief, ask one decision at a time and
  summarize what is now fixed before moving to the next one.
- Do NOT paste raw `Q1`–`Q17` numbering unless the user explicitly asks for the full checklist.

Framework selection rule:

- Do NOT default every Web App to `Next.js`.
- For web products, compare at least 3 realistic candidates that match the brief
  (for example `Next.js`, `Remix`, `Nuxt`, `SvelteKit`, `Astro`, or `React + Vite` depending on
  whether the product is app-like, content-heavy, edge-first, or SPA-first).
- Recommend `Next.js` only when the user explicitly wants it or when its tradeoffs match the
  discovered needs better than the alternatives.
- When the best fit is uncertain, present the tradeoff briefly before asking the user to choose.

**Stage 1 — frontend shape (ask first for Web / Mobile / Desktop):**

Ask `Q1` and `Q2` first. For UI projects, stop after `Q2`, wait for the user's answer, then run
the UI brief (`Q11`–`Q16`) before returning to backend/data questions.

Suggested opener:
> "I’ll pin down the frontend direction first. Is this product closer to a dashboard, a content site, or an app shell? Then I’ll narrow the framework options for that shape."

**ask_user_input call 1 (adapt options to research results; 2-3 options per question):**

1. **Product shape** (single_select): Which shape is this closest to?
   - Curate 2-3 options from: `Dashboard / app shell`, `Content / marketing`, `Workflow / wizard`, `Marketplace / ecommerce`, `Mixed / not sure`

2. **Framework / stack** (multi_select): Based on research, here are the top fits:
   - Populate with **2-3** researched recommendations specific to this product
   - Example for Web App SaaS: `Remix + Tailwind`, `Next.js + Tailwind`, `Nuxt 3 + Tailwind`
   - Example for Web App SaaS (Cloudflare-first): `Remix + Cloudflare Pages`, `Astro + Cloudflare Pages`, `Next.js (OpenNext) + Cloudflare`
   - Example for SPA-first dashboard: `React + Vite + TanStack Router`, `Next.js`, `SvelteKit`
   - Example for content-heavy web product: `Astro`, `Nuxt 3`, `Remix`
   - Example for API / Backend (edge): `Hono + Cloudflare Workers`, `Elysia + Bun`, `Fastify`
   - Example for CLI Tool: `Node.js (Commander.js)`, `Python (Click/Typer)`, `Go (Cobra)`
   - Example for Agent Tool: `MCP Server (TypeScript)`, `LangGraph (Python)`, `CrewAI`
   - For Web / Mobile / Desktop projects, use this question to narrow the **frontend shell**
     first. Do NOT bundle backend/runtime/database choices into the same prompt.
   - **Internal candidate pool for Cloudflare-first projects:** When the user mentions Cloudflare,
     edge computing, or low-latency global deployment, prioritize Cloudflare-native stacks from
     the following pool, then surface only the best 2-3:
     - **Frontend:** Remix, Astro, SvelteKit, or Next.js via OpenNext adapter on Cloudflare Pages
     - **Backend / API:** Hono (lightweight, Workers-native), itty-router, or Remix loaders on Pages Functions
     - **Database:** Cloudflare D1 (SQLite at edge), Turso (libSQL), or Drizzle ORM + D1
     - **KV / Cache:** Cloudflare KV, Cloudflare R2 (S3-compatible object storage)
     - **Auth:** Better Auth, Lucia, or Cloudflare Access
     - **Queue / Cron:** Cloudflare Queues, Cron Triggers
     - **Config files to generate:** `wrangler.toml`, `.dev.vars` (local env), `compatibility_flags`
     - **Search:** `cloudflare workers <framework> 2025` during research phase

**Stage 2 — backend / API / data (only after frontend choice for UI projects):**

For Web / Mobile / Desktop projects, ask this stage only after the user has answered the UI brief.
Tailor the backend suggestions to the chosen frontend/runtime instead of showing a generic list.

Suggested opener:
> "Now that the frontend direction is clearer, let’s decide how much backend you want behind it: same app, separate API, or managed backend."

Backend shape is usually better as a short PM-style prose follow-up than a separate numbered
form field. Ask it conversationally, for example:
- "Do you want the backend to live inside the same app, split into a separate API, or stay mostly managed through something like Supabase?"

3. **Database / data layer** (single_select, only if the product needs app data):
   - Curate 2-3 options from: `PostgreSQL + Prisma/Drizzle`, `Supabase`, `MongoDB`, `SQLite`, `Cloudflare D1 + Drizzle`, `Turso (libSQL) + Drizzle`
   - Note: If deploy target is Cloudflare Workers/Pages, strongly recommend D1 or Turso —
     traditional PostgreSQL requires an external connection (Neon, Supabase) since Workers
     can't hold persistent TCP connections. D1 is zero-config and co-located at the edge.

Use short targeted follow-ups in prose when needed, for example:
- "Since you picked `Next.js`, do you want the backend inside route handlers / server actions, or as a separate API?"
- "Since you picked `React + Vite`, do you want a separate API service, or a hosted backend like Supabase?"
- "Since this is Cloudflare-first, do you want to keep everything at the edge, or allow a separate origin API?"

**Stage 3 — workspace / runtime refinement:**

Suggested opener:
> "Implementation-wise, do you want this repo to stay simple, or do you expect multiple apps/packages early and want the workspace structured for that now?"

**ask_user_input call 2 (JS/TS projects only; 2-3 options per question):**

4. **Package manager** (single_select): Which package manager?
   - For most JS/TS projects, surface 2-3 choices from: `pnpm`, `bun`, `npm`
   - **Expo / React Native special case:** surface 2-3 choices from: `bun (recommended)`, `yarn`, `npm`, `pnpm (only if the user explicitly accepts EAS monorepo caveats)`
   - If the selected frontend stack is Expo / React Native and the project is EAS-first or likely to become a monorepo, recommend `bun` or `yarn`. Do NOT recommend `pnpm` by default for Expo.
   - Skip for Python/Go/Rust projects

5. **Monorepo** (single_select): Do you want a monorepo structure?
   - Options: `Yes — monorepo (apps/ + packages/)`, `No — single package`
   - Recommend monorepo if: the project has multiple layers (e.g. web + API + mobile),
     the user mentioned wanting to add features / apps later, or the frontend and backend are
     intentionally split into separate deploy units, or the product has a clear public package
     (SDK, shared UI lib, etc.)
   - If monorepo and the selected stack is **Expo / React Native**: recommend `bun` or `yarn`
     workspaces. Use `pnpm` only when the user explicitly accepts the EAS caveats from
     `docs/agent/skill-mobile.md`.
   - If monorepo and the selected stack is **not** Expo / React Native: recommend `pnpm`
     workspaces; `bun` workspaces also work; `npm` workspaces are functional but slower
   - Ask a follow-up in prose: "What apps or packages do you expect to add first?
     (e.g. `apps/web`, `apps/api`, `packages/ui`, `packages/db`)"
     Use the answer to pre-populate the initial workspace structure
   - Store choice as `MONOREPO=true/false` — referenced throughout scaffold generation

**Stage 4 — deploy / CI / ops (DO NOT SKIP):**

Suggested opener:
> "Last major architecture choice: where do you actually want this to run, and do you want the deploy flow to stay very managed or be more infra-controlled?"

**ask_user_input call 3 (deploy + ops — DO NOT SKIP; 2-3 options per question):**

6. **Deploy target** (single_select): Where will this run?
   - Surface 2-3 best-fit options relevant to the project type based on research.
   - **Internal candidate pool — pick from this, do not show all at once:**
     - Managed platforms (zero infra): `Vercel`, `Cloudflare Pages/Workers`, `Netlify`, `Railway`, `Render`
     - Container platforms: `Fly.io`, `AWS ECS/Fargate`, `Google Cloud Run`, `Azure Container Apps`
     - VPS / self-hosted: `VPS (Hetzner/DigitalOcean/Linode)`, `Self-hosted (Coolify/Dokku/Kamal)`
     - Serverless: `AWS Lambda`, `Cloudflare Workers`, `Supabase Edge Functions`
     - Mobile: `EAS (Expo Application Services)` — standard for Expo
     - CLI / Package: `npm registry`, `PyPI`, `Homebrew`, `GitHub Releases`
   - Example curated sets by project type:
     - React SSR / full-stack web app: `Vercel`, `Cloudflare Pages`, `VPS (Hetzner/DO)`
     - Full-stack (Cloudflare): `Cloudflare Pages + Workers + D1`, `Cloudflare Workers (Hono)`, `VPS fallback`
     - API / Backend: `Railway`, `Fly.io`, `VPS (Hetzner/DO)`
     - Static site / JAMstack: `Cloudflare Pages`, `Vercel`, `Netlify`
     - Agent / MCP tool: `Docker self-hosted`, `Cloud Run`, `Fly.io`

7. **Deployment method** (single_select): How should it be packaged and deployed?
   - Surface 2-3 options depending on the deploy target chosen in #6.
   - Candidate pool:
     - **Vercel / Netlify**: `Git push auto-deploy (managed)`, `CLI deploy (vercel / netlify deploy)`
     - **Cloudflare Pages**: `Git push auto-deploy`, `Wrangler CLI deploy`
     - **Cloudflare Workers**: `Wrangler CLI`, `Git push via Pages Functions`
     - **Fly.io / Railway / Render**: `Docker container`, `Buildpack (auto-detect)`
     - **VPS (Hetzner/DO/Linode)**: `Docker Compose + SSH deploy`, `Kamal (zero-downtime Docker)`, `Coolify (self-hosted PaaS)`, `Dokku (self-hosted Heroku)`
     - **AWS ECS / Cloud Run**: `Docker container + CI push to registry`
     - **AWS Lambda**: `Serverless Framework`, `SST`, `SAM`
     - **Mobile (EAS)**: `EAS Build (managed)` — typically the only answer
     - **CLI / Package**: `npm publish`, `GitHub Release + binary`, `Docker image`
   - This determines: Dockerfile generation, platform config files (vercel.json / wrangler.toml /
     fly.toml / docker-compose.yml / kamal deploy.yml), build commands, CI deploy steps

8. **CI/CD pipeline** (single_select): Which CI/CD provider?
   - Surface 2-3 choices from: `GitHub Actions`, `GitLab CI`, `None (manual deploy for now)`
   - Default: `GitHub Actions` if repo is on GitHub
   - Note: some targets have built-in CI (Vercel/Netlify/Cloudflare auto-deploy on git push).
     Even then, still generate a CI workflow for `harness validate` on PR — deploy can be
     handled by the platform's built-in integration
   - This determines: which workflow files to generate (.github/workflows/ vs .gitlab-ci.yml),
     how deploy triggers are configured, and how secrets/env vars are referenced

**Stage 5 — monitoring / environments:**

Suggested opener:
> "For v1 operations, do you want to keep it light, or do you already want staging, monitoring, and structured logs in place?"

**ask_user_input call 4 (monitoring + environments; 2-3 options per question):**

9. **Monitoring & analytics** (multi_select): Which operational layers do you want?
   - Surface 2-3 grouped choices such as: `Keep it minimal for v1`, `Error tracking + logs`, `Error tracking + analytics + uptime`

10. **Environments** (multi_select): Which deployment environments do you need?
   - Surface 2-3 choices from: `development + production`, `development + staging + production`, `production-first for now`
   - Default: all three. Deselect staging if project is very early/solo
   - This determines: how many env files to generate (.env.development, .env.staging, .env.production),
     what CI/CD pipelines to set up, and how EAS build profiles are named (for mobile)

**Stage 1B — UI brief (ask immediately after Stage 1 for frontend/UI projects):**

Even though this section is numbered later for reference stability, ask it **before** any
backend/database/deploy questions for Web / Mobile / Desktop projects.
Ask the UI brief one decision at a time. This keeps the conversation natural and gives the user
room to react to each visual choice separately before the next one.

Suggested opener:
> "Before we get into backend, I want to lock the UI direction one choice at a time so we can shape it like a real product review, not a bulk questionnaire."

Preferred prose sequence for plain terminal flows:
- Start with: "First UI question: do you want to lean on a component system like shadcn, Radix, MUI, Chakra, etc., or keep it mostly custom?"
- Then ask: "Second UI question: should this feel minimal, enterprise, bold, playful, editorial, or something else?"
- Then ask: "Third UI question: is the main layout more like a dashboard, landing page, admin/table-heavy app, docs/content site, ecommerce flow, wizard, or a mix?"
- Then ask: "Fourth UI question: are there any products, brands, screenshots, or moodboards I should preserve or borrow from?"
- Then ask: "Fifth UI question: should the interface feel spacious, balanced, or dense?"
- Then ask: "Sixth UI question: do you want light-first, dark-first, or both themes?"

When `ask_user_input` is unavailable, prefer the prose sequence above over pasting the raw
`Q11`-`Q16` labels. Keep the numbered questions below as the internal mapping so the captured
answers still map cleanly into `docs/product/frontend-design.md`.

**ask_user_input call 5 (frontend/UI projects only — skip for CLI Tool and Agent/MCP Server):**

When structured prompts are available, present the UI brief as **six sequential ask_user_input
turns**. Ask exactly one UI decision at a time so the user can respond like they are in a real
PM review conversation.

Lead-in before `Q11`:
> "First UI decision: let’s pick the component/style system."

Lead-in before `Q12`:
> "Next UI decision: what overall feel should the product have?"

Lead-in before `Q13`:
> "Next UI decision: what’s the dominant layout pattern?"

Lead-in before `Q14`:
> "Next UI decision: what should anchor the visual references?"

Lead-in before `Q15`:
> "Next UI decision: how dense should the interface feel?"

Lead-in before `Q16`:
> "Last UI decision: what theme posture should the system follow?"

> Only ask these questions if the project type selected in Step 1 is **Web App**, **Mobile App**, or **Desktop App**. Skip entirely for CLI Tool and Agent/MCP Server.

11. **UI Component Library** (single_select): Which component library will you use?
   - Show **2-3 curated options** based on the framework selected in call 1.
   - Internal candidate pool:
     - **Next.js / React / Remix:** `Shadcn/ui + Tailwind CSS`, `Radix UI + Tailwind CSS`, `Material UI (MUI)`, `Chakra UI`, `Ant Design`, `None / custom CSS`
     - **Nuxt / Vue:** `Nuxt UI + Tailwind CSS`, `Shadcn-vue + Tailwind CSS`, `Vuetify`, `PrimeVue`, `None / custom CSS`
     - **SvelteKit:** `Shadcn-svelte + Tailwind CSS`, `Skeleton UI`, `None / custom CSS`
     - **Mobile (Expo / React Native):** `NativeWind (Tailwind)`, `React Native Paper`, `Tamagui`, `Gluestack UI`, `None / custom`
     - **Desktop (Electron / Tauri):** `Shadcn/ui + Tailwind CSS`, `Radix UI + Tailwind CSS`, `None / custom`

12. **Design Aesthetic** (single_select): What's the overall look and feel?
    - Show **2-3 curated options** from: `Minimal / clean`, `Modern SaaS`, `Bold / expressive`, `Corporate / enterprise`, `Playful / consumer`, `Undecided — generate a sensible default`

13. **Primary Layout Pattern** (single_select): What's the dominant screen layout?
    - Show **2-3 curated options** from: `SaaS dashboard`, `Marketing / landing page`, `Admin / data table heavy`, `Docs / content site`, `E-commerce`, `Single-page / wizard flow`, `Mixed — multiple patterns in one app`
    - This determines: the primary navigation structure, page skeleton, and layout constraints written into `docs/product/frontend-design.md`

14. **Visual References / Brand Anchors** (single_select): What should anchor the UI direction?
    - Show 2-3 choices from: `Existing product / brand UI to preserve`, `External references / moodboard`, `No references — derive from the product brief`
    - If the first or second option is chosen, ask in prose for the concrete inputs:
      file paths, URLs, screenshots, or a short list of products to reference.

15. **Content Density** (single_select): How dense should the interface feel?
    - Show 2-3 choices from: `Spacious / editorial`, `Balanced`, `Dense / data-rich`

16. **Theme Preference** (single_select): What theme posture should the preview and UI system follow?
    - Show 2-3 choices from: `Light-first`, `Dark-first`, `Support both themes`

Treat questions 11–16 as the **hybrid UI brief**. Questions 11–13 choose the broad
design system direction; questions 14–16 stabilize the output so the generated UI docs
and preview converge on a repeatable result.

**Stage 6 — companion skill choice:**

Suggested opener:
> "One last project-level choice: do you want me to generate a companion SKILL.md so other agents can discover and operate this project cleanly?"

**ask_user_input call 6 (all project types):**

17. **Companion AI Skill** (single_select): Generate a companion skill so AI agents
    (Claude Code, claude.ai, OpenClaw) can discover and operate this project?
    - `Yes — generate SKILL.md + docs/agent/` — claude.ai / OpenClaw / Claude Code compatible
    - `No — skip`

> Skip this question only if the project type is **Agent Tool / MCP Server** AND the user
> already confirmed SKILL.md generation via the MCP scaffold path. Otherwise always ask.

Store the answer as `COMPANION_SKILL=true|false`.

### Phase 1 Exit Gate

Do NOT leave Phase 1 until all applicable inputs below are captured or explicitly marked
as intentionally undecided:

- Project name and short product introduction
- Project type and first-version success definition
- Early market scan / research pass 1 shared back to the user
- Primary users and core jobs-to-be-done
- V1 must-haves, later ideas, and explicit non-goals
- Hard constraints (platform, performance, security/compliance, offline, etc.)
- Page inventory for Web/Mobile/Desktop projects
- Targeted recommendation summary / research pass 2 shared back to the user
- Stack / deploy / CI / monitoring / environment choices from Step 5
- Companion skill choice

Before Phase 2, send a short discovery recap with the decisions and assumptions you captured.
If a critical item is still unclear, ask a follow-up instead of generating artifacts.

### Reference injection based on Step 5 answers

After completing all ask_user_input calls in Step 5, load the relevant platform references
**before** generating the PRD or any scaffold:

```
If project uses authentication (any user login, OAuth, sessions, API keys):
  → Read docs/agent/skill-auth.md NOW and keep it active through Phase 3.
  → This determines: auth library choice, session strategy, OAuth provider setup,
    DB schema for user/session/account tables, and env vars for secrets.

If project runtime is NOT Node/JS/TS (i.e. Python, Go, Rust, or mixed-language monorepo):
  → Read docs/agent/harness-native.md for the shell CLI implementation.
  → Phase 3 generates scripts/harness.sh instead of scripts/harness.ts.
  → Phase 3 also generates a Makefile with validate, done, next, block targets.
  → NOTE: harness-native.md does not cover worktree management or plan:apply —
    those steps require a human operator during multi-milestone work.

If project runtime IS Node/JS/TS (or a monorepo with a Node root):
  → The default TypeScript CLI applies. Read docs/agent/harness-cli.md during Phase 3.
  → All worktree, plan:apply, scaffold, and merge-gate commands are available.
  → Use managed worktrees only when parallelism or milestone isolation is beneficial;
    otherwise the project can start serially from main/root.
```

---

### Handling "Other" Selections

**If the user selects `Other` for framework/stack**, ask in prose:
> "What stack did you have in mind? Describe the framework, runtime, or any tools you already
> know you want to use."

Then do a **targeted web search** for that stack:
1. Search: `<user's stack> production best practices <current year>`
2. Search: `<user's stack> project structure`
3. Check if the stack suits the project type. If it's a mismatch (e.g., user says
   "Django" for a real-time mobile app), say so directly:
   > "Django is a strong choice for server-side web apps, but for a real-time mobile
   > experience you'd typically want a dedicated API layer (FastAPI, Node, etc.) plus
   > a mobile client. Here's what I'd suggest instead: [researched alternatives]."
4. Only proceed with the user's choice if it's genuinely suitable, or if the user
   explicitly confirms they want it anyway. Document any tradeoffs in the PRD tech stack
   section.

**If the user selects `Other` for deploy target**, ask in prose:
> "Where do you want to deploy? Describe the platform, hosting provider, or infrastructure
> you already have or prefer."

Then do a **targeted web search**:
1. Search: `<user's platform> deploy <framework> <current year>`
2. Search: `<user's platform> CI CD setup`
3. Generate the appropriate platform config file (or note if one isn't needed).
   If the platform is unusual or undocumented, document the deploy steps as a new page
   in `docs/gitbook/` (e.g. `docs/gitbook/deployment.md`) as prose rather than generating
   a config file.
4. Make sure the CI workflow's deploy step matches the chosen platform.

---

### Auth Stack Decision

After the user's tech stack is confirmed, ask:

**ask_user_input:**
1. **Authentication** (single_select): How will users authenticate?
   - Options: `Better Auth (self-hosted, TypeScript)`, `Clerk (managed)`, `Supabase Auth`, `Firebase Auth`, `None / custom`

**Auth provider routing:**
- **Better Auth** → read `docs/agent/skill-auth.md` NOW for library setup, env vars, and
  framework mounting patterns.
- **Clerk** → do NOT use Better Auth code. Research current Clerk setup for the chosen
  framework: `Clerk <framework> 2025 setup`. Key tasks: install `@clerk/nextjs` (or
  equivalent), wrap layout with `<ClerkProvider>`, add env vars `NEXT_PUBLIC_CLERK_*`.
  No self-hosted auth code — Clerk manages sessions.
- **Supabase Auth** → use Supabase SSR helpers for the chosen framework. Research:
  `Supabase Auth SSR <framework> 2025`. Key tasks: `createServerClient`,
  middleware session refresh, Row Level Security policies on user-scoped tables.
- **Firebase Auth** → research `Firebase Auth <framework> 2025`. Key tasks:
  `initializeApp`, `getAuth`, provider setup (Google/email). Note: Firebase Auth is
  independent of Firestore — add Firestore tasks separately if needed.
- **None / Custom** → skip auth tasks in M1. Add a plain note in `ARCHITECTURE.md`:
  "Auth is intentionally not implemented in the initial scaffold. Add a provider in a future milestone if required."

---

## Phase 2: Product Requirements Review

After discovery, generate a rigorous PRD. This is NOT a loose feature list — it's a
structured product document with traceability from requirements down to tasks.

### Core Principles for Requirements

1. **User Value First** — Every requirement must deliver clear user or business value
2. **Testable & Measurable** — All requirements have explicit acceptance criteria
3. **Prioritized Ruthlessly** — Use MoSCoW: Must / Should / Could / Won't
4. **Traceable** — Clear path: Requirement → Epic → Story → Task in PLAN.md

### PRD.md Structure

```markdown
# Product Requirements Document: <Project Name>

## 1. Overview
One paragraph: what the product does, the problem it solves, target users.

## 2. User Personas
For each user type identified in discovery:
| Persona | Role | Primary Goal | Pain Point |
|---------|------|-------------|------------|

## 3. User Journeys
For each persona, describe 2-3 key journeys:

**Journey: <Name>**
Persona: <who>
Trigger: <what starts this journey>
Steps:
1. User does X → System responds Y
2. User does A → System responds B
3. ...
Success state: <what "done" looks like>
Error states: <what can go wrong and how system handles it>

## 4. Functional Requirements

Each FR must have: ID, description, acceptance criteria, priority, and parent journey.

| ID | Requirement | Acceptance Criteria | Priority | Journey |
|----|-------------|-------------------|----------|---------|
| FR-001 | User can sign up with email | - Email validated - Confirmation sent within 5s - Account active after confirm | Must | Onboarding |
| FR-002 | ... | ... | Should | ... |

Priority uses MoSCoW:
- **Must** — Launch blocker. Product doesn't work without it.
- **Should** — Important. Delay is painful but survivable.
- **Could** — Nice to have. First to cut if behind schedule.
- **Won't (v1)** — Explicitly out of scope for this version.

## 5. Non-Functional Requirements

| ID | Category | Requirement | Metric | Priority |
|----|----------|-------------|--------|----------|
| NFR-001 | Performance | Page load time | < 2s on 3G | Must |
| NFR-002 | Security | Auth tokens | JWT with refresh, 15min expiry | Must |
| NFR-003 | Accessibility | WCAG compliance | Level AA | Should |
| NFR-004 | Analytics | User behavior tracking | GA4 / Posthog core events instrumented | Must |
| NFR-005 | Monitoring | Error tracking | Sentry integrated, <5min alert latency | Must |
| NFR-006 | Monitoring | Health checks | /health endpoint, uptime monitoring | Must |
| NFR-007 | Observability | Structured logging | JSON logs with request ID, level, timestamp | Must |
| NFR-008 | Release | Feature flags | Flag service integrated, flags for all new features | Should |

Populate actual NFRs based on project discovery. The above are COMMON defaults for
**Web App / API** projects. Adjust based on call 5 (design) answers when available:
- **NFR-001 (Performance):** If layout pattern is `Marketing / landing page`, tighten to
  `< 1s LCP on 3G` and note Core Web Vitals. If `SaaS dashboard`, prioritize TTI for the
  authenticated shell over first-paint.
- **NFR-003 (Accessibility):** If component library is `Shadcn/ui`, `Radix UI`, or `Nuxt UI`,
  note that ARIA is built-in — set metric to `Level AA (component library provides baseline)`.
  If `None / custom CSS`, add explicit audit requirement.

For other project types, use these defaults instead:

**CLI Tool defaults:**
| ID | Category | Requirement | Metric | Priority |
|----|----------|-------------|--------|----------|
| NFR-001 | Performance | Startup time | < 500ms to first output | Must |
| NFR-002 | UX | Error messages | Human-readable errors to stderr, exit code 1 | Must |
| NFR-003 | UX | Help text | `--help` for every command, contextual examples | Must |
| NFR-004 | Compatibility | Exit codes | 0 = success, 1 = error, 2 = usage error | Must |
| NFR-005 | Output | Machine-readable output | `--format json` option on all data commands | Should |
| NFR-006 | Monitoring | Error tracking | Sentry (opt-in with `--telemetry` flag) | Could |

**Agent / MCP Server defaults:**
| ID | Category | Requirement | Metric | Priority |
|----|----------|-------------|--------|----------|
| NFR-001 | Reliability | Tool error handling | All tools return structured MCP errors, never raw exceptions | Must |
| NFR-002 | Performance | Tool response time | < 5s for most tools, timeout after 30s | Must |
| NFR-003 | Security | Input validation | All tool inputs validated against JSON Schema | Must |
| NFR-004 | Observability | Structured logging | JSON logs with tool name, duration, success/failure | Must |
| NFR-005 | Discoverability | SKILL.md | SKILL.md at project root, all tools documented | Must |
| NFR-006 | Discoverability | API reference | docs/api-reference.md with full JSON Schemas per tool | Must |
| NFR-007 | Observability | Tool metrics | Call count, latency, error rate per tool (`scaffold agent-observe`) | Should |
| NFR-008 | Security | Auth + rate limit | Bearer token auth + per-key rate limit on remote SSE | Must (if remote) |
| NFR-009 | Compatibility | Dual transport | stdio (local) + SSE (remote) transports | Should |
| NFR-010 | Discoverability | A2A Agent Card | `/.well-known/agent.json` for agent-to-agent discovery | Should |
| NFR-011 | Discoverability | llms.txt | llms.txt (llmstxt.org) indexes project for LLMs | Should |
| NFR-012 | Quality | Protocol compliance tests | Full MCP lifecycle tested: initialize → list → call → error | Must |
| NFR-013 | Quality | Schema drift CI | CI detects SKILL.md vs code tool mismatch, fails build | Should |
| NFR-014 | Compatibility | Tool versioning | Breaking changes = new tool name, deprecation window ≥ 4 weeks | Should |
| NFR-015 | Reliability | Long-running tasks | Webhook callback for tools > 30s, poll-able task status | Should (if applicable) |
| NFR-016 | Discoverability | MCP Prompts | Pre-built prompt templates for complex tool usage patterns | Could |
| NFR-017 | Observability | Cost tracking | Per-call cost estimation + audit log for paid external APIs | Should (if paid APIs) |
| NFR-018 | Monetization | Payment layer | x402 (per-request micropayments) and/or Stripe metered billing | Could |
| NFR-019 | Compatibility | Multi-agent client | Can discover + call remote agents via A2A/MCP with retry | Could |
| NFR-020 | Monitoring | Error tracking | Sentry integrated | Should |

**Desktop App defaults:**
| ID | Category | Requirement | Metric | Priority |
|----|----------|-------------|--------|----------|
| NFR-001 | Performance | Startup time | < 2s to interactive | Must |
| NFR-002 | Performance | Memory usage | < 200MB idle | Should |
| NFR-003 | UX | Offline support | Core features work without network | Must |
| NFR-004 | Security | Auto-update | Signed updates via electron-updater or Tauri updater | Must |
| NFR-005 | Accessibility | Keyboard navigation | All features keyboard-accessible | Should |

Always ask during Step 2 if unclear which NFRs apply.

## 6. Tech Stack
| Layer | Choice | Rationale |
|-------|--------|-----------|

## 7. Data Model
Key entities, their relationships, and core fields. Expand in design docs later.

## 8. API Surface (if applicable)
Key endpoints/commands with method, path, brief description, and auth requirement.

## 9. Epics & Stories Breakdown

Decompose FRs into epics, then into user stories. This is the bridge to PLAN.md.

### Epic E1: <Name> (covers FR-001, FR-002)
| Story ID | As a... | I want to... | So that... | Acceptance Criteria | Estimate |
|----------|---------|-------------|-----------|-------------------|----------|
| E1-S01 | new user | sign up with email | I can access the app | - Valid email required - Password 8+ chars - Confirmation email sent | S |
| E1-S02 | new user | confirm my email | my account is activated | - Click link → account active - Link expires in 24h | S |

Estimates: XS (< 1h), S (1-4h), M (4-8h), L (1-2d), XL (2-5d)

### Epic E2: <Name> (covers FR-003, FR-004)
...

## 10. Out of Scope (v1)
Explicit list of what we're NOT building. Reference Won't items from FRs.

## 11. Open Questions
Unresolved decisions that need input before implementation.
```

**PRD story examples for other project types (use instead of the web app example above):**

CLI Tool:
```markdown
### Epic E1: Core Commands (covers FR-001, FR-002)
| Story ID | As a... | I want to... | So that... | Acceptance Criteria | Estimate |
|----------|---------|-------------|-----------|-------------------|----------|
| E1-S01 | developer | run `mycli init` | my project is configured | - Creates config file - Validates dir - Prints next steps | S |
| E1-S02 | developer | run `mycli deploy --env staging` | my app deploys | - Reads config - Shows progress - Exit 0/1 - Prints URL on success | M |
| E1-S03 | developer | get output as JSON | I can pipe/parse it | - `--format json` returns valid JSON - Default: table | S |
```

Agent / MCP Server:
```markdown
### Epic E1: Core Tools (covers FR-001, FR-002)
| Story ID | As a... | I want to... | So that... | Acceptance Criteria | Estimate |
|----------|---------|-------------|-----------|-------------------|----------|
| E1-S01 | LLM agent | call `search` tool | I get relevant results | - Schema validates input - Returns structured array - Handles empty | M |
| E1-S02 | LLM agent | call `create` tool | a record is created | - Validates required fields - Returns ID - Duplicate → error | M |
```

Desktop App:
```markdown
### Epic E1: App Shell + Core Screen (covers FR-001)
| Story ID | As a... | I want to... | So that... | Acceptance Criteria | Estimate |
|----------|---------|-------------|-----------|-------------------|----------|
| E1-S01 | user | launch the app | I see the main window | - App opens in <2s - Window sized correctly - Menu bar works | S |
| E1-S02 | user | use the core feature | I get value from the app | - Feature works offline - State persists between sessions | M |
```

### Resolving Open Questions — Mandatory Gate

**DO NOT proceed to Phase 3 until ALL Open Questions are resolved.**

After generating the PRD, present the Open Questions section explicitly and work
through each one with the user in conversation. Common categories:

**Technical decisions:** auth provider, database, API style (REST / tRPC / GraphQL),
state management, offline support, push notification triggers

**Product scope:** free vs paid tiers, permission model (who can edit/delete what),
legal/compliance (GDPR, HIPAA, age restrictions), multi-language from day one

**UX decisions:** what happens when a user hits a limit, error states for critical flows

For each open question, ask the user to decide. If the user defers ("figure it out"),
make a **concrete recommendation** and document it as a decided choice:
> "I'll default to tRPC since you're using Next.js + React Native — end-to-end type
> safety without a schema layer. Noted in PRD §6 Tech Stack."

Only mark a question resolved when there is an actual answer — not "TBD" or "decide later."
Update the PRD with resolved decisions before proceeding.

### After generating PRD — Approval Gate

Present the PRD to the user and ask them to review:
- Are the Must-have FRs correct? Anything missing or over-scoped?
- Do the user journeys match what you had in mind?
- Any acceptance criteria that need adjusting?
- Are all Open Questions resolved?

Incorporate all feedback. Then ask explicitly:

> **"All open questions are resolved and the PRD is finalized. Here's a summary of
> the key decisions: [list: stack, auth, DB, deploy target, environments, monorepo y/n].
> Every milestone will be built to production standards (Iron Rule 7): error handling,
> input validation, structured logging, zero build warnings, no TODO/FIXME in code.
> Shall I proceed to Phase 3 and generate the full project scaffold?"**

**Wait for the user to say yes before generating any files.**
Do not auto-proceed. Phase 3 generates a lot of files — the user must consciously
sign off on the plan before the agent starts building.

### Phase 2.5: Convert PRD Epics → Initial PLAN.md (runs before Phase 3 scaffold)

This is the bridge from PRD to execution. Before generating any project files, convert
the PRD's Epic/Story breakdown into a harness-format plan file that will seed PLAN.md.

**Step 1 — Map Epics → Milestones, Stories → Tasks:**

For each Epic in PRD §9 (Epics & Stories Breakdown):
- One Epic = one Milestone block
- Each Story in the epic becomes one or more task rows
- Story estimate S → 1 task, M → 2–3 tasks, L → 4–6 tasks, XL → split into a new epic
- Task names must be imperative verbs: "Create user model", "Add signup endpoint"
- "Done When" column comes directly from the Story's acceptance criteria

**Step 2 — Prepare `docs/exec-plans/active/001-initial-setup.md`** using this format:

> **Directory timing note:** `docs/exec-plans/active/` does not exist yet during Phase 2.5 —
> it is created by the Phase 3 scaffold. Keep the exec-plan content in working memory during
> Phase 2.5. During Phase 3 scaffold generation, write it to disk as
> `docs/exec-plans/active/001-initial-setup.md` after the directory is created.

```markdown
### M1: <Epic name>
**Status:** ⬜ Not Started
**Branch:** milestone/m1
**Depends on:** none

| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| M1-001  | E1-S01 | Create user model + migration | User table exists in DB, migration runs | ⬜ | — |
| M1-002  | E1-S01 | Add email uniqueness constraint | Duplicate email returns 409 | ⬜ | — |
| M1-003  | E1-S02 | Implement signup endpoint | POST /auth/signup creates user, returns 201 | ⬜ | — |

### M2: <Next epic name>
**Status:** ⬜ Not Started
**Branch:** milestone/m2
**Depends on:** M1
...
```

Rules:
- Milestone IDs are sequential: M1, M2, M3…
- Each task ID is `M<n>-<3-digit-seq>`: M1-001, M1-002…
- `Depends on:` lists the milestone ID(s) that must merge before this one can start.
  Wire them to mirror PRD epic dependencies, or mark `none` for the first milestone.
- Task rows must describe real implementation outcomes, not scaffold shell creation that
  Phase 3 already handles. Do NOT write tasks like "create dashboard page file" or
  "add auth config stub" if the scaffold is going to generate those shells anyway.
  Instead target the real milestone work: wiring logic, integrating services, handling
  success/empty/error states, persistence, permissions, and validation.
- Do NOT put design or documentation tasks in milestones — those happen continuously.
  Exception: if the PRD explicitly scopes docs as a deliverable (e.g. API reference site).

**Step 3 — Seed the initial plan during Phase 3 scaffold:**

For the **initial scaffold only**, the generated project must already contain a consistent
`docs/PLAN.md` and `docs/progress.json` before handoff. Do **not** leave `PLAN.md` blank and do
**not** defer the initial milestone insertion to a later `plan:apply` step.

The exec-plan file (`docs/exec-plans/active/001-initial-setup.md`) is still written in Phase 2.5,
but during Phase 3 scaffold generation you must:

- copy its milestone tables into `docs/PLAN.md`
- populate `docs/progress.json` so `active_milestones[]`, per-task mirrors, and
  `dependency_graph` already match those tables
- generate the CLI so future plan files can use `harness plan:apply` from main/root

**If the project uses a non-Node runtime (Python / Go / Rust):**
The shell CLI (`scripts/harness.sh`) and Makefile do NOT implement `plan:apply`.
During Phase 3 scaffold generation, append the milestone tables from the exec-plan
directly into `docs/PLAN.md` under `## Milestones`, and populate
`docs/progress.json`'s `active_milestones[]`, task mirrors, and `dependency_graph` to match —
there is no automated sync command. The agent receiving the project must start with a
consistent PLAN.md and progress.json from the start; the first `make init` inside the
project will verify state but cannot repair a missing PLAN or progress.

**Ordering constraint (applies to all runtimes):**
Do NOT instruct the user to run `plan:apply` for the initial scaffold. `plan:apply` is for
**future** plan files after the scaffold already exists. The Phase 3 Exit Gate expects the
initial milestones to be materialized in `docs/PLAN.md` and `docs/progress.json` already.

---

## Phase 3: Generate Project Artifacts

> **Before generating any files:** Load the reference files that apply to this project.
> - **All Node/TS projects:** Read `docs/agent/harness-cli.md` NOW — it contains the full
>   TypeScript CLI source code, JSON Schema, git hooks, and Assembly Checklist that Phase 3
>   must produce. Do not generate CLI files from memory.
> - **Mobile projects:** Also read `docs/agent/skill-mobile.md`.
> - **Desktop projects:** Also read `docs/agent/skill-desktop.md`.
> - **Non-Node projects:** Read `docs/agent/harness-native.md` instead of harness-cli.md.
> - **Projects with auth:** Also read `docs/agent/skill-auth.md`.
> - **Web/Mobile/Desktop projects:** Invoke the `frontend-design` skill NOW to generate
>   `docs/product/frontend-design.md`. Pass Phase 1 call 5 answers as context:
>   Q11 (component library), Q12 (design aesthetic), Q13 (layout pattern),
>   Q14 (visual references / brand anchors), Q15 (content density), and
>   Q16 (theme preference).
>   Follow the generation strategy in the harness SKILL.md — try in order:
>   1. `frontend-design` skill active → use as base template, customize with call 5 answers
>   2. Local copy found → use as base template, customize with call 5 answers
>   3. Neither available → generate directly from call 5 answers (no generic fallback)
>   The generated file MUST contain these sections:
>   - `Component System`
>   - `Visual Language`
>   - `Layout Patterns`
>   - `Reference Anchors`
>   - `Preview Rendering Rules`
>   Log which strategy was used in `docs/learnings.md`.
> - **All projects:** Generate `docs/gitbook/` NOW with these 7 files. Build each file
>   from the specific sources listed — do NOT leave placeholder text:
>   - `SUMMARY.md` — table of contents linking all 6 other files
>   - `README.md` ← project name + one-line tagline from Phase 1 Step 1 vision;
>     "what it does" paragraph from PRD problem statement
>   - `product-overview.md` ← PRD: problem definition, solution, value proposition,
>     MoSCoW priorities; must-have FRs summarized in plain language
>   - `target-users.md` ← Phase 1 Step 2 deep dive: user types, #1 job-to-be-done per
>     user, current alternative, pain points; align with PRD user journeys
>   - `architecture.md` ← call 1 (tech stack), calls 2-3 (monorepo/deploy target),
>     system component list from ARCHITECTURE.md; describe data flow in 1-2 paragraphs
>   - `quickstart.md` ← AGENTS.md quick-start section: activation/install command,
>     phrased as "when you're ready to start the first milestone", env setup,
>     first-run step, first meaningful action the user can take
>   - `roadmap.md` ← docs/PLAN.md: milestone list in plain language, grouped by
>     phase (MVP / v2 / backlog); no internal task IDs, user-facing feature names only
>   Draft the GitBook pages in this order so the writing stays grounded:
>   `README.md` → `product-overview.md` → `target-users.md` → `architecture.md`
>   → `quickstart.md` → `roadmap.md` → `SUMMARY.md`.
>   For each page, extract bullets from the named source docs first, then turn them into
>   external-facing prose. Do not paste raw task tables or internal milestone wording into GitBook.
>   The GitBook loop is only closed when the pages are written, the sources of truth still match,
>   and the next session can treat `docs/gitbook/*` as current repo state.
>   Do not defer GitBook to Phase 6 or a later milestone.
> - **Web App / Mobile / Desktop projects:** Generate `docs/product/design.md` from the page
>   inventory collected in Phase 1 Step 2. This is the **authoritative page reference**
>   for Phase 4 execution agents. Use the format defined in the "docs/product/design.md format"
>   section below.
> - **Web App / Mobile / Desktop projects:** Generate `docs/product/design-preview.html` immediately
>   after `docs/product/design.md`. This is a self-contained single-file mid-fi preview viewable in
>   any browser — no build step, no external dependencies. It is generated in Phase 3
>   and used as the user review gate before Phase 4 begins.

### Phase 3 Dependency / Install Policy

Phase 3 is a scaffold pass, not a full environment bootstrap.

- Do NOT run `pnpm install`, `bun install`, `npm install`, `yarn install`, `uv sync`,
  `go mod tidy`, `cargo build`, or similar install/sync/build commands during scaffold
  generation by default.
- Do NOT create `node_modules/`, `.venv/`, compiled binaries, or any other installed runtime
  artifacts as part of the initial handoff.
- Only include dependencies required for the repo shell, harness runtime, lint/test toolchain,
  and code that already exists in the initial scaffold.
- Defer milestone-specific packages until the milestone that actually implements them.
  Examples: auth SDKs, charting libs, billing SDKs, queue clients, analytics vendors,
  vector databases, and third-party integration clients that are only referenced in future work.
- If a later milestone owns a feature, let that milestone add the packages it needs.
  Do NOT pre-install or pre-declare those packages just because the PRD mentions them.
- If the user explicitly says they want a fully bootstrapped repo right now, call that out as
  an exception and say which installs you are doing early.
- In generated quick-start docs, present install/sync as a "when you're ready to start the
  first milestone" activation step, not as something that must already have happened inside
  Phase 3.

### Phase 3 Foundation-Only Scope

Phase 3 creates the base repo, not the first feature release.

- Generate the harness/runtime shell, docs, config, validation pipeline, env examples,
  CI wiring, and any framework-required route/screen/module skeletons.
- Keep generated product files skeletal and inert unless working behavior is required for the
  scaffold itself to boot. A shell may exist; the milestone still owns the real feature.
- Do NOT implement milestone business logic in Phase 3. That includes auth flows, billing,
  dashboard data queries, provider integrations, queue workers, production copy, analytics
  wiring, or any other feature whose real acceptance criteria belong to a milestone.
- If a file must exist early for structure coherence, keep it neutral and foundation-only.
  A page shell, repository interface, adapter stub, migration placeholder, or provider config
  shell is acceptable. Marking the milestone done because that shell exists is not.
- A seeded milestone remains `⬜ Not Started` after scaffold. File existence is not evidence
  of completion; only the milestone's `Done When` outcomes are.

### File Structure

```
<project-name>/
├── AGENTS.md                    ← Codex reads this (identical to CLAUDE.md)
├── CLAUDE.md                    ← Claude Code reads this (identical to AGENTS.md)
├── ARCHITECTURE.md              ← domain map, dependency layers, patterns
├── docs/
│   ├── index.md                 ← human navigation entrypoint for generated docs
│   ├── PRD.md                   ← product requirements (from Phase 2)
│   ├── PLAN.md                  ← granular milestones + tasks
│   ├── progress.json            ← machine-readable cross-session state
│   ├── learnings.md             ← agent learnings log (human-readable)
│   ├── product/
│   │   ├── frontend-design.md   ← frontend design skill (read before any UI work)
│   │   ├── design.md            ← page inventory (Web App / Mobile / Desktop only)
│   │   ├── design-preview.html  ← self-contained mid-fi preview artifact (Web / Mobile / Desktop)
│   │   └── release.md           ← desktop release contract (Desktop App only)
│   ├── agent/
│   │   ├── agent-workflows.md   ← common agent workflows with this project
│   │   ├── api-guide.md         ← API reference when the project exposes one
│   │   ├── commands.md          ← CLI command reference when applicable
│   │   └── data-model.md        ← data entities agents will read/write
│   ├── memory/                  ← persistent agent memory (OpenClaw-inspired)
│   │   ├── MEMORY.md            ← curated long-term memory (decisions, patterns, gotchas)
│   │   └── .gitkeep             ← daily logs (YYYY-MM-DD.md) created per session
│   ├── design-docs/
│   │   └── .gitkeep
│   ├── exec-plans/
│   │   ├── active/
│   │   │   └── 001-initial-setup.md
│   │   └── completed/
│   │       └── .gitkeep
│   ├── tech-debt/
│   │   └── .gitkeep
│   └── gitbook/                 ← GitBook-compatible project documentation
│       ├── SUMMARY.md
│       ├── README.md
│       ├── product-overview.md
│       ├── target-users.md
│       ├── architecture.md
│       ├── quickstart.md
│       └── roadmap.md
├── src/
│   ├── lib/
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── feature-flags.ts
│   │   ├── analytics.ts
│   │   └── env.ts
│   ├── middleware/
│   │   └── error-handler.ts
│   └── ...
├── scripts/
│   ├── harness.ts               ← entry point router (~85 lines)
│   ├── maintenance/
│   │   └── check-commit-msg.ts  ← commit message format enforcer (for hooks)
│   └── harness/                 ← CLI modules (each <500 lines)
│       ├── config.ts            ← constants, paths, colors, output helpers
│       ├── types.ts             ← all interfaces: Progress, AgentEntry, WorktreeInfo
│       ├── state.ts             ← loadProgress, saveProgress, loadPlan, savePlan
│       ├── plan-utils.ts        ← PLAN.md table parser — shared by tasks/quality/recovery
│       ├── recovery.ts          ← installWithRetry + recoverMilestoneBoard
│       ├── worktree-helpers.ts  ← path normalization, finish-job state, worktree cleanup
│       ├── worktree.ts          ← worktree detection, enforcement, agent lifecycle, worktree:* commands
│       ├── task-helpers.ts      ← pending-plan detection, next-task selection, milestone sync
│       ├── tasks.ts             ← init, status, next, start, done, block, reset
│       ├── validate.ts          ← validate, validate:full, file-guard
│       ├── quality.ts           ← merge-gate, stale-check, sync-plans, schema, changelog
│       ├── plan-apply.ts        ← plan:apply + plan:status — parse plans, insert milestones
│       └── scaffold-templates.ts ← scaffold command: inject MCP, SKILL.md, Cloudflare templates
├── schemas/
│   └── progress.schema.json     ← JSON Schema for progress.json
├── tests/
│   ├── unit/                    ← per-task tests (run in task loop)
│   ├── integration/             ← cross-module (run at milestone merge)
│   └── e2e/                     ← full user journeys (run at milestone merge)
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── .env.example
├── .gitignore
├── .claude/
│   └── settings.json             ← plansDirectory → docs/exec-plans/active/
├── .codex/
│   └── config.toml               ← Codex project-level config
├── .husky/
│   ├── pre-commit               ← lint-staged + file-guard + schema (via tsx)
│   ├── commit-msg               ← [Mn-id] format enforcer (via tsx)
│   └── pre-push                 ← full validate (via tsx)
├── Dockerfile
├── docker-compose.yml
├── package.json / pyproject.toml / go.mod / Cargo.toml
└── README.md
```

**If MONOREPO=true**, replace the single-package structure above with:

```
<project-name>/
├── AGENTS.md
├── CLAUDE.md
├── ARCHITECTURE.md
├── docs/                        ← same as single-package (PRD, PLAN, progress.json, etc.)
├── apps/
│   ├── web/                     ← e.g. Next.js frontend (populate from user's answer)
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api/                     ← e.g. Express / Fastify backend
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── ui/                      ← shared component library
│   │   ├── src/
│   │   └── package.json
│   ├── db/                      ← shared DB client / schema (e.g. Prisma)
│   │   ├── prisma/
│   │   └── package.json
│   └── config/                  ← shared tsconfig, eslint, prettier configs
│       ├── tsconfig.base.json
│       ├── eslint.config.js
│       └── package.json
├── scripts/
│   ├── harness.ts               ← root-level entry point (validates all workspaces)
│   ├── maintenance/
│   │   └── check-commit-msg.ts
│   └── harness/                 ← CLI modules
├── schemas/
│   └── progress.schema.json
├── .github/
│   └── workflows/
│       ├── ci.yml               ← runs validate across all workspaces
│       └── deploy.yml
├── pnpm-workspace.yaml          ← declares apps/* and packages/* as workspaces
├── turbo.json                   ← optional: Turborepo pipeline for build/test/lint
├── package.json                 ← root package (private: true, scripts call turbo or pnpm -r)
├── tsconfig.json                ← root tsconfig (references all workspace tsconfigs)
├── .env.example
├── .gitignore
├── .claude/settings.json
├── .codex/config.toml
├── .husky/
│   ├── pre-commit
│   ├── commit-msg
│   └── pre-push
└── README.md
```

**Monorepo generation rules:**
- Pre-populate `apps/` and `packages/` based on the user's answer to the follow-up question.
  Only generate the packages they mentioned — don't invent extra ones.
- Each JS/TS workspace package gets its own `package.json` with a scoped name:
  `@<project-name>/web`, `@<project-name>/api`, `@<project-name>/ui`, etc.
- Root `package.json` must have `"private": true` and workspace scripts
  (e.g. `"build": "pnpm -r build"` or `"build": "turbo build"`).
- For JS/TS-only monorepos, `pnpm-workspace.yaml` includes both `apps/*` and `packages/*`.
  For mixed-language monorepos, list only Node-managed workspaces there and keep Python / Go /
  Rust packages on their native manifests and workspace files.
- Add `turbo.json` only if the user's project has 3+ workspaces or mentions CI performance.
  Otherwise keep it simple with `pnpm -r` scripts.
- `harness.ts` at the root runs validate across ALL workspaces in sequence.
  Add a `--workspace` flag so agents can validate a single package: `harness validate --workspace apps/web`.
- ARCHITECTURE.md must document the workspace dependency graph:
  which `apps/` depend on which `packages/`.
- In AGENTS.md / CLAUDE.md, add a **Monorepo Rules** section:
  - Shared code lives in `packages/` — never import across `apps/`
  - Each package is independently buildable and testable
  - Breaking changes to a `packages/` entry require updating all consumers in the same PR
  - New feature area → new workspace under `apps/` or `packages/` (don't bloat existing ones)

**Mixed-language monorepo rules:**
- Keep one harness runtime at the repo root, but let each non-JS app own its native toolchain:
  `pyproject.toml`, `go.mod` / `go.work`, or `Cargo.toml`.
- Add a root `Makefile` or `justfile` as the cross-language operator interface for
  `install`, `validate`, `test`, and `dev`. Do not pretend `pnpm` can orchestrate Python / Go /
  Rust by itself.
- Put cross-language contracts in a neutral package such as `packages/contracts/` using
  OpenAPI, JSON Schema, SQL migrations, or protobuf. Do not share source files directly across
  languages.
- In AGENTS.md / CLAUDE.md, spell out the per-app validate commands explicitly:
  `pnpm --dir apps/web test`, `uv run pytest`, `go test ./...`, `cargo test`, etc.

**Example mixed-language monorepo (TS frontend + Python backend):**

```
<project-name>/
├── AGENTS.md
├── CLAUDE.md
├── docs/
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   └── src/
│   └── api/
│       ├── pyproject.toml
│       ├── src/
│       └── tests/
├── packages/
│   └── contracts/
│       ├── openapi.yaml
│       └── schemas/
├── scripts/
│   ├── harness.ts
│   └── harness/
├── package.json              ← root Node tooling + harness runtime only
├── pnpm-workspace.yaml       ← includes apps/web and JS packages only
├── Makefile                  ← install / validate / test across all languages
└── README.md
```

---

### docs/product/design.md Format (Web App / Mobile / Desktop)

Generate this file from the design inventory collected in Phase 1 Step 2 plus
the project's `docs/product/frontend-design.md`.
This is the **authoritative product wireframe + page reference** for Phase 4 execution agents.

```markdown
# Design — <Project Name>

## Product Wireframe

**App shell:** <overall shell model — e.g. marketing shell, dashboard shell, tabbed mobile shell>
**Navigation model:** <sidebar / top nav / bottom tabs / stacked flow / split pane>
**Global regions:** <header, sidebar, content column, inspector, footer, etc.>
**Primary flows:** <core movement through the product in 3-5 bullets>
**Responsive notes:** <how layout collapses or changes across desktop/tablet/mobile>

## Design Direction in Context

**Visual summary:** <how the chosen style should feel in this specific product>
**Hierarchy notes:** <where emphasis, whitespace, density, and CTA weight should sit>
**Interaction tone:** <calm / operational / editorial / playful / enterprise / etc.>
**Style anchors:** <specific brand/UI references to preserve or emulate>

## Pages

### /<route> — <Page Name>
**Purpose:** <what this page does — one sentence from Step 2>
**Accessible to:** <user types who see this page>
**Primary action:** <the main thing a user should do on this screen>
**Key elements:** <main sections or UI components>
**Critical states:** `loading`, `empty`, `error` (+ any route-specific state like `first-run` or `permission-denied`)
**Layout notes:** <how this page uses the global shell / regions / hierarchy>

### /<route> — <Page Name>
...

## Navigation Structure

| Nav item | Route | Visible to |
|----------|-------|-----------|
| Dashboard | /dashboard | all authenticated users |
| Settings | /settings | all authenticated users |
| Admin | /admin | admin only |
...

## Auth Gates

| Route | Auth required | Role required |
|-------|--------------|---------------|
| / | No | — |
| /dashboard | Yes | any |
| /admin | Yes | admin |
```

**Generation rules:**
- Derive `Product Wireframe` and `Design Direction in Context` from the design inventory
  collected in Phase 1 Step 2 and the final `docs/product/frontend-design.md`.
- Do not invent pages not mentioned by the user or implied by the journeys.
- Keep each page entry concrete — "shows a list of user projects with filter/sort" not
  "displays content".
- Every page must name exactly one `Primary action`.
- Every page must include `loading`, `empty`, and `error` in `Critical states`,
  plus any extra state implied by the workflow.
- Every page must include `Layout notes` describing how it sits inside the global wireframe.
- `docs/product/design.md` is not page-only. It must describe the whole product wireframe and how the
  visual style applies across the product, not just list routes.
- The Navigation Structure table must match the scaffold's nav component.
- Auth Gates table must match the middleware/route guard generated in the scaffold.

---

### Page File Scaffolding (Web App / Mobile / Desktop)

Instead of leaving `(pages)/` or `app/` empty, generate one skeleton file per page
from the `docs/product/design.md` design inventory and overall wireframe contract.

**Next.js App Router:**
```
src/app/
├── page.tsx                  ← home / landing (or redirect to /dashboard)
├── dashboard/
│   └── page.tsx
├── settings/
│   └── page.tsx
└── <other pages from inventory>/
    └── page.tsx
```

Each page file follows this skeleton:
```tsx
// <Page Name> — <purpose from docs/product/design.md>
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "<Page Name> | <Project Name>",
}

export default function <PageName>Page() {
  return (
    <main>
      <h1><Page Name></h1>
      {/* Scaffold placeholder — see docs/product/design.md#<route> */}
    </main>
  )
}
```

**Expo / React Native (file-based Expo Router):**
```
app/
├── index.tsx                  ← home screen
├── (tabs)/
│   ├── dashboard.tsx
│   ├── settings.tsx
│   └── _layout.tsx            ← tab bar config (tabs from page inventory)
└── <other screens>/
    └── index.tsx
```

**Remix / SvelteKit / Nuxt:** apply equivalent file-based routing conventions.

**Desktop (Electron/Tauri renderer):**
```
src/renderer/
├── pages/
│   ├── Dashboard.tsx
│   ├── Settings.tsx
│   └── <PageName>.tsx
```

**Rules:**
- One file per page from the inventory — no more, no less.
- Comments in each file reference the corresponding `docs/product/design.md` entry.
- Do NOT implement content in Phase 3 — skeleton only. Phase 4 fills each page.
- If you include a placeholder comment, keep it neutral and point to `docs/product/design.md`.
  Do NOT generate `TODO` or `FIXME` comments in committed scaffold files.

---

### HTML Design Preview (Web App / Mobile / Desktop)

Generate `docs/product/design-preview.html` from the `docs/product/design.md` page inventory.
This is a **self-contained, zero-dependency mid-fi styled static preview** opened directly
in a browser. It is the visual review artifact before Phase 4 begins.

**File: `docs/product/design-preview.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><Project Name> — Design Preview</title>
  <style>
    /* Mid-fi preview tokens — no external dependencies */
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    body { display: flex; height: 100vh; background: #f5f5f5; color: #333; }

    /* Sidebar nav (from Navigation Structure in docs/product/design.md) */
    nav { width: 220px; background: #1e1e2e; color: #cdd6f4; padding: 1.5rem 1rem; flex-shrink: 0; }
    nav h2 { font-size: .75rem; text-transform: uppercase; letter-spacing: .1em; opacity: .5; margin-bottom: 1rem; }
    nav a { display: block; padding: .5rem .75rem; border-radius: 6px; color: #cdd6f4;
             text-decoration: none; font-size: .875rem; margin-bottom: .25rem; cursor: pointer; }
    nav a:hover, nav a.active { background: #313244; }
    .auth-badge { font-size: .65rem; background: #45475a; padding: 1px 5px; border-radius: 4px;
                  margin-left: .5rem; vertical-align: middle; }

    /* Main content area */
    main { flex: 1; overflow-y: auto; padding: 2rem; }
    .page { display: none; }
    .page.active { display: block; }
    .page-header { border-bottom: 2px solid #e0e0e0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .page-header h1 { font-size: 1.5rem; }
    .page-header .meta { font-size: .8rem; color: #888; margin-top: .25rem; }
    /* Preview component blocks */
    .ph { background: #e0e0e0; border-radius: 6px; margin-bottom: 1rem; }
    .ph-card { height: 120px; }
    .ph-row { height: 40px; }
    .ph-text { height: 16px; width: 60%; margin-bottom: .5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .preview-note { font-size: .75rem; color: #7c7f8a; font-style: italic; margin-top: .5rem; }
  </style>
</head>
<body>

<nav>
  <h2><Project Name></h2>
  <!-- One link per page from docs/product/design.md Navigation Structure table -->
  <a href="#" onclick="show('dashboard')" class="active">
    Dashboard
  </a>
  <a href="#" onclick="show('settings')">
    Settings <span class="auth-badge">auth</span>
  </a>
  <!-- ... one <a> per page -->
</nav>

<main>
  <!-- One <section> per page from docs/product/design.md -->
  <section id="dashboard" class="page active">
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="meta">
        Route: /dashboard · Accessible to: all authenticated users
        <!-- Purpose from docs/product/design.md -->
        · Purpose: Shows active projects and stats
      </div>
    </div>
    <!-- Key elements from docs/product/design.md as preview component blocks -->
    <div class="grid">
      <div class="ph ph-card"></div>
      <div class="ph ph-card"></div>
      <div class="ph ph-card"></div>
    </div>
    <p class="preview-note">Preview direction only — see docs/product/frontend-design.md and docs/product/design.md#/dashboard</p>
  </section>

  <section id="settings" class="page">
    <div class="page-header">
      <h1>Settings</h1>
      <div class="meta">Route: /settings · Auth required · Purpose: ...</div>
    </div>
    <div class="ph ph-row"></div>
    <div class="ph ph-row"></div>
    <div class="ph ph-text"></div>
    <p class="preview-note">Preview direction only — see docs/product/frontend-design.md and docs/product/design.md#/settings</p>
  </section>

  <!-- ... one section per page -->
</main>

<script>
  function show(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    event.target.classList.add('active');
  }
</script>

</body>
</html>
```

**Desktop variant (Electron/Tauri):**

Wrap the above in a window-chrome shell:

```html
<body style="display:flex; flex-direction:column;">
  <!-- Simulated title bar -->
  <div style="height:32px; background:#2d2d2d; display:flex; align-items:center;
              padding:0 1rem; color:#ccc; font-size:.8rem; flex-shrink:0;">
    <span style="flex:1"><Project Name></span>
    <span style="display:flex; gap:.5rem;">
      <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></span>
      <span style="width:12px;height:12px;border-radius:50%;background:#febc2e;"></span>
      <span style="width:12px;height:12px;border-radius:50%;background:#28c840;"></span>
    </span>
  </div>
  <!-- Then the nav + main layout identical to Web App variant -->
  ...
</body>
```

**Mobile variant (Expo / React Native):**

Simulate a phone frame. Each screen from `docs/product/design.md` is a section. Tab bar or stack
navigation is rendered at the bottom (matching the Expo Router `(tabs)/` layout).

```html
<body style="background:#111; display:flex; align-items:center; justify-content:center;
             min-height:100vh; padding:2rem;">
  <!-- Phone frame -->
  <div style="width:390px; height:844px; border-radius:44px; overflow:hidden;
              border:8px solid #333; display:flex; flex-direction:column;
              background:#fff; box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <!-- Status bar -->
    <div style="height:44px; background:#f5f5f5; display:flex; align-items:center;
                padding:0 1.5rem; justify-content:space-between; font-size:.75rem;">
      <span>9:41</span>
      <span>●●●</span>
    </div>

    <!-- Screen content (one div per screen, show/hide via JS) -->
    <div id="screen-dashboard" class="screen active"
         style="flex:1; overflow-y:auto; padding:1rem;">
      <h2 style="font-size:1.1rem; margin-bottom:1rem;">Dashboard</h2>
      <!-- Placeholder blocks -->
      <div style="height:100px; background:#e0e0e0; border-radius:8px; margin-bottom:.75rem;"></div>
      <div style="height:40px; background:#e0e0e0; border-radius:8px; margin-bottom:.75rem;"></div>
      <p style="font-size:.7rem; color:#7c7f8a;">Preview direction — see docs/product/frontend-design.md and docs/product/design.md#/dashboard</p>
    </div>
    <!-- ... one div per screen ... -->

    <!-- Bottom tab bar (from Navigation Structure in docs/product/design.md) -->
    <div style="height:83px; background:#f5f5f5; border-top:1px solid #e0e0e0;
                display:flex; align-items:center; justify-content:space-around;
                padding:0 1rem 16px;">
      <a href="#" onclick="showScreen('dashboard')"
         style="text-align:center; font-size:.65rem; color:#007aff; text-decoration:none;">
        ⬜<br>Dashboard
      </a>
      <a href="#" onclick="showScreen('settings')"
         style="text-align:center; font-size:.65rem; color:#888; text-decoration:none;">
        ⬜<br>Settings
      </a>
      <!-- one tab per primary screen from docs/product/design.md -->
    </div>
  </div>

  <!-- Screen selector (outside phone, for screens not in tab bar) -->
  <div style="margin-left:2rem; color:#ccc;">
    <p style="font-size:.75rem; margin-bottom:.5rem;">All screens:</p>
    <!-- list all screens as buttons -->
  </div>

  <script>
    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
      document.getElementById('screen-' + id).style.display = 'block';
    }
  </script>
</body>
```

**Generation rules:**
- **Self-contained**: No `<link>` to external CSS. No `<script src="...">`. Inline everything.
- **Mid-fi styled, not wireframe-only**: reflect the project's chosen theme, density, and
  component hierarchy from `docs/product/frontend-design.md`. Use real typography hierarchy,
  surface styles, spacing rhythm, and CTA emphasis.
- **One section / div per page** from `docs/product/design.md` — no more, no less.
- **Nav links** must match the Navigation Structure table in `docs/product/design.md` exactly.
- **Auth badges**: Show a visual `auth` or `admin` label on nav items that have auth gates.
- **Key elements**: Render each "Key elements" value from `docs/product/design.md` as styled
  preview blocks. Do NOT implement real data flows, but do show component hierarchy.
- **Primary action**: each page preview must visibly show its `Primary action`.
- **Critical states**: include at least one representative `empty` or `error` state panel
  somewhere in the preview, and reflect route-specific states where they change layout.
- **Preview note**: Every section ends with
  `"Preview direction only — see docs/product/frontend-design.md and docs/product/design.md#<route>"`.
- **Reference Anchors**: if the UI brief says "preserve existing", keep the preview aligned
  with the current product language instead of inventing a new aesthetic.
- **Theme**: follow Q16 exactly. `both themes` means show the preview in one primary theme,
  but note that the system is expected to support both.
- **Desktop**: Add the window-chrome title bar wrapper.
- **Mobile**: Use the phone-frame variant. Tab bar shows primary screens; secondary screens
  accessible from the screen-selector panel beside the phone.
- Do NOT add `docs/product/design-preview.html` to `.gitignore`. Commit it — it is a project artifact.

---

### Project-Type-Specific Scaffolds

The file structure above is the **Web App default**. For other project types, replace
the `src/` layout and adjust which files are generated. The harness layer (docs/, scripts/,
schemas/, .claude/, .codex/) stays identical for every project type. The git hook setup
varies by runtime: `.husky/` for Node/TS projects, `.pre-commit-config.yaml` for Python/Go,
`.githooks/` for Rust (see `docs/agent/harness-native.md` for non-Node details).

### API Style Scaffold Differences (Web App + Backend)

The `src/` layout changes based on the API style chosen in Phase 2:

**REST API (Express / Fastify / Hono):**
```
src/
├── routes/                ← one file per resource (users.ts, posts.ts)
│   └── index.ts           ← route registry
├── controllers/           ← request → validate → service → response
├── services/              ← business logic (framework-agnostic)
├── models/                ← DB models / Prisma schema re-exports
├── middleware/             ← auth, error handler, rate limiter, security headers
├── validators/            ← zod / joi schemas for request bodies
└── lib/                   ← logger, errors, env, config
```
Generate: `validators/` with zod schemas matching each route's request/response.
Generate: OpenAPI spec (`docs/openapi.yaml`) — auto-generate from zod using `zod-to-openapi`
or hand-write. The AGENTS.md should point to this file for API reference.

**tRPC (Next.js / standalone):**
```
src/
├── server/
│   ├── routers/           ← one file per domain (users.ts, posts.ts)
│   │   └── index.ts       ← root router (mergeRouters)
│   ├── procedures/        ← shared procedure builders (public, authed, admin)
│   ├── context.ts         ← request context (session, DB)
│   └── trpc.ts            ← initTRPC + middleware
├── client/                ← tRPC client hooks (if separate frontend)
│   └── trpc.ts
└── lib/                   ← logger, errors, env, config
```
Key: input/output schemas use zod — co-located with each router file.
No `controllers/` or `validators/` — tRPC handles both via procedure definitions.
No OpenAPI spec needed (unless exposing a public API — then use `trpc-openapi`).

**GraphQL (Apollo / Yoga / Pothos):**
```
src/
├── schema/
│   ├── types/             ← one file per type (User.ts, Post.ts)
│   │   └── index.ts       ← merged type defs
│   ├── resolvers/         ← one file per type (users.ts, posts.ts)
│   │   └── index.ts       ← merged resolvers
│   ├── inputs/            ← input types + validation
│   └── schema.ts          ← buildSchema / makeExecutableSchema
├── services/              ← business logic (shared with resolvers)
├── context.ts             ← request context (session, dataloaders)
├── middleware/             ← auth, error formatting
└── lib/                   ← logger, errors, env, config
```
Generate: `codegen.ts` for TypeScript type generation from schema (if schema-first).
Recommend Pothos for code-first (TypeScript-native) or schema-first with `graphql-codegen`.
Warn: N+1 queries — always use DataLoader pattern for relational data.

**No separate API (Next.js API routes / Remix loaders):**
```
src/app/
├── api/                   ← Next.js route handlers
│   ├── users/
│   │   └── route.ts       ← GET, POST handlers
│   └── auth/
│       └── [...all]/
│           └── route.ts
├── (pages)/               ← page components with server actions
└── lib/                   ← server-only utilities, DB client
```
No separate backend — server logic lives in API routes and server actions.
Validation: zod schemas in `src/lib/validators/` shared between client and server.

For any **Desktop App**, read `docs/agent/skill-desktop.md` before generating files.
The layouts below are only the canonical tree shape; the desktop reference contains the
security, IPC/command, updater, and packaging rules.

**If CLI Tool:**

```
src/
├── commands/              ← one file per command (e.g. init.ts, deploy.ts, config.ts)
│   └── index.ts           ← command registry + top-level parser
├── lib/                   ← shared utilities (errors, logger, config loader, output formatters)
│   ├── errors.ts
│   ├── logger.ts
│   ├── config.ts          ← read/write config files (~/.myapp/config.json)
│   └── output.ts          ← table / JSON / plain text formatters
├── prompts/               ← interactive prompts (if needed — inquirer / @clack/prompts)
└── index.ts               ← entry point: parse args → dispatch to command
```

Additional files for CLI projects:
- `package.json` must include `"bin": { "<cli-name>": "./dist/index.js" }` and `"type": "module"`
- `tsup.config.ts` or `esbuild` config for bundling to single distributable file
- If publishing to npm: `"files": ["dist"]`, `"main": "./dist/index.js"`, `.npmignore`
- If distributing as binary: `pkg` config or `bun build --compile` in CI
- **No Docker, no docker-compose** — skip unless user explicitly requests
- **No frontend-design.md** — skip for non-interactive CLIs
- **No middleware/** — CLIs don't have HTTP middleware
- **No health endpoints** — CLI NFRs focus on: startup time, error messages, exit codes

```
# CLI-specific package.json additions:
{
  "name": "<cli-name>",
  "version": "0.0.1",
  "type": "module",
  "bin": { "<cli-name>": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "harness": "tsx scripts/harness.ts",
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "prepare": "husky"
  }
}
```

**If Agent Tool / MCP Server:**

```
<project-name>/
├── SKILL.md               ← Agent discovery file — how LLMs find and use this tool
├── AGENTS.md + CLAUDE.md  ← Developer agent instructions (same as other project types)
├── src/
│   ├── server.ts              ← MCP server entry point (stdio or SSE transport)
│   ├── tools/                 ← one file per tool
│   │   ├── index.ts           ← tool registry
│   │   ├── search.ts          ← example: search tool
│   │   └── create.ts          ← example: create tool
│   ├── resources/             ← MCP resources (if applicable)
│   │   └── index.ts
│   ├── prompts/               ← MCP prompt templates (if applicable)
│   │   └── index.ts
│   ├── lib/                   ← shared utilities
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── config.ts
│   │   └── api-client.ts      ← external API client (if tool calls external services)
│   └── index.ts               ← entry point: start server
├── docs/
│   ├── PRD.md
│   ├── PLAN.md
│   └── api-reference.md       ← Tool schemas, input/output examples, error codes
├── tests/
│   ├── tools/                 ← one test file per tool
│   └── integration/           ← MCP protocol lifecycle tests
├── scripts/
│   └── harness.ts + harness/  ← harness CLI (same as other project types)
└── schemas/
    └── progress.schema.json
```

Additional files for MCP/Agent projects:
- `SKILL.md`: **Always generate this.** It's the discovery file — tells agents what this
  tool does, what tools are available, how to connect, and what inputs/outputs to expect.
  See SKILL.md template in `skill-artifacts.md`.
- `package.json`: `"type": "module"`, `"bin": { "<server-name>": "./dist/index.js" }`
- Transport config: stdio (default for Claude Desktop) or SSE (for web integrations / claude.ai)
- `docs/api-reference.md`: Auto-generated or hand-written tool reference with JSON Schema
  for every tool — this is what the SKILL.md points to for detailed specs
- **No frontend-design.md** — no UI
- **No middleware/** — MCP servers don't use HTTP middleware
- If deploying as Docker: include Dockerfile + compose for self-hosting
- If publishing to npm: include `bin` field for `npx <server-name>` usage
- If deploying as remote SSE server (e.g. for claude.ai connectors): include SSE transport
  setup, CORS config, health endpoint at `/health`, and connection URL in SKILL.md

```json
// Example MCP server package.json:
{
  "name": "<server-name>",
  "version": "0.0.1",
  "type": "module",
  "bin": { "<server-name>": "./dist/index.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm",
    "dev": "tsx src/index.ts",
    "harness": "tsx scripts/harness.ts"
  }
}
```

**If Desktop App (Electron):**

```
src/
├── main/                  ← main process (Node.js)
│   ├── index.ts           ← app lifecycle, window management
│   ├── ipc.ts             ← IPC handlers (main ↔ renderer)
│   └── menu.ts            ← native menus
├── renderer/              ← renderer process (React/Vue/etc.)
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   └── lib/
├── preload/               ← preload scripts (context bridge)
│   └── index.ts
├── shared/                ← types/utils shared between main and renderer
│   └── types.ts
└── lib/                   ← shared utilities
    ├── errors.ts
    └── logger.ts
```

**If Desktop App (Tauri):**

```
src/                       ← frontend (React/Vue/Svelte)
├── App.tsx
├── pages/
├── components/
└── lib/
src-tauri/                 ← Rust backend (auto-generated by Tauri)
├── src/
│   ├── main.rs
│   └── commands.rs        ← Tauri command handlers
├── Cargo.toml
└── tauri.conf.json
```

Desktop notes:
- **Include frontend-design.md** — desktops have UI
- **Include docs/product/release.md** — desktop packaging, signing, updater, and smoke-test contract
- Electron: `electron-builder` or `electron-forge` for packaging
- Tauri: `tauri build` for packaging
- Use `docs/agent/skill-desktop.md` as the default source of truth
- Only run targeted web search for release-signing, updater, notarization, or version-specific
  plugin/build details that are not already covered there

**If Python project (CLI or API):**

```
pyproject.toml
uv.lock
Makefile
src/
├── <package_name>/
│   ├── __init__.py
│   ├── cli.py             ← entry point (click/typer)
│   ├── commands/          ← one file per command group
│   ├── lib/               ← shared utilities
│   └── config.py
tests/
├── unit/
├── integration/
└── conftest.py
```

Python notes:
- Use `pyproject.toml` for project metadata, build backend, Ruff, mypy, pytest, and
  CLI entrypoints (see `project-configs.md`)
- Default package manager: `uv` unless the user already standardized on Poetry or PDM
- **Harness CLI decision:** If Node.js is available (recommended), use the TypeScript CLI
  as-is — it manages docs and git workflow without needing to understand Python source.
  If the user explicitly refuses Node.js, use `docs/agent/harness-native.md` to generate
  `scripts/harness.sh` (shell-based CLI) + `.pre-commit-config.yaml` (replaces husky).
  Note the feature tradeoffs in AGENTS.md / CLAUDE.md.
- `Makefile` replaces `package.json scripts` as the command interface

**If Go project:**

```
go.mod / go.work
Makefile
.golangci.yml
cmd/
├── <app-name>/
│   └── main.go            ← entry point
internal/                  ← private packages
├── commands/              ← CLI commands (cobra)
├── config/
├── service/
└── lib/
pkg/                       ← public packages (if any)
tests/
└── ...
```

Go notes:
- Use `golangci-lint` for linting (see project-configs.md)
- Use `go test ./...` for testing
- Use `go.work` when the repo has multiple Go modules or the Go service lives inside a larger
  monorepo. Use a single root `go.mod` for standalone Go projects.
- **Harness CLI decision:** same as Python — use TypeScript CLI with Node.js (recommended),
  or `docs/agent/harness-native.md` for the shell-based alternative if Node.js is unwanted.
- Dockerfile: `FROM golang:1.22-alpine AS build` → `FROM alpine:3.19` (multi-stage)

---

**If Rust project (CLI or service):**

```
Cargo.toml
Cargo.lock
clippy.toml
Makefile
src/
├── main.rs                ← binary entry point
├── lib.rs                 ← optional shared library surface
└── commands/              ← clap commands or service modules
crates/                    ← optional workspace members for larger projects
tests/
└── integration/
```

Rust notes:
- Use a root Cargo workspace when the project has multiple crates or lives inside a larger
  monorepo. Keep shared versions and common dependencies in `[workspace.dependencies]`.
- Generate `clippy.toml`, run `cargo fmt`, `cargo clippy -- -D warnings`, and `cargo test`
  through the root `Makefile`.
- For CLI binaries, default to `clap` derive APIs. For services, keep HTTP/runtime setup in
  `src/main.rs` and domain logic in library crates or modules.
- **Harness CLI decision:** same as Python/Go — use TypeScript CLI with Node.js (recommended),
  or `docs/agent/harness-native.md` for the shell-based alternative. Rust projects use
  `.githooks/` instead of pre-commit framework (see harness-native.md).
- If the project is `Tauri`, the Rust side already lives under `src-tauri/`; still apply the
  same lint, test, and workspace rules.

---

### Companion Skill Scaffold (when COMPANION_SKILL=true)

When COMPANION_SKILL is true, generate the following alongside the main project scaffold.
This uses the same convention as claude.ai / OpenClaw skills (YAML frontmatter + markdown body).

**File placement:**

```
<project-root>/
├── SKILL.md                     ← companion skill discovery file
├── docs/
│   ├── index.md                 ← human navigation entrypoint
│   ├── product/                 ← human-facing product docs
│   └── agent/                   ← companion skill reference docs (agent-facing)
│       ├── api-guide.md         ← Web App/API: endpoint reference for agents
│       ├── commands.md          ← CLI: command reference for agents
│       ├── agent-workflows.md   ← common agent workflows with this project
│       └── data-model.md        ← data entities agents will read/write
├── AGENTS.md                    ← (unchanged — developer agent instructions)
└── src/
```

> **Inside generated projects:** `docs/index.md` is the human entrypoint, `docs/product/`
> holds human-facing product/design docs, and `docs/agent/` holds companion agent reference
> docs. Keep them separated so humans can review quickly without losing the detailed
> agent reference layer.

---

**SKILL.md template (companion skill):**

```markdown
---
name: <project-name>
description: >
  Operate and integrate with <project-name>. Use this skill when an agent needs to
  [call its API / run CLI commands / query data / trigger workflows — fill in from project].
  <One sentence on what the project does and what agents can accomplish with it.>
---

# <Project Name> — Companion Skill

## What This Skill Does

<2-3 sentences: what an AI agent can accomplish by using this skill.
Concrete examples: "create and query tasks via REST API", "run deploy commands",
"read and update database records".>

## How This Skill Is Structured

| Reference | When to read |
|-----------|-------------|
| `docs/agent/api-guide.md` | When calling the project's API (Web App/API projects) |
| `docs/agent/commands.md` | When running CLI commands (CLI/tool projects) |
| `docs/agent/agent-workflows.md` | For common agent workflows with this project |
| `docs/agent/data-model.md` | When reading or writing data |

> Skip rows that don't apply to this project type.

## Quick Start

<Auth setup + first successful call/command>

**Web App/API example:**
```bash
export API_KEY=<your-key>
curl -H "Authorization: Bearer $API_KEY" https://<domain>/api/health
```

**CLI example:**
```bash
npx <cli-name> --help
npx <cli-name> <first-command>
```

## Common Agent Workflows

1. **<Workflow name>** — <one sentence description>
   → See `docs/agent/agent-workflows.md#<anchor>`

2. **<Workflow name>** — <one sentence description>
   → See `docs/agent/agent-workflows.md#<anchor>`

<List 3-5 most common things an agent would do.>
```

---

**`docs/agent/api-guide.md` template (Web App / API projects):**

```markdown
## Agent API Guide — <Project Name>

Base URL: `https://<domain>/api`
Auth: `Authorization: Bearer $API_KEY`

### <Resource 1>

**GET /api/<resource>** — list all
Query params: `?status=<value>&limit=<n>`
Returns: `[{ id, <fields> }]`

**POST /api/<resource>** — create
Body: `{ <required fields> }`
Returns: `{ id, <fields>, created_at }`

**GET /api/<resource>/:id** — get one
Returns: `{ id, <fields> }` or 404

### Error Codes
| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API_KEY |
| 404 | Resource not found |
| 422 | Validation error — see `errors` array in response |
```

---

**`docs/agent/commands.md` template (CLI Tool projects):**

````markdown
## Agent Command Reference — <cli-name>

### `<cli-name> <command-1>`
<One sentence: what this command does.>

```bash
<cli-name> <command-1> [options]
  --env <value>     Target environment (dev, staging, prod)
  --format json     Output as JSON (default: table)
```

JSON output shape: `{ status, result, timestamp }`

### `<cli-name> <command-2>`
...
````

---

**`docs/agent/agent-workflows.md` template (all project types):**

```markdown
## Agent Workflows — <Project Name>

### <Workflow 1 name>

**Goal:** <What the agent is trying to achieve>
**Steps:**
1. <API call or command with example>
2. <Next step>
3. <Final step + expected output>

### <Workflow 2 name>
...
```

---

**`docs/agent/data-model.md` template (all project types with a database):**

```markdown
## Data Model — <Project Name>

### <Entity 1>

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `<field>` | string | <description> |
| `created_at` | ISO 8601 | Creation timestamp |

### <Entity 2>
...
```

---

**AGENTS.md / CLAUDE.md addition:**

Add a "Companion AI Skill" section (after the existing Quick Start section):

```markdown
## Companion AI Skill

This project includes a companion skill for AI agents that need to **operate** this project
(call its API, run commands, query data). To use it:

- **Claude Code:** `SKILL.md` is at the project root — Claude Code reads it automatically.
- **Codex:** Treat the project-root `SKILL.md` as a discoverability artifact for compatible agent
  ecosystems, not as Codex's primary execution entrypoint. Codex should still start from `AGENTS.md`.
- **claude.ai:** Upload this project folder as a custom skill.
- **OpenClaw:** Symlink or copy to `~/.openclaw/skills/<project-name>/`.

Key reference files:
- `docs/agent/api-guide.md` — API endpoints and auth
- `docs/agent/agent-workflows.md` — Common agent workflows
- `docs/agent/data-model.md` — Data entities
```

---

**Generation rules:**
- Generate `docs/agent/api-guide.md` only if the project has an API (Web App, API, tRPC, etc.)
- Generate `docs/agent/commands.md` only if the project is a CLI Tool
- Always generate `docs/agent/agent-workflows.md` and `docs/agent/data-model.md`
  (unless project type has no data model — e.g. static site — then omit data-model.md)
- The SKILL.md `description` frontmatter must be concrete — derive from Phase 1 Step 2
  answers and PRD FRs. Do not use generic placeholder text.
- Keep SKILL.md under 150 lines — it is a discovery file, not full documentation.
  Point to `docs/agent/` for details.
- `docs/agent/` files may be longer — they are the detailed agent reference layer.
- Generate `docs/index.md` so humans can immediately find runtime state, `docs/product/`,
  `docs/agent/`, and `docs/gitbook/`.

---

### Phase 3 Exit Gate — Pre-flight Checklist

**Do not hand off to Phase 4 or load `skill-execution.md` until this checklist is complete.**

Required artifacts:

- `AGENTS.md` and `CLAUDE.md` both exist and are byte-for-byte identical
- `ARCHITECTURE.md`, `docs/PRD.md`, `docs/PLAN.md`, `docs/progress.json`, and
  `docs/learnings.md` exist
- `docs/index.md` exists and links runtime state docs, `docs/product/`, `docs/agent/`,
  and `docs/gitbook/`
- `schemas/progress.schema.json` exists and matches the generated `progress.json` shape
- CLI entry point exists for the chosen runtime:
  - **Node/TS:** `scripts/harness.ts` and all referenced `scripts/harness/` modules
  - **Non-Node (native):** `scripts/harness.sh` (executable) and `Makefile` with `validate` target
- Stack-native manifests exist for the chosen runtime:
  `package.json`, `pyproject.toml`, `go.mod` / `go.work`, `Cargo.toml`, `tauri.conf.json`, etc.
- The generated test layout exists: at minimum `tests/unit/`, plus integration/e2e folders when
  the stack uses them
- `.claude/settings.json`, `.codex/config.toml`, `.gitignore`, and `.env.example` are present
- Git hook setup is present for the chosen runtime:
  - **Node/TS projects:** `.husky/` with `pre-commit`, `commit-msg`, `pre-push` hooks
  - **Non-Node projects (native CLI):** `.pre-commit-config.yaml` (Python/Go) or `.githooks/`
    (Rust) as specified in `harness-native.md` — `.husky/` is NOT required and must NOT
    be listed as missing for these projects
- **Web App / Desktop / Mobile projects:** `docs/product/design-preview.html` exists, is a valid
  HTML file, and contains one page/screen section per entry in `docs/product/design.md`

Required consistency checks:

- `PLAN.md` task IDs match the dependency graph and active milestone state in `progress.json`
- The initial milestones from `docs/exec-plans/active/001-initial-setup.md` are already
  materialized in `docs/PLAN.md` and `docs/progress.json`
- Every task marked available in `progress.json` actually exists in `PLAN.md`
- The generated repo is handoff-ready for both Claude Code and Codex: a second agent can open
  the repo, read `AGENTS.md` / `CLAUDE.md`, inspect `docs/PLAN.md` + `docs/progress.json`, and
  continue without relying on the original scaffold chat history
- `progress.schema.json` includes every required field written by the scaffold
- `AGENTS.md` / `CLAUDE.md` contains both the fixed `Interaction Rules` section and the fixed
  `Iron Rules` section from `skill-artifacts.md`
- The quick-start commands in `AGENTS.md` / `CLAUDE.md` match the actual package manager and
  runtime chosen in Phase 1, and any install/sync command is framed as a "run this when you are
  ready to start the first milestone" activation step rather than something Phase 3 already did
- The initial scaffold only declares the minimal dependency set needed for the generated code,
  harness runtime, and validation toolchain. Milestone-specific feature/integration packages are
  deferred until the milestone that implements them
- No milestone task is treated as complete solely because the scaffold generated placeholder
  files, route shells, stubs, schemas, or config. Product milestones stay pending until their
  `Done When` criteria are actually met in execution
- **Frontend / UI projects** (web, mobile, desktop): `docs/product/frontend-design.md` exists and
  AGENTS.md Iron Rule 5 references it. If it was not generated via an active `frontend-design`
  skill session or a local copy, it must still be generated directly from the Phase 1 Step 5
  call 5 answers — do not fall back to a generic minimal template. See SKILL.md strategy.
  The file **must reflect call 5 (design) answers** from Phase 1 Step 5:
  - "Component System" section: names the chosen component library (Q11) and import conventions
  - "Visual Language" section: documents color tone, spacing, and font style (Q12 aesthetic)
  - "Layout Patterns" section: documents the primary navigation structure and page skeleton (Q13)
  - "Reference Anchors" section: captures Q14 and states whether to preserve an existing UI,
    use external inspirations, or derive directly from the product brief
  - "Preview Rendering Rules" section: captures Q15/Q16 and tells the preview how dense,
    theme-forward, and CTA-heavy it should be
  If call 5 was skipped (CLI Tool / MCP Server), these sections are omitted.
  Pure CLI tools and MCP servers are exempt from `frontend-design.md` entirely.
- **Companion skill docs:** `docs/agent/agent-workflows.md` exists for every generated project,
  and `docs/agent/api-guide.md` / `docs/agent/commands.md` / `docs/agent/data-model.md` are
  present when the project type requires them
- `docs/gitbook/SUMMARY.md`, `docs/gitbook/README.md`, and `docs/gitbook/quickstart.md`
  exist and contain substantive content derived from the PRD (not placeholder text).
  All new projects require this — CLI tools and MCP servers are not exempt.
- Desktop projects include the shell-specific files from `skill-desktop.md`
- Desktop projects: `docs/product/release.md` exists and documents packaging target, signing /
  notarization expectations, updater channel, and a manual smoke checklist
- Mixed-language monorepos include the root orchestration file (`Makefile` or `justfile`) plus
  native manifests in each app
- Non-Node projects using the native CLI: `scripts/harness.sh` exists and is executable,
  `Makefile` has a `validate` target, `.pre-commit-config.yaml` or `.githooks/` is set up,
  and `.claude/settings.json` uses `Bash(bash scripts/harness.sh *)` instead of
  `Bash(npx tsx scripts/harness.ts *)`
- **Page inventory** (Web App / Mobile / Desktop projects):
  - `docs/product/design.md` exists and contains at least 2 page entries
  - Every page entry has a route, name, purpose, `Primary action`, and `Critical states`
    (no placeholder text)
  - The Navigation Structure table in `docs/product/design.md` matches the nav component
    generated in the scaffold
  - Each page in the inventory has a corresponding skeleton file in the source tree
    (e.g. `src/app/<route>/page.tsx` for Next.js App Router)
  - `docs/product/design-preview.html` exists and reflects the same routes plus at least one
    representative non-happy-path state

- **Companion Skill** (when COMPANION_SKILL=true):
  - `SKILL.md` exists at project root, frontmatter `description` contains project-specific
    content (not placeholder text)
  - `docs/agent/agent-workflows.md` exists with at least 2 workflows
  - `docs/agent/api-guide.md` exists (Web App/API projects) OR
    `docs/agent/commands.md` exists (CLI projects)
  - AGENTS.md / CLAUDE.md contains a "Companion AI Skill" section

If any artifact is missing, repair it in **Phase 3**. Do not defer missing files to execution.
Phase 4 assumes the scaffold is internally consistent; a missing file such as
`schemas/progress.schema.json` or a broken task graph is a scaffold bug, not an execution task.

### Design Preview Review Gate (Web App / Mobile / Desktop)

This is the canonical and only formal approval gate before Phase 4 for greenfield projects.
Do not add a second approval gate in `skill-execution.md`.

After the Phase 3 Exit Gate passes and all artifacts are generated:

1. Tell the user:
   > "Phase 3 is complete. I've generated `docs/product/design-preview.html` — a browser-viewable
   > mid-fi styled preview of your UI direction. Please open it and confirm the layout,
   > visual direction, density, and CTA hierarchy look right
   > before I begin Phase 4 execution.
   > Path: `<absolute-or-relative path to docs/product/design-preview.html>`"
   >
   > "This scaffold is foundation-only. The milestone plan is still ahead of us; placeholder
   > files and shells are not treated as completed feature work."

2. **Wait for explicit user confirmation** before loading `skill-execution.md` or starting
   Phase 4. Do not auto-proceed.

3. If the user requests changes to the page structure:
   - Update `docs/product/design.md` first for route/layout/state changes
   - Update `docs/product/frontend-design.md` first for visual language, density, theme, or
     component hierarchy changes
   - Regenerate the affected sections of `docs/product/design-preview.html`
   - Re-run the page inventory Exit Gate check
   - Ask for confirmation again

4. Once the user confirms ("ok", "looks good", "proceed", or equivalent):
   → Load `docs/agent/skill-execution.md` and begin Phase 4.

