# README.md Public Template

This is the README for **GitHub visitors / external developers**, placed at the repo root.
The Docs Generator creates a draft in Phase 4, and the final version is completed in Phase 6.

---

```markdown
<div align="center">

# [PROJECT_DISPLAY_NAME]

[One-sentence description, clearly stating what it is and what it's useful for]

[![CI](https://github.com/[ORG]/[REPO]/actions/workflows/ci.yml/badge.svg)](...)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://[PROJECT_URL])

[DEMO_GIF_OR_SCREENSHOT]

**[Demo](https://[PROJECT_URL])** · **[Docs](https://[GITBOOK_URL])** · **[Report Bug](https://github.com/[ORG]/[REPO]/issues)**

</div>

---

## What is [PROJECT_NAME]?

[2-3 sentences: what problem it solves, who it's built for, core differentiator]

## ✨ Features

- **[Feature 1]** — [one-sentence description]
- **[Feature 2]** — [one-sentence description]
- **[Feature 3]** — [one-sentence description]

## 🚀 Quick Start

### Prerequisites

- [Tool 1] [version]
- [Tool 2] [version]

### Install

\`\`\`bash
git clone https://github.com/[ORG]/[REPO].git
cd [REPO]
# Install dependencies with the project's package manager
# Example: bun install / npm install / uv sync / cargo build

# Create local env/config from the provided example if required
# Example: cp .env.example .env.local

# Start the local app using the project's documented dev command
\`\`\`

Open the local URL or runtime output documented by the project to verify the app starts correctly.

## 📖 Documentation

Full documentation is available at **[docs.example.com](https://[GITBOOK_URL])**.

| Document | Link |
|----------|------|
| Getting Started | [docs/getting-started](https://[GITBOOK_URL]/getting-started) |
| API Reference | [docs/api-reference](https://[GITBOOK_URL]/api-reference) |
| Guides | [docs/guides](https://[GITBOOK_URL]/guides) |

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | [Tech] |
| Backend | [Tech] |
| Database | [Tech] |
| Deploy | [Tech] |

## 📁 Project Structure

\`\`\`
[REPO]/
├── src/
│   ├── app/            # UI / API routes
│   ├── services/       # Business logic
│   ├── lib/            # Utilities
│   └── types/          # Type definitions
├── docs/
│   ├── gitbook/        # Public documentation
│   ├── PRD.md          # Product requirements
│   └── adr/            # Architecture decisions
└── ...
\`\`\`

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

\`\`\`bash
# 1. Fork and clone
git clone https://github.com/[YOUR_FORK]/[REPO].git

# 2. Create a feature branch
git checkout -b feat/your-feature

# 3. Make your changes and test
Run the project's documented verification commands

# 4. Open a Pull Request
\`\`\`

## 📄 License

[MIT](LICENSE) © [YEAR] [AUTHOR]
```

---

## Generation Timing and Responsibilities

| Timing | Content |
|--------|---------|
| Phase 4 Scaffold | Draft: badges, Tech Stack table, Project Structure (extracted from ARCHITECTURE.md) |
| Phase 5 each Milestone | Demo GIF placeholder, Features update |
| Phase 6 final | Complete version: actual demo screenshot descriptions, full Features, Contributing Guide |

## Badge Generation

```bash
# CI badge: replace [ORG] and [REPO] with actual values
[![CI](https://github.com/[ORG]/[REPO]/actions/workflows/ci.yml/badge.svg)]

# Coverage badge (requires codecov or coveralls)
[![Coverage](https://codecov.io/gh/[ORG]/[REPO]/branch/main/graph/badge.svg)]

# Version badge (extracted from package.json)
[![npm version](https://img.shields.io/npm/v/[PACKAGE_NAME])]
```
