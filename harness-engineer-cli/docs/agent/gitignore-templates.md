# .gitignore Templates

Use the template matching the project's tech stack. Always include the
**Universal** block at the top of every .gitignore, then append the
stack-specific block.

---

## Universal (ALWAYS include — every project, no exceptions)

```gitignore
# === Secrets & Environment (NEVER commit) ===
.env
.env.local
.env.*.local
.env.development
.env.production
.env.staging
.dev.vars
*.pem
*.key
*.cert
*.secret

# === OS files ===
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/

# === IDE / Editor ===
.idea/
.vscode/
*.swp
*.swo
*~
*.sublime-project
*.sublime-workspace
.project
.classpath
.settings/

# === Logs ===
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
```

---

## Node.js / TypeScript (Web App, API, CLI)

Append after Universal block:

```gitignore
# === Dependencies ===
node_modules/
.pnp
.pnp.js

# === Build output ===
dist/
build/
out/
.output/
.next/
.nuxt/
.svelte-kit/
.vercel/
.netlify/
storybook-static/

# === Package manager ===
# Lockfiles ARE committed (only the one for your chosen manager)
# pnpm: pnpm-lock.yaml
# bun: bun.lockb
# npm: package-lock.json

# === TypeScript ===
*.tsbuildinfo
tsconfig.tsbuildinfo

# === Test & Coverage ===
coverage/
.nyc_output/
__snapshots__/

# === Turbo ===
.turbo/

# === Misc ===
*.d.ts.map
.eslintcache
.prettiercache
```

---

## Next.js (extends Node.js)

Append after Node.js block:

```gitignore
# === Next.js specific ===
.next/
out/
.vercel/
next-env.d.ts
```

---

## Python

Append after Universal block:

```gitignore
# === Python runtime ===
__pycache__/
*.py[cod]
*$py.class
*.so

# === Virtual environments ===
venv/
.venv/
env/
ENV/

# === Distribution / Packaging ===
dist/
build/
*.egg-info/
*.egg
wheels/
pip-wheel-metadata/
*.whl

# === Test & Coverage ===
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/
.tox/
.nox/

# === Jupyter ===
.ipynb_checkpoints/

# === Type stubs ===
.pytype/
```

---

## Go

Append after Universal block:

```gitignore
# === Build ===
/bin/
/vendor/
*.exe
*.exe~
*.dll
*.so
*.dylib

# === Test ===
*.test
*.out
coverage.txt
coverage.html

# === Go workspace ===
go.work
go.work.sum

# === Misc ===
*.prof
```

---

## Rust

Append after Universal block:

```gitignore
# === Build ===
/target/
**/*.rs.bk

# === Cargo ===
# Cargo.lock IS committed for binaries, NOT for libraries
# Binary projects: remove this line
# Cargo.lock

# === IDE ===
*.pdb
```

---

## Docker

Append to any project using Docker:

```gitignore
# === Docker (local dev artifacts only) ===
docker-compose.override.yml
.docker/
```

---

## Mobile (React Native / Flutter)

### React Native
Append after Node.js block:

```gitignore
# === React Native ===
ios/Pods/
ios/build/
android/.gradle/
android/app/build/
android/build/
*.jks
*.keystore
*.hprof
buck-out/
\.buckd
```

### Flutter
Append after Universal block:

```gitignore
# === Flutter / Dart ===
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
build/
*.iml
.metadata
pubspec.lock    # committed for apps, ignored for packages
```

---

## Assembly Rules

When generating `.gitignore` for a project:

1. Start with the **Universal** block (copy verbatim)
2. Append the block matching the primary stack
3. Append additional blocks if multiple stacks apply (e.g., Node.js + Docker)
4. For frameworks that extend a base (e.g., Next.js extends Node.js), include BOTH
5. Verify `.env` and all secret patterns are present — if somehow missing, add them
6. Commit the `.gitignore` as the FIRST file in the repo, before any other code
