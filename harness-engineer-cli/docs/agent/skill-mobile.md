# Mobile — Expo React Native

## Project Architecture

Expo with React Native uses a **feature-oriented architecture** with Expo Router for
file-based navigation. Each feature is self-contained — screen, components, state, and
API calls all live together.

```
apps/mobile/
├── app/                         ← Expo Router file-based routes (thin re-exports only)
│   ├── (auth)/
│   │   ├── sign-in.tsx          → re-exports features/auth/sign-in-screen
│   │   └── sign-up.tsx          → re-exports features/auth/sign-up-screen
│   ├── (app)/
│   │   ├── _layout.tsx          → protected route layout
│   │   ├── home.tsx
│   │   └── profile.tsx
│   ├── _layout.tsx              ← root layout (auth provider, navigation config)
│   └── +not-found.tsx
├── features/                    ← ALL feature logic lives here
│   ├── auth/
│   │   ├── sign-in-screen.tsx
│   │   ├── sign-up-screen.tsx
│   │   ├── components/
│   │   │   └── auth-form.tsx
│   │   ├── api.ts               ← React Query hooks for auth
│   │   └── use-auth-store.ts    ← Zustand store (optional)
│   ├── home/
│   │   ├── home-screen.tsx
│   │   └── components/
│   └── profile/
│       └── profile-screen.tsx
├── components/                  ← Shared UI components (used in 2+ features)
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── text.tsx
│   └── layout/
│       └── safe-area.tsx
├── lib/                         ← Infrastructure (features depend on this)
│   ├── auth-client.ts           ← Better Auth / auth provider client
│   ├── api.ts                   ← API base client (axios/fetch wrapper)
│   ├── storage.ts               ← expo-secure-store abstraction
│   └── env.ts                   ← typed environment variables
├── hooks/                       ← Shared custom hooks
├── constants/
│   └── colors.ts
├── assets/
├── app.json                     ← Expo config (scheme, bundleIdentifier, package)
├── eas.json                     ← EAS Build + Submit profiles
├── metro.config.js              ← Metro bundler (required for monorepo)
├── tsconfig.json
└── package.json
```

### Key architecture rules
- `app/` routes are **thin re-exports** only: `export { HomeScreen as default } from '@/features/home/home-screen'`
- All logic, state, API calls belong in `features/`
- Shared code only moves to `components/` when used in 2+ features
- Never import across features — shared logic goes through `components/` or `lib/`
- `lib/` is infrastructure: auth, API client, storage, env. Features import from `lib/`, not the other way

---

## Monorepo Setup for Expo (Important Caveats)

Single-package Expo apps can use `bun`, `yarn`, or `npm`. The guidance below is about
Expo projects that use EAS Build plus workspaces / monorepos.

Expo + monorepo has specific requirements. **Use `yarn` or `bun` workspaces, not `pnpm`** for Expo projects when using EAS Build — EAS Build internally assumes Yarn.

**If using pnpm monorepo + EAS Build**, the workaround is:
- Dev: workspace-linked packages (fast, local)
- Prod: publish `packages/*` as actual npm packages, let EAS treat them as normal deps

**pnpm-workspace.yaml** — must force hoisted installs for React Native:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**.npmrc** (required for Expo + pnpm to avoid broken dependency chains):
```
node-linker=hoisted
```

**metro.config.js** (SDK 52+ auto-configures for monorepos — delete manual overrides if migrating):
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNxMetro } = require('@nx/expo'); // only if using Nx

const config = getDefaultConfig(__dirname);
module.exports = config;
// Do NOT manually set watchFolders, resolver.nodeModulesPaths etc. for SDK 52+
```

**Critical**: Only one version of React Native is allowed in the entire monorepo.
Check with: `pnpm why --recursive react-native`

---

## Environment Variables in Expo

Expo uses a different env variable convention than Node.js:

```
# Server-side only (API, backend)
BETTER_AUTH_SECRET=...
DATABASE_URL=...

# Expo client-side — MUST be prefixed with EXPO_PUBLIC_
EXPO_PUBLIC_API_URL=https://api.yourapp.com
EXPO_PUBLIC_APP_SCHEME=yourapp
```

`EXPO_PUBLIC_*` variables are **inlined at build time** by Metro. They are visible in the
bundle — never put secrets in EXPO_PUBLIC_ vars.

Access in code:
```ts
// lib/env.ts
export const ENV = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL!,
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME!,
};
```

For per-environment values, use `app.config.js` (dynamic) instead of `app.json`:
```js
// app.config.js
export default ({ config }) => ({
  ...config,
  name: process.env.APP_ENV === 'production' ? 'MyApp' : 'MyApp (Dev)',
  ios: {
    bundleIdentifier: process.env.APP_ENV === 'production'
      ? 'com.yourco.myapp'
      : 'com.yourco.myapp.dev',
  },
  android: {
    package: process.env.APP_ENV === 'production'
      ? 'com.yourco.myapp'
      : 'com.yourco.myapp.dev',
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
});
```

---

## EAS Configuration (eas.json)

Three standard build profiles — development, preview, production:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "requireCommit": true
  },
  "build": {
    "base": {
      "node": "20.x",
      "env": {
        "APP_ENV": "production"
      }
    },
    "development": {
      "extends": "base",
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_ENV": "development",
        "EXPO_PUBLIC_API_URL": "http://localhost:3000"
      },
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "extends": "base",
      "distribution": "internal",
      "env": {
        "APP_ENV": "preview",
        "EXPO_PUBLIC_API_URL": "https://api-staging.yourapp.com"
      }
    },
    "production": {
      "extends": "base",
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production",
        "EXPO_PUBLIC_API_URL": "https://api.yourapp.com"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      },
      "android": {
        "track": "internal"
      }
    }
  }
}
```

---

## Deployment Pipeline — iOS vs Android

### Pre-requisites (one-time setup, human does this manually)

**iOS:**
1. Paid Apple Developer account ($99/year) at developer.apple.com
2. Create App ID in Apple Developer Portal (matches `ios.bundleIdentifier` in app.json)
3. Create app record in App Store Connect
4. Note the ASC App ID (numeric, goes in `eas.json` submit profile)
5. EAS manages signing credentials automatically — run `eas credentials` to verify

**Android:**
1. Google Play Developer account ($25 one-time) at play.google.com/console
2. Create app in Google Play Console
3. **First upload must be manual** — download AAB from EAS and upload via Play Console UI
   (After first manual upload, API-based submissions via EAS Submit work)
4. EAS manages the keystore — run `eas credentials` to view/update

---

### Build Profiles Explained

| Profile | Purpose | Distribution | iOS | Android |
|---------|---------|-------------|-----|---------|
| `development` | Local dev with expo-dev-client | Internal (device/simulator) | Simulator build or device (ad hoc) | APK |
| `preview` | Team QA / stakeholder review | Internal (URL-shareable) | Ad hoc (registered UDIDs) | APK |
| `production` | App store release | Store | .ipa → App Store Connect | .aab → Play Store |

---

### Full Deployment Flow

#### Development Build (daily dev)
```bash
# First time — install expo-dev-client
npx expo install expo-dev-client

# Build dev client (simulator)
eas build --profile development --platform ios

# Or for physical device
eas build --profile development --platform android
# Install via QR code / Expo Orbit
```

#### Preview Build (team QA)
```bash
# Build for both platforms
eas build --profile preview --platform all

# Share via EAS internal distribution URL (no store required)
# iOS: devices must be registered via eas device:create first
# Android: direct APK install
```

#### Production Build → Store

**iOS:**
```bash
# 1. Build production binary
eas build --profile production --platform ios

# 2. Submit to TestFlight (auto)
eas submit --profile production --platform ios --latest

# OR build + submit in one step
eas build --profile production --platform ios --auto-submit

# 3. In App Store Connect:
#    - TestFlight internal testing: available immediately after Apple processes (~10-15 min)
#    - TestFlight external testing: requires Apple Beta App Review (~hours)
#    - App Store release: fill metadata + screenshots → Submit for Review (~1-2 days)
```

**Android:**
```bash
# 1. Build production AAB
eas build --profile production --platform android

# 2. Submit to Play Store
eas submit --profile production --platform android --latest
# Default track: "internal" (per eas.json)
# Change to "alpha", "beta", or "production" in eas.json submit.android.track

# 3. In Play Console:
#    - Internal testing: available immediately, up to 100 testers
#    - Closed/open testing (alpha/beta): larger groups
#    - Production: triggers Google review and public rollout
```

---

### iOS vs Android Key Differences

| | iOS | Android |
|--|-----|---------|
| **Test distribution** | TestFlight (internal 100 / external 10k) | Play Store tracks (internal → alpha → beta → prod) |
| **Internal test speed** | ~10-15 min processing | Near-instant |
| **External test review** | Beta App Review required | No review for internal/alpha |
| **Production review** | 1-2 days (App Review) | Hours to days (Google review) |
| **Build artifact** | `.ipa` | `.aab` (store) or `.apk` (direct install) |
| **Signing** | Apple provisioning profile + cert | Android keystore |
| **First submission** | Automated via EAS | First upload must be manual via Play Console |
| **Device registration** | UDID required for ad hoc | Not required for APK |
| **Simulator builds** | EAS or local Xcode | Android Emulator (any machine) |

---

### OTA Updates (EAS Update)

For JS/asset-only changes that don't touch native code, use EAS Update to bypass
the app store review cycle:

```bash
# Install
npx expo install expo-updates

# Configure update channels in eas.json build profiles:
# "channel": "production" (in production profile)
# "channel": "preview"    (in preview profile)

# Push an OTA update
eas update --channel production --message "Fix login crash"

# The app checks for updates on launch and applies on next restart
```

**OTA update limitations:**
- Only JS bundle + assets — no native code changes
- Native changes require a full EAS build + store submission
- Cannot be used to add new native modules or change app.json native fields

---

### CI/CD with EAS Workflows

Create `.eas/workflows/build-and-submit.yml`:

```yaml
name: Build and submit on merge to main
on:
  push:
    branches: ['main']

jobs:
  build_ios:
    name: Build iOS (production)
    type: build
    params:
      platform: ios
      profile: production

  build_android:
    name: Build Android (production)
    type: build
    params:
      platform: android
      profile: production

  submit_ios:
    name: Submit to TestFlight
    needs: [build_ios]
    type: testflight
    params:
      build_id: ${{ needs.build_ios.outputs.build_id }}

  submit_android:
    name: Submit to Play Store internal
    needs: [build_android]
    type: submit
    params:
      platform: android
      build_id: ${{ needs.build_android.outputs.build_id }}
```

For PRs, create `.eas/workflows/preview.yml`:

```yaml
name: Preview build on PR
on:
  pull_request:
    branches: ['main']

jobs:
  preview:
    name: Build preview
    type: build
    params:
      platform: all
      profile: preview
```

---

---

### Harness CLI Integration for Expo Projects

Expo projects are Node-based, so the **TypeScript CLI** (`scripts/harness.ts`) applies.
Do NOT use `harness-native.md` for mobile projects.

**`harness validate` wiring for mobile:**

`cmdValidate` in the TypeScript CLI calls `lint:fix`, `lint`, `type-check`, and `test` —
the script names must match **exactly** or npm/pnpm will throw "Missing script".

```json
// package.json scripts — use the exact names cmdValidate expects
{
  "lint:fix":    "eslint . --fix",
  "lint":        "eslint .",
  "type-check":  "tsc --noEmit",
  "test":        "jest --passWithNoTests"
}
```

`harness validate:full` on mobile should guard E2E tests as optional:
```typescript
// In validate.ts, the e2e step should use:
if (existsSync('e2e/')) {
  execSync(`${PKG} run test:e2e`, { stdio: 'inherit' });
  // Expo E2E (Maestro/Detox) requires a running simulator — skip in CI unless explicitly set up.
}
```

**`docs/product/frontend-design.md` — required (Iron Rule 5):**
Expo/React Native is a UI project. `docs/product/frontend-design.md` MUST be bundled in the
project following the same 3-strategy approach in SKILL.md. AGENTS.md Iron Rule 5 must
point to it. All screen and component work reads it first.

**`docs/product/design.md` + `docs/product/design-preview.html` — required UI review artifacts:**
- `docs/product/design.md` is the authoritative mobile screen inventory: routes/screens, purpose,
  primary action, key elements, and critical states.
- `docs/product/design-preview.html` is still generated for mobile projects. Use the phone-frame
  variant as a self-contained, mid-fi styled static preview for human review before Phase 4.

**Scaffold additions for mobile (added to Phase 3 output):**
- `docs/product/frontend-design.md` — generated from frontend-design skill (see SKILL.md load order)
- `docs/product/design.md` — generated from the screen inventory
- `docs/product/design-preview.html` — generated from the screen inventory + frontend design rules
- `.env.example` — `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_ENV`; note that `EXPO_PUBLIC_*`
  vars are inlined in the bundle — never put secrets here
- `eas.json` — development / preview / production build profiles
- `.eas/workflows/` — optional CI automation for builds

**Git hook note:**
`.husky/pre-commit` runs `npx expo export --dry-run` is too slow for per-commit validation.
Use only lint + type-check in pre-commit; reserve `expo export` for CI or `validate:full`.

### Common Pitfalls

- **EAS Build + pnpm**: EAS internally assumes Yarn. If using pnpm monorepo, publish `packages/*` to npm for prod builds
- **Metro cache**: Run `npx expo start --clear` after switching SDK versions or modifying metro.config.js
- **Duplicate React Native versions**: Use your package manager's dependency-inspection command
  (`pnpm why --recursive react-native`, `yarn why react-native`, etc.) — only one version allowed
- **iOS UDID limits**: Ad hoc profile limited to 100 registered devices. Use TestFlight for larger QA groups
- **Android first upload**: The first AAB must be uploaded manually in Play Console before EAS Submit API works
- **Bundle identifier drift**: Keep `app.json` and `eas.json` in sync with Apple/Google developer accounts. Run `eas credentials` to verify
- **Environment variable exposure**: `EXPO_PUBLIC_*` vars are inlined in the bundle — visible to anyone who decompiles the app. Never store API secrets there

