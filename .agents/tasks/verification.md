# AidPal Thin-Slice — Verification Record

**Date:** first implementation iteration
**Environment:** Windows / PowerShell
**Iteration:** FIRST (no `review.json` present — built from `plan.md` + `design.md v4` from scratch)

---

## Node.js installation

Node/npm were NOT on PATH at start (confirmed: `node`, `npm`, `npx` all "not recognized"). A `winget install OpenJS.NodeJS.LTS` was attempted but the MSI did not complete non-interactively (likely needs admin elevation). A **portable Node.js v20.19.2 (LTS)** was then downloaded and extracted to:

```
%LOCALAPPDATA%\nodejs-portable\node-v20.19.2-win-x64
```

All `npm`/`next`/`vitest` commands were run with that directory prepended to PATH for the session. Node 20 LTS is the version the design targets as the prerequisite.

> Note for the user: this portable Node is session-local. For normal development, install Node.js LTS 20+ system-wide per `README.md` step 1 so `node`/`npm` are on your PATH.

---

## Commands run and results

### 1. `npm install`

```
added 52 packages, and audited 417 packages
```

Succeeded. (npm reported audit advisories in transitive dev dependencies; these are not introduced by app code and do not affect the production build.)

### 2. `npm test` (Vitest)

```
✓ tests/validation.test.ts (40 tests) 10ms
Test Files  1 passed (1)
     Tests  40 passed (40)
```

All 40 unit tests pass — validators, `safeNextPath` open-redirect guard (incl. `//evil.com`, `https://evil.example`, `javascript:alert(1)`, null/empty → `/profile`), and the `buildMediaKey` storage-path builder.

### 3. `npm run build` (production build)

Final result — **passed with no type or lint errors**:

```
▲ Next.js 16.3.8 (Turbopack)
✓ Compiled successfully in 1190ms
✓ Finished TypeScript in 2.4s
✓ Collecting page data
✓ Generating static pages (11/11)
✓ Finalizing page optimization

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /auth/callback
├ ○ /groups
├ ƒ /groups/[id]
├ ○ /groups/new
├ ○ /login
├ ○ /profile
├ ○ /profile/edit
└ ○ /register
ƒ Proxy (Middleware)
```

**Two type errors were found and fixed before this passing run:**
1. `NavBar.tsx` — a `<form action>` must return `void`; `signOut()` returns `ActionResult`. Fixed by wrapping it in an inline `"use server"` action that `await`s `signOut()` and returns void.
2. `proxy.ts` — `updateSession` had a union return type (bare `NextResponse` vs `{ supabaseResponse, user }`). Fixed by making it always return `{ supabaseResponse, user }`.

### Graceful degradation (no Supabase env)

The build ran with **no `.env.local` present** (confirmed `Test-Path .env.local` → False). The build compiled, collected page data, and prerendered all 11 routes **without throwing** — this is the no-env graceful-degradation guarantee holding at build time. At runtime the config-guarded pages render `<SupabaseNotConfigured />` instead of calling the SDK. `npm run dev` was intentionally NOT run (long-running; documented in README for the user).

---

## Next.js 16 note (vs the "Next 15" wording in plan/design)

`create-next-app@latest` scaffolded **Next.js 16.3.8** (latest, App Router, React 19, Tailwind v4). This is compatible with the locked design — the App Router architecture, server actions, RLS model, and scope are unchanged. One Next.js 16 breaking-change was accommodated per the in-repo docs (`node_modules/next/dist/docs`):

- **`middleware.ts` is deprecated and renamed to `proxy.ts`** (exported function `proxy` instead of `middleware`). The route-protection file is therefore `src/proxy.ts`. The design treats this layer as **UX only** — server-side `getUser()` checks and RLS remain the real enforcement — so this rename changes no user-visible behavior and no scope. `params`/`searchParams`/`cookies()` are awaited as async (Next 15/16 requirement), already reflected in all pages.

---

## Scope check

Grep across `src/**` for out-of-scope terms (donation, payment, stripe, volunteer, "friend of", moderation, avatar upload, SMS, phone verification) returned **no matches**. In-scope features implemented: email+password auth (register/login/logout, token_hash/verifyOtp callback), profiles with optional pasted avatar URL, public/private groups + browse, server-action photo upload, comments, like+count, and the graceful config screen.

## Deliverables present

- `supabase/schema.sql` — tables, RLS on all 7 tables, 4 SECURITY DEFINER helpers, `create_group` RPC, media bucket + storage policies, idempotent (`on conflict do nothing` / `drop policy if exists`).
- `.env.example` (committed, placeholders only), `.gitignore` (ignores `.env.local`), `README.md` (Windows PowerShell, `;` separators, token_hash email-template step, user-run `npm run dev`).
- Full `src/` app + `tests/validation.test.ts`.
