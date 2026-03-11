# Desktop App — Electron / Tauri

Use this reference whenever the selected project type is `Desktop App`, or when the user mentions
Electron, Tauri, tray apps, menubar apps, local-first workflows, file-system access, native
menus, or auto-updating installers.

This file is the **primary desktop reference**. Do not fall back to generic "web app + web
search" behavior. Use web search only for version-sensitive packaging, signing, notarization,
updater, or plugin setup that depends on the exact framework version.

---

## Choosing the Desktop Shell

Default decision rule:

- Prefer **Tauri** when bundle size, startup time, tighter privilege boundaries, and native-feel
  distribution matter more than Node ecosystem compatibility.
- Prefer **Electron** when the app depends on Node-native modules, mature desktop ecosystem
  packages, browser-like debugging/tooling, or complex background process integrations.

Ask directly if the tradeoff matters:

> "For desktop, do you want the smaller Rust-backed shell (`Tauri`) or the broader Node ecosystem
> and tooling (`Electron`)? If you don't care, I'll default to Tauri for lighter footprint."

If the user already picked Electron or Tauri, keep that choice and optimize within it.

---

## Non-Negotiable Desktop Rules

- Keep the **privileged shell** and the **UI renderer** separate. Never mix app shell code,
  window lifecycle, and UI code in one module tree.
- All privileged operations must go through a **thin bridge layer**:
  preload + `contextBridge`/IPC for Electron, or typed commands/plugins for Tauri.
- Validate all IPC / command payloads at the boundary. Treat the renderer as untrusted input.
- Desktop apps still follow the harness rules: structured logging, zero build warnings, no
  TODO/FIXME in committed code, tests for happy path and at least one failure path.
- Generate `docs/product/frontend-design.md`, `docs/product/design.md`, and `docs/product/design-preview.html` for
  desktop apps with UI. The preview is the mid-fi static review artifact before Phase 4.
- Generate `docs/product/release.md` for desktop apps. Include packaging target, signing/notarization,
  updater channel, and manual QA smoke steps for each OS.

---

## Electron Scaffold

Canonical layout:

```text
src/
├── main/
│   ├── index.ts           ← app lifecycle, BrowserWindow creation, single-instance lock
│   ├── windows/
│   │   └── main-window.ts
│   ├── ipc/
│   │   ├── index.ts
│   │   └── handlers/
│   ├── menu/
│   │   └── app-menu.ts
│   └── updater/
│       └── index.ts
├── preload/
│   └── index.ts           ← minimal contextBridge surface
├── renderer/
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── lib/
├── shared/
│   ├── contracts/
│   └── types.ts
└── lib/
    ├── errors.ts
    └── logger.ts
```

Required Electron security defaults:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` unless a documented dependency forces a different choice
- Renderer gets a **minimal** API surface via `contextBridge`
- One IPC module per capability area, not a giant catch-all channel file

Implementation rules:

- Define a typed contract for each IPC channel under `src/shared/contracts/`
- Preload exposes only high-level functions such as `window.api.saveFile()`
- Main process validates every incoming payload before calling filesystem, network, or OS APIs
- Keep menus, updater, and tray integration under `src/main/`, never in renderer code

Packaging / release:

- Default packager: `electron-builder` when signed installers and auto-update feeds are needed
- Keep signing and update configuration in explicit release files, not inline in application code
- Generate a release checklist covering Windows code signing, macOS notarization, Linux targets,
  and update feed/channel configuration

Testing minimum:

- Renderer component tests
- One main-process smoke test for window boot
- One IPC contract test per privileged capability
- One packaging smoke checklist in `docs/product/release.md`

---

## Tauri Scaffold

Canonical layout:

```text
src/                        ← frontend UI
├── App.tsx
├── pages/
├── components/
├── hooks/
└── lib/
src-tauri/
├── src/
│   ├── lib.rs              ← shared Rust modules
│   ├── main.rs             ← Tauri builder + plugin wiring
│   ├── commands/
│   │   └── mod.rs
│   └── state/
│       └── mod.rs
├── capabilities/
│   └── default.json
├── icons/
├── Cargo.toml
└── tauri.conf.json
```

Required Tauri rules:

- Use **Tauri v2 capability files** to scope shell/plugin access per window instead of granting
  broad privileges everywhere
- Keep frontend-to-Rust calls behind a typed wrapper in `src/lib/desktop.ts`
- Rust commands must validate input and return structured errors
- Add only the plugins the product actually needs: dialog, updater, store, shell, fs, etc.

Implementation rules:

- Group commands by domain under `src-tauri/src/commands/`
- Keep stateful backend services in `src-tauri/src/state/`
- Do not let frontend code call raw `invoke()` strings all over the app; centralize them in one
  typed client module
- For local persistence, document whether data lives in Tauri Store, SQLite, or OS-specific
  app data directories

Packaging / release:

- Use `tauri build` for production artifacts
- Generate `docs/product/release.md` with updater channel, signing expectations, notarization, and
  per-platform smoke tests
- If updater support is enabled, document the exact plugin/configuration pair and release channel

Testing minimum:

- Frontend tests for core screens
- Rust unit tests for commands and state modules
- One integration smoke flow covering frontend → command → persistence/result
- One packaging smoke checklist in `docs/product/release.md`

---

## Shared Desktop Architecture

Always generate:

- `src/lib/logger.ts` or equivalent structured logger
- `src/lib/errors.ts` and platform-specific error adapters
- `docs/product/release.md`
- `tests/desktop/` or equivalent integration smoke area

Recommended release document sections:

- Target platforms: Windows, macOS, Linux
- Packaging tool / build command
- Signing / notarization requirements
- Auto-update strategy and channels
- Manual QA smoke flow: launch, open main window, core action, persistence, update check

---

## Desktop + Monorepo

Desktop projects fit well in monorepos when the shell shares code with web or backend apps.

Preferred layouts:

- `apps/desktop` + `packages/ui` + `packages/core`
- `apps/desktop` + `apps/web` when the product ships both installed and browser variants
- `apps/desktop` + `packages/contracts` when the desktop shell calls a separate backend

Rules:

- Shared UI belongs in `packages/ui` only if the renderer truly shares components with another app
- Shell-only code stays local to `apps/desktop`
- For Tauri, keep Rust workspace files under `apps/desktop/src-tauri/` or hoist them to a repo
  workspace only when there are multiple Rust crates
- For Electron, shared TypeScript packages can live in `packages/`, but main-process code must
  not import renderer-only modules

---

## Desktop Research Checklist

Only run targeted web search when one of these is unresolved:

- Updater plugin/package choice and release feed format
- macOS notarization or Windows signing specifics
- Framework-version-specific build config
- New plugin APIs that are not covered by the current reference

Prefer official docs:

- Electron process model, preload, `contextBridge`, IPC, and security checklist
- Tauri v2 capabilities, command model, and updater/plugin docs

When you do search, summarize the result into the generated `docs/product/release.md` or architecture
notes so the downstream agent does not need to rediscover it.

