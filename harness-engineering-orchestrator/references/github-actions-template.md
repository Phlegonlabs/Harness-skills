# GitHub Actions CI/CD Template

These workflows are reference shapes, not copy-paste defaults for every project. Always align setup, install, lint, test, build, and deploy steps to the confirmed stack and `state.toolchain.commands`.

## CI Pipeline (Reference Shape)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - name: Install dependencies
        run: <install command from state.toolchain.commands.install.command>
      - name: Type check
        run: <typecheck command from state.toolchain.commands.typecheck.command>
      - name: Lint
        run: <lint command from state.toolchain.commands.lint.command>
      - name: Test with coverage
        run: <test command from state.toolchain.commands.test.command>
      - name: Build
        run: <build command from state.toolchain.commands.build.command>
      - name: Check file sizes (max 400 lines)
        run: |
          find <source-roots> -type f | while read file; do
            lines=$(wc -l < "$file")
            if [ "$lines" -gt 400 ]; then
              echo "❌ $file has $lines lines (max 400)"
              exit 1
            fi
          done
      - name: Check for forbidden patterns
        run: |
          if grep -rE "<forbidden-pattern-regex>" <source-roots> 2>/dev/null; then
            echo "❌ Forbidden pattern detected"
            exit 1
          fi
      - name: Verify dependency direction
        run: <dependency-direction check command>
        continue-on-error: true
```

For Bun/TypeScript repos, the runtime setup action is commonly `oven-sh/setup-bun@v2`. For Python, Go, Rust, JVM, Swift, or mixed stacks, swap in the platform-appropriate setup action before using the corresponding toolchain commands.

---

## CD Pipeline — Choose Based on Deployment Platform

### Vercel (Web App — Next.js / Remix)

```yaml
# .github/workflows/cd-vercel.yml
name: CD — Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy-preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - run: <install command from state.toolchain.commands.install.command>
      - name: Deploy to Vercel Preview
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - run: <install command from state.toolchain.commands.install.command>
      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Cloudflare Pages + Workers

```yaml
# .github/workflows/cd-cloudflare.yml
name: CD — Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - run: <install command from state.toolchain.commands.install.command>
      - run: <build command from state.toolchain.commands.build.command>
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: ${{ vars.PROJECT_NAME }}
          directory: dist
      - name: Deploy Workers (if any)
        run: bunx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### iOS App — TestFlight (Staging) + App Store (Production)

```yaml
# .github/workflows/cd-ios.yml
name: CD — iOS

on:
  push:
    branches: [main]

jobs:
  deploy-testflight:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable
      - name: Install certificates
        uses: apple-actions/import-codesign-certs@v2
        with:
          p12-file-base64: ${{ secrets.CERTIFICATES_P12 }}
          p12-password: ${{ secrets.CERTIFICATES_P12_PASSWORD }}
      - name: Build and upload to TestFlight
        run: |
          xcodebuild archive \
            -scheme "${{ vars.SCHEME_NAME }}" \
            -archivePath build/app.xcarchive \
            -configuration Release
          xcodebuild -exportArchive \
            -archivePath build/app.xcarchive \
            -exportOptionsPlist ExportOptions.plist \
            -exportPath build/ipa
          xcrun altool --upload-app \
            -f build/ipa/*.ipa \
            -u "${{ secrets.APPLE_ID }}" \
            -p "${{ secrets.APPLE_APP_PASSWORD }}"
```

### Tag-based Release (Reference Shape)

```yaml
# .github/workflows/release.yml
# Auto-release on version tag push
# Usage: git tag v1.0.0 && git push origin v1.0.0
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - run: <install command from state.toolchain.commands.install.command>
      - run: <typecheck command from state.toolchain.commands.typecheck.command>
      - run: <test command from state.toolchain.commands.test.command>
      - run: <build command from state.toolchain.commands.build.command>
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref, '-rc') || contains(github.ref, '-beta') || contains(github.ref, '-alpha') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### CLI Tool — GitHub Releases + NPM

```yaml
# .github/workflows/cd-cli.yml
name: CD — CLI Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup project toolchain
        uses: <setup-action-for-your-runtime>
      - run: <install command from state.toolchain.commands.install.command>
      - name: Build binaries (cross-platform)
        run: <cross-platform release build command>
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/*
          generate_release_notes: true
      - name: Publish package
        run: <package publish command>
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## PR Automation

```yaml
# .github/workflows/pr-checks.yml
name: PR Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pr-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate commit message format
        uses: wagoid/commitlint-github-action@v5

      - name: Check PR has Task-ID
        run: |
          PR_BODY="${{ github.event.pull_request.body }}"
          if ! echo "$PR_BODY" | grep -q "Task-ID:"; then
            echo "❌ PR body must contain Task-ID: T[ID]"
            exit 1
          fi

      - name: Check PR references PRD
        run: |
          PR_BODY="${{ github.event.pull_request.body }}"
          if ! echo "$PR_BODY" | grep -q "PRD#\|Closes:"; then
            echo "⚠️  Consider referencing PRD item (Closes: PRD#F00X)"
          fi
```

---

## PR Template (.github/PULL_REQUEST_TEMPLATE.md)

```markdown
## What this PR does

[Brief description]

## Task Information

- **Task-ID**: T[ID]
- **Closes**: PRD#F[ID]
- **Milestone**: M[N] — [Name]

## Checklist

- [ ] Typecheck / compile command passes
- [ ] Lint command passes
- [ ] Test command passes
- [ ] Build / package command passes
- [ ] All modified files ≤ 400 lines
- [ ] No `console.log` / `any` / `@ts-ignore`
- [ ] AGENTS.md / CLAUDE.md updated (if architecture changed)
- [ ] user-level LEARNING.md updated (if issues resolved or Spike completed)

## Screenshots (if applicable)

[Please attach screenshots for UI changes]
```
