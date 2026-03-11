# Authentication — Better Auth

Better Auth is a TypeScript-first, framework-agnostic auth library. Self-hosted,
no vendor lock-in, works with any database (Prisma, Drizzle, raw SQL).

---

## Phase 3 Scaffold Integration

When auth is selected during Step 4 (tech stack choices), the Phase 3 scaffold
generation must include auth-specific tasks and wiring. Do this BEFORE generating
the exec-plan, so auth tasks appear in `docs/exec-plans/active/001-initial-setup.md`.

**Auth tasks to add to M1 (or the first milestone) in the exec-plan:**

Replace `M1-00X` with the next available task number in the **draft M1 table you are
already assembling in Phase 2.5**. Use the in-memory exec-plan content to find the
highest assigned task number, then continue sequentially: if the current last task in
the draft table is `M1-007`, add auth tasks as `M1-008`, `M1-009`, etc.
Do NOT run `harness plan:status` or inspect on-disk `PLAN.md` here — the scaffold and
CLI do not exist yet.

```markdown
| M1-00X | Auth | Install Better Auth + configure lib/auth.ts | `pnpm run harness validate` passes; auth config exports `auth` object | ⬜ | — |
| M1-00X | Auth | Add env vars to .env.example | All BETTER_AUTH_* vars documented; server starts without auth errors | ⬜ | — |
| M1-00X | Auth | Mount auth handler route | /api/auth/* responds 200 for all methods | ⬜ | — |
| M1-00X | Auth | Run schema migration | User, Session, Account, Verification tables exist in DB | ⬜ | — |
| M1-00X | Auth | Write auth integration test | Sign up + sign in flow passes; invalid creds return 401 | ⬜ | — |
```

These rows describe **future execution tasks**. Their `Done When` cells are acceptance
criteria for Phase 4; do not try to run validation, migrations, or handlers during
scaffold generation itself.

After adding auth tasks, also update `ARCHITECTURE.md`: add an **Auth Layer** section
describing the auth library chosen, session strategy (HttpOnly cookie / SecureStore),
protected route approach, and the DB tables created (`user`, `session`, `account`,
`verification`). Keep it to one concise paragraph — the goal is discoverability for
future agents, not exhaustive documentation.

**Auth handler mount by framework** (wire this in Phase 3 scaffold, not just Setup):

```typescript
// Next.js App Router — app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
export const { GET, POST } = toNextJsHandler(auth);

// Hono (Cloudflare Workers / Node) — Better Auth v1.x handler API
import { auth } from './lib/auth';
import { Hono } from 'hono';
const app = new Hono();
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
// Note: better-auth/integrations/hono does NOT exist. Use auth.handler(c.req.raw) directly.

// Express
import { auth } from './lib/auth';
import { toNodeHandler } from 'better-auth/node';
app.all('/api/auth/*', toNodeHandler(auth));

// Fastify
import { auth } from './lib/auth';
import { fromNodeHandler } from 'better-auth/node';
fastify.all('/api/auth/*', async (request, reply) => {
  await fromNodeHandler(auth)(request.raw, reply.raw);
});
```

Generate the mount file appropriate for the chosen framework — do NOT leave it
as a copy-paste comment. The scaffolded file must match the framework selected in Phase 1.

---

## Installation

```bash
# Backend (API / server)
pnpm add better-auth

# Expo mobile app
pnpm add better-auth @better-auth/expo expo-secure-store
```

---

## Required Environment Variables

**Add to `.env` and `.env.example` immediately. These must be set before ANY auth
code runs.**

```env
# ──────────────────────────────────────────────────────────────
# Better Auth Core (required)
# ──────────────────────────────────────────────────────────────
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=<32-char-minimum-high-entropy-secret>

# Your backend URL (used to construct OAuth callback URLs)
BETTER_AUTH_URL=https://api.yourapp.com
# Local: BETTER_AUTH_URL=http://localhost:3000

# ──────────────────────────────────────────────────────────────
# OAuth Providers (add only the ones you're using)
# ──────────────────────────────────────────────────────────────
# Google: console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>

# GitHub: github.com/settings/applications/new
GITHUB_CLIENT_ID=<from-github>
GITHUB_CLIENT_SECRET=<from-github>

# Apple Sign In (requires Apple Developer account + paid plan)
APPLE_CLIENT_ID=<your-service-id-from-apple-developer>
APPLE_TEAM_ID=<your-apple-team-id>
APPLE_KEY_ID=<your-key-id>
# Path to the .p8 private key file downloaded from Apple Developer
APPLE_PRIVATE_KEY_PATH=./secrets/AuthKey_<KEY_ID>.p8

# ──────────────────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# ──────────────────────────────────────────────────────────────
# Email (for password reset, magic links, verification)
# ──────────────────────────────────────────────────────────────
# Resend (recommended): resend.com/api-keys
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourapp.com

# OR SMTP:
# SMTP_HOST=smtp.yourprovider.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
```

---

## Platform Setup Checklist

### Google OAuth
1. Go to console.cloud.google.com → Create/select project
2. APIs & Services → Credentials → Create Credentials → OAuth Client ID
3. Application type: **Web application**
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://api.yourapp.com/api/auth/callback/google` (prod)
5. Copy Client ID + Secret into `.env`
6. For mobile (Expo): add the deep link scheme as an authorized redirect URI:
   - `yourapp://` or `yourapp://oauth`

### GitHub OAuth
1. github.com/settings/developers → OAuth Apps → New OAuth App
2. Homepage URL: `https://yourapp.com`
3. Callback URL: `https://api.yourapp.com/api/auth/callback/github`
4. Copy Client ID + Secret into `.env`

### Apple Sign In (most complex — iOS App Store may require it)
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → App IDs
2. Enable "Sign In with Apple" capability
3. Create a Service ID (this is your `APPLE_CLIENT_ID`)
4. Configure web authentication: add domain + return URL (`https://api.yourapp.com/api/auth/callback/apple`)
5. Keys → Create a new key → Enable "Sign In with Apple"
6. Download the `.p8` file (only downloadable once — store securely, never commit to git)
7. Note the Team ID (top right of developer portal) and Key ID

---

## Backend Server Setup (`lib/auth.ts`)

```ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { expo } from '@better-auth/expo';
import { prisma } from '@/lib/db';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  // Email + password
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  // Social providers — only include what you have configured
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  // Required for Expo mobile clients
  plugins: [expo()],

  // Trusted origins — add all your client URLs
  trustedOrigins: [
    'http://localhost:8081',    // Expo dev server
    'https://yourapp.com',      // Web client
    'yourapp://',               // Expo deep link scheme
  ],
});

export type Auth = typeof auth;
```

**Mount the handler** (example: Next.js App Router):
```ts
// app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
export const { GET, POST } = toNextJsHandler(auth);
```

---

## Expo Mobile Client Setup (`lib/auth-client.ts`)

```ts
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const authClient = createAuthClient({
  // Point to your backend API
  baseURL: process.env.EXPO_PUBLIC_API_URL!,

  plugins: [
    expoClient({
      scheme: process.env.EXPO_PUBLIC_APP_SCHEME!, // e.g. 'yourapp'
      storagePrefix: 'yourapp',
      storage: SecureStore,  // Sessions stored in iOS Keychain / Android Keystore
    }),
  ],
});
```

**app.json** — scheme must match:
```json
{
  "expo": {
    "scheme": "yourapp",
    "ios": { "bundleIdentifier": "com.yourco.yourapp" },
    "android": { "package": "com.yourco.yourapp" }
  }
}
```

---

## Mobile Auth Pages

Better Auth does NOT ship pre-built UI screens for Expo. You must build them.

The agent should generate these screens in `features/auth/`:

### Sign In Screen
```tsx
// features/auth/sign-in-screen.tsx
import { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { router } from 'expo-router';
import { authClient } from '@/lib/auth-client';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async () => {
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign In Failed', error.message);
    } else {
      router.replace('/(app)/home');
    }
  };

  const handleGoogleSignIn = async () => {
    // On native: opens system browser, handles deep link callback automatically
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/(app)/home',
    });
    if (error) Alert.alert('Sign In Failed', error.message);
    // On success, expo plugin handles navigation via deep link
  };

  return (
    <View>
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
      <Button title={loading ? 'Signing in...' : 'Sign In'} onPress={handleEmailSignIn} disabled={loading} />
      <Button title="Continue with Google" onPress={handleGoogleSignIn} />
    </View>
  );
}
```

### Protected Route Guard
```tsx
// app/(app)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { authClient } from '@/lib/auth-client';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null; // or a loading spinner

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Stack />;
}
```

### Making Authenticated Requests
```ts
// Session cookie is stored in SecureStore — must be manually attached to requests
const makeAuthRequest = async (url: string) => {
  const cookies = authClient.getCookie();
  return fetch(url, {
    headers: { Cookie: cookies },
    credentials: 'omit',  // Don't use 'include' — it conflicts with manual cookies
  });
};
```

---

## Database Schema (auto-generated)

After configuring auth, run the schema generator to add tables:

```bash
# Generate and apply schema to database
npx @better-auth/cli generate
npx @better-auth/cli migrate   # for Prisma: uses prisma migrate dev
```

This creates: `user`, `session`, `account`, `verification` tables.

For Prisma — add to `schema.prisma` and run:
```bash
npx prisma migrate dev --name add-better-auth-tables
```

---

## Environment Variables by Platform

When deploying, set these in your hosting platform's secrets/env UI:

| Variable | Required | Where to set |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Always | Vercel / Railway / Fly.io env secrets |
| `BETTER_AUTH_URL` | Always | Same — must match production domain |
| `DATABASE_URL` | Always | Same |
| `GOOGLE_CLIENT_ID/SECRET` | If using Google | Same |
| `GITHUB_CLIENT_ID/SECRET` | If using GitHub | Same |
| `APPLE_*` | If using Apple Sign In | Same (key content as env var, not file path) |
| `RESEND_API_KEY` | If using email auth | Same |
| `EXPO_PUBLIC_API_URL` | Mobile build | EAS environment (set in eas.json or EAS dashboard) |
| `EXPO_PUBLIC_APP_SCHEME` | Mobile build | EAS environment |

**Apple private key in CI/CD**: The `.p8` file can't be stored as a file in most
platforms. Instead, base64-encode the contents and store as a secret:
```bash
base64 -i AuthKey_KEYID.p8 | pbcopy  # copy to clipboard
```
Then in `auth.ts`, decode it: `Buffer.from(process.env.APPLE_PRIVATE_KEY_B64!, 'base64').toString('utf-8')`

---

## Common Issues

- **`redirect_uri_mismatch`**: OAuth callback URL in Google/GitHub console must exactly match `BETTER_AUTH_URL + /api/auth/callback/<provider>`
- **Mobile social sign-in**: On native (iOS/Android), `signIn.social` doesn't auto-navigate. Handle navigation manually after the call resolves via deep link
- **Session not persisting on mobile**: Ensure `expo-secure-store` is installed and passed to `expoClient`. SecureStore caches session between app restarts
- **Apple Sign In required**: Apple App Store guidelines require "Sign In with Apple" if you offer any other social sign-in (Google, Facebook, etc.)
- **`BETTER_AUTH_SECRET` rotation**: Use `BETTER_AUTH_SECRETS` (plural, array) to rotate without invalidating existing sessions

---

## Alternative Auth Providers

This skill file covers Better Auth in depth because it's self-hosted, TypeScript-native,
and gives the agent full control over the implementation. If the user chose a different
auth provider in Phase 1, use the guidance below instead.

### Clerk (managed — zero backend auth code)

Research: `clerk <framework> setup <current year>`

Key differences from Better Auth:
- No self-hosted auth code — Clerk handles everything via their SDK + hosted UI
- Install: `<pkg-mgr> add @clerk/nextjs` (or `@clerk/remix`, `@clerk/express`, `@clerk/expo`)
- Env vars: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
- Protected routes: `clerkMiddleware()` in Next.js middleware, or `requireAuth()` per-route
- User data lives in Clerk's cloud — sync to local DB via webhooks if needed
- Mobile (Expo): `@clerk/clerk-expo` + `expo-secure-store` for token storage
- Tradeoff: faster setup, no auth code to maintain, but vendor lock-in + usage-based pricing

Generate: env vars in `.env.example`, middleware setup, webhook handler if DB sync needed.
Do NOT generate auth screens — Clerk provides pre-built `<SignIn />` and `<SignUp />` components.

### Supabase Auth

Research: `supabase auth <framework> setup <current year>`

Key differences:
- Part of Supabase platform — comes free with a Supabase project
- Install: `<pkg-mgr> add @supabase/supabase-js` (or `@supabase/ssr` for server-side)
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Row Level Security (RLS): auth integrates directly with Postgres policies
- OAuth, magic links, phone OTP built-in — configure in Supabase dashboard
- Mobile (Expo): `@supabase/supabase-js` + `expo-secure-store` for session persistence
- Tradeoff: deeply integrated with Supabase DB, but coupled to Supabase platform

Generate: Supabase client init, auth helper, RLS policy examples, env vars.

### Firebase Auth

Research: `firebase auth <framework> setup <current year>`

Key differences:
- Google's managed auth — supports email/password, OAuth, phone, anonymous
- Install: `<pkg-mgr> add firebase` (client) + `firebase-admin` (server)
- Env vars: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`
- Server-side verification: `admin.auth().verifyIdToken(token)` — validate client tokens
- Mobile: `@react-native-firebase/auth` (not the web SDK — native modules required)
- Tradeoff: broad platform support, mature, but Google lock-in + complex pricing

Generate: Firebase config, auth context, server-side token verification middleware, env vars.

### None / Custom

If the user selected "None / custom":
- Do NOT generate any auth code or auth-related env vars
- Generate a placeholder `src/lib/auth.ts` (or equivalent) with a neutral note such as
  `Auth intentionally not implemented in the initial scaffold.`
- Add a `docs/tech-debt/auth-not-implemented.md` note
- In PLAN.md: do not create auth-related tasks unless the user explicitly asks later

### General Auth Rules (all providers)

Regardless of provider:
- Auth-related env vars go in `.env.example` with clear comments
- Protected routes/endpoints must be defined — never leave all routes public by default
- Session handling: use HttpOnly cookies (web) or secure storage (mobile)
- Rate limit auth endpoints: login, signup, password reset, OTP verification
- Log auth events: sign-in, sign-out, failed attempts, password changes
- If the provider supports webhooks: generate the webhook handler to sync user data to local DB
