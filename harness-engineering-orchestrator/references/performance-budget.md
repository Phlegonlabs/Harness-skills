# Performance Budget Reference

Defines measurable performance targets for web applications. These budgets are enforced in CI and must not be exceeded without explicit approval.

---

## Web Vitals Targets

| Metric | Target | Description |
|--------|--------|-------------|
| **FCP** (First Contentful Paint) | < 1.8s | Time until first text or image is painted |
| **LCP** (Largest Contentful Paint) | < 2.5s | Time until largest content element is visible |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability — how much the layout shifts |
| **INP** (Interaction to Next Paint) | < 200ms | Responsiveness to user interactions |

> These targets align with Google's "Good" thresholds. Measure on a mid-tier mobile device (Moto G Power equivalent) on a 4G connection.

---

## JavaScript Bundle Limits

| Scope | Limit (gzipped) | Notes |
|-------|-----------------|-------|
| **Initial bundle** | 150 KB | All JS loaded before first meaningful paint |
| **Per-route chunk** | 50 KB | Lazy-loaded chunk for a single route |
| **Total JS** | 500 KB | Sum of all JS across the application |

Use dynamic imports and code splitting to stay within per-route limits. Tree-shaking must be enabled in the production build.

---

## Lighthouse Score Targets

| Category | Minimum Score |
|----------|---------------|
| **Performance** | 90 |
| **Accessibility** | 95 |
| **Best Practices** | 90 |
| **SEO** | 90 |

> Lighthouse audits should run against a production-equivalent build and preview flow, not the dev server.

---

## API Latency Targets

| Endpoint Type | P50 | P95 | P99 | Examples |
|---------------|-----|-----|-----|----------|
| **Read (single)** | 50ms | 150ms | 300ms | GET /api/users/:id |
| **Read (list)** | 100ms | 300ms | 500ms | GET /api/users?page=1 |
| **Write** | 100ms | 300ms | 500ms | POST /api/users |
| **Search** | 150ms | 500ms | 1000ms | GET /api/search?q=term |
| **Upload** | 200ms | 1000ms | 3000ms | POST /api/upload |

> Latency is measured server-side, excluding network transfer time. For cold-start environments (serverless), add 500ms to P99 targets.

---

## CI Integration

### Lighthouse CI

```yaml
# .github/workflows/ci.yml (relevant step)
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v12
  with:
    configPath: ./lighthouserc.json
    uploadArtifacts: true
```

```jsonc
// lighthouserc.json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.9 }],
        "first-contentful-paint": ["warn", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "interactive": ["warn", { "maxNumericValue": 3800 }]
      }
    }
  }
}
```

### Bundle Size Check (size-limit)

```jsonc
// package.json (relevant section)
{
  "size-limit": [
    { "path": "dist/assets/index-*.js", "limit": "150 KB", "gzip": true },
    { "path": "dist/assets/*.js", "limit": "500 KB", "gzip": true }
  ]
}
```

```yaml
# .github/workflows/ci.yml (relevant step)
- name: Check bundle size
  run: <bundle size check command>
```

---

## Budget Violation Thresholds

| Severity | Condition | CI Behavior |
|----------|-----------|-------------|
| **Pass** | Within budget | CI passes |
| **Warning** | Exceeds budget by < 20% | CI passes with warning annotation |
| **Blocking** | Exceeds budget by >= 20% | CI fails — merge is blocked |

### Handling Violations

1. **Warning**: Add a note to the PR description explaining the overage and whether it will be addressed
2. **Blocking**: Must be resolved before merge — options include:
   - Code splitting to reduce initial bundle
   - Removing unused dependencies
   - Deferring non-critical JS with `async` / `defer`
   - Requesting a budget increase via ADR (requires justification)

> Budget increases require an ADR (`docs/adr/ADR-[N]-increase-bundle-budget.md`) with measurements and justification.
