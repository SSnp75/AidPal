# AidPal — Thin-Slice Technical Design

**Status:** Design v4 (FINAL — first thin slice; revised after the third design review)
**Scope source:** `c:\Projects\AidPal\REQUIREMENTS.md` (product vision) + the locked thin-slice scope for this build.
**Audience:** The implementer. Every architectural decision below is made and locked; implement to it rather than choosing.
**Revision note:** v4 resolves all 8 findings from the third review (`c:\Projects\AidPal\.agents\tasks\design-review.md` / `design-review.json`): 1 HIGH, 4 MEDIUM, 3 NIT. These were localized, surgical edits — no architecture was re-opened (stack, scope, email-only auth, donations-excluded all unchanged). See Section 18 for the v3→v4 per-finding response log. (Sections 16 and 17 retain the earlier v1→v2 and v2→v3 logs for history.)

---

## 1. Overview

This document designs the **first thin vertical slice** of AidPal — just enough to prove the full stack end to end: a user can register with email + password, complete a profile, create public/private groups, browse public groups, open a group, upload a photo to it, comment on posts, and like them. Nothing else from the broader product vision (events, volunteering, "Friend of" pledges, donations, engagement ranking, search, feeds, moderation) is built here. The design notes where those slot in later but ships no code for them.

The stack is **locked**: a standard **Next.js 15 App Router app in TypeScript** (React 19, ESLint) for the frontend and route handlers, with **Supabase** providing Postgres, Auth (email + password), and Storage (media). The app stays a plain Next.js app with no vendor lock-in beyond Supabase, so it deploys to Vercel or Cloudflare Pages free tiers later. Everything targets $0/month free tiers. Development is on **Windows / PowerShell**, so all documented commands use `;` as the statement separator, never `&&`, and no long-running dev server is launched by the build process — the run command is documented for the user instead.

A defining constraint: there is **no live Supabase project yet**. The app must boot, render, and show a clear "Supabase is not configured" message instead of crashing when the environment variables are absent. This graceful-degradation behavior (Section 8) is a first-class design requirement, not an afterthought.

---

## 2. Technology stack (locked)

| Concern | Choice | Version intent | Notes |
|---|---|---|---|
| Framework | Next.js, App Router | 15.x | `app/` directory, Server Components by default. |
| Language | TypeScript | 5.x | `strict: true`. |
| UI runtime | React | 19.x (bundled with Next 15) | — |
| Linting | ESLint | `eslint-config-next` | Scaffolded by `create-next-app`. |
| Styling | **Tailwind CSS** | v4 (scaffold default) | Chosen over CSS Modules/styled-components: ships with `create-next-app`, zero runtime cost, fastest path to a consistent dark theme. Locked. |
| Backend-as-a-service | Supabase | hosted free tier | Postgres + Auth + Storage. |
| Supabase JS SDK | `@supabase/supabase-js` | 2.x | Core client. |
| SSR auth helper | `@supabase/ssr` | latest 0.x | Cookie-based session for Server Components, Route Handlers, middleware. |
| Package manager | **npm** | bundled with Node | Chosen for lowest friction; lockfile is `package-lock.json`. Locked. |
| Unit test runner | **Vitest** | latest | Fast, TS-native; see Section 12. |

**Prerequisite note for README:** Node.js (LTS 20+) with npm must be installed and on PATH. During design authoring, `node`/`npm` were not found on the current PATH, so the README's first step must be "install Node.js LTS and reopen the terminal," with a `node --version; npm --version` check.

No other runtime dependencies are introduced in this slice. (Icon libraries, form libraries, state managers, UI kits are **not** added — native HTML + Tailwind are sufficient and keep the bundle and the surface area small.)

---

## 3. Project structure (files to create)

```
c:\Projects\AidPal\
├─ REQUIREMENTS.md              # EXISTS — do not touch
├─ .env.example                 # committed; placeholder keys
├─ .env.local                   # git-ignored; real keys (user fills in)
├─ .gitignore                   # includes .env.local, node_modules, .next
├─ README.md                    # Windows PowerShell setup steps
├─ next.config.ts
├─ tsconfig.json
├─ package.json
├─ vitest.config.ts
├─ supabase/
│  └─ schema.sql                # tables + RLS + storage bucket policies
├─ tests/
│  └─ validation.test.ts        # unit tests for validators + key builder
├─ .agents/
│  └─ tasks/
│     └─ design.md              # THIS FILE
└─ src/
   ├─ middleware.ts             # session refresh + route protection
   ├─ lib/
   │  ├─ validation.ts          # pure validators (unit-tested)
   │  ├─ storage-path.ts        # pure media object-key builder (unit-tested)
   │  └─ supabase/
   │     ├─ config.ts           # reads + validates env; isSupabaseConfigured()
   │     ├─ client.ts           # browser client factory
   │     ├─ server.ts           # server client factory (cookies via @supabase/ssr)
   │     └─ middleware.ts       # updateSession helper for middleware.ts
   ├─ types/
   │  └─ db.ts                  # hand-written row types for the slice tables
   ├─ components/
   │  ├─ NavBar.tsx
   │  ├─ SupabaseNotConfigured.tsx
   │  ├─ LikeButton.tsx         # client component
   │  ├─ CommentForm.tsx        # client component
   │  └─ MediaUploadForm.tsx    # client component
   └─ app/
      ├─ layout.tsx             # root layout: nav, dark theme, <main>
      ├─ globals.css            # Tailwind + theme tokens
      ├─ page.tsx               # landing / home
      ├─ login/page.tsx
      ├─ register/page.tsx
      ├─ auth/
      │  ├─ actions.ts          # server actions: signIn, signUp, signOut
      │  └─ callback/route.ts   # email-confirmation verifyOtp(token_hash) + ensureProfile
      ├─ profile/
      │  ├─ page.tsx            # view own profile (protected)
      │  ├─ edit/page.tsx       # edit own profile (protected)
      │  └─ actions.ts          # upsertProfile server action
      └─ groups/
         ├─ page.tsx            # browse public groups
         ├─ new/page.tsx        # create group (protected)
         ├─ actions.ts          # createGroup, joinGroup, createPost,
         │                      #   addComment, toggleLike server actions
         └─ [id]/page.tsx       # group detail: posts, media, comments, likes
```

`src/` is used as the app root (the `create-next-app` option), so `middleware.ts` lives at `src/middleware.ts` and the import alias is `@/*` → `src/*`.

---

## 4. Data model

All application tables live in the `public` schema. Primary keys are UUIDs. Timestamps are `timestamptz default now()`. Row Level Security (RLS) is **enabled on every table** and the policies are the real access-control boundary (the client is never trusted). The SQL below is the authoritative spec for `supabase/schema.sql`; the implementer writes it verbatim-equivalent.

The schema file must begin with `create extension if not exists pgcrypto;` so `gen_random_uuid()` is guaranteed available (Supabase enables it by default, but this makes the schema self-contained).

### 4.1 Tables

**`profiles`** — one row per auth user.
| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `display_name` | `text` | NOT NULL, length 1–60 (CHECK) |
| `avatar_url` | `text` | NULL, length ≤ 2048 (CHECK) — an optional **pasted** URL (no upload in this slice; see §4.5 and finding 1) |
| `bio` | `text` | NULL, length ≤ 500 (CHECK) |
| `created_at` | `timestamptz` | NOT NULL default now() |
| `updated_at` | `timestamptz` | NOT NULL default now() |

**`groups`**
| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `name` | `text` | NOT NULL, length 1–100 (CHECK) |
| `description` | `text` | NULL, length ≤ 1000 (CHECK) |
| `is_private` | `boolean` | NOT NULL default false |
| `owner_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL default now() |

**`group_members`** — membership; the creator is inserted as `owner`.
| Column | Type | Constraints |
|---|---|---|
| `group_id` | `uuid` | FK → `groups(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | FK → `profiles(id)` ON DELETE CASCADE |
| `role` | `text` | NOT NULL, CHECK in (`'owner'`,`'member'`), default `'member'` |
| `created_at` | `timestamptz` | NOT NULL default now() |
| | | PK (`group_id`, `user_id`) |

**`posts`** — a post belongs to a group and an author. In this slice a post is the container that media and comments/likes attach to. A post may carry a text body and/or one media item.
| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `group_id` | `uuid` | NOT NULL, FK → `groups(id)` ON DELETE CASCADE |
| `author_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `body` | `text` | NULL, length ≤ 2000 (CHECK) |
| `created_at` | `timestamptz` | NOT NULL default now() |

**`media`** — image uploaded to Storage, linked to a post. One row per uploaded image (schema allows multiple per post; UI uploads one at a time).
| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `post_id` | `uuid` | NOT NULL, FK → `posts(id)` ON DELETE CASCADE |
| `storage_path` | `text` | NOT NULL (object key within the `media` bucket) |
| `mime_type` | `text` | NOT NULL, CHECK `mime_type in ('image/jpeg','image/png','image/webp','image/gif')` |
| `uploader_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL default now() |

> The `mime_type` CHECK matches the application allowlist exactly (finding 8) so the DB backstop is no looser than the app rule; `image/svg+xml` is deliberately excluded (inline-SVG XSS vector).
>
> Column named `storage_path`, not a full URL: display URLs are derived at read time (public bucket → `getPublicUrl`). Keeps the row stable if the bucket/domain changes.

**`comments`**
| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `post_id` | `uuid` | NOT NULL, FK → `posts(id)` ON DELETE CASCADE |
| `author_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `body` | `text` | NOT NULL, length 1–1000 (CHECK) |
| `created_at` | `timestamptz` | NOT NULL default now() |

**`likes`** — one like per user per post.
| Column | Type | Constraints |
|---|---|---|
| `post_id` | `uuid` | FK → `posts(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | FK → `profiles(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL default now() |
| | | PK (`post_id`, `user_id`) |

Like **count** is derived (`select count(*) ... where post_id = ...`), not stored, in this slice. No denormalized counter is added — correctness over micro-optimization at this scale.

### 4.2 Relationships (summary)

```
auth.users 1─1 profiles
profiles   1─* groups          (owner_id)
groups     1─* group_members   *─1 profiles
groups     1─* posts           *─1 profiles (author)
posts      1─* media           *─1 profiles (uploader)
posts      1─* comments        *─1 profiles (author)
posts      1─* likes           *─1 profiles
```

**FK ordering invariant (finding 6):** every content/membership row (`groups.owner_id`, `group_members.user_id`, `posts.author_id`, `media.uploader_id`, `comments.author_id`, `likes.user_id`) FKs to `profiles(id)`, so the actor's `profiles` row must exist **before** any such write. Profile creation is therefore a **login-time precondition**, performed by `ensureProfile()` at `/auth/callback` and in `signIn` (see §6). The implementer must order operations accordingly and must not defer profile creation to a later page visit.

### 4.3 Helpers for RLS

Private-group visibility is checked in several policies, so define two `SECURITY DEFINER` SQL functions. `SECURITY DEFINER` is **load-bearing**: it makes the function body run as the function owner (a role that bypasses the invoker's RLS), so a function that selects from `group_members` does **not** re-trigger `group_members` RLS and therefore cannot cause recursive policy evaluation (finding 2). Both functions pin `search_path = public`.

```sql
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid()
  );
$$;

create or replace function public.can_read_group(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from groups g
    where g.id = gid
      and (g.is_private = false or public.is_group_member(g.id))
  );
$$;

create or replace function public.can_read_post(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from posts p
    where p.id = pid and public.can_read_group(p.group_id)
  );
$$;

create or replace function public.can_write_post_media(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from posts p
    join group_members gm on gm.group_id = p.group_id
    where p.id = pid and gm.user_id = auth.uid()
  );
$$;
```

`can_write_post_media` exists so the `media` INSERT policy can confirm "the uploader is a member of the group that owns this post" **through a `SECURITY DEFINER` helper** rather than a direct `(select group_id from posts where id = post_id)` subselect in the policy body — the same forbidden cross-table coupling the recursion rule below rules out (the subselect would re-evaluate the `posts` SELECT policy under the invoker).

`can_read_post` exists so that `media` / `comments` / `likes` policies reach a post's owning group **through a `SECURITY DEFINER` helper** rather than a direct `exists (select 1 from posts ...)` subselect in the policy body. A direct subselect would run under the invoker's RLS and re-evaluate the `posts` SELECT policy inside every `media`/`comment`/`like` check — an undocumented cross-table coupling the recursion rule below is meant to forbid. Routing through `can_read_post` keeps the single rule ("all cross-table authorization inside a policy goes through a `SECURITY DEFINER` helper") true for every table (finding 2).

**Recursion / cross-table rule (mandatory):** All cross-table authorization *inside any RLS policy* MUST go through a `SECURITY DEFINER` helper — `is_group_member` / `can_read_group` for `group_members`/`groups`-reach, `can_read_post` for `media`/`comments`/`likes` **read**-reach, and `can_write_post_media` for the `media` INSERT membership check. **Never** reference `group_members` directly in another policy's `USING` / `WITH CHECK` predicate, never express the `group_members` SELECT policy as a direct `exists (select 1 from group_members ...)` self-reference (that bypasses the definer boundary and triggers `infinite recursion detected in policy`), and never put a direct `exists (select 1 from posts ...)` subselect in a `media`/`comments`/`likes` policy (that re-triggers `posts` RLS under the invoker). The helper functions must be owned by a role that bypasses RLS (the default when created by the Supabase SQL editor / `postgres` owner); do not alter their owner.

### 4.4 RLS policy summary

RLS is enabled on all seven tables. **Anonymous-read contract (finding 6):** public group pages are reachable by logged-out visitors (§5) and render author names/avatars, so the read audience must be consistent. `profiles` contains no PII — email lives in `auth.users`, which is never exposed — so SELECT on the content tables is granted to **`anon, authenticated`**. Write policies remain `authenticated`-scoped via `auth.uid()`.

- **profiles** — SELECT: `anon, authenticated` (any visitor may read any profile; needed to show author names/avatars on public group pages). INSERT/UPDATE: `authenticated`, only where `id = auth.uid()`. No DELETE policy (profiles are removed via auth user cascade).
- **groups** — SELECT: `anon, authenticated`, predicate `public.can_read_group(id)` (public groups readable by all incl. anon; private readable only by members). INSERT: `authenticated`, `owner_id = auth.uid()`. UPDATE/DELETE: `authenticated`, owner only (`owner_id = auth.uid()`).
- **group_members** — SELECT: `anon, authenticated`, predicate **`public.can_read_group(group_id)`** (goes through the SECURITY DEFINER helper per the recursion rule; written exactly as below). INSERT: `authenticated`, a user may insert **their own** membership (`user_id = auth.uid()` AND `role = 'member'`) only into a **public** group (self-join); the owner row is inserted by the `create_group` RPC (§10) in the same authenticated context. DELETE: `authenticated`, a user may remove their own membership (`user_id = auth.uid()`); owners cannot be demoted in this slice (UI doesn't expose it).

  ```sql
  -- group_members SELECT (the exact predicate; uses the SECURITY DEFINER helper, never a direct self-reference)
  create policy gm_select on public.group_members
    for select to anon, authenticated
    using ( public.can_read_group(group_id) );
  ```

- **posts** — SELECT: `anon, authenticated`, `public.can_read_group(group_id)`. INSERT: `authenticated`, `author_id = auth.uid()` AND `public.is_group_member(group_id)` (must be a member to post). UPDATE/DELETE: `authenticated`, `author_id = auth.uid()`.
- **media** — SELECT: `anon, authenticated`, `public.can_read_post(post_id)`. INSERT: `authenticated`, `uploader_id = auth.uid()` AND `public.can_write_post_media(post_id)` (the uploader must be a member of the post's owning group; the membership reach goes through the `SECURITY DEFINER` helper of §4.3, **never** a direct `(select group_id from posts where id = post_id)` subselect — enforced together with the `createPost` server action). DELETE: `authenticated`, `uploader_id = auth.uid()`.

  ```sql
  create policy media_insert on public.media
    for insert to authenticated
    with check ( uploader_id = auth.uid() and public.can_write_post_media(post_id) );
  ```
- **comments** — SELECT: `anon, authenticated`, `public.can_read_post(post_id)`. INSERT: `authenticated`, `author_id = auth.uid()` AND `public.can_read_post(post_id)`. UPDATE/DELETE: `authenticated`, `author_id = auth.uid()`.
- **likes** — SELECT: `anon, authenticated`, `public.can_read_post(post_id)`. INSERT: `authenticated`, `user_id = auth.uid()` AND `public.can_read_post(post_id)`. DELETE: `authenticated`, `user_id = auth.uid()`.

For `media`/`comments`/`likes`, the policy reaches the post's owning group **through the `public.can_read_post(post_id)` `SECURITY DEFINER` helper** (§4.3), never a direct `exists (select 1 from posts ...)` subselect — this honors the single cross-table rule and avoids re-triggering `posts` RLS under the invoker (finding 2).

**Invariant ownership:** the "users edit only their own rows" and "private groups are member-only" invariants are owned by the **database (RLS)**, because it is the only layer that cannot be bypassed by a crafted client request. Server actions add convenience and friendly errors but never serve as the security boundary.

### 4.5 Storage bucket

One bucket named **`media`**, created in `schema.sql` via a `storage.buckets` insert, marked **public = true** (public-read of image bytes is acceptable for this slice; access to the *context* is still gated because the `media` table rows are RLS-protected and the UI only surfaces URLs a reader is allowed to see). Object key convention: `group/{group_id}/{post_id}/{uuid}.{ext}`. The key is built by the pure helper `lib/storage-path.ts` (unit-tested, §12).

**Running context + idempotency (finding 2):** `schema.sql` is run in the **Supabase dashboard SQL editor**, where it executes as role `postgres` (which may write `storage.*`); the design does not support running it over a connection that lacks that privilege. The whole file is a repeatable, run-verbatim document, so the bucket insert and the storage `create policy` statements must be safe to re-run:

```sql
-- idempotent bucket creation (safe to re-run; no unique-violation on a second run)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- guard each storage policy so a re-run does not error on an already-existing policy
drop policy if exists media_objects_select on storage.objects;
drop policy if exists media_objects_insert on storage.objects;
drop policy if exists media_objects_update on storage.objects;
drop policy if exists media_objects_delete on storage.objects;
-- (then the four create policy ... statements below)
```

Every other object in `schema.sql` already uses `create ... if not exists` / `create or replace`; the `drop policy if exists` guard brings the storage policy creates in line so the entire file is re-runnable in one paste.

**No avatar uploads in this slice (finding 1, Option A).** Profile avatars are handled as an **optional pasted URL** in `profiles.avatar_url`; there is no avatar upload input, no `avatars` bucket, and no avatar object-key convention. This matches the scope line "profiles table + view/edit own profile," which does not require avatar upload, and keeps the only Storage surface the `media` bucket for group post images. (Avatar upload can be added later by reusing the `media` bucket with an `avatar/{user_id}/{uuid}.{ext}` key plus an own-prefix storage INSERT policy — noted in §14, not built now.)

Storage RLS policies (on `storage.objects` where `bucket_id = 'media'`):
- SELECT: allowed for the `media` bucket (public bucket; bytes are readable).
- INSERT: authenticated users only, restricted to the `media` bucket. Fine-grained per-group write authorization is enforced by the application-layer upload flow plus the `media` table INSERT policy; storage INSERT is intentionally limited to "authenticated + correct bucket" to keep policy complexity low in the slice.
- UPDATE/DELETE on objects: owner only (`owner = auth.uid()`).

**Owner-population dependency (finding 10):** the `owner = auth.uid()` UPDATE/DELETE policy relies on `storage.objects.owner` being set, which Supabase Storage does **only when the upload is performed with the user's authenticated session**. Uploads in this slice are performed by the `createPost` **server action** using the cookie-derived server client (which carries the user's JWT) — **never** a service-role client — so `owner` is populated with the uploading user (finding 4). This is consistent with §7's anon-key-only decision and §10's server-side upload flow.

**Known limitation (finding 9):** because the `media` bucket is public, private-group images are **not** byte-level private — anyone holding an object URL can fetch the bytes, even for an image posted in a private group. The row-level gating only hides the URL from unauthorized readers in the UI. This is an accepted trade-off for the thin slice; a later phase switches the `media` bucket to private + signed URLs if true private-media confidentiality is required (REQUIREMENTS §5 "private groups truly private").

**Limits enforced at upload (client + server action):** max 5 MB per image; allowed MIME types `image/jpeg`, `image/png`, `image/webp`, `image/gif`. (Supabase free tier Storage limit is ~1 GB total; 5 MB/image keeps headroom.)

---

## 5. Route / page map (App Router)

| Path | Type | Auth | Purpose |
|---|---|---|---|
| `/` | Server Component | public | Landing: pitch, links to Register / Browse groups. If signed in, show quick links. |
| `/register` | Server Component + form → server action | public | Email + password sign-up. |
| `/login` | Server Component + form → server action | public | Email + password sign-in. |
| `/auth/callback` | Route Handler (`GET`) | public | Verifies the email-confirmation `token_hash`+`type` with `verifyOtp`, sets the session, ensures a `profiles` row exists, then redirects. |
| `/profile` | Server Component | **protected** | View own profile. If no profile row yet, redirect to `/profile/edit`. |
| `/profile/edit` | Server Component + form | **protected** | Create/complete/edit own profile (display name, bio, avatar URL). |
| `/groups` | Server Component | public (anon can browse) | Browse public groups (list). "New group" shown only when signed in. |
| `/groups/new` | Server Component + form | **protected** | Create a group (name, description, public/private). |
| `/groups/[id]` | Server Component | public for public groups (anon can view); **member-only data** for private | Group detail: info, join button (public), new-post form (members), posts with media, comments, like button + count. |

Server actions live in `actions.ts` colocated files and are the only write path. There are **no custom REST route handlers** in this slice except `/auth/callback`; all mutations go through typed server actions (simpler, type-safe, no duplicate API surface). This is a deliberate choice over building a `/api/*` layer.

**Route protection** is layered:
1. `src/middleware.ts` runs `updateSession` on every matched request (refreshes the Supabase cookie) and, for protected path prefixes (`/profile`, `/groups/new`), redirects to `/login?next=<path>` when there is no session. The `<path>` is always the current same-origin request path, and whatever consumes it on login validates it via `safeNextPath` (§6, finding 7) before redirecting, so a crafted `next` can never cause an off-site redirect.
2. Each protected page/server action **re-checks** `supabase.auth.getUser()` server-side and redirects/returns an error if unauthenticated. Middleware is treated as UX, not security; the server-side check is the enforcement. (RLS is the final backstop.)

Middleware `matcher` excludes `_next/static`, `_next/image`, `favicon`, and public asset extensions. `/groups` and `/groups/[id]` are **not** protected prefixes — anonymous visitors can browse public groups, consistent with the §4.4 anonymous-read contract. Interactive controls on those pages (join, post, comment, like) are only rendered when a session is present and are additionally enforced by server-side `getUser()` checks and RLS.

---

## 6. Auth flow

Email + password via Supabase Auth only. No phone, no OAuth. **Session-mutating operations (`signUp`, `signInWithPassword`, `signOut`, `verifyOtp`) run only inside Server Actions or the `/auth/callback` Route Handler — never during a Server Component render** — because only those contexts can write the auth cookies onto the response (finding 5).

**Registration (`/register`):**
1. Form posts `email`, `password`, `displayName` to the `signUp` server action.
2. Action validates input (Section 9), calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: <origin>/auth/callback } })`.
3. **The branch is decided by inspecting `data.session` on the `signUp` result** — the only reliable runtime signal of whether the project requires email confirmation (the Auth setting is not exposed to the SDK as a documented boolean). `supabase.auth.signUp` returns a `session` that is `null` when confirmation is required and populated when it is not.
   - **`data.session` is null (confirmation on, the default):** the action returns `{ ok: true }` and the UI shows "Check your email to confirm." `ensureProfile()` is **not** called here — there is no session yet, so it cannot run; the profile row is created later at `/auth/callback` after `verifyOtp` (confirmation flow below). On confirmation the link hits `/auth/callback`, which establishes the session and then redirects to `/profile/edit`.
   - **`data.session` is non-null (confirmation disabled):** the session is set immediately; the action calls `ensureProfile()` and then `redirect('/profile/edit')`.
4. The `profiles` row is created at the first moment the user is authenticated (see **Profile-row creation**, below), not deferred to a `/profile/edit` visit, so every authenticated user always has a profile row before any FK-dependent write (finding 5).

**Email-confirmation flow — `token_hash`/`verifyOtp`, not PKCE `?code=` (finding 1, Option A — locked):** this slice uses Supabase's **default** email-link flow, not the server-side PKCE `?code=` flow. The design does **not** configure `flowType: 'pkce'`, so `exchangeCodeForSession` is **not** used anywhere. Instead:

- The Supabase Auth email template for "Confirm signup" is configured to redirect to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (this is a required README Supabase-setup step — Auth → Email Templates). The `emailRedirectTo` passed to `signUp` is `<origin>/auth/callback`.
- The `/auth/callback` `GET` Route Handler reads the `token_hash` and `type` query params and calls `supabase.auth.verifyOtp({ type, token_hash })` (where `type` is the `EmailOtpType` value, `'email'` for signup confirmation). On success the session cookies are written and the handler redirects to `/profile/edit`. On a missing/invalid `token_hash`/`type` (or a `verifyOtp` error) it redirects to `/login?error=auth` with a banner.
- The handler reads **only** `token_hash` and `type`; it never reads `?code=`. This matches a default Supabase project out of the box with no PKCE configuration, so the primary registration happy-path completes.

**Profile-row creation (login-time precondition — finding 5/6):** a `profiles` row for `auth.uid()` must exist before any content/membership write (every such row FKs to `profiles(id)`). To guarantee this, profile creation is a **login-time precondition**, performed in both authenticated entry points:
- the `/auth/callback` Route Handler, immediately after a successful `verifyOtp`, and
- the `signIn` server action, immediately after a successful `signInWithPassword`.

Each calls `ensureProfile()` (in `profile/actions.ts`): an idempotent `insert into profiles (id, display_name) values (auth.uid(), <fallback>) on conflict (id) do nothing`, where `<fallback>` is a minimal non-null display name derived from the email local-part (the user can edit it later at `/profile/edit`). **The fallback must be CHECK-safe for the `profiles.display_name` 1–60 constraint (§4.1):** use `left(split_part(email,'@',1), 60)` to cap the local-part at 60 chars (an RFC 5321 local-part can be up to 64, which would otherwise trip the CHECK and turn a routine login into the fatal `/login?error=auth` path); if the result is empty after trimming, substitute the constant `'New user'`. This guarantees the idempotent insert never violates the length CHECK. Because the row is created only for an authenticated, confirmed user, the `profiles.id` → `auth.users(id)` FK always holds. `upsertProfile` (from `/profile/edit`) then updates the same row. FK-dependent actions (`createGroup`, `createPost`, `addComment`, `toggleLike`, `joinGroup`) therefore never hit an opaque FK violation; as a defensive backstop each still treats a profile-missing error as "complete your profile first" and redirects to `/profile/edit`.

**Callback cookie ordering (finding 11):** the `/auth/callback` Route Handler must set the session cookies on the **same `NextResponse` that issues the redirect** to `/profile/edit`, so the first request to the protected route already carries the session and middleware does not bounce the just-confirmed user back to `/login`.

**Login (`/login`):** `signIn` action calls `signInWithPassword`, then `ensureProfile()` (above); on success redirects to the validated `next` param or `/profile`. On failure returns a field-agnostic "Invalid email or password" message (no account enumeration).

**`next` redirect validation (finding 7):** the `next` param is accepted **only** if it is a safe same-origin relative path — it must start with a single `/` and **not** with `//` (protocol-relative) or contain a scheme (`:`). Any value failing this (including absolute URLs like `https://evil.example`) is discarded and the redirect falls back to `/profile`. This closes the open-redirect vector and is applied anywhere `next` is consumed (both `/login` and the middleware-built `/login?next=<path>`). A single pure helper `safeNextPath(next): string` in `lib/validation.ts` implements this and is unit-tested (§12).

**Logout:** `signOut` server action calls `supabase.auth.signOut()` and redirects to `/`. Triggered from a form button in the nav.

**Session storage:** `@supabase/ssr` cookie-based sessions, so Server Components and server actions read the session from cookies. The browser client is used only inside client components that need interactivity (form handling in this slice; they call server actions).

### 6.1 Server action contracts (finding 3)

All mutations are typed server actions. The shared return type is:

```ts
type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
```

Actions that `redirect()` on success **never return** on the happy path (Next.js `redirect` throws a special control-flow signal); they only return an `ActionResult` with `ok: false` on failure. Actions that must give the client data to render return a typed success value instead of redirecting. Every action begins with the config guard (`isSupabaseConfigured()`, §8) and, where authentication is required, a server-side `getUser()` check.

| Action (file) | Input | Success behavior | Failure return |
|---|---|---|---|
| `signUp` (`auth/actions.ts`) | `FormData` (`email`, `password`, `displayName`) | branch on `data.session`: if **non-null** (confirmation off) call `ensureProfile()` then `redirect('/profile/edit')`; if **null** (confirmation on) return `{ ok: true }` and the page shows the "check your email" notice (`ensureProfile()` cannot run here — no session yet) | `{ ok: false; error; fieldErrors? }` |
| `signIn` (`auth/actions.ts`) | `FormData` (`email`, `password`); reads validated `next` | `ensureProfile()` then `redirect(safeNextPath(next) ?? '/profile')` | `{ ok: false; error }` (generic "Invalid email or password") |
| `signOut` (`auth/actions.ts`) | none (form button) | `redirect('/')` | `{ ok: false; error }` (rare) |
| `ensureProfile` (`profile/actions.ts`) | none (uses `auth.uid()`) | returns `void` on success (idempotent insert with a CHECK-safe `display_name` fallback — `left(split_part(email,'@',1),60)`, or `'New user'` if empty; §6) | throws to caller (callback/signIn map it to an auth error) |
| `upsertProfile` (`profile/actions.ts`) | `FormData` (`displayName`, `bio?`, `avatarUrl?`) | `redirect('/profile')` | `{ ok: false; error; fieldErrors? }` |
| `createGroup` (`groups/actions.ts`) | `FormData` (`name`, `description?`, `isPrivate`) | calls `create_group` RPC, then `redirect('/groups/' + newId)` | `{ ok: false; error; fieldErrors? }` |
| `joinGroup` (`groups/actions.ts`) | typed args `{ groupId: string }` | returns `{ ok: true }` (idempotent); caller revalidates the group page | `{ ok: false; error }` |
| `createPost` (`groups/actions.ts`) | `FormData` (`groupId`, `body?`, `image?: File`) | returns `{ ok: true }`; caller revalidates the group page | `{ ok: false; error; fieldErrors? }` |
| `addComment` (`groups/actions.ts`) | `FormData` (`postId`, `body`) | returns `{ ok: true }`; caller revalidates | `{ ok: false; error; fieldErrors? }` |
| `toggleLike` (`groups/actions.ts`) | typed args `{ postId: string; liked: boolean }` | returns `{ ok: true; count: number }` (fresh like count; §10) | `{ ok: false; error }` |

Rationale for the split: form-driven, navigation-ending actions (`signUp`, `signIn`, `signOut`, `upsertProfile`, `createGroup`) take `FormData` from `<form action={...}>` and `redirect()` on success. Interactive client components that must update inline without a full navigation (`LikeButton` → `toggleLike`, `JoinButton` → `joinGroup`) call argument-based actions and render the returned value (or trigger `revalidatePath`). `createPost`/`addComment` take `FormData` (they carry a `File` / free text from forms) but return a value and `revalidatePath` the group page rather than navigating, so the user stays in place.

---

## 7. Supabase client wiring (`@supabase/ssr`)

Three factories, all reading config through `lib/supabase/config.ts`:

- **`lib/supabase/config.ts`** — exports `getSupabaseConfig()` returning `{ url, anonKey } | null` and `isSupabaseConfigured(): boolean`. Reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Returns `null` (never throws) when either is missing or still equals the placeholder value from `.env.example`.
- **`lib/supabase/client.ts`** — `createBrowserClient` from `@supabase/ssr`, used in client components. Must only be called when configured (callers guard with `isSupabaseConfigured()`).
- **`lib/supabase/server.ts`** — `createServerClient` from `@supabase/ssr`, wired to Next's `cookies()` with a `getAll`/`setAll` adapter. An **async** `createClient()` for use in Server Components, server actions, and route handlers.

  **`setAll` must be wrapped in try/catch and ignore write errors (finding 5).** Next.js does not allow setting cookies during a Server Component render, so `setAll` will throw/no-op there; swallowing that error keeps the §8 no-throw guarantee intact. Persisting refreshed session cookies is the responsibility of `middleware.ts`'s `updateSession` (which runs in a context that *can* set cookies). Session-mutating operations are confined to Server Actions / the Route Handler (§6), where `setAll` works.

- **`lib/supabase/middleware.ts`** — `updateSession(request)` that builds a server client bound to the request/response cookies, calls `getUser()` to refresh, and returns the `NextResponse` with any refreshed cookies set (used by `src/middleware.ts`).

Only the **anon** key is ever referenced. No service-role key is used anywhere in this slice (not needed; RLS covers all operations under the user's own identity, and Storage `owner` population depends on it per §4.5). `.env.example` therefore contains only the two `NEXT_PUBLIC_*` vars.

---

## 8. Missing-env graceful degradation

The app must build and run with absent/placeholder Supabase env vars and must **not throw**.

- **Server factory & middleware:** if `getSupabaseConfig()` is `null`, `updateSession` is a no-op pass-through (returns `NextResponse.next()` without touching cookies), and `createClient()` callers check `isSupabaseConfigured()` first.
- **Pages:** every page that needs Supabase first calls `isSupabaseConfigured()`. If false, it renders the shared `<SupabaseNotConfigured />` component — a calm, styled panel explaining that Supabase env vars are missing and pointing to `README.md` + `.env.example`. It does **not** attempt any auth or data call, so nothing throws. Public, Supabase-free content (landing copy, nav shell) still renders.
- **Server actions:** each action guards with `isSupabaseConfigured()` and, if false, returns `{ error: "Supabase is not configured. See README.md." }` instead of calling the SDK.
- **Build:** because env is only read at request time behind guards (never at module top-level in a way that throws), `next build` succeeds with no env present. Any module-scope access to env is wrapped so it degrades to `null`.
- The `setAll` try/catch (§7) is part of this guarantee: even when a session cookie write is attempted in a render context that forbids it, the request does not throw.

This makes the first `npm run dev` show a clear, friendly configuration screen rather than a stack trace — the intended first-run experience before the user has a Supabase project.

---

## 9. Input validation (per external input)

Validation runs in server actions (authoritative) and is mirrored with HTML attributes for UX. The authoritative rules live in pure functions in `lib/validation.ts` (unit-tested, §12). On failure the action returns `{ error, fieldErrors? }`; the page re-renders the form with messages. DB CHECK constraints are the final backstop.

| Input | Rules | On failure |
|---|---|---|
| Register `email` | required; valid email format; trimmed, lowercased | field error "Enter a valid email." |
| Register `password` | required; **app rule** min length 8; max 72 **bytes** | field error "Password must be at least 8 characters (max 72 bytes)." |
| Register/profile `displayName` | required; trimmed; length 1–60 | field error. |
| Profile `bio` | optional; length ≤ 500 | field error. |
| Profile `avatarUrl` | optional; if present must be a valid `http(s)` URL; length ≤ 2048 | field error; profile still saveable without an avatar URL. |
| Group `name` | required; trimmed; length 1–100 | field error. |
| Group `description` | optional; length ≤ 1000 | field error. |
| Group `isPrivate` | boolean checkbox; default false | coerced; never fails. |
| Post `body` | optional; length ≤ 2000; a post must have body **or** media (not both empty) — **server-action-only check**, see note | "Add text or an image." |
| Media upload | required for media post; MIME in allowlist (`image/jpeg,png,webp,gif`); ≤ 5 MB | "Images only (JPEG, PNG, WebP, GIF), up to 5 MB." |
| Comment `body` | required; trimmed; length 1–1000 | field error. |
| Like toggle | body `{ postId: uuid, liked: boolean }`; see §10 | n/a (idempotent). |
| `postId`/`groupId` args | must be UUID; existence + authorization enforced by RLS | action returns generic "Not found or not allowed." |

**Password limits note (finding 7):** the minimum of 8 is **our application rule**, not a Supabase constraint. The server-side check (min 8) always runs **before** `signUp` is called, so a shorter password can never reach Supabase on the happy path — the Supabase Auth minimum therefore only matters if the app is bypassed. Leaving the Supabase default (6) is fine; optionally set it to 8 to keep the two in sync. The maximum of 72 is bcrypt's input limit measured in **bytes**, not characters (relevant for multibyte passwords).

**Body-or-media backstop exception (finding 8):** the general rule in this section's intro is that DB CHECK constraints are the final backstop. The "a post must have body **or** media" rule is the one deliberate exception: it is a **cross-table** invariant (`posts.body` vs a row in the separate `media` table) and cannot be expressed as a single-table CHECK, so it is enforced **only in the `createPost` server action**, with no DB backstop. This is acceptable because an empty post is a UX concern, not a security one — an empty `posts` row is harmless and leaks nothing. (If strict enforcement is ever required, a deferred-constraint trigger could be added later; not built now.)

All text inputs are trimmed before length checks. User-supplied text is rendered as text (React escapes by default) — no `dangerouslySetInnerHTML` anywhere. The pasted `avatarUrl` is used only as an `<img src>` / link; it is never injected as HTML.

---

## 10. Error handling (per failing operation)

Every operation that can fail is listed with: condition, recoverable vs fatal, what the caller sees, and logging. Logging in this slice is `console.error` on the server (server actions / route handlers / middleware) with a short context tag; no secrets or full tokens are logged. Client never sees raw Supabase error messages — it gets a mapped, user-safe message.

| Operation | Failure condition | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| Read Supabase config | env missing/placeholder | recoverable | `<SupabaseNotConfigured />` / `{error}` | no (expected state) |
| `signUp` | email already registered | recoverable | "If this email is new, check your inbox to confirm." (non-enumerating) | server, info |
| `signUp` | weak/invalid password, bad email | recoverable | mapped field error | no |
| `signIn` | bad credentials | recoverable | "Invalid email or password." | server, info |
| `/auth/callback` | missing/invalid `token_hash`/`type`, or `verifyOtp` error | recoverable | redirect to `/login?error=auth` with banner | server, warn |
| `ensureProfile` (callback / signIn) | DB/RLS error inserting the first profile row | fatal-to-action | redirect to `/login?error=auth` (callback) / "Could not sign in. Try again." (signIn) | server, error |
| `getUser` on protected route | no/expired session | recoverable | redirect to `/login?next=...` | no |
| `upsertProfile` | validation fail | recoverable | field errors | no |
| `upsertProfile` | DB/RLS error | fatal-to-action | "Could not save profile. Try again." | server, error |
| `createGroup` | validation fail | recoverable | field errors | no |
| `createGroup` RPC | DB error inside the transaction | fatal-to-action | "Could not create group. Try again." (RPC is atomic — no half-created group) | server, error |
| `joinGroup` | already a member | recoverable | treated as success (idempotent: `on conflict do nothing`) | no |
| `joinGroup` | group is private | recoverable | "This group is private." (RLS also blocks) | server, info |
| `createPost` | not a member / not allowed | recoverable | "You must join this group to post." | server, info |
| Media upload to Storage | network / size / type / quota | recoverable | "Upload failed: <reason>." entire post action fails, no `posts` row created (see flow below) | server, error |
| `addComment` | not allowed / group unreadable | recoverable | "You can't comment here." | server, info |
| `toggleLike` | unexpected DB/RLS error | recoverable | "Could not update like. Try again." | server, error |
| Any server action | unexpected exception | fatal-to-action | generic "Something went wrong. Try again." | server, error with tag |

**`createGroup` atomicity:** inserting the `groups` row and the owner `group_members` row must not leave a half-created group. Implement via a single Postgres RPC `create_group(name, description, is_private)` (`SECURITY DEFINER`, `search_path=public`) that inserts both rows in one function body (implicitly transactional) and returns the new group id. The server action calls this RPC rather than issuing two separate inserts. This is the chosen approach over client-side two-step inserts (which can partially fail) and over a DB trigger (less explicit). The RPC records `owner_id = auth.uid()` and the owner `group_members` row with `role = 'owner'`.

**`toggleLike` contract — idempotent by desired state (finding 3):** the action is **not** a read-then-flip toggle. The `LikeButton` sends its intended next state `{ postId: uuid, liked: boolean }`. The server action, after the auth + config guards:
1. If `liked === true`: `insert into likes (post_id, user_id) values ($postId, auth.uid()) on conflict (post_id, user_id) do nothing`.
2. If `liked === false`: `delete from likes where post_id = $postId and user_id = auth.uid()`.
3. `select count(*) from likes where post_id = $postId` and return the fresh count.

This removes the read-modify-write race: repeated or double-clicked requests converge on the same state, the `on conflict do nothing` makes a duplicate "like" a no-op (no unique-violation surfaced), and a duplicate "unlike" simply deletes zero rows. §9 reflects the boolean argument.

**Media upload trust boundary — server-action upload (finding 4, locked):** the upload is performed **in the `createPost` server action**, not by the client component. `MediaUploadForm` (client) submits the chosen `File` as part of the `createPost` `FormData` (`image?: File`), and the server action — using the **cookie-derived server client, which carries the signed-in user's JWT** — performs `supabase.storage.from('media').upload(...)`. Because that upload runs under the user's authenticated (anon-key) session, Supabase populates `storage.objects.owner = auth.uid()`, which the owner-scoped UPDATE/DELETE storage policy (§4.5) depends on. The service-role key is never used (§7). This keeps the whole upload→insert sequence inside one server-side action so it can be ordered and compensated atomically; the client never writes to Storage directly, so there is no "object uploaded but never registered" orphan window of the client-upload alternative.

**Media + post atomicity — single server-side flow:** for a media post (text and/or image), if the image upload fails the **entire action fails and no `posts` row is created**; the user re-submits. There is no text-only fallback for a post that was submitted with an image. The ordering, all within `createPost`:
0. **Membership check first — before any Storage upload.** After the config + `getUser()` guards, verify `public.is_group_member(groupId)` for `auth.uid()` (a membership read). If the user is not a member, return `{ ok: false, error: 'You must join this group to post.' }` **immediately, before uploading any bytes to Storage**. Checking membership ahead of the upload means a non-member never uploads bytes that the `posts` INSERT RLS would reject, so the compensating delete (step 5) stays an exceptional path rather than the normal non-member path.
1. Validate the file (MIME allowlist + ≤ 5 MB, §9) **in the server action** on the received bytes (the client also pre-checks for UX, but the server check is authoritative since the bytes arrive at the server).
2. Upload the image object to the `media` bucket under the user's session (key from `lib/storage-path.ts`).
3. On upload success, insert the `posts` row.
4. Insert the `media` row referencing the post and the object key.
5. If the `media` insert (or the `posts` insert) fails after a successful upload, best-effort delete the just-uploaded object (compensating delete) and surface the error, so no object is orphaned.

A **text-only** post (no image attached) performs step 0 then skips steps 1, 2, 4, 5 and simply inserts the `posts` row.

---

## 11. UI / layout / accessibility

A single root `layout.tsx` provides a dark, modern theme (Tailwind; near-black background, high-contrast text meeting WCAG AA contrast, an accent color for primary actions), a top `NavBar` (brand "AidPal", links: Groups, Profile, and Login/Logout depending on session), and a centered responsive `<main>` container. Layout is responsive via Tailwind breakpoints (single column on mobile, constrained width on desktop); no fixed pixel widths that break small screens.

Accessibility rules the implementer must follow:
- Semantic HTML: `<header><nav>`, `<main>`, `<form>`, `<button>`, `<ul>`/`<li>` for lists, one `<h1>` per page.
- Every input has an associated `<label htmlFor>`; the like button is a real `<button>` with `aria-pressed` and an accessible name including the count (e.g. `aria-label="Like, 3 likes"`).
- Images have meaningful `alt` (post media uses author/group context; decorative images use `alt=""`).
- Full keyboard operability; visible focus states (Tailwind `focus-visible` ring); color is never the sole status indicator.
- Error messages are associated with fields via `aria-describedby`; form-level errors use `role="alert"`.

> Full WCAG conformance can't be asserted from code alone — it needs manual testing with assistive tech and expert review. The design targets WCAG AA practices; it does not claim certified compliance.

Client components are minimal and isolated: `LikeButton` (sends `{ postId, liked }` to `toggleLike`), `CommentForm`, `MediaUploadForm` (they call server actions). Everything else is a Server Component.

---

## 12. Testability

- **Unit-testable (pure, no network):** input validators in Section 9 (in `lib/validation.ts` as pure functions returning `{ ok, error }`), the `safeNextPath(next)` open-redirect guard (§6, finding 7 — assert that `/groups`, `/profile/edit` pass through while `//evil.com`, `https://evil.example`, `javascript:alert(1)`, and `null`/empty fall back to `/profile`), the config/`isSupabaseConfigured` logic (inject `env` or use `process.env` with a test override), URL/key placeholder detection, and the media object-key builder in `lib/storage-path.ts`. These are the primary unit test targets and ship in `tests/validation.test.ts`.
- **Integration-testable (needs a Supabase project or local Supabase):** RLS policies — the highest-value integration tests. Scenarios: a non-member cannot read a private group's posts; an **anonymous** visitor *can* read a public group's posts, profiles, and like counts but *cannot* read a private group's; a user cannot update another user's profile/comment; self-join works only on public groups; like/comment insert blocked when group unreadable; the `group_members` SELECT policy does not raise `infinite recursion detected in policy`. These run against a local Supabase (`supabase start`) or a disposable project and are documented as such; they are **not** run as part of this slice's CI by default (no live project yet).
- **Not meaningfully unit-testable without heavy mocking:** server actions that are thin wrappers over the SDK — covered better by the RLS integration tests above than by mocking the SDK.

**Test tooling (locked):** Vitest for unit tests (fast, TS-native, no extra Babel), configured by `vitest.config.ts`. Vitest and the `tests/` surface are **implementer infrastructure** adopted to satisfy the verification guideline — not a product feature and not part of the thin-slice scope list, so a later reader should not mistake them for scope drift. The `tests/validation.test.ts` suite ships with the slice covering the validators and the storage-path builder. `package.json` gets a `test` script. Integration/RLS tests are documented in the README but gated behind a configured local Supabase.

A design-for-testability consequence already applied above: validation logic and the storage-key builder are pulled out of server actions into pure functions precisely so they can be unit tested without Next or Supabase.

---

## 13. `.env.example`, `.gitignore`, README outline

**`.env.example`** (committed, placeholders only):
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
`.env.local` is git-ignored and created by the user from this template. The placeholder values double as the sentinel for `isSupabaseConfigured()` (treated as "not configured").

**`.gitignore`** must include `node_modules/`, `.next/`, `.env.local`, `.env*.local`, build output, and OS cruft.

**README.md** (Windows PowerShell, `;` separators, no auto-started dev server) outlines:
1. Prerequisites: install Node.js LTS 20+ (verify `node --version; npm --version`).
2. `npm install`.
3. Create a free Supabase project; copy Project URL + anon key. In Auth settings: (a) the app enforces min-8 passwords server-side before calling Supabase, so the Supabase Auth minimum only matters if the app is bypassed — leaving the default (6) is fine, or optionally set it to 8 to keep them in sync (§9); (b) set the **Site URL** to your dev origin (`http://localhost:3000`) and add it to Redirect URLs; (c) in **Auth → Email Templates → Confirm signup**, set the confirmation link target to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` so the callback can verify via `verifyOtp` (§6, finding 1). The default `?code=` link will **not** work with this app, which does not use the PKCE flow.
4. In the Supabase **dashboard SQL editor** (runs as role `postgres`, which may write `storage.*`), run `supabase/schema.sql` to create the `pgcrypto` extension, tables, RLS policies, the `is_group_member` / `can_read_group` / `can_read_post` / `can_write_post_media` helpers, the `create_group` RPC, and the `media` bucket + storage policies. The file is idempotent and safe to re-run (bucket insert uses `on conflict do nothing`; storage policies are `drop policy if exists`-guarded — §4.5).
5. `Copy-Item .env.example .env.local` then edit `.env.local` with the real URL + anon key.
6. Run the dev server **yourself**: `npm run dev` (documented, not executed by the agent — long-running).
7. Optional: run unit tests `npm test`.
8. Deploy later to Vercel/Cloudflare Pages (set the two env vars in the host dashboard).

All multi-step command snippets in the README use `;` between statements, never `&&`.

---

## 14. Where out-of-scope features slot in later (no code now)

The schema and routing are shaped so later phases extend cleanly without rework:
- **Avatar upload:** reuse the `media` bucket with key `avatar/{user_id}/{uuid}.{ext}`, add a storage INSERT policy allowing authenticated users to write under their own `avatar/{auth.uid()}/...` prefix, and store the object key in `profiles.avatar_url` resolved via `getPublicUrl`. Not built now (this slice uses a pasted URL — §4.5).
- **Events / project management:** new `events` table FK → `groups` (or standalone), `event_tasks`, `event_volunteers`; routes under `/events` and `/groups/[id]/events`. Volunteer sign-up reuses the membership pattern.
- **"Friend of" places:** `places` (structure/city/country) + `friend_pledges` join to `profiles`; a `/places` section. Needs the OPEN decisions in REQUIREMENTS (what a "structure" is, where place data comes from) resolved first.
- **Donations / payments:** explicitly excluded now and company-decided deferred; later a Stripe integration with its own tables — no money columns are introduced in this slice to avoid implying a half-built payment path.
- **Engagement ranking:** the current derived like/comment counts become inputs to a ranking score; add a materialized/denormalized counter and a `rank` ordering then.
- **Search / feed / recommendations:** add Postgres full-text or an index service over existing tables; the feed reads from groups/posts the user can access.
- **Moderation / reporting / admin:** `reports` table + role column on `profiles` + an admin area; RLS gains role-aware policies.
- **Phone registration / social login:** additional Supabase Auth providers; the auth-action layer is the single integration point.

None of the above is implemented in this build.

---

## 15. Acceptance mapping (this slice)

The build is done when: a user can register (email+password) and confirm; complete and edit a profile (display name, bio, optional avatar URL); create a public or private group; browse public groups (including as an anonymous visitor); open a group detail; (for public groups) join; create a post with text and/or an uploaded image stored in Supabase Storage; comment on a post; like/unlike a post and see the count; and sign out — all with protected routes redirecting unauthenticated users to login, private-group data blocked for non-members by RLS, the app building and running with no Supabase env configured (showing the configuration screen instead of crashing), and a responsive dark accessible UI. No out-of-scope feature code is present.

---

## 16. Review response log (v1 → v2)

Resolutions to the 11 findings in `c:\Projects\AidPal\.agents\tasks\design-review.md`. All choices align with the locked thin-slice scope and `REQUIREMENTS.md`.

1. **HIGH — Avatar upload has no storage design → ADDRESSED (Option A).** Dropped avatar *upload* from the slice. `profiles.avatar_url` is now an optional **pasted URL**; the `/profile/edit` form takes a URL text input, not a file upload. The §9 avatar-upload row is replaced by an `avatarUrl` URL-validation row. No `avatars` bucket, no avatar object-key convention. The upload path is documented as a later extension in §14. This matches the scope ("view/edit own profile"), which never required avatar upload.
2. **HIGH — `group_members` SELECT underspecified / recursion risk → ADDRESSED.** §4.3 now gives the full `can_read_group` body and an explicit, mandatory recursion rule: all `group_members` access inside policies must go through the `SECURITY DEFINER` helpers, never a direct self-reference. §4.4 states the exact `gm_select` policy (`using (public.can_read_group(group_id))`) as SQL.
3. **MEDIUM — `toggleLike` ambiguous → ADDRESSED.** §10 now defines an idempotent-by-desired-state contract: `LikeButton` sends `{ postId, liked }`; `liked` → `insert ... on conflict do nothing`, else `delete`; then return `count(*)`. §9 and §11 updated to the boolean argument.
4. **MEDIUM — media/post atomicity contradiction → ADDRESSED.** Removed the "if its only content was the image" branch. §10 states a single rule: any media post fails entirely on image-upload failure (no `posts` row), with a numbered flow (upload → insert post → insert media → best-effort object delete on media-insert failure). Text-only posts skip the upload steps.
5. **MEDIUM — Server-Component cookie writes → ADDRESSED.** §7 now requires `setAll` to be wrapped in try/catch that ignores write errors (middleware persists refreshed cookies); §6 and §8 state that session-mutating ops run only in Server Actions / the Route Handler, never in a Server Component render, preserving the no-throw guarantee.
6. **MEDIUM — anonymous public-group browsing vs profiles SELECT → ADDRESSED.** Chose the consistent anonymous-read contract: SELECT on `profiles`, `groups`, `group_members`, `posts`, `media`, `comments`, `likes` is granted to `anon, authenticated` (profiles hold no PII; email is in `auth.users`). §4.4, §5, §12, §15 aligned so logged-out visitors see fully-rendered public group pages while private groups stay member-only via `can_read_group`.
7. **NIT — password limit wording → ADDRESSED.** §9 reworded: min 8 is our app rule (Supabase default min is 6 and configurable; set it ≤ 8), max 72 is the bcrypt input limit in **bytes**, not characters.
8. **NIT — `media.mime_type` CHECK weaker than allowlist → ADDRESSED.** §4.1 CHECK tightened to `mime_type in ('image/jpeg','image/png','image/webp','image/gif')`, matching the app allowlist and excluding `image/svg+xml` (XSS vector).
9. **NIT — public bucket exposes private-group bytes → ADDRESSED.** §4.5 adds an explicit Known-Limitation paragraph: private-group images are not byte-level private; a later phase moves to a private bucket + signed URLs.
10. **NIT — `storage.objects.owner` population assumed → ADDRESSED.** §4.5 adds the dependency note: uploads must use the user's authenticated session (never service-role) or `owner` is null and own UPDATE/DELETE is denied; consistent with §7's anon-key-only decision.
11. **NIT — callback→protected-route cookie ordering → ADDRESSED.** §6 states the `/auth/callback` Route Handler must set session cookies on the same `NextResponse` that issues the redirect to `/profile/edit`.

Additional non-finding hardening carried in from the review's "unverified assumptions": §4 now opens with `create extension if not exists pgcrypto;` so `gen_random_uuid()` is guaranteed.

---

## 17. Review response log (v2 → v3)

Resolutions to the 8 findings in the second review (`c:\Projects\AidPal\.agents\tasks\design-review.md` / `design-review.json`): 1 HIGH, 4 MEDIUM, 3 NIT. Every choice stays inside the locked thin-slice scope and aligns with `REQUIREMENTS.md`.

1. **HIGH — callback assumed PKCE `?code=`, but Supabase's default link is `token_hash`/`verifyOtp` → ADDRESSED (Option A).** Dropped `exchangeCodeForSession` and the `?code=` assumption entirely. §5, §6, §10 now specify the default email-link flow: the Confirm-signup template redirects to `/auth/callback?token_hash={{ .TokenHash }}&type=email`, and the handler calls `verifyOtp({ type, token_hash })`. The README step 3 adds the exact Auth → Email Templates configuration. No PKCE `flowType` is configured, matching a default Supabase project, so the registration happy-path completes.

2. **MEDIUM — `media`/`comments`/`likes` RLS joined directly to `posts`, bypassing the definer-only rule → ADDRESSED.** Added the `can_read_post(pid uuid)` `SECURITY DEFINER` helper (§4.3) and changed the `media`/`comments`/`likes` SELECT and INSERT `WITH CHECK` policies in §4.4 to `public.can_read_post(post_id)`. The §4.3 recursion rule is widened to a general cross-table rule covering posts-reach, and the direct `exists (select 1 from posts ...)` subselect is explicitly forbidden.

3. **MEDIUM — server-action signatures/return contract undefined → ADDRESSED.** Added §6.1 "Server action contracts": the shared `ActionResult` type, a per-action table of input (`FormData` vs typed args) and success behavior (redirect vs returned value), and an explicit statement of which actions `redirect()` (never return on success) vs return a value. `toggleLike` is defined to return `{ ok: true; count: number }`; §9's "n/a" was about idempotency, not the return shape, and §6.1 now carries the render contract.

4. **MEDIUM — media-upload trust/ownership boundary unspecified → ADDRESSED.** Locked the server-action-upload path: `MediaUploadForm` submits the `File` in `createPost` `FormData`; the server action uploads to the `media` bucket **under the user's cookie-derived session** (populating `storage.objects.owner`), then inserts post+media with the §10 compensating delete. §4.5 and §10 both state this; the client never writes Storage directly, eliminating the orphan-object window of a client-upload design.

5. **MEDIUM — `profiles` row precondition not enforced; FK violations likely → ADDRESSED.** Profile-row creation moved to a **login-time precondition** via an idempotent `ensureProfile()` run in both `/auth/callback` (post-`verifyOtp`) and the `signIn` action (post-sign-in), so every authenticated user has a `profiles` row before any FK-dependent write. §6 documents this; FK-dependent actions additionally guard-and-redirect to `/profile/edit` as a defensive backstop. §5 `/profile` redirect retained for the edit UX.

6. **NIT — FK-to-`profiles` ordering not stated as an invariant → ADDRESSED.** Added an explicit "FK ordering invariant" paragraph before §4.3 naming every FK-to-`profiles` column and pointing to the §6 login-time precondition.

7. **NIT — `next` redirect open-redirect risk → ADDRESSED.** Added `safeNextPath(next)` (pure, unit-tested) in §6: `next` is honored only when it is a same-origin relative path (starts with a single `/`, not `//` or a scheme), else falls back to `/profile`. Referenced in §5, §6, §6.1, and §12.

8. **NIT — body-or-media invariant app-only, contradicting "DB is final backstop" → ADDRESSED.** §9 now explicitly flags this one rule as the deliberate server-action-only exception (a cross-table invariant with no single-table CHECK), notes an empty post is a UX not a security concern, and mentions a deferred trigger as the future option if strictness is ever needed.

All five blocking findings (1–5) and all three nits (6–8) are resolved by localized edits; no architectural redesign was required, consistent with the review's own assessment.

---

## 18. Review response log (v3 → v4, FINAL)

Resolutions to the 8 findings in the third review (`c:\Projects\AidPal\.agents\tasks\design-review.md` / `design-review.json`): 1 HIGH, 4 MEDIUM, 3 NIT. Every edit is surgical and stays inside the locked thin-slice scope; no settled decision (stack, scope, email-only auth, donations-excluded) was re-opened.

1. **HIGH — `media` INSERT policy used a direct `posts` subselect, which §4.3 forbids → ADDRESSED.** Added the `can_write_post_media(pid)` `SECURITY DEFINER` helper (§4.3) that joins `posts`+`group_members` as the function owner, and changed the §4.4 `media` INSERT `WITH CHECK` to `uploader_id = auth.uid() and public.can_write_post_media(post_id)` (with the exact `media_insert` policy SQL). The forbidden `(select group_id from posts where id = post_id)` subselect is gone; the §4.3 mandatory rule now names `can_write_post_media` as the helper for the `media` INSERT membership check.

2. **MEDIUM — `createPost` uploaded bytes before the membership check → ADDRESSED.** Added an explicit **step 0** to the §10 `createPost` flow: verify `is_group_member(groupId)` and return `'You must join this group to post.'` **before any Storage upload**, so a non-member never uploads bytes that RLS would reject and the compensating delete stays an exceptional path. The text-only branch also runs step 0 first.

3. **MEDIUM — `signUp` success branch had no stated discriminator → ADDRESSED.** §6 and the §6.1 contract table now branch explicitly on `data.session`: non-null (confirmation off) → `ensureProfile()` then `redirect('/profile/edit')`; null (confirmation on) → return `{ ok: true }` and show the "check your email" notice. Both places note `ensureProfile()` cannot run in the confirmation-required branch because there is no session yet (it runs later at `/auth/callback`).

4. **MEDIUM — `ensureProfile` display-name fallback could violate the 1–60 CHECK → ADDRESSED.** §6 (and the §6.1 row) now specify a CHECK-safe fallback: `left(split_part(email,'@',1), 60)`, and if empty after trimming the constant `'New user'`, so a long (up to 64-char RFC 5321) local-part can never trip the CHECK and turn a login into the fatal `/login?error=auth` path.

5. **MEDIUM — storage bucket creation was non-idempotent and the running role was unstated → ADDRESSED.** §4.5 now states `schema.sql` is run in the Supabase **dashboard SQL editor** as role `postgres`, makes the bucket insert `insert into storage.buckets ... on conflict (id) do nothing`, and guards the storage `create policy` statements with `drop policy if exists` so the whole file is safe to re-run. README step 4 reflects the dashboard-editor role and the idempotency.

6. **NIT — `avatar_url` had no DB length CHECK → ADDRESSED.** §4.1 `profiles.avatar_url` now carries `length ≤ 2048 (CHECK)`, matching the §9 validator so the "DB CHECK is the final backstop" principle holds for this field too.

7. **NIT — Vitest/`tests/` could be mistaken for scope drift → ADDRESSED.** §12 now states Vitest and the `tests/` surface are implementer infrastructure adopted to satisfy the verification guideline, not a product feature.

8. **NIT — README "set Supabase min password length ≤ 8" overstated the setting → ADDRESSED.** §9 and README step 3(a) reworded: the app enforces min 8 server-side before calling Supabase, so the Supabase minimum only matters if the app is bypassed; the default (6) is fine, optionally set 8 to keep them in sync.

All five blocking findings (1–5) and all three nits (6–8) are resolved by localized edits. This is the final design version (v4).
