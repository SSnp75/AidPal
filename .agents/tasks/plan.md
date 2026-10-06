# AidPal Thin-Slice — Implementation Plan

Source of truth: `c:\Projects\AidPal\.agents\tasks\design.md` (Design v4 FINAL). Product vision (read-only): `c:\Projects\AidPal\REQUIREMENTS.md`. This plan sequences that locked design; it does not re-decide architecture.

## Environment notes (read before starting)

- OS is Windows / PowerShell. All multi-statement shell commands use `;` as the separator, never `&&`. Never launch a long-running dev server (`npm run dev`) as part of a build step — it is documented for the user to run, not executed by the agent.
- Node.js / npm are NOT on PATH in this environment (verified: `node`, `npm`, `npx` all "not recognized"). This blocks `npm install`, `next build`, and `vitest` from running here. Each item below gives the real verification command; if Node is still unavailable when an item is reached, the coder must (a) attempt to locate/install Node LTS 20+ and reopen the shell, and (b) if it still cannot run, record that build/test verification was blocked by missing Node and fall back to a careful file-level review, calling this out explicitly rather than claiming a passing build. Verification commands below assume Node is present.
- All paths are absolute per the design's project structure (§3). `src/` is the app root; import alias `@/*` → `src/*`.
- Scope is locked. IN: email+password auth, profiles (pasted avatar URL only), public/private groups + browse, photo upload via server action, comments, like+count, graceful degradation with no env. OUT (build nothing): events, volunteering, "Friend of", donations/money, ranking, search, feed, moderation, phone/SMS, admin, avatar file upload.

---

# Implementation Plan

- [ ] 1. Scaffold the Next.js 15 app in place.
      Run `create-next-app` into `c:\Projects\AidPal` with TypeScript, ESLint, Tailwind, App Router, `src/` dir, and the `@/*` import alias, keeping the existing `REQUIREMENTS.md` and `.agents/` untouched. Because the directory is non-empty, scaffold into a temp dir and merge, or run with the flags that allow a non-empty target; do NOT overwrite `REQUIREMENTS.md`, `.agents/`, or any `.agents/tasks/*` file. Target Next.js 15.x, React 19.x, Tailwind v4, TypeScript 5.x strict. Use npm (lockfile `package-lock.json`).
      Files: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`, `next-env.d.ts`.
      Verify: `npm run build` from `c:\Projects\AidPal` completes with no errors (the default scaffold builds clean).

- [ ] 2. Pin dependencies and tsconfig/strict + add Vitest config and test script.
      Ensure `package.json` includes runtime deps `@supabase/supabase-js` (2.x) and `@supabase/ssr` (0.x latest), and devDeps `vitest` (latest). Add scripts: `"test": "vitest run"` (and optionally `"test:watch": "vitest"`). Confirm `tsconfig.json` has `"strict": true` and the `@/*` → `./src/*` path alias. Create `vitest.config.ts` configured for a Node/TS environment resolving the `@/*` alias so `tests/` can import from `src/lib`.
      Files: `package.json`, `tsconfig.json`, `vitest.config.ts`.
      Verify: `npm install` then `npm run build` succeeds; `npm test` runs Vitest (it reports "no tests found" until item 4 lands — that is the expected outcome here).

- [ ] 3. Write `.env.example`, confirm `.gitignore` ignores env files, and write the README (Windows PowerShell setup).
      Create `.env.example` with exactly the two placeholder vars from design §13 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — no service-role key. Ensure `.gitignore` includes `node_modules/`, `.next/`, `.env.local`, `.env*.local`, build output, and OS cruft (add any missing lines to the scaffolded `.gitignore`). Write `README.md` following design §13 steps 1–8: install Node LTS 20+ (`node --version; npm --version`), `npm install`, create Supabase project + copy URL/anon key, Auth settings (Site URL `http://localhost:3000` + Redirect URLs; Email Templates → Confirm signup link set to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`; note the `?code=` link will NOT work), run `supabase/schema.sql` in the dashboard SQL editor, `Copy-Item .env.example .env.local` then edit it, run `npm run dev` yourself, optional `npm test`, deploy later. Use `;` separators throughout; never `&&`.
      Files: `.env.example`, `.gitignore`, `README.md`.
      Verify: `Select-String -Path c:\Projects\AidPal\.gitignore -Pattern '\.env\.local'` returns a match (env file is ignored); README exists and contains the `token_hash` email-template line and the `npm run dev` user-run step.

- [ ] 4. Create the pure, unit-tested helper libraries and their tests.
      Implement `src/lib/validation.ts` with pure functions for every §9 rule (email, password min-8/max-72-bytes, displayName 1–60, bio ≤500, avatarUrl optional http(s) ≤2048, group name 1–100, description ≤1000, isPrivate coercion, post body ≤2000, comment body 1–1000, UUID check) each returning `{ ok, error }`, plus `safeNextPath(next): string` (accept only a single-leading-`/` same-origin relative path; reject `//...`, any scheme/`:`, empty/null → fall back to `/profile`). Implement `src/lib/storage-path.ts` as the pure media object-key builder producing `group/{group_id}/{post_id}/{uuid}.{ext}`. Write `tests/validation.test.ts` covering the validators, the storage-path builder, and the `safeNextPath` cases named in §12 (`/groups`, `/profile/edit` pass; `//evil.com`, `https://evil.example`, `javascript:alert(1)`, null/empty → `/profile`).
      Files: `src/lib/validation.ts`, `src/lib/storage-path.ts`, `tests/validation.test.ts`.
      Verify: `npm test` — all unit tests in `tests/validation.test.ts` pass.

- [ ] 5. Write the Supabase config reader and the three client factories + middleware helper.
      Implement `src/lib/supabase/config.ts` (`getSupabaseConfig(): { url, anonKey } | null` and `isSupabaseConfigured(): boolean`, reading the two `NEXT_PUBLIC_*` vars, returning `null` — never throwing — when either is missing or still equals the `.env.example` placeholder). Implement `src/lib/supabase/client.ts` (`createBrowserClient`), `src/lib/supabase/server.ts` (async `createClient()` via `createServerClient` wired to Next `cookies()` with a `getAll`/`setAll` adapter where **`setAll` is wrapped in try/catch and swallows write errors** per §7), and `src/lib/supabase/middleware.ts` (`updateSession(request)` that refreshes via `getUser()` and returns the `NextResponse` with refreshed cookies, or a no-op `NextResponse.next()` pass-through when config is `null`). Only the anon key is referenced anywhere. Add `src/types/db.ts` with hand-written row types for the seven slice tables.
      Files: `src/lib/supabase/config.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/types/db.ts`.
      Verify: `npm run build` succeeds with NO Supabase env present (graceful degradation holds at build time; nothing throws at module scope).

- [ ] 6. Add route protection middleware.
      Create `src/middleware.ts` that calls `updateSession` on every matched request and, for protected prefixes `/profile` and `/groups/new`, redirects to `/login?next=<current same-origin path>` when there is no session. Set a `matcher` excluding `_next/static`, `_next/image`, `favicon`, and public asset extensions. `/groups` and `/groups/[id]` are NOT protected. Treat middleware as UX only (server-side `getUser()` and RLS are the real enforcement).
      Files: `src/middleware.ts`.
      Verify: `npm run build` succeeds (middleware compiles and is picked up).

- [ ] 7. Write `supabase/schema.sql` — the complete, idempotent, re-runnable schema.
      Author the authoritative SQL per design §4: `create extension if not exists pgcrypto;`; the seven tables (`profiles`, `groups`, `group_members`, `posts`, `media`, `comments`, `likes`) with the exact columns, CHECK constraints (incl. `media.mime_type` allowlist `jpeg/png/webp/gif`, no `svg`), FKs and ON DELETE CASCADE, and composite PKs; RLS ENABLED on all seven tables; the four `SECURITY DEFINER` helpers `is_group_member`, `can_read_group`, `can_read_post`, `can_write_post_media` (each `set search_path = public`, `stable`); every SELECT/INSERT/UPDATE/DELETE policy from §4.4 written through the helpers (never a direct `group_members`/`posts` subselect; `gm_select` and `media_insert` exactly as given); the `create_group(name, description, is_private)` `SECURITY DEFINER` RPC inserting the group + owner `group_members` row atomically and returning the new id; and the `media` storage bucket (`insert ... on conflict (id) do nothing`, `public=true`) with the four `storage.objects` policies each preceded by `drop policy if exists` so the whole file re-runs cleanly.
      Files: `supabase/schema.sql`.
      Verify: no local DB here, so verify by review: confirm RLS is enabled on all seven tables, every cross-table authorization goes through a `SECURITY DEFINER` helper (grep that no policy body contains a bare `from group_members` or `from posts` outside the helper definitions), the file contains `on conflict (id) do nothing` for the bucket and `drop policy if exists` before each storage policy. (Live apply + RLS integration tests are a documented later step requiring `supabase start` / a project, per §12.)

- [ ] 8. Build the shared UI shell and the config screen.
      Implement `src/app/layout.tsx` (dark theme, WCAG-AA contrast, accent color, `<header><nav>` + centered responsive `<main>`), `src/app/globals.css` (Tailwind + theme tokens), `src/components/NavBar.tsx` (brand "AidPal"; links Groups, Profile, and Login/Logout chosen by session via a server-side `getUser()` read guarded by `isSupabaseConfigured()`), and `src/components/SupabaseNotConfigured.tsx` (calm styled panel pointing to `README.md` + `.env.example`). Follow the §11 accessibility rules.
      Files: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/NavBar.tsx`, `src/components/SupabaseNotConfigured.tsx`.
      Verify: `npm run build` succeeds; the landing shell and nav render Supabase-free content with no env present.

- [ ] 9. Build the auth server actions and the email-confirmation callback.
      Implement `src/app/auth/actions.ts` with `signUp`, `signIn`, `signOut` per the §6.1 contracts: each guards with `isSupabaseConfigured()` first; `signUp` validates input, calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: <origin>/auth/callback } })`, branches on `data.session` (non-null → `ensureProfile()` then `redirect('/profile/edit')`; null → return `{ ok: true }` for the "check your email" notice); `signIn` calls `signInWithPassword`, then `ensureProfile()`, then `redirect(safeNextPath(next))` (fallback `/profile`), returning the generic "Invalid email or password" on failure; `signOut` calls `supabase.auth.signOut()` then `redirect('/')`. Session-mutating calls run only inside these actions / the route handler. Implement `src/app/auth/callback/route.ts` (`GET`) reading ONLY `token_hash` and `type`, calling `verifyOtp({ type, token_hash })`, then `ensureProfile()`, setting session cookies on the SAME `NextResponse` that redirects to `/profile/edit`; on missing/invalid token or error redirect to `/login?error=auth`. Use the shared `ActionResult` type. (Depends on item 5 clients, item 4 `safeNextPath`, and item 10's `ensureProfile` — implement `ensureProfile` as part of item 10; if item 10 is not yet done, land `ensureProfile` first.)
      Files: `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`.
      Verify: `npm run build` succeeds (no PKCE/`exchangeCodeForSession` usage; callback reads only `token_hash`/`type`).

- [ ] 10. Build the profile actions and pages.
      Implement `src/app/profile/actions.ts` with `ensureProfile()` (idempotent `insert into profiles (id, display_name) values (auth.uid(), left(split_part(email,'@',1),60)) on conflict (id) do nothing`, substituting `'New user'` when the derived name is empty; throws to caller on DB error) and `upsertProfile(FormData)` (validate displayName/bio/avatarUrl via `lib/validation`, upsert the caller's own row, `redirect('/profile')` on success). Implement `src/app/profile/page.tsx` (protected; view own profile; if no row, redirect to `/profile/edit`) and `src/app/profile/edit/page.tsx` (protected; form for display name, bio, pasted avatar URL — no file upload). Each page/action guards `isSupabaseConfigured()` (render `<SupabaseNotConfigured />` when false) and re-checks `getUser()` server-side.
      Files: `src/app/profile/actions.ts`, `src/app/profile/page.tsx`, `src/app/profile/edit/page.tsx`.
      Verify: `npm run build` succeeds; with no env, `/profile` and `/profile/edit` render the config screen without throwing.

- [ ] 11. Build the register and login pages.
      Implement `src/app/register/page.tsx` (email + password + displayName form posting to `signUp`; shows field errors and the "check your email to confirm" notice on `{ ok: true }`) and `src/app/login/page.tsx` (email + password form posting to `signIn`; reads/forwards a validated `next`; shows the generic auth-error banner, incl. the `?error=auth` banner from the callback). Mirror §9 rules as HTML attributes for UX; associate errors with fields via `aria-describedby`, form-level errors via `role="alert"`. Both guard `isSupabaseConfigured()`.
      Files: `src/app/register/page.tsx`, `src/app/login/page.tsx`.
      Verify: `npm run build` succeeds; both pages render Supabase-free (config screen) when env is absent.

- [ ] 12. Build the groups server actions (the write path for groups, posts, comments, likes).
      Implement `src/app/groups/actions.ts` with `createGroup` (validate; call the `create_group` RPC; `redirect('/groups/'+id)`), `joinGroup({ groupId })` (idempotent self-join, returns `{ ok: true }`), `createPost(FormData: groupId, body?, image?)` (the §10 server-side flow: config + `getUser()` guards; membership check via `is_group_member` BEFORE any upload; validate file MIME allowlist + ≤5 MB on received bytes; upload under the user's cookie-derived server client to the `media` bucket using the `lib/storage-path` key; insert `posts` then `media`; compensating delete of the uploaded object if a later insert fails; text-only post skips upload/media steps), `addComment(FormData: postId, body)` (validate 1–1000; insert; returns `{ ok: true }`), and `toggleLike({ postId, liked })` (idempotent-by-desired-state: insert `on conflict do nothing` when liked, delete when not, then `select count(*)` and return `{ ok: true, count }`). Every action guards config + auth; map Supabase errors to the §10 user-safe messages; `console.error` with a context tag server-side; never use the service-role key.
      Files: `src/app/groups/actions.ts`.
      Verify: `npm run build` succeeds (actions typecheck against `ActionResult` and the RPC signature).

- [ ] 13. Build the client components for interactive controls.
      Implement `src/components/LikeButton.tsx` (real `<button>` with `aria-pressed` and accessible name including the count, e.g. `aria-label="Like, 3 likes"`; sends `{ postId, liked }` to `toggleLike` and renders the returned fresh count), `src/components/CommentForm.tsx` (posts to `addComment`, revalidates), and `src/components/MediaUploadForm.tsx` (file input with client-side MIME/size pre-check for UX; submits the `File` as part of `createPost` `FormData`; never writes to Storage directly). These call the item 12 server actions.
      Files: `src/components/LikeButton.tsx`, `src/components/CommentForm.tsx`, `src/components/MediaUploadForm.tsx`.
      Verify: `npm run build` succeeds (client components compile; `"use client"` boundaries correct).

- [ ] 14. Build the groups pages (browse, create, detail).
      Implement `src/app/groups/page.tsx` (public; list public groups; "New group" link only when signed in), `src/app/groups/new/page.tsx` (protected; name/description/public-private form → `createGroup`), and `src/app/groups/[id]/page.tsx` (public for public groups, anon can view; member-only data for private via RLS; shows group info, a join button for public groups, a new-post form for members using `MediaUploadForm`, the list of posts with media rendered from `getPublicUrl`, comments with `CommentForm`, and `LikeButton` + derived count per post). Each page guards `isSupabaseConfigured()` and uses the server client; media URLs come from `getPublicUrl` on `storage_path`. Follow §11 accessibility (one `<h1>`, labelled inputs, meaningful `alt`).
      Files: `src/app/groups/page.tsx`, `src/app/groups/new/page.tsx`, `src/app/groups/[id]/page.tsx`.
      Verify: `npm run build` succeeds; with no env all three render the config screen; the landing page (`src/app/page.tsx`, update it here to add pitch + links to Register / Browse groups + signed-in quick links) renders Supabase-free.

- [ ] 15. Final full verification pass.
      Run the complete build and unit test suite and confirm the acceptance mapping (§15) is structurally satisfied: all in-scope routes, actions, schema, and the graceful-degradation screen exist; no out-of-scope feature code (events, volunteering, "Friend of", donations/money, ranking, search, feed, moderation, phone, admin, avatar upload) is present. Fix any lint/type/build errors surfaced. Clean up any temp files created during scaffolding (item 1 merge).
      Files: (none new — verification + cleanup only.)
      Verify: `npm run build` succeeds with zero errors AND `npm test` passes all unit tests, both run from `c:\Projects\AidPal`. If Node is unavailable, state that explicitly and that build/test verification is blocked, per the environment note.
