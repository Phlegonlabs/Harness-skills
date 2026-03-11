# Scaffold Templates — scripts/harness/scaffold-templates.ts

This file contains the `scaffold-templates.ts` module extracted from `harness-cli.md`
to reduce context window usage. The agent only needs to load this file when generating
the scaffold command module for a new project.

**When to read:** During Phase 3 scaffold generation, after reading `harness-cli.md` for
the core CLI modules. Skip this file if the project does not need scaffold commands
(e.g., retrofit projects or projects that will never add MCP/agent capabilities).

---

### scripts/harness/scaffold-templates.ts

```typescript
// Scaffold command: inject capability templates into the project on demand.
// Agent runs this when user wants to add MCP, skills, Cloudflare, etc. mid-project.
// Templates are embedded here — the project repo stays clean until needed.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, warn, fail, step, info, G, Y, B, N } from './config.js';
import { loadProgress, saveProgress, loadPlan, savePlan } from './state.js';

const SCAFFOLD_TYPES = [
  'mcp', 'skill', 'milestone:agent', 'cloudflare', 'llms-txt',
  'agent-card', 'agent-observe', 'agent-auth', 'agent-pay',
  'agent-test', 'agent-schema-ci', 'agent-version',
  'agent-client', 'agent-prompts', 'agent-webhook', 'agent-cost',
] as const;
type ScaffoldType = typeof SCAFFOLD_TYPES[number];

export function cmdScaffold(type: string): void {
  if (!type || !SCAFFOLD_TYPES.includes(type as ScaffoldType)) {
    console.log(`\n${B}harness scaffold${N} — inject capability templates\n`);
    console.log(`${Y}Usage:${N} harness scaffold <type>\n`);
    console.log(`${Y}Core:${N}`);
    console.log(`  mcp              MCP server: src/tools/, src/server.ts, transport, tests`);
    console.log(`  skill            SKILL.md agent discovery file at project root`);
    console.log(`  llms-txt         llms.txt LLM discovery file (llmstxt.org spec)`);
    console.log(`  milestone:agent  Pre-built milestone for agent work → appends to PLAN.md`);
    console.log(`${Y}Infrastructure:${N}`);
    console.log(`  agent-card       A2A Agent Card (/.well-known/agent.json)`);
    console.log(`  agent-observe    Tool observability: call count, latency, errors`);
    console.log(`  agent-auth       Auth + rate limit middleware for remote SSE`);
    console.log(`  agent-pay        Payment: x402 micropayments + Stripe metered billing`);
    console.log(`${Y}Quality:${N}`);
    console.log(`  agent-test       MCP protocol compliance tests (lifecycle + error handling)`);
    console.log(`  agent-schema-ci  CI step: detect schema drift between SKILL.md and code`);
    console.log(`  agent-version    Tool versioning strategy: v1/v2 coexistence + deprecation`);
    console.log(`${Y}Advanced:${N}`);
    console.log(`  agent-client     Multi-agent client: discover + connect + call remote agents`);
    console.log(`  agent-prompts    MCP Prompts capability: pre-built prompt templates`);
    console.log(`  agent-webhook    Webhook + long-running task callback pattern`);
    console.log(`  agent-cost       Per-call cost estimation + audit log for paid APIs`);
    console.log(`${Y}Deploy:${N}`);
    console.log(`  cloudflare       wrangler.toml + .dev.vars + CI deploy step\n`);
    return;
  }

  console.log(`\n${B}═══ Scaffold: ${type} ═══${N}\n`);

  switch (type as ScaffoldType) {
    case 'mcp':             scaffoldMcp(); break;
    case 'skill':           scaffoldSkill(); break;
    case 'milestone:agent': scaffoldAgentMilestone(); break;
    case 'cloudflare':      scaffoldCloudflare(); break;
    case 'llms-txt':        scaffoldLlmsTxt(); break;
    case 'agent-card':      scaffoldAgentCard(); break;
    case 'agent-observe':   scaffoldAgentObserve(); break;
    case 'agent-auth':      scaffoldAgentAuth(); break;
    case 'agent-pay':       scaffoldAgentPay(); break;
    case 'agent-test':      scaffoldAgentTest(); break;
    case 'agent-schema-ci': scaffoldAgentSchemaCi(); break;
    case 'agent-version':   scaffoldAgentVersion(); break;
    case 'agent-client':    scaffoldAgentClient(); break;
    case 'agent-prompts':   scaffoldAgentPrompts(); break;
    case 'agent-webhook':   scaffoldAgentWebhook(); break;
    case 'agent-cost':      scaffoldAgentCost(); break;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeIfMissing(path: string, content: string, label: string): boolean {
  if (existsSync(path)) { info(`${label} already exists: ${path} — skipped`); return false; }
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content);
  ok(`Created: ${path}`);
  return true;
}

function getProjectName(): string {
  try {
    const p = loadProgress();
    return p.project ?? 'my-project';
  } catch { return 'my-project'; }
}

// ─── scaffold mcp ────────────────────────────────────────────────────────────

function scaffoldMcp(): void {
  const name = getProjectName();

  writeIfMissing('src/server.ts', `// MCP server entry point — stdio + SSE transport
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolRegistry } from './tools/index.js';

const server = new Server({ name: '${name}', version: '0.0.1' }, { capabilities: { tools: {} } });

// Register tools from the registry
for (const [name, handler] of Object.entries(toolRegistry)) {
  server.setRequestHandler(handler.schema, handler.handler);
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('${name} MCP server running on stdio');
`, 'MCP server entry');

  writeIfMissing('src/tools/index.ts', `// Tool registry — import and re-export all tools here.
// Each tool is a separate file in src/tools/.
// import { searchTool } from './search.js';

export const toolRegistry: Record<string, { schema: any; handler: any }> = {
  // search: searchTool,
};
`, 'Tool registry');

  writeIfMissing('src/tools/example.ts', `// Example tool — copy this pattern for each new tool.
// 1. Define input schema (JSON Schema)
// 2. Implement handler
// 3. Export and register in index.ts

export const exampleTool = {
  schema: {
    name: 'example',
    description: 'An example tool — replace with real implementation',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  handler: async (params: { query: string }) => {
    // TODO: implement real logic
    return { content: [{ type: 'text', text: \`Results for: \${params.query}\` }] };
  },
};
`, 'Example tool');

  writeIfMissing('tests/tools/example.test.ts', `import { describe, it, expect } from 'vitest';
import { exampleTool } from '../../src/tools/example.js';

describe('example tool', () => {
  it('returns results for a query', async () => {
    const result = await exampleTool.handler({ query: 'test' });
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('test');
  });
});
`, 'Example tool test');

  info('Next steps:');
  console.log(`  1. ${Y}npm install @modelcontextprotocol/sdk${N} (or pnpm/bun)`);
  console.log(`  2. Copy ${B}src/tools/example.ts${N} → create real tools`);
  console.log(`  3. Register each tool in ${B}src/tools/index.ts${N}`);
  console.log(`  4. Run: ${Y}harness scaffold skill${N} to generate SKILL.md`);
  console.log(`  5. Run: ${Y}harness scaffold milestone:agent${N} to add tasks to PLAN.md`);
}

// ─── scaffold skill ──────────────────────────────────────────────────────────

function scaffoldSkill(): void {
  const name = getProjectName();

  writeIfMissing('SKILL.md', `---
name: ${name}
description: >
  TODO: Describe what this tool does, what data/APIs it accesses, and what problems
  it solves. Be specific — agents read this to decide whether to use the tool.
---

# ${name}

## Overview

TODO: 2-3 sentences about what this MCP server does and who it's for.

## Connection

### stdio (local — Claude Desktop, Claude Code)

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["${name}"],
      "env": {
        "API_KEY": "<your-api-key>"
      }
    }
  }
}
\`\`\`

### SSE (remote — claude.ai, web integrations)

\`\`\`
URL: https://<your-domain>/sse
\`\`\`

## Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| \`API_KEY\` | TODO: API key for what service | Yes |

## Available Tools

### \`example\`

TODO: What this tool does.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`query\` | string | Yes | Search query |

**Output:** \`{ content: [{ type: "text", text: "..." }] }\`

## Error Handling

| Code | Meaning |
|------|---------|
| \`INVALID_PARAMS\` | Missing or invalid input |
| \`NOT_FOUND\` | Resource not found |
| \`AUTH_ERROR\` | API key missing or invalid |
| \`RATE_LIMITED\` | External API rate limit |
| \`INTERNAL_ERROR\` | Unexpected server error |
`, 'SKILL.md');

  info('SKILL.md created at project root.');
  info('Update the TODO sections with real tool descriptions.');
  info('This file is compatible with claude.ai skills, OpenClaw, and Claude Code.');
}

// ─── scaffold milestone:agent ────────────────────────────────────────────────

function scaffoldAgentMilestone(): void {
  const name = getProjectName();

  step('Appending agent milestone to PLAN.md...');
  let plan: string;
  try { plan = loadPlan(); } catch { fail('PLAN.md not found'); return; }

  // Find the next milestone number
  const msNumbers = [...plan.matchAll(/### (M\d+):/g)].map((m) => parseInt(m[1].slice(1)));
  const nextN = msNumbers.length > 0 ? Math.max(...msNumbers) + 1 : 1;
  const msId = `M${String(nextN)}`;

  const milestone = `

### ${msId}: Agent / MCP Integration (Target: 2-3 weeks)
**Status:** ⬜ Not Started
**Branch:** \`milestone/${msId.toLowerCase()}\`
**Worktree:** \`../${name}-${msId.toLowerCase()}\`
**Covers:** Agent tool exposure
**Depends on:** ${nextN > 1 ? `M${String(nextN - 1)}` : 'None'}

| Task ID | Story | Task | Done When | Status | Commit |
|---------|-------|------|-----------|--------|--------|
| ${msId}-001 | — | Set up MCP server with stdio transport | Server starts, responds to \`initialize\` request | ⬜ | — |
| ${msId}-002 | — | Implement tool registry + schema validation | Tools listed in \`tools/list\`, input schemas validated | ⬜ | — |
| ${msId}-003 | — | Implement first tool (wire to existing API) | Tool calls existing service layer, returns structured data | ⬜ | — |
| ${msId}-004 | — | Add structured error responses | Tool errors return proper MCP error codes | ⬜ | — |
| ${msId}-005 | — | Write integration test (tool call lifecycle) | Test: initialize → tools/list → tools/call → validate | ⬜ | — |
| ${msId}-006 | — | Generate SKILL.md + llms.txt + update docs | SKILL.md lists all tools; llms.txt indexes project for LLMs | ⬜ | — |
| ${msId}-007 | — | Add SSE transport (if remote deploy needed) | HTTP SSE connections work, CORS configured, /health → 200 | ⬜ | — |
| ${msId}-008 | — | Add auth + rate limiting (\`scaffold agent-auth\`) | Bearer token auth, per-key rate limit, 401/403/429 responses | ⬜ | — |
| ${msId}-009 | — | Add tool observability (\`scaffold agent-observe\`) | Metrics: call count, latency, error rate per tool, /health endpoint | ⬜ | — |
| ${msId}-010 | — | Add MCP protocol compliance tests | Tests: initialize → tools/list → call → error → full lifecycle | ⬜ | — |
| ${msId}-011 | — | Schema drift CI check (\`scaffold agent-schema-ci\`) | CI fails if SKILL.md and code tools are out of sync | ⬜ | — |
`;

  savePlan(plan + milestone);
  ok(`Appended ${msId}: Agent / MCP Integration to PLAN.md`);

  // Update progress.json
  try {
    const p = loadProgress();
    p.active_milestones = p.active_milestones ?? [];
    p.active_milestones.push({
      id: msId,
      title: 'Agent / MCP Integration',
      status: '⬜ Not Started',
      branch: `milestone/${msId.toLowerCase()}`,
      depends_on: nextN > 1 ? [`M${String(nextN - 1)}`] : [],
      started_at: null as any,
    });

    // Add dependency graph entries
    p.dependency_graph = p.dependency_graph ?? {};
    for (let i = 2; i <= 11; i++) {
      p.dependency_graph[`${msId}-${String(i).padStart(3, '0')}`] = {
        depends_on: [`${msId}-${String(i - 1).padStart(3, '0')}`],
        blocks: i < 11 ? [`${msId}-${String(i + 1).padStart(3, '0')}`] : [],
      };
    }
    saveProgress(p);
    ok('Updated progress.json with new milestone + dependency graph');
  } catch { warn('Could not update progress.json — update manually'); }

  info(`Next: ${Y}harness worktree:start ${msId}${N}`);
}

// ─── scaffold cloudflare ─────────────────────────────────────────────────────

function scaffoldCloudflare(): void {
  const name = getProjectName();

  writeIfMissing('wrangler.toml', `name = "${name}"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database — uncomment after: wrangler d1 create ${name}-db
# [[d1_databases]]
# binding = "DB"
# database_name = "${name}-db"
# database_id = "<from wrangler d1 create>"

# KV Namespace — uncomment after: wrangler kv namespace create CACHE
# [[kv_namespaces]]
# binding = "CACHE"
# id = "<from wrangler kv namespace create>"

# R2 Bucket — uncomment after: wrangler r2 bucket create ${name}-uploads
# [[r2_buckets]]
# binding = "UPLOADS"
# bucket_name = "${name}-uploads"

# Environment overrides
# [env.staging]
# name = "${name}-staging"
# [env.production]
# name = "${name}"
`, 'wrangler.toml');

  writeIfMissing('.dev.vars', `# Cloudflare local dev environment (equivalent of .env)
# This file is gitignored. Never commit.
# API_KEY=your-key-here
`, '.dev.vars');

  // Check .gitignore has .dev.vars
  try {
    const gi = readFileSync('.gitignore', 'utf-8');
    if (!gi.includes('.dev.vars')) {
      writeFileSync('.gitignore', gi.trimEnd() + '\n.dev.vars\n');
      ok('Added .dev.vars to .gitignore');
    }
  } catch { warn('.gitignore not found — add .dev.vars manually'); }

  info('Next steps:');
  console.log(`  1. ${Y}npm install -D wrangler${N}`);
  console.log(`  2. Uncomment the bindings you need in wrangler.toml`);
  console.log(`  3. Run: ${Y}wrangler d1 create ${name}-db${N} (if using D1)`);
  console.log(`  4. Paste the database_id into wrangler.toml`);
  console.log(`  5. ${Y}wrangler dev${N} to start local development`);
}

// ─── scaffold llms-txt ───────────────────────────────────────────────────────
// Generates llms.txt following the llmstxt.org spec.
// Scans existing project files to auto-populate links.

function scaffoldLlmsTxt(): void {
  const name = getProjectName();

  // Auto-detect existing docs and build link sections
  const sections: Array<{ heading: string; links: string[] }> = [];

  // Docs section
  const docsLinks: string[] = [];
  const docFiles: Array<[string, string]> = [
    ['docs/PRD.md', 'Product requirements and user journeys'],
    ['docs/PLAN.md', 'Milestones, tasks, and progress tracking'],
    ['ARCHITECTURE.md', 'Domain map, dependency layers, module structure'],
    ['docs/gitbook/architecture.md', 'System architecture and data flow'],
    ['docs/gitbook/quickstart.md', 'Setup and quickstart guide'],
    ['docs/learnings.md', 'Technical learnings and gotchas'],
  ];
  for (const [path, desc] of docFiles) {
    if (existsSync(path)) docsLinks.push(`- [${path}](${path}): ${desc}`);
  }
  if (docsLinks.length > 0) sections.push({ heading: 'Docs', links: docsLinks });

  // Agent / MCP section (if SKILL.md or tools exist)
  const agentLinks: string[] = [];
  if (existsSync('SKILL.md')) agentLinks.push('- [SKILL.md](SKILL.md): Agent discovery — tools, connection methods, env vars');
  if (existsSync('src/server.ts')) agentLinks.push('- [src/server.ts](src/server.ts): MCP server entry point');
  if (existsSync('src/tools/index.ts')) agentLinks.push('- [src/tools/](src/tools/): MCP tool implementations');
  if (existsSync('docs/api-reference.md')) agentLinks.push('- [docs/api-reference.md](docs/api-reference.md): Full tool JSON Schemas and examples');
  if (agentLinks.length > 0) sections.push({ heading: 'Agent Tools', links: agentLinks });

  // Source section
  const srcLinks: string[] = [];
  if (existsSync('src/index.ts')) srcLinks.push('- [src/index.ts](src/index.ts): Application entry point');
  if (existsSync('src/lib/errors.ts')) srcLinks.push('- [src/lib/errors.ts](src/lib/errors.ts): Error class hierarchy');
  if (existsSync('src/lib/config.ts')) srcLinks.push('- [src/lib/config.ts](src/lib/config.ts): Configuration and env validation');
  if (srcLinks.length > 0) sections.push({ heading: 'Source', links: srcLinks });

  // Config section
  const cfgLinks: string[] = [];
  if (existsSync('package.json')) cfgLinks.push('- [package.json](package.json): Dependencies and scripts');
  if (existsSync('wrangler.toml')) cfgLinks.push('- [wrangler.toml](wrangler.toml): Cloudflare Workers configuration');
  if (existsSync('tsconfig.json')) cfgLinks.push('- [tsconfig.json](tsconfig.json): TypeScript configuration');
  if (cfgLinks.length > 0) sections.push({ heading: 'Configuration', links: cfgLinks });

  // Optional section
  const optLinks: string[] = [];
  if (existsSync('AGENTS.md')) optLinks.push('- [AGENTS.md](AGENTS.md): Agent coding conventions and iron rules');
  if (existsSync('docs/memory/MEMORY.md')) optLinks.push('- [docs/memory/MEMORY.md](docs/memory/MEMORY.md): Long-term project memory');
  if (existsSync('README.md')) optLinks.push('- [README.md](README.md): Project overview for humans');
  if (optLinks.length > 0) sections.push({ heading: 'Optional', links: optLinks });

  // Read description from PRD if available
  let description = `${name} — TODO: add a one-line description of what this project does.`;
  try {
    const prd = readFileSync('docs/PRD.md', 'utf-8');
    const overviewMatch = prd.match(/## 1\. Overview\s*\n\s*(.+)/);
    if (overviewMatch) description = overviewMatch[1].trim();
  } catch { /* no PRD */ }

  // Build the file
  let content = `# ${name}\n\n> ${description}\n`;

  // Add important notes if we detect it's an MCP/agent project
  if (existsSync('SKILL.md') || existsSync('src/server.ts')) {
    content += `\nThis project exposes functionality as MCP tools for AI agents. `;
    content += `See SKILL.md for connection methods and available tools.\n`;
  }

  for (const section of sections) {
    content += `\n## ${section.heading}\n\n`;
    content += section.links.join('\n') + '\n';
  }

  writeIfMissing('llms.txt', content, 'llms.txt');

  info('llms.txt generated following the llmstxt.org specification.');
  info('Review and update descriptions, then commit.');
  if (existsSync('SKILL.md')) {
    info('SKILL.md detected — llms.txt includes Agent Tools section.');
  }
}

// ─── scaffold agent-card ─────────────────────────────────────────────────────
// A2A Agent Card: /.well-known/agent.json (Google A2A protocol v0.3+)
// Other agents discover your agent via this JSON file.

function scaffoldAgentCard(): void {
  const name = getProjectName();

  writeIfMissing('.well-known/agent.json', JSON.stringify({
    name,
    description: 'TODO: What this agent does',
    url: 'https://TODO-your-domain.com',
    version: '0.0.1',
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'TODO-skill-id',
        name: 'TODO: Skill name',
        description: 'TODO: What this skill does',
        tags: ['TODO'],
        examples: ['TODO: Example input'],
      },
    ],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    authentication: {
      schemes: ['bearer'],
    },
  }, null, 2) + '\n', 'A2A Agent Card');

  info('A2A Agent Card created at .well-known/agent.json');
  info('Update skills[], description, url, and auth scheme.');
  info('Other agents discover you via: https://your-domain/.well-known/agent.json');
  info('Spec: https://a2a-protocol.org');
}

// ─── scaffold agent-observe ──────────────────────────────────────────────────
// Tool call observability: wraps each tool with metrics collection.

function scaffoldAgentObserve(): void {
  writeIfMissing('src/lib/tool-metrics.ts', `// Tool observability — wraps tool handlers to track calls, latency, errors.
// Usage: wrapTool(toolHandler) → returns instrumented handler with same signature.

interface ToolMetrics {
  tool: string;
  calls: number;
  errors: number;
  totalMs: number;
  lastCallAt: string | null;
}

const metrics = new Map<string, ToolMetrics>();

export function getMetrics(): ToolMetrics[] {
  return [...metrics.values()];
}

export function resetMetrics(): void {
  metrics.clear();
}

export function wrapTool<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  handler: T,
): T {
  const m: ToolMetrics = { tool: toolName, calls: 0, errors: 0, totalMs: 0, lastCallAt: null };
  metrics.set(toolName, m);

  return (async (...args: any[]) => {
    const start = performance.now();
    m.calls++;
    m.lastCallAt = new Date().toISOString();
    try {
      const result = await handler(...args);
      m.totalMs += performance.now() - start;
      return result;
    } catch (err) {
      m.errors++;
      m.totalMs += performance.now() - start;
      throw err;
    }
  }) as T;
}

// Health endpoint data — call from your /health or /metrics route
export function healthPayload(): Record<string, unknown> {
  const all = getMetrics();
  return {
    status: 'ok',
    tools: all.length,
    totalCalls: all.reduce((s, m) => s + m.calls, 0),
    totalErrors: all.reduce((s, m) => s + m.errors, 0),
    avgLatencyMs: all.length > 0
      ? Math.round(all.reduce((s, m) => s + (m.calls > 0 ? m.totalMs / m.calls : 0), 0) / all.length)
      : 0,
    perTool: all.map((m) => ({
      tool: m.tool,
      calls: m.calls,
      errors: m.errors,
      avgMs: m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0,
      lastCall: m.lastCallAt,
    })),
  };
}
`, 'Tool metrics');

  info('Wrap your tool handlers: wrapTool("search", searchHandler)');
  info('Expose metrics at /health or /metrics endpoint.');
}

// ─── scaffold agent-auth ─────────────────────────────────────────────────────
// Auth + rate limit middleware for remote MCP (SSE) deployments.

function scaffoldAgentAuth(): void {
  writeIfMissing('src/middleware/auth.ts', `// Auth + rate limit middleware for SSE/HTTP transport.
// Validates API key from Authorization header + enforces per-key rate limits.

interface RateLimitEntry { count: number; resetAt: number; }

const rateLimits = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_MIN ?? '60', 10);

// Set of valid API keys — load from env, database, or KV store.
// For production: replace with a DB lookup or Cloudflare KV.
function getValidKeys(): Set<string> {
  const keys = process.env.API_KEYS?.split(',').map((k) => k.trim()).filter(Boolean) ?? [];
  return new Set(keys);
}

export function authMiddleware(req: Request): Response | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'AUTH_ERROR', message: 'Missing Bearer token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = authHeader.slice(7);
  if (!getValidKeys().has(key)) {
    return new Response(JSON.stringify({ error: 'AUTH_ERROR', message: 'Invalid API key' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimits.set(key, entry);
  }
  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(JSON.stringify({
      error: 'RATE_LIMITED',
      message: \`Rate limit exceeded. Retry after \${String(retryAfter)}s\`,
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
  }

  return null; // Auth passed — continue
}
`, 'Auth middleware');

  info('Apply authMiddleware() to your SSE/HTTP handler.');
  info('Set API_KEYS="key1,key2" in .env / .dev.vars');
  info('Set RATE_LIMIT_PER_MIN=60 (default) in env.');
}

// ─── scaffold agent-pay ──────────────────────────────────────────────────────
// Payment layer: x402 (HTTP 402 micropayments) + Stripe per-call billing.
// x402: Coinbase open standard — agent pays per-request via stablecoin, no account needed.
// Stripe: traditional per-call metered billing for API consumers.

function scaffoldAgentPay(): void {
  const name = getProjectName();

  writeIfMissing('src/middleware/payment-x402.ts', `// x402 payment middleware — HTTP 402 micropayments for agent-to-agent commerce.
// Spec: https://www.x402.org | SDK: @x402/express or @x402/hono
//
// How it works:
// 1. Client requests a tool endpoint without payment → server returns 402
// 2. 402 response includes payment instructions (amount, recipient, network)
// 3. Client signs a stablecoin transaction and retries with PAYMENT-SIGNATURE header
// 4. Server verifies payment via facilitator → serves the resource
//
// No accounts. No API keys. No subscriptions. Pure per-request payment.
//
// Install: npm install @x402/core @x402/evm @x402/express
// (or @x402/hono for Cloudflare Workers)

// ─── Express example ─────────────────────────────────────────────────────────
// import { paymentMiddleware } from '@x402/express';
//
// app.use(paymentMiddleware({
//   "POST /tools/search": {
//     price: "$0.01",             // per-request price
//     network: "base-sepolia",     // blockchain network (use base-mainnet for production)
//     config: {
//       description: "${name} — search tool",
//     },
//   },
//   "POST /tools/generate": {
//     price: "$0.05",
//     network: "base-sepolia",
//     config: {
//       description: "${name} — generate tool",
//     },
//   },
// }));

// ─── Hono / Cloudflare Workers example ───────────────────────────────────────
// import { paymentMiddleware } from '@x402/hono';
//
// app.use('/tools/*', paymentMiddleware({
//   "POST /tools/search": {
//     price: "$0.01",
//     network: "base-sepolia",
//     config: { description: "${name} — search tool" },
//   },
// }));

// ─── Pricing strategy ────────────────────────────────────────────────────────
// - Cheap tools (search, lookup): $0.001 - $0.01 per call
// - Expensive tools (generate, analyze): $0.01 - $0.10 per call
// - Tools calling paid APIs: cost + margin (e.g., OpenAI API cost × 1.5)
//
// ─── Client side (if YOUR agent needs to PAY other x402 services) ────────────
// import { withPayment } from '@x402/fetch';
//
// const response = await withPayment(fetch)('https://api.example.com/data', {
//   method: 'GET',
//   payerWallet: wallet, // Coinbase MPC wallet or any EVM wallet
// });

export const X402_CONFIG = {
  // Facilitator verifies and settles payments on-chain
  facilitatorUrl: 'https://x402.org/facilitator',
  // Your wallet address to receive payments
  receiverAddress: process.env.X402_RECEIVER_ADDRESS ?? '',
  // Network: 'base-mainnet' for production, 'base-sepolia' for testing
  network: process.env.X402_NETWORK ?? 'base-sepolia',
};
`, 'x402 payment middleware');

  writeIfMissing('src/middleware/payment-stripe.ts', `// Stripe metered billing — for traditional per-call API monetization.
// Usage: wrap tool endpoints to track usage, bill monthly via Stripe.
//
// Install: npm install stripe
//
// Setup:
// 1. Create a Stripe Product + metered Price (per-unit billing)
// 2. Each API consumer gets a Stripe Customer + Subscription
// 3. On each tool call, report usage to Stripe
// 4. Stripe bills at end of billing cycle

// import Stripe from 'stripe';
//
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
//
// export async function reportUsage(subscriptionItemId: string, quantity = 1): Promise<void> {
//   await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
//     quantity,
//     timestamp: Math.floor(Date.now() / 1000),
//     action: 'increment',
//   });
// }
//
// // In your tool handler:
// const result = await myTool(params);
// await reportUsage(customer.subscriptionItemId);
// return result;

export const STRIPE_CONFIG = {
  secretKey: process.env.STRIPE_SECRET_KEY ?? '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  priceId: process.env.STRIPE_METERED_PRICE_ID ?? '', // metered price for API calls
};
`, 'Stripe billing');

  info('Two payment models generated:');
  console.log(\`  \${Y}x402\${N} — Agent-native micropayments (stablecoin, per-request, no accounts)\`);
  console.log(\`       Install: npm install @x402/core @x402/evm @x402/express\`);
  console.log(\`       Set X402_RECEIVER_ADDRESS in .env\`);
  console.log(\`  \${Y}Stripe\${N} — Traditional metered billing (monthly invoice per API consumer)\`);
  console.log(\`       Install: npm install stripe\`);
  console.log(\`       Set STRIPE_SECRET_KEY in .env\`);
  info('Choose one or both — x402 for agent economy, Stripe for human customers.');
}

// ─── scaffold agent-test ─────────────────────────────────────────────────────
// MCP protocol compliance tests — lifecycle, error handling, edge cases.

function scaffoldAgentTest(): void {
  writeIfMissing('tests/integration/mcp-protocol.test.ts', `import { describe, it, expect } from 'vitest';

// MCP Protocol Compliance Tests
// Tests the full MCP lifecycle, not just individual tool logic.
// Run: <pkg-mgr> run test:integration

describe('MCP Protocol Lifecycle', () => {
  // TODO: import your server instance or create a test client

  it('responds to initialize request', async () => {
    // const response = await client.initialize({ protocolVersion: '2024-11-05', capabilities: {} });
    // expect(response.protocolVersion).toBeDefined();
    // expect(response.capabilities.tools).toBeDefined();
    expect(true).toBe(true); // placeholder
  });

  it('lists all registered tools', async () => {
    // const response = await client.listTools();
    // expect(response.tools.length).toBeGreaterThan(0);
    // for (const tool of response.tools) {
    //   expect(tool.name).toBeDefined();
    //   expect(tool.inputSchema).toBeDefined();
    // }
    expect(true).toBe(true);
  });

  it('validates tool input against schema', async () => {
    // const result = await client.callTool('search', { query: 123 }); // wrong type
    // expect(result).toHaveProperty('error');
    // expect(result.error.code).toBe('INVALID_PARAMS');
    expect(true).toBe(true);
  });

  it('handles missing required params', async () => {
    // const result = await client.callTool('search', {}); // missing required
    // expect(result.error.code).toBe('INVALID_PARAMS');
    expect(true).toBe(true);
  });

  it('handles unknown tool name', async () => {
    // const result = await client.callTool('nonexistent_tool', {});
    // expect(result.error.code).toBe('METHOD_NOT_FOUND');
    expect(true).toBe(true);
  });

  it('returns structured errors (never raw exceptions)', async () => {
    // Force an internal error in a tool and verify the response shape
    // expect(result.error).toHaveProperty('code');
    // expect(result.error).toHaveProperty('message');
    // expect(result.error.code).not.toBe('INTERNAL_ERROR'); // ideally specific
    expect(true).toBe(true);
  });

  it('completes full call lifecycle: initialize → list → call → validate response', async () => {
    // const init = await client.initialize(...);
    // const tools = await client.listTools();
    // const firstTool = tools.tools[0];
    // const result = await client.callTool(firstTool.name, sampleInput);
    // expect(result.content).toBeDefined();
    // expect(result.content[0]).toHaveProperty('type');
    expect(true).toBe(true);
  });
});
`, 'MCP protocol tests');

  info('Uncomment and wire to your server instance.');
  info('Run: <pkg-mgr> run test:integration');
}

// ─── scaffold agent-schema-ci ────────────────────────────────────────────────
// CI step that detects schema drift between SKILL.md and actual tool code.

function scaffoldAgentSchemaCi(): void {
  writeIfMissing('scripts/check-schema-drift.ts', `#!/usr/bin/env tsx
// Schema Drift Detection — run in CI to ensure SKILL.md matches actual tool schemas.
// If a tool's input params change in code but SKILL.md isn't updated, this fails the build.
//
// Usage: tsx scripts/check-schema-drift.ts
// Add to CI: after build, before deploy.

import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const R = '\\x1b[31m', G = '\\x1b[32m', Y = '\\x1b[33m', N = '\\x1b[0m';

// ── 1. Extract tool names from SKILL.md ──────────────────────────────────────
function extractSkillTools(): Set<string> {
  if (!existsSync('SKILL.md')) { console.log(\`\${Y}⚠\${N} SKILL.md not found — skipping drift check\`); process.exit(0); }
  const skill = readFileSync('SKILL.md', 'utf-8');
  const tools = new Set<string>();
  // Match ### \`tool_name\` headings in the Available Tools section
  const matches = skill.matchAll(/### \`([^\\x60]+)\`/g);
  for (const m of matches) tools.add(m[1]);
  return tools;
}

// ── 2. Extract tool names from code (tool registry) ──────────────────────────
function extractCodeTools(): Set<string> {
  const registryPath = 'src/tools/index.ts';
  if (!existsSync(registryPath)) { console.log(\`\${Y}⚠\${N} \${registryPath} not found\`); return new Set(); }
  const code = readFileSync(registryPath, 'utf-8');
  const tools = new Set<string>();
  // Match key names in toolRegistry object or named exports
  const matches = code.matchAll(/['"]([a-z_-]+)['"]\s*[:=]/g);
  for (const m of matches) tools.add(m[1]);
  return tools;
}

// ── 3. Compare ───────────────────────────────────────────────────────────────
const skillTools = extractSkillTools();
const codeTools = extractCodeTools();
let drifted = false;

for (const tool of codeTools) {
  if (!skillTools.has(tool)) {
    console.error(\`\${R}✗\${N} Tool "\${tool}" exists in code but NOT in SKILL.md\`);
    drifted = true;
  }
}
for (const tool of skillTools) {
  if (!codeTools.has(tool)) {
    console.error(\`\${R}✗\${N} Tool "\${tool}" listed in SKILL.md but NOT in code\`);
    drifted = true;
  }
}

if (drifted) {
  console.error(\`\\n\${R}Schema drift detected.\${N} Update SKILL.md or code to match.\\n\`);
  console.error(\`  Run: harness scaffold skill   (regenerate SKILL.md from scratch)\`);
  console.error(\`  Or manually update the Available Tools section.\\n\`);
  process.exit(1);
} else {
  console.log(\`\${G}✓\${N} SKILL.md and code tools are in sync (\${String(codeTools.size)} tools)\`);
}
`, 'Schema drift checker');

  info('Add to CI: tsx scripts/check-schema-drift.ts');
  info('Add to package.json scripts: "check:schema": "tsx scripts/check-schema-drift.ts"');
  info('Also add to harness validate:full for local checks.');
}

// ─── scaffold agent-version ──────────────────────────────────────────────────
// Tool versioning strategy: v1/v2 coexistence, deprecation flow.

function scaffoldAgentVersion(): void {
  writeIfMissing('docs/tool-versioning.md', `# Tool Versioning Strategy

## Principles

1. **Tools are named, not path-versioned.** No \\\`/v1/search\\\` — just \\\`search\\\`.
   The MCP protocol identifies tools by name, not URL.
2. **Breaking changes = new tool name.** \\\`search\\\` → \\\`search_v2\\\`.
   Old \\\`search\\\` stays functional during deprecation window.
3. **Non-breaking changes = same tool name.** Adding optional params,
   expanding output fields, improving performance — all fine without renaming.

## What counts as breaking?

| Change | Breaking? | Action |
|--------|-----------|--------|
| Remove a required input param | Yes | New tool name |
| Rename an input param | Yes | New tool name |
| Change param type (string → number) | Yes | New tool name |
| Add new required input param | Yes | New tool name |
| Add optional input param | No | Same tool name |
| Add new output field | No | Same tool name |
| Remove output field | Yes | New tool name |
| Change error codes | Yes | New tool name |

## Deprecation Flow

\\\`\\\`\\\`
Phase 1: Release search_v2, keep search working (4 weeks minimum)
  - SKILL.md lists both: search (deprecated) and search_v2
  - search returns a \\\`deprecation\\\` field in every response:
    { content: [...], meta: { deprecated: true, successor: "search_v2", sunset: "2025-04-01" } }
  - Log every call to deprecated tool for tracking

Phase 2: Sunset search (after deprecation window)
  - search returns error: { code: "TOOL_DEPRECATED", message: "Use search_v2" }
  - Remove from SKILL.md Available Tools (move to a "Deprecated" section)

Phase 3: Remove search from code (next major version)
  - Delete the implementation file
  - Remove from tool registry
\\\`\\\`\\\`

## SKILL.md Version Field

Add to YAML frontmatter:
\\\`\\\`\\\`yaml
---
name: my-server
version: "1.2.0"     # bump when tools change
---
\\\`\\\`\\\`

## Schema Registry (optional, for large projects)

Keep a \\\`schemas/tools/\\\` directory with one JSON Schema file per tool:
\\\`\\\`\\\`
schemas/tools/
├── search.input.json
├── search.output.json
├── search_v2.input.json
├── search_v2.output.json
└── ...
\\\`\\\`\\\`

CI compares these against actual code schemas (see \\\`harness scaffold agent-schema-ci\\\`).
`, 'Tool versioning doc');

  info('Versioning strategy documented at docs/tool-versioning.md');
  info('Key rule: breaking change = new tool name, not in-place mutation.');
}

// ─── scaffold agent-client ───────────────────────────────────────────────────
// Multi-agent client: discover + connect + call remote agents/tools.

function scaffoldAgentClient(): void {
  writeIfMissing('src/lib/agent-client.ts', `// Multi-agent client — discover and call remote MCP servers or A2A agents.
// Your agent uses this when it needs to delegate to OTHER agents/tools.

interface RemoteAgent {
  name: string;
  url: string;          // MCP SSE endpoint or A2A agent URL
  type: 'mcp' | 'a2a';
  apiKey?: string;       // optional auth
}

interface CallResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  latencyMs: number;
}

// ── Discovery ────────────────────────────────────────────────────────────────

/** Fetch A2A Agent Card from /.well-known/agent.json */
export async function discoverA2A(baseUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(\`\${baseUrl}/.well-known/agent.json\`);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch { return null; }
}

/** Fetch MCP tool list from an SSE endpoint */
export async function discoverMCP(sseUrl: string): Promise<string[]> {
  // TODO: implement MCP client handshake (initialize → tools/list)
  // For now, return empty — implement with @modelcontextprotocol/sdk client
  return [];
}

// ── Call with retry ──────────────────────────────────────────────────────────

export async function callRemoteTool(
  agent: RemoteAgent,
  toolName: string,
  params: Record<string, unknown>,
  retries = 2,
): Promise<CallResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (agent.apiKey) headers['Authorization'] = \`Bearer \${agent.apiKey}\`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const start = performance.now();
    try {
      const res = await fetch(agent.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tool: toolName, params }),
      });

      const latencyMs = Math.round(performance.now() - start);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      const data = await res.json();
      if (!res.ok) return { success: false, error: data as any, latencyMs };
      return { success: true, data, latencyMs };
    } catch (err) {
      if (attempt === retries) {
        return {
          success: false,
          error: { code: 'NETWORK_ERROR', message: String(err) },
          latencyMs: Math.round(performance.now() - start),
        };
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // backoff
    }
  }
  return { success: false, error: { code: 'MAX_RETRIES', message: 'All retries exhausted' }, latencyMs: 0 };
}

// ── Agent Registry ───────────────────────────────────────────────────────────

const registry: RemoteAgent[] = [];

export function registerRemoteAgent(agent: RemoteAgent): void { registry.push(agent); }
export function getRegistry(): RemoteAgent[] { return [...registry]; }

/** Find a remote agent by name */
export function findAgent(name: string): RemoteAgent | undefined {
  return registry.find((a) => a.name === name);
}
`, 'Agent client');

  info('Register remote agents: registerRemoteAgent({ name, url, type, apiKey })');
  info('Call: callRemoteTool(agent, "search", { query: "..." })');
  info('Discover: discoverA2A("https://remote-agent.com")');
}

// ─── scaffold agent-prompts ──────────────────────────────────────────────────
// MCP Prompts capability — pre-built prompt templates for callers.

function scaffoldAgentPrompts(): void {
  writeIfMissing('src/prompts/index.ts', `// MCP Prompts — pre-built prompt templates.
// These help callers use your tools effectively without writing custom prompts.
// MCP spec: prompts/list → returns available templates; prompts/get → fills template

export interface PromptTemplate {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  template: string;  // Uses {argName} placeholders
}

export const promptRegistry: PromptTemplate[] = [
  {
    name: 'search-and-summarize',
    description: 'Search for information and provide a concise summary',
    arguments: [
      { name: 'topic', description: 'What to search for', required: true },
      { name: 'max_results', description: 'Number of results (default: 5)' },
    ],
    template: \`Search for "{topic}" using the search tool (limit: {max_results} results).
For each result, extract the key insight in 1-2 sentences.
Then provide a summary paragraph synthesizing the findings.\`,
  },
  {
    name: 'create-with-validation',
    description: 'Create a new record with pre-validation',
    arguments: [
      { name: 'type', description: 'Type of record to create', required: true },
      { name: 'data', description: 'JSON data for the record', required: true },
    ],
    template: \`Before creating the {type}, validate the data:
1. Check all required fields are present
2. Validate field formats (emails, URLs, dates)
3. If valid, call the create tool with: {data}
4. If invalid, list the issues without creating.\`,
  },
];

/** Fill a prompt template with arguments */
export function fillPrompt(name: string, args: Record<string, string>): string | null {
  const prompt = promptRegistry.find((p) => p.name === name);
  if (!prompt) return null;
  let filled = prompt.template;
  for (const [key, value] of Object.entries(args)) {
    filled = filled.replaceAll(\`{\${key}}\`, value);
  }
  return filled;
}
`, 'MCP Prompts');

  info('Register prompts in src/prompts/index.ts');
  info('Wire into MCP server: server.setRequestHandler(ListPromptsSchema, ...)');
}

// ─── scaffold agent-webhook ──────────────────────────────────────────────────
// Long-running task callback pattern — for tools that take >30s.

function scaffoldAgentWebhook(): void {
  writeIfMissing('src/lib/task-queue.ts', `// Long-running task queue with webhook callback.
// For tools that take >30s (scraping, analysis, generation).
//
// Flow:
// 1. Client calls tool → gets { taskId, status: "queued", callbackUrl? }
// 2. Server processes async → updates status → calls webhook when done
// 3. Client polls GET /tasks/:id or receives webhook POST

interface Task {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  error?: { code: string; message: string };
  createdAt: string;
  completedAt?: string;
  callbackUrl?: string;
}

const tasks = new Map<string, Task>();

/** Create a new async task */
export function createTask(callbackUrl?: string): Task {
  const id = \`task_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`;
  const task: Task = {
    id, status: 'queued', createdAt: new Date().toISOString(), callbackUrl,
  };
  tasks.set(id, task);
  return task;
}

/** Get task status */
export function getTask(id: string): Task | undefined { return tasks.get(id); }

/** Complete a task and optionally call webhook */
export async function completeTask(id: string, result: unknown): Promise<void> {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'completed';
  task.result = result;
  task.completedAt = new Date().toISOString();

  if (task.callbackUrl) {
    try {
      await fetch(task.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, status: 'completed', result }),
      });
    } catch (err) {
      console.error(\`Webhook failed for task \${id}: \${String(err)}\`);
    }
  }
}

/** Fail a task */
export async function failTask(id: string, error: { code: string; message: string }): Promise<void> {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'failed';
  task.error = error;
  task.completedAt = new Date().toISOString();

  if (task.callbackUrl) {
    try {
      await fetch(task.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, status: 'failed', error }),
      });
    } catch { /* webhook failed */ }
  }
}

// Usage in a tool:
// const task = createTask(params.callbackUrl);
// processInBackground(task.id, params); // don't await
// return { content: [{ type: 'text', text: JSON.stringify({ taskId: task.id, status: 'queued' }) }] };
`, 'Task queue');

  info('For tools that take >30s: createTask() → process async → completeTask()');
  info('Client can poll GET /tasks/:id or provide callbackUrl for webhook.');
}

// ─── scaffold agent-cost ─────────────────────────────────────────────────────
// Per-call cost estimation + audit log for tools calling paid APIs.

function scaffoldAgentCost(): void {
  writeIfMissing('src/lib/cost-tracker.ts', `// Cost Tracker — estimate and log costs for tools calling paid external APIs.
// Wraps tool calls with cost estimation and writes to an append-only audit log.

interface CostEntry {
  timestamp: string;
  tool: string;
  externalApi: string;
  estimatedCost: number;  // USD
  currency: string;
  inputTokens?: number;
  outputTokens?: number;
  details?: string;
}

const auditLog: CostEntry[] = [];

/** Known pricing (update as needed) */
const PRICING: Record<string, { perInputToken?: number; perOutputToken?: number; perCall?: number }> = {
  'openai/gpt-4o':       { perInputToken: 2.50 / 1_000_000, perOutputToken: 10.00 / 1_000_000 },
  'openai/gpt-4o-mini':  { perInputToken: 0.15 / 1_000_000, perOutputToken: 0.60 / 1_000_000 },
  'anthropic/claude-sonnet': { perInputToken: 3.00 / 1_000_000, perOutputToken: 15.00 / 1_000_000 },
  'stripe/api-call':     { perCall: 0.00 },    // Stripe charges via their own billing
  'google-maps/geocode': { perCall: 0.005 },
  'twilio/sms':          { perCall: 0.0079 },
};

/** Estimate cost for an API call */
export function estimateCost(
  externalApi: string,
  opts: { inputTokens?: number; outputTokens?: number; calls?: number },
): number {
  const pricing = PRICING[externalApi];
  if (!pricing) return 0;

  let cost = 0;
  if (pricing.perInputToken && opts.inputTokens) cost += pricing.perInputToken * opts.inputTokens;
  if (pricing.perOutputToken && opts.outputTokens) cost += pricing.perOutputToken * opts.outputTokens;
  if (pricing.perCall) cost += pricing.perCall * (opts.calls ?? 1);
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

/** Log a cost entry */
export function logCost(entry: Omit<CostEntry, 'timestamp'>): void {
  const full: CostEntry = { ...entry, timestamp: new Date().toISOString() };
  auditLog.push(full);
  // Optional: also append to a file for persistence
  // appendFileSync('docs/cost-audit.jsonl', JSON.stringify(full) + '\\n');
}

/** Get audit summary */
export function getCostSummary(): { totalUsd: number; byTool: Record<string, number>; byApi: Record<string, number>; entries: number } {
  const byTool: Record<string, number> = {};
  const byApi: Record<string, number> = {};
  let totalUsd = 0;

  for (const e of auditLog) {
    totalUsd += e.estimatedCost;
    byTool[e.tool] = (byTool[e.tool] ?? 0) + e.estimatedCost;
    byApi[e.externalApi] = (byApi[e.externalApi] ?? 0) + e.estimatedCost;
  }

  return { totalUsd: Math.round(totalUsd * 100) / 100, byTool, byApi, entries: auditLog.length };
}

// Usage in a tool:
// const cost = estimateCost('openai/gpt-4o', { inputTokens: 500, outputTokens: 200 });
// logCost({ tool: 'analyze', externalApi: 'openai/gpt-4o', estimatedCost: cost, currency: 'USD', inputTokens: 500, outputTokens: 200 });
`, 'Cost tracker');

  info('Track costs: estimateCost("openai/gpt-4o", { inputTokens, outputTokens })');
  info('Log: logCost({ tool, externalApi, estimatedCost, currency })');
  info('Summary: getCostSummary() → { totalUsd, byTool, byApi }');
  info('Update PRICING in cost-tracker.ts with your actual API costs.');
}
```
