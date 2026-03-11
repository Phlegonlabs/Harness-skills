# Project Config Templates

Ready-to-use configs for all supported stacks. Copy and adapt to the project.

---

## TypeScript — tsconfig.json

### Base (strict, all projects)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "build"]
}
```

### Next.js additions

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Node.js API

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Rules:**
- `strict: true` is non-negotiable — never set to false
- `noUncheckedIndexedAccess: true` catches index access bugs at compile time
- Always configure `paths` with `@/*` alias for clean imports
- `verbatimModuleSyntax` enforces `import type` (pairs with ESLint rule)

---

## Prettier — .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": []
}
```

### .prettierignore

```
dist/
build/
.next/
out/
node_modules/
pnpm-lock.yaml
bun.lockb
package-lock.json
coverage/
*.min.js
```

**Rules:**
- Single quotes, semicolons, trailing commas — consistent across all projects
- `printWidth: 100` — wider than default 80, reduces unnecessary wrapping
- Add framework-specific plugins as needed (e.g., `prettier-plugin-tailwindcss`)

---

## Vitest — vitest.config.ts

### Base

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.*',
        '**/*.d.ts',
        'src/lib/env.ts',
      ],
    },
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### React / Next.js (with jsdom)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        '**/*.config.*',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### tests/setup.ts (for React)

```typescript
import '@testing-library/jest-dom/vitest';
```

**Dependencies:**
```json
{
  "vitest": "^3.0.0",
  "@vitest/coverage-v8": "^3.0.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.0.0",
  "@testing-library/user-event": "^14.0.0",
  "jsdom": "^25.0.0"
}
```

---

## Monorepo Workspace Config

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Turborepo — turbo.json (optional — add when 3+ workspaces or CI performance matters)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Install: `<pkg-mgr> add -D turbo -w` (workspace root)

Root package.json scripts when using Turborepo:
```json
{
  "scripts": {
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "dev": "turbo dev",
    "validate": "turbo lint type-check test",
    "harness": "tsx scripts/harness.ts"
  }
}
```

Without Turborepo (simpler — use for 1-2 workspaces):
```json
{
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "dev": "pnpm -r dev",
    "validate": "pnpm -r lint && pnpm -r run type-check && pnpm -r test",
    "harness": "tsx scripts/harness.ts"
  }
}
```

**When to use Turborepo:**
- 3+ workspace packages
- CI taking >3 minutes due to redundant builds
- Teams working on different packages in parallel
- Remote caching needed (Vercel Remote Cache or self-hosted)

**When to skip Turborepo:**
- 1-2 workspace packages (pnpm -r is fine)
- Solo developer
- Project doesn't have a build step (pure API / CLI)

---

## Docker

### Dockerfile (Node.js multi-stage)

```dockerfile
# === Build stage ===
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# === Production stage ===
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup \
 && adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

USER appuser
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

Adapt: replace `pnpm` commands with `bun` or `npm` based on chosen package manager.
Replace `node:22-alpine` with `oven/bun:1-alpine` for Bun projects.

### docker-compose.yml (with PostgreSQL)

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    env_file: .env
    volumes:
      - ./src:/app/src
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-appdb}
    ports:
      - '5432:5432'
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  db_data:
```

Swap `postgres:16-alpine` for the chosen DB image (MongoDB, MySQL, etc.).

---

## CI — GitHub Actions

### ci.yml

```yaml
name: CI
on:
  pull_request:
    branches: [main, 'milestone/*']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm run validate

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm audit --audit-level=high
```

### deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm run validate
      - run: pnpm run build

      # ── Deploy — uncomment ONE section matching your target ──────────

      # Vercel (managed — usually auto-deploys on push, use this for manual control):
      # - uses: amondnet/vercel-action@v25
      #   with:
      #     vercel-token: ${{ secrets.VERCEL_TOKEN }}
      #     vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
      #     vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      #     vercel-args: '--prod'

      # Cloudflare Pages:
      # - uses: cloudflare/wrangler-action@v3
      #   with:
      #     apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      #     accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      #     command: pages deploy ./out --project-name=<project-name>

      # Cloudflare Workers:
      # - uses: cloudflare/wrangler-action@v3
      #   with:
      #     apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      #     command: deploy

      # Cloudflare D1 migrations (run before deploy if using D1):
      # - uses: cloudflare/wrangler-action@v3
      #   with:
      #     apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      #     command: d1 migrations apply <db-name> --remote

      # Fly.io:
      # - uses: superfly/flyctl-actions/setup-flyctl@master
      # - run: flyctl deploy --remote-only
      #   env:
      #     FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      # Railway (auto-deploys on push — CI just validates):
      # Railway connects directly to your repo. No deploy step needed here.
      # Just ensure validate passes. Railway triggers on push to main.

      # Render (auto-deploys on push — CI just validates):
      # Render connects directly to your repo. No deploy step needed here.
      # Or use deploy hook:
      # - run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK_URL }}

      # VPS via SSH + Docker Compose:
      # - uses: appleboy/ssh-action@v1
      #   with:
      #     host: ${{ secrets.VPS_HOST }}
      #     username: ${{ secrets.VPS_USER }}
      #     key: ${{ secrets.VPS_SSH_KEY }}
      #     script: |
      #       cd /opt/<project-name>
      #       git pull origin main
      #       docker compose pull
      #       docker compose up -d --remove-orphans

      # VPS via Kamal (zero-downtime Docker deploy):
      # - uses: ruby/setup-ruby@v1
      #   with:
      #     ruby-version: '3.3'
      # - run: gem install kamal
      # - run: kamal deploy
      #   env:
      #     KAMAL_REGISTRY_PASSWORD: ${{ secrets.KAMAL_REGISTRY_PASSWORD }}

      # AWS ECS (Docker → ECR → ECS):
      # - uses: aws-actions/configure-aws-credentials@v4
      #   with:
      #     aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      #     aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      #     aws-region: us-east-1
      # - uses: aws-actions/amazon-ecr-login@v2
      # - run: |
      #     docker build -t $ECR_REGISTRY/<project-name>:${{ github.sha }} .
      #     docker push $ECR_REGISTRY/<project-name>:${{ github.sha }}
      # - run: |
      #     aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment

      # Google Cloud Run:
      # - uses: google-github-actions/auth@v2
      #   with:
      #     credentials_json: ${{ secrets.GCP_SA_KEY }}
      # - uses: google-github-actions/deploy-cloudrun@v2
      #   with:
      #     service: <service-name>
      #     region: us-central1
      #     source: .

      # Netlify:
      # - uses: nwtgck/actions-netlify@v3
      #   with:
      #     publish-dir: './out'
      #     production-deploy: true
      #   env:
      #     NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
      #     NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

**Adapt:** replace `pnpm` with `bun` or `npm`. For Bun, use `oven-sh/setup-bun@v2`.
For npm, remove the pnpm setup step — Node.js includes npm.

### Platform config files

Generate the appropriate config file based on the chosen deploy target:

```
# Vercel — vercel.json (optional, Vercel auto-detects most frameworks)
{
  "framework": "nextjs",
  "buildCommand": "pnpm run build",
  "outputDirectory": ".next"
}

# Cloudflare Pages — wrangler.toml
name = "<project-name>"
compatibility_date = "2025-01-01"
pages_build_output_dir = "./out"

# Cloudflare Workers — wrangler.toml (minimal)
name = "<project-name>"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Cloudflare Workers — wrangler.toml (full-stack with D1 + KV + R2)
# Use this when the project needs database, cache, and/or object storage.
# Uncomment the bindings the project actually uses.
name = "<project-name>"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database (SQLite at edge)
# Run: wrangler d1 create <project-name>-db
# Then paste the returned database_id below.
# [[d1_databases]]
# binding = "DB"
# database_name = "<project-name>-db"
# database_id = "<from wrangler d1 create>"

# KV Namespace (key-value cache)
# Run: wrangler kv namespace create CACHE
# [[kv_namespaces]]
# binding = "CACHE"
# id = "<from wrangler kv namespace create>"

# R2 Bucket (S3-compatible object storage)
# Run: wrangler r2 bucket create <project-name>-uploads
# [[r2_buckets]]
# binding = "UPLOADS"
# bucket_name = "<project-name>-uploads"

# Queues (async task processing)
# [[queues.producers]]
# queue = "<project-name>-tasks"
# binding = "TASK_QUEUE"
# [[queues.consumers]]
# queue = "<project-name>-tasks"

# Cron Triggers
# [triggers]
# crons = ["0 * * * *"]  # every hour

# Environment-specific overrides
# [env.staging]
# name = "<project-name>-staging"
# [env.staging.vars]
# ENVIRONMENT = "staging"
# [env.production]
# name = "<project-name>"
# [env.production.vars]
# ENVIRONMENT = "production"

# Local development env vars (create .dev.vars, NOT .env)
# .dev.vars is Cloudflare's equivalent of .env — wrangler reads it automatically.
# Never commit .dev.vars. Add to .gitignore.

# Fly.io — fly.toml
app = "<project-name>"
primary_region = "iad"
[build]
  dockerfile = "Dockerfile"
[http_service]
  internal_port = 3000
  force_https = true

# Railway — railway.toml (optional)
[build]
  builder = "dockerfile"
[deploy]
  healthcheckPath = "/health"
  restartPolicyType = "ON_FAILURE"

# Kamal (VPS) — config/deploy.yml
service: <project-name>
image: <registry>/<project-name>
servers:
  web:
    - <vps-ip>
registry:
  server: ghcr.io
  username: <github-username>
  password:
    - KAMAL_REGISTRY_PASSWORD

# Docker Compose (VPS self-hosted) — docker-compose.yml already generated in scaffold
# Coolify / Dokku — connect repo via their web UI, no config file needed
```

Only generate the config file for the platform the user chose. Don't include configs
for platforms they didn't select.

---

---

## GitLab CI (alternative to GitHub Actions)

Generate these if user selects `GitLab CI` in Step 4. Place at project root as `.gitlab-ci.yml`.

### .gitlab-ci.yml

```yaml
stages:
  - validate
  - deploy

variables:
  NODE_VERSION: "22"

# ── CI: runs on every merge request ──────────────────────────────────────────
validate:
  stage: validate
  image: node:${NODE_VERSION}-alpine
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - pnpm run harness validate
    - pnpm run harness file-guard
    - pnpm run harness schema
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'

# ── Deploy: runs on push to main ─────────────────────────────────────────────
deploy:
  stage: deploy
  image: node:${NODE_VERSION}-alpine
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - pnpm run harness validate:full
    - pnpm run build

    # Uncomment ONE deploy target:

    # Vercel:
    # - npx vercel --prod --token $VERCEL_TOKEN

    # Fly.io:
    # - curl -L https://fly.io/install.sh | sh
    # - flyctl deploy --remote-only

    # VPS via SSH + Docker Compose:
    # - apt-get update && apt-get install -y openssh-client
    # - ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST "cd /opt/$CI_PROJECT_NAME && git pull && docker compose up -d --remove-orphans"

    # Docker registry push (for container platforms):
    # - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    # - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  environment:
    name: production
```

**Adapt:** replace `pnpm` with `bun` or `npm`. For Bun, use `oven-sh/setup-bun` or
`bun install` directly. Variables like `$VERCEL_TOKEN`, `$VPS_HOST` etc. are set in
GitLab CI/CD settings → Variables.

---

## Python equivalents

### pyproject.toml (project metadata + build + ruff + mypy + pytest)

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "<package-name>"
version = "0.1.0"
description = "Short project description"
readme = "README.md"
requires-python = ">=3.12"
dependencies = []

[project.optional-dependencies]
dev = [
  "mypy",
  "pytest",
  "pytest-cov",
  "ruff",
]

[project.scripts]
<app-name> = "<package_name>.cli:app"

[tool.hatch.build.targets.wheel]
packages = ["src/<package_name>"]

[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = [
  "E",   # pycodestyle errors
  "W",   # pycodestyle warnings
  "F",   # pyflakes
  "I",   # isort
  "N",   # pep8-naming
  "UP",  # pyupgrade
  "B",   # flake8-bugbear
  "SIM", # flake8-simplify
  "T20", # flake8-print (ban print statements)
  "RUF", # ruff-specific
]

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --tb=short --strict-markers"
pythonpath = ["src"]
```

### Makefile (Python)

```makefile
.PHONY: install dev lint lint-fix type-check test validate

install:
	uv sync

dev:
	uv run python -m <package_name>.cli

lint:
	uv run ruff check .

lint-fix:
	uv run ruff check --fix .
	uv run ruff format .

type-check:
	uv run mypy src/

test:
	uv run pytest

validate: lint type-check test
```

---

## Go equivalents

### go.mod (single-module project)

```go
module github.com/<org>/<repo>

go 1.24
```

### go.work (multi-module or mixed-language monorepo)

```go
go 1.24

use (
	./apps/api
	./tools/migrations
)
```

### golangci-lint (.golangci.yml)

```yaml
run:
  timeout: 5m

linters:
  enable:
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused
    - gofmt
    - goimports
    - misspell
    - unconvert
    - gocritic
    - revive

linters-settings:
  revive:
    rules:
      - name: exported
        severity: warning
  gocritic:
    enabled-tags:
      - diagnostic
      - style
      - performance
```

### Makefile (Go)

```makefile
.PHONY: tidy lint lint-fix type-check test test-integration validate build

tidy:
	go mod tidy

lint:
	golangci-lint run ./...

lint-fix:
	golangci-lint run --fix ./...
	goimports -w .

type-check:
	go vet ./...

test:
	go test -v -race ./...

test-integration:
	go test -v -race -tags=integration ./...

validate: lint type-check test

build:
	go build -o bin/<app-name> ./cmd/<app-name>/
```

---

## Rust equivalents

### Cargo.toml (workspace root)

```toml
[workspace]
members = ["crates/core", "apps/cli"]
resolver = "3"

[workspace.package]
edition = "2024"
version = "0.1.0"

[workspace.dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
```

### Cargo.toml (workspace member)

```toml
[package]
name = "<crate-name>"
edition.workspace = true
version.workspace = true

[dependencies]
anyhow.workspace = true
clap.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
```

### clippy.toml

```toml
too-many-arguments-threshold = 5
cognitive-complexity-threshold = 15
```

### Cargo.toml (lint section)

```toml
[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }
unwrap_used = "warn"
expect_used = "warn"
```

### Makefile (Rust)

```makefile
.PHONY: fmt lint lint-fix type-check test validate build

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace --all-targets --all-features -- -D warnings

lint-fix:
	cargo clippy --fix --allow-dirty
	cargo fmt --all

type-check:
	cargo check --workspace --all-targets

test:
	cargo test --workspace --all-targets

validate: lint type-check test

build:
	cargo build --workspace --release
```

---

## Mixed-language monorepo orchestration

### Makefile (TS frontend + Python backend example)

```makefile
.PHONY: install validate test dev

install:
	corepack enable && pnpm install --frozen-lockfile
	cd apps/api && uv sync

validate:
	pnpm --dir apps/web lint
	pnpm --dir apps/web test -- --run
	cd apps/api && uv run ruff check .
	cd apps/api && uv run mypy src
	cd apps/api && uv run pytest

test:
	pnpm --dir apps/web test -- --run
	cd apps/api && uv run pytest

dev:
	pnpm --dir apps/web dev
```

Use the root `Makefile` or `justfile` as the human and agent entrypoint, but keep package-native
files in each app: `package.json` for Node workspaces, `pyproject.toml` for Python, `go.work` or
`go.mod` for Go, and Cargo workspaces for Rust.

---

## Structured Logger Templates

Generate `src/lib/logger.ts` (or equivalent) for every project. Iron Rule 7 bans `console.log`
in production code — all logging goes through the structured logger.

### Node.js / TypeScript — pino (recommended)

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME ?? '<project-name>',
    env: process.env.NODE_ENV ?? 'development',
  },
});

export type Logger = typeof logger;
```

Install: `<pkg-mgr> add pino` and `<pkg-mgr> add -D pino-pretty`

Usage: `logger.info({ userId }, 'User signed in')` — always structured, never string templates.

### Python — structlog (recommended)

```python
# src/<package>/logger.py
import structlog
import logging
import sys

def setup_logging(level: str = "INFO", json_output: bool = False) -> None:
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]
    if json_output:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level)),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
    )

logger = structlog.get_logger()
```

Install: `uv add structlog`

Usage: `logger.info("user_signed_in", user_id=user_id)` — key-value pairs, not f-strings.

### Go — slog (stdlib, Go 1.21+)

```go
// internal/logger/logger.go
package logger

import (
    "log/slog"
    "os"
)

func New(jsonOutput bool) *slog.Logger {
    var handler slog.Handler
    opts := &slog.HandlerOptions{Level: slog.LevelInfo}

    if jsonOutput {
        handler = slog.NewJSONHandler(os.Stderr, opts)
    } else {
        handler = slog.NewTextHandler(os.Stderr, opts)
    }

    return slog.New(handler)
}
```

Usage: `logger.Info("user signed in", "user_id", userID)` — stdlib, zero dependencies.

### Rust — tracing (recommended)

```rust
// src/logger.rs
use tracing_subscriber::{fmt, EnvFilter};

pub fn init() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .json()  // Remove .json() for human-readable dev output
        .init();
}
```

Install: add `tracing`, `tracing-subscriber` with `json` and `env-filter` features to `Cargo.toml`.

Usage: `tracing::info!(user_id = %user_id, "user signed in");` — structured spans and events.

### Rules

- Every project generates the logger module at scaffold time — not as a later task
- `console.log` / `print()` / `fmt.Println` / `println!` are banned in production code
- In development mode: human-readable output (colored, pretty-printed)
- In production: JSON output (for log aggregation — Datadog, CloudWatch, Grafana, etc.)
- Always include: timestamp, log level, service name, and structured context fields
- Error logs must include the error object/traceback, not just the message string

---

## Non-Node CI — GitHub Actions

### Python ci.yml

```yaml
name: CI
on:
  pull_request:
    branches: [main, 'milestone/*']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: astral-sh/setup-uv@v5

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - run: uv sync
      - run: make validate

      - name: File guard
        run: bash scripts/harness.sh file-guard

      - name: Schema check
        run: bash scripts/harness.sh schema
```

### Python deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: uv sync
      - run: make validate

      # Uncomment ONE deploy target:

      # Docker (Fly.io / Cloud Run / VPS):
      # - run: docker build -t $REGISTRY/$IMAGE:${{ github.sha }} .
      # - run: docker push $REGISTRY/$IMAGE:${{ github.sha }}

      # PyPI publish:
      # - run: uv build
      # - run: uv publish --token ${{ secrets.PYPI_TOKEN }}
```

### Go ci.yml

```yaml
name: CI
on:
  pull_request:
    branches: [main, 'milestone/*']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'

      - uses: golangci/golangci-lint-action@v6
        with:
          version: latest

      - run: make validate

      - name: File guard
        run: bash scripts/harness.sh file-guard

      - name: Schema check
        run: bash scripts/harness.sh schema
```

### Go deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      - run: make validate

      # Uncomment ONE:

      # Docker:
      # - run: docker build -t $REGISTRY/$IMAGE:${{ github.sha }} .
      # - run: docker push $REGISTRY/$IMAGE:${{ github.sha }}

      # Binary release (GitHub Releases):
      # - run: make build
      # - uses: softprops/action-gh-release@v2
      #   with:
      #     files: bin/*
```

### Rust ci.yml

```yaml
name: CI
on:
  pull_request:
    branches: [main, 'milestone/*']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - uses: Swatinem/rust-cache@v2

      - run: make validate

      - name: File guard
        run: bash scripts/harness.sh file-guard

      - name: Schema check
        run: bash scripts/harness.sh schema
```

### Rust deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: make validate

      # Uncomment ONE:

      # Docker:
      # - run: docker build -t $REGISTRY/$IMAGE:${{ github.sha }} .
      # - run: docker push $REGISTRY/$IMAGE:${{ github.sha }}

      # Binary release (cross-compile):
      # - uses: taiki-e/upload-rust-binary-action@v1
      #   with:
      #     bin: <app-name>
      #     tar: unix
      #     zip: windows
```

**Adapt:** If the project uses the TypeScript CLI with Node.js (recommended), add
`actions/setup-node` + `npm install tsx` before the harness commands, and replace
`bash scripts/harness.sh` with `npx tsx scripts/harness.ts`.

---

## Docker variants by project type

### Node.js Web App / API (default)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Node.js CLI Tool (for Docker distribution)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
ENTRYPOINT ["node", "dist/index.js"]
```

### Python (API or CLI)

```dockerfile
FROM python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen
COPY . .

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /app /app
ENV PATH="/app/.venv/bin:$PATH"
# For API:
# CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3000"]
# For CLI:
# ENTRYPOINT ["python", "-m", "src.cli"]
```

### Go (API or CLI)

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/app ./cmd/<app-name>/

FROM alpine:3.19
COPY --from=build /bin/app /bin/app
# For API:
# EXPOSE 3000
# CMD ["/bin/app"]
# For CLI:
# ENTRYPOINT ["/bin/app"]
```

### Rust (API or CLI)

```dockerfile
FROM rust:1.77-alpine AS build
WORKDIR /app
RUN apk add musl-dev
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release

FROM alpine:3.19
COPY --from=build /app/target/release/<app-name> /bin/app
# ENTRYPOINT ["/bin/app"]
```

**Rules:**
- Only generate Docker if the project needs it (web apps, self-hosted agents, Docker distribution)
- Skip Docker for CLI tools distributed via npm/pip/homebrew (unless user requests it)
- Always multi-stage build (build stage + minimal production stage)
- Never install dev dependencies in production stage

---

## Assembly Rules

1. Read this file BEFORE generating any config — never write configs from memory
2. Always use the strictest settings (strict: true, strictTypeChecked, etc.)
3. Adapt path aliases, ignores, and plugins to the specific project
4. Package manager commands must match the user's choice (pnpm/bun/npm for JS; uv for Python; go for Go; cargo for Rust)
5. Docker base images should match the chosen runtime version
6. CI workflows must match the chosen language and package manager — use the Node.js CI templates for JS/TS projects and the non-Node CI templates for Python/Go/Rust projects
7. Never downgrade strictness. If a rule causes errors, fix the code, not the config.
8. For non-Node projects using the native shell CLI, use the non-Node `.claude/settings.json` variant below

---

## Claude Code — .claude/settings.json

```json
{
  "plansDirectory": "./docs/exec-plans/active",
  "permissions": {
    "allowedTools": [
      "Read", "Write",
      "Bash(git *)",
      "Bash(<package-manager> *)",
      "Bash(npx tsx scripts/harness.ts *)",
      "Bash(npx tsx scripts/maintenance/check-commit-msg.ts *)",
      "Bash(npx lint-staged)",
      "Bash(npx prisma *)",
      "Bash(npx drizzle-kit *)"
    ],
    "deny": ["Read(./.env)", "Read(./.env.*)"]
  }
}
```

**Critical:** replace `<package-manager>` with the chosen one (`pnpm`, `bun`, or `npm`).

This config enables **autonomous execution**:
- Routes plan mode output to `docs/exec-plans/active/` (inside repo, versioned)
- Pre-approves ALL harness CLI commands (no "allow?" prompts during task loop)
- Pre-approves git and package manager commands
- Blocks reading .env files (Iron Rule 6: secrets never touch agent context)

### Non-Node variant — .claude/settings.json

For projects using the native shell CLI (`scripts/harness.sh`) instead of the TypeScript CLI:

```json
{
  "plansDirectory": "./docs/exec-plans/active",
  "permissions": {
    "allowedTools": [
      "Read", "Write",
      "Bash(git *)",
      "Bash(make *)",
      "Bash(bash scripts/harness.sh *)",
      "Bash(bash scripts/check-commit-msg.sh *)"
    ],
    "deny": ["Read(./.env)", "Read(./.env.*)"]
  }
}
```

Add language-specific tools to `allowedTools`:
- Python: `"Bash(uv *)"`, `"Bash(python *)"`, `"Bash(ruff *)"`, `"Bash(mypy *)"`
- Go: `"Bash(go *)"`, `"Bash(golangci-lint *)"`
- Rust: `"Bash(cargo *)"`, `"Bash(rustup *)"`

## Codex — .codex/config.toml

```toml
# Codex project-level configuration
approval_policy = "never"
# This allows Codex to run harness commands, git, and package manager without prompts.
# For supervised mode: approval_policy = "on-request"

[sandbox]
sandbox_mode = "workspace-write"

[project_doc]
project_doc_max_bytes = 65536
```

**Key difference from Claude Code:**
- Codex does NOT have a native `plansDirectory` config
- AGENTS.md contains the instruction to write plans to `docs/exec-plans/active/`
- Codex sandbox allows workspace writes by default
- Codex does not mirror Claude Code's per-path deny list here; secret protection still relies on
  repo rules (`.gitignore`, `.env.example`, AGENTS/CLAUDE instructions) and not materializing
  secret values into agent-visible repo state

**Plan file flow (both agents):**

```
Plan mode → plan file lands in docs/exec-plans/active/
  ↓
Main-root Session Init or explicit plan:apply → detects new plan file
  ↓
Sync → parse plan → add to PLAN.md + progress.json
  ↓
Task Execution Loop → runs the new milestone
  ↓
Milestone complete → worktree:finish auto-archives completed execution plan files to docs/exec-plans/completed/

After copying newer harness runtime files into an existing project, run
`harness migrate` once from main/root to refresh the runtime schema and
exec-plan directories.
```

### Cross-Agent Continuation

When switching between Claude Code and Codex, do not create a second source of truth.

1. Before leaving the current agent session, materialize any new plan, architecture, UI, or docs
   changes into repo files.
2. Serial mode handoff: the incoming agent opens the repo root and resumes with `harness init`.
3. Managed worktree handoff: the incoming agent opens the same milestone worktree / branch and runs
   `harness init` there, not on main/root.
4. `AGENTS.md` / `CLAUDE.md`, `ARCHITECTURE.md`, `docs/PLAN.md`, `docs/progress.json`, and, when
   present, `docs/product/frontend-design.md`, `docs/product/design.md`, `docs/product/design-preview.html`, and
   `docs/gitbook/*` are the handoff contract.
5. `.claude/settings.json` and `.codex/config.toml` adapt the runtime only; they do not replace
   repo-backed state.

