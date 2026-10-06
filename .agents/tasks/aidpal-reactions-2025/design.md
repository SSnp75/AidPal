# Post Reactions — Technical Design

## Overview

This design replaces AidPal's single boolean `like` with three mutually-exclusive reactions — **Like (👍)**, **Love (❤️)**, **Dislike (👎)** — enforced as one row per `(post, user)` via a primary-key invariant, and makes the engagement controls on both the group detail page and the home feed actually functional. The work spans five layers that already have clear precedent in the codebase: the Supabase schema + RLS (`supabase/schema.sql`), server actions (`src/app/groups/actions.ts`), a new client component modeled on `LikeButton.tsx`, the feed data layer (`src/lib/feed.ts` + `src/lib/sampleFeed.ts`), and the two rendering surfaces (`src/app/groups/[id]/page.tsx`, `src/components/dashboard/PostCard.tsx`).

The guiding principle is to mirror existing patterns rather than invent new ones. The `reactions` table is the `likes` table plus a `type` column, so its DDL, RLS, and the `setReaction` action are near-isomorphic to `likes` / `toggleLike`. `ReactionBar` is `LikeButton` generalized from one button with a boolean to three buttons with an enum. The feed shaping (DB rows → `SamplePost`) is unchanged in structure; only the carried fields grow. This keeps the change reviewable and the build green.

The `likes` table is removed entirely (single source of truth, per requirements A2/FR-4 and OQ-1 default), with a one-time migration that backfills existing likes as `type = 'like'` reactions before dropping it.

## Technology stack (locked)

Unchanged from the existing project; no new dependencies are introduced.

- **Database / auth / storage:** Supabase (Postgres + RLS), accessed via `@supabase/supabase-js` and the server helper `@/lib/supabase/server` (`createClient()`), guarded by `@/lib/supabase/config` (`isSupabaseConfigured()`).
- **Framework:** Next.js App Router with React Server Components and `"use server"` server actions; `revalidatePath` from `next/cache` for cache invalidation.
- **UI:** React client components (`"use client"`) with `useState` + `useTransition` for optimistic updates.
- **Styling:** Tailwind CSS v4 with the `@theme inline` token system in `src/app/globals.css`; colors referenced as CSS-variable-backed tokens (`text-*`, `bg-*`), never raw palette classes in the reaction UI.
- **Validation:** the pure helpers in `src/lib/validation.ts` (`isUUID`), extended with a reaction-type guard.
- **Types:** hand-written row types in `src/types/db.ts`.

## Data model

### `reactions` table DDL (canonical, in `schema.sql`)

The table replaces `public.likes`. It adds a `type` column with a CHECK constraint and keeps the same composite PK, which is what makes "at most one reaction per user per post" a hard database invariant (no application logic can violate it).

```sql
create table if not exists public.reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('like','love','dislike')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
```

Placement in `schema.sql`: the `reactions` block replaces the current `likes` `create table` block in the **Tables** section. The `alter table public.likes enable row level security;` line is replaced with `alter table public.reactions enable row level security;` in the **RLS** section.

Idempotency / re-runnability (AC-3): `create table if not exists` makes the DDL safe to re-run; the CHECK and PK are defined inline so they are created exactly once with the table and never re-added on subsequent runs. The canonical `schema.sql` reflects the **end state** — `reactions` present, `likes` and its policies absent — so a fresh database built from `schema.sql` never creates a `likes` table at all. No `likes` → `reactions` copy exists in `schema.sql` (there is nothing to copy on a fresh DB); the backfill lives only in the incremental migration (below). This keeps `schema.sql` strictly declarative and re-runnable without data-dependent branching.

### RLS policies (canonical, in `schema.sql`)

These mirror the existing `likes` policies exactly, with two deliberate differences: they target `reactions`, and they **add an UPDATE policy** because switching reaction type mutates an existing row (`likes` never had UPDATE — a like could only be inserted or deleted). Every gate uses the existing `public.can_read_post(post_id)` SECURITY DEFINER helper; **no policy contains a direct `posts` subselect** (NFR-5, AC-2).

```sql
-- ── reactions ──
drop policy if exists reactions_select on public.reactions;
drop policy if exists reactions_insert on public.reactions;
drop policy if exists reactions_update on public.reactions;
drop policy if exists reactions_delete on public.reactions;

create policy reactions_select on public.reactions
  for select to anon, authenticated using (public.can_read_post(post_id));

create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));

create policy reactions_update on public.reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_read_post(post_id));

create policy reactions_delete on public.reactions
  for delete to authenticated using (user_id = auth.uid());
```

The `drop policy if exists` before each `create policy` is the established idempotency idiom used throughout `schema.sql`; it makes re-runs error-free (AC-3). These replace the three `likes_*` policies in the **RLS Policies** section.

Why these gates:
- SELECT via `can_read_post` so counts and the viewer's reaction are visible exactly where the post itself is visible (matches `likes_select`, `comments_select`, `media_select`).
- INSERT requires `user_id = auth.uid()` (you may only react as yourself) **and** `can_read_post` (you may only react on a post you can see).
- UPDATE requires `user_id = auth.uid()` on the existing row (`using`) and re-checks ownership + readability on the new row (`with check`). Because `post_id`/`user_id` form the PK and never change on a type switch, the `with check` on `can_read_post(post_id)` is a defense-in-depth re-assertion.
- DELETE requires only `user_id = auth.uid()` (matches `likes_delete`); you can always remove your own reaction.

### Row type (`src/types/db.ts`)

Replace the `Like` interface with:

```ts
export type ReactionType = "like" | "love" | "dislike";

export interface Reaction {
  post_id: string;
  user_id: string;
  type: ReactionType;
  created_at: string;
}
```

**`ReactionType` canonical definition chain (resolves the "defined in three places" risk).** `ReactionType` is defined **exactly once**, here in `src/types/db.ts`. Everywhere else imports it; no other file re-declares or re-exports it:

1. `src/types/db.ts` — the single `export type ReactionType = "like" | "love" | "dislike"` (above) and the `Reaction` interface. This is canonical.
2. `src/lib/validation.ts` — imports `ReactionType` from `@/types/db` and uses it as the guard's return type. The runtime list is derived as `const REACTION_TYPES: readonly ReactionType[] = ["like", "love", "dislike"]`, which the compiler checks against the imported union (so the list and the type can never silently diverge). `validation.ts` does **not** `export type ReactionType`.
3. `src/app/groups/actions.ts` — imports `ReactionType` from `@/types/db` (and `isReactionType` from `@/lib/validation`). The `SetReactionResult` type references `ReactionType` but does **not** re-define or re-export it.

This avoids any duplicate-export divergence: there is one union, imported in two places.

The `Like` interface is removed; `grep` confirms no source file imports `Like` (the only `likes` usages are inline-typed `supabase.from("likes")` calls in `feed.ts` and `groups/[id]/page.tsx`), so removing it is safe.

### Incremental migration block (FR-4, AC-4, NFR-7)

A separate, clearly-commented block for the Supabase SQL editor that upgrades a **live, populated** database without data loss. It is NOT part of `schema.sql`; it is delivered as a fenced block in this design and (at implementation) as a comment-delimited section the operator runs once. The implementer should place it in a clearly separated, commented region (e.g. a `-- ===== ONE-TIME MIGRATION (run once on live DB) =====` block appended below the canonical schema, or a sibling `supabase/migrations/` file if the team prefers — the content is identical either way).

```sql
-- ============================================================
-- ONE-TIME MIGRATION: likes → reactions
-- Run ONCE in the Supabase SQL editor against a live DB that
-- still has public.likes. Safe to run on a populated database.
-- Do NOT include in the re-runnable canonical schema.sql.
-- ============================================================

-- 1. Create reactions (no-op if a prior run already created it).
create table if not exists public.reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('like','love','dislike')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.reactions enable row level security;

-- 2. RLS policies (drop-then-create = safe to re-run).
drop policy if exists reactions_select on public.reactions;
drop policy if exists reactions_insert on public.reactions;
drop policy if exists reactions_update on public.reactions;
drop policy if exists reactions_delete on public.reactions;

create policy reactions_select on public.reactions
  for select to anon, authenticated using (public.can_read_post(post_id));
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));
create policy reactions_update on public.reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_read_post(post_id));
create policy reactions_delete on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- 3. Backfill: copy every existing like as type='like'.
--    on conflict do nothing makes a second run a no-op (no dupes, no error).
--    Guarded by to_regclass so re-running AFTER likes is dropped is harmless.
do $$
begin
  if to_regclass('public.likes') is not null then
    insert into public.reactions (post_id, user_id, type, created_at)
    select l.post_id, l.user_id, 'like', l.created_at
    from public.likes l
    on conflict (post_id, user_id) do nothing;
  end if;
end $$;

-- 4. Drop old likes policies, then the table (idempotent).
--    Guarded by to_regclass so this whole step is a no-op once likes is gone.
--    NOTE: `drop policy if exists ... on public.likes` does NOT self-guard —
--    IF EXISTS only suppresses "policy not found", not "relation not found".
--    If the likes table is already dropped, those statements raise
--    `ERROR: relation "public.likes" does not exist`, so the table-existence
--    guard below is what makes step 4 safe to re-run.
do $$
begin
  if to_regclass('public.likes') is not null then
    drop policy if exists likes_select on public.likes;
    drop policy if exists likes_insert on public.likes;
    drop policy if exists likes_delete on public.likes;
    drop table public.likes;
  end if;
end $$;
```

Data-integrity reasoning (NFR-7): the PK `(post_id, user_id)` guarantees each live `likes` row maps to a unique `reactions` row; `on conflict (post_id, user_id) do nothing` means re-running the backfill never duplicates and never errors. Both the backfill (step 3) and the drop (step 4) are wrapped in a `to_regclass('public.likes') is not null` guard, so after `likes` has already been dropped the whole block is a true no-op on re-run — step 3 skips the backfill and step 4 skips the policy/table drops entirely (this matters because `drop policy if exists ... on public.likes` would otherwise raise "relation does not exist" once the table is gone; `IF EXISTS` on a policy only swallows a missing-policy error, never a missing-table error). `created_at` is preserved from the original like. Because a like carried no type, every migrated row is `type = 'like'`, leaving exactly one reaction per original (post, user) pair.

## Server action: `setReaction`

### Location

Add to the existing `src/app/groups/actions.ts` (chosen over a new `src/app/reactions/actions.ts`). Rationale: `toggleLike` already lives there alongside `addComment`/`createPost`, the file already imports every helper needed (`isSupabaseConfigured`, `createClient`, `isUUID`), and keeping post-engagement actions co-located matches the current structure. A new file would duplicate the import header for no benefit.

### Contract

```ts
// ReactionType is imported from "@/types/db" — NOT re-declared here.
import type { ReactionType } from "@/types/db";

export type SetReactionResult =
  | { ok: true; counts: { like: number; love: number; dislike: number }; mine: ReactionType | null }
  | { ok: false; error: string };

export async function setReaction(
  { postId, type }: { postId: string; type: ReactionType }
): Promise<SetReactionResult>;
```

`counts` and `mine` always reflect the post's state **after** the write (FR-6). `mine` is `null` when the user just toggled their reaction off.

### Logic

Following the exact convention order used by `toggleLike`/`joinGroup`:

1. `if (!isSupabaseConfigured()) return { ok: false, error: "Supabase is not configured. See README.md." }`.
2. `const supabase = await createClient();` then `const { data: { user } } = await supabase.auth.getUser();` — `if (!user) return { ok: false, error: "Sign in to react to posts." }`. (Returns, does not `redirect` — this is called from a client transition, matching `toggleLike`.)
3. Validate input: `if (!isUUID(postId)) return { ok: false, error: "Not found or not allowed." }`. Validate `type` with a new guard `isReactionType(type)` (see Validation below) → `{ ok: false, error: "Invalid reaction." }` on failure.
4. Read the viewer's current reaction on this post:
   ```ts
   const { data: existing } = await supabase
     .from("reactions")
     .select("type")
     .eq("post_id", postId)
     .eq("user_id", user.id)
     .maybeSingle();
   ```
5. Branch (FR-5):
   - **No existing row** → `insert({ post_id, user_id, type })`.
   - **Existing row, different type** → `update({ type }).eq("post_id", postId).eq("user_id", user.id)`.
   - **Existing row, same type** → `delete().eq("post_id", postId).eq("user_id", user.id)` (toggle off).

   **Write-outcome checking (resolves finding #3).** The three write kinds fail differently under RLS, and this must be handled explicitly rather than assuming every denial raises an error:
   - **INSERT** — a failing `with check` (e.g. post no longer readable) raises Postgres error `42501`, which Supabase returns as a non-null `error`. Checked directly.
   - **UPDATE / DELETE** — the `using` predicate is applied as a row filter, so a denial (e.g. the viewer lost read access, or the row vanished) matches **zero rows and returns NO error**. Checking `error` alone is insufficient: a zero-row update/delete looks like success.

   To make the switch/clear branches fail loudly instead of silently, request the affected rows and assert a match. Use `.select()` on the mutating call so Supabase returns the affected rows:
   ```ts
   // switch branch
   const { data: updated, error } = await supabase
     .from("reactions")
     .update({ type })
     .eq("post_id", postId)
     .eq("user_id", user.id)
     .select("post_id"); // returns [] if RLS filtered it to 0 rows
   if (error) { /* log + { ok:false, "Could not update reaction. Try again." } */ }
   if (!updated || updated.length === 0) {
     return { ok: false, error: "Not found or not allowed." };
   }
   ```
   The DELETE branch applies the same `.select("post_id")` + zero-row check. The INSERT branch relies on the raised `42501`/error only (an insert that violates `with check` errors; it does not silently no-op). On any raised `error` → `console.error("[setReaction] <op>", error.message)` and `return { ok: false, error: "Could not update reaction. Try again." }`.

   Rationale for choosing the affected-row check over documenting the silent `{0,0,0}` outcome: the check is cheap (the row set is already being returned), it turns a confusing "my reaction silently disappeared with ok:true" into an honest `{ ok: false }` the client reverts, and it keeps the action's success contract meaning "the write I intended actually happened."
6. Re-read post-write state and return it:
   ```ts
   const { data: rows } = await supabase
     .from("reactions")
     .select("type, user_id")
     .eq("post_id", postId);
   ```
   Aggregate `rows` into `counts = { like, love, dislike }` and set `mine` to the viewer's row type (or `null`).
7. Revalidate server-rendered surfaces (see `revalidatePath` below): `revalidatePath("/")`, then look up the owning group (`supabase.from("posts").select("group_id").eq("id", postId).maybeSingle()`) and, if found, `revalidatePath(\`/groups/\${groupId}\`)`. Then `return { ok: true, counts, mine }`.

Why read-current-then-branch rather than a blind upsert: the three-way toggle (insert / switch / clear) cannot be expressed as a single upsert because "same type → delete" is not an upsert outcome. Reading first is one extra round-trip but keeps the logic obvious and race-tolerable (the PK still prevents duplicate rows; a lost race at worst yields a slightly stale count that the next action corrects). This matches the project's preference for clarity over micro-optimization and the acceptable staleness noted in Out of Scope (no realtime).

### Count aggregation

Counts are computed in JS from the per-post rows (same approach as the group page and feed today, which tally `likes` rows in a `Map`). A single `select("type, user_id").eq("post_id", postId)` returns at most a few rows per post and yields both the counts and `mine` in one query, so no `count: "exact"` head queries are needed. (The `group_id` lookup for revalidation is a separate single-row PK read; see the `revalidatePath` subsection.)

**Why the single query is complete and does not under-count (resolves finding #4).** `reactions_select` gates on `can_read_post(post_id)`, which is a **post-level** predicate — row visibility depends only on whether the viewer can read the post, not on the row's `user_id`. So a viewer who can read the post sees **every** reaction row on it. The single `select("type, user_id").eq("post_id", postId)` therefore returns the complete reaction set, yielding accurate per-type `counts` for everyone plus `mine` (the row whose `user_id === user.id`). No per-user filter and no separate `count: "exact"` head query is needed or wanted; adding either would be redundant and would diverge from this one-query design.

### `revalidatePath`

The reacting user always sees correct counts immediately, because `ReactionBar` reconciles against the action's returned `counts`/`mine`. The problem `revalidatePath` solves here is **server-rendered staleness for everyone else and across navigations**: both `/` (home feed) and `/groups/[id]` are React Server Components that read reaction counts on the server, and Next.js caches that RSC output (Data Cache / Full Route Cache). Without revalidation, after a reaction lands: (a) another viewer navigating to the page sees stale counts until the cache naturally expires, and (b) the reactor themselves, after navigating away and back, sees the cached server render snap back to pre-reaction counts. The old `toggleLike` largely dodged this because `LikeButton` only appeared on the group page, which rendered fresh on direct load; moving reactions onto the home feed widens the exposure.

Decision: `setReaction` **does** revalidate. Concretely:

- Always call `revalidatePath("/")` after a successful write, so the home feed (trending + latest ordering, which now depends on reaction counts via `rankByEngagement`) re-renders fresh on next request.
- Also revalidate the owning group page. The action already needs the `post_id`; it does one additional single-row PK lookup to get the group id — `supabase.from("posts").select("group_id").eq("id", postId).maybeSingle()` — and, when found, calls `revalidatePath(\`/groups/\${groupId}\`)`. This mirrors the existing `addComment` pattern, which looks up `group_id` from the post for exactly the same reason. If the lookup returns nothing (post deleted/invisible), the group revalidation is skipped; `revalidatePath("/")` still runs.

Cost is one extra single-row read on the write path — acceptable and consistent with `addComment`. This supersedes the earlier "no revalidation" stance; see updated **D1** below.

### Fate of `toggleLike` and callers (FR-7)

`toggleLike` is **removed**, and its only caller surface is migrated to `setReaction` + `ReactionBar`:

- `src/components/LikeButton.tsx` — removed (replaced by `ReactionBar.tsx`). It is the sole importer of `toggleLike`.
- `src/app/groups/[id]/page.tsx` — stops importing/rendering `LikeButton`, renders `ReactionBar` instead.

Rationale for removal over re-pointing: re-pointing `toggleLike` at `reactions(type='like')` would leave a dead one-dimensional API next to the new three-way one, and `LikeButton` could not express Love/Dislike. Since there is exactly one caller chain, a clean removal is lower risk than carrying a shim. After this change **no source file references the `likes` table or `toggleLike`** (AC-7).

### Validation helper (`src/lib/validation.ts`)

Add a pure guard beside `isUUID`, matching the file's "no network, no side effects" contract:

```ts
import type { ReactionType } from "@/types/db"; // canonical union, not re-declared

export const REACTION_TYPES: readonly ReactionType[] = ["like", "love", "dislike"];
export function isReactionType(raw: unknown): raw is ReactionType {
  return typeof raw === "string" && (REACTION_TYPES as readonly string[]).includes(raw);
}
```

`REACTION_TYPES` is typed as `readonly ReactionType[]`, so the literal list is checked against the canonical `db.ts` union at compile time — adding or mistyping an entry fails the build, keeping the runtime list and the type in lockstep without `validation.ts` ever re-declaring `ReactionType`. `src/app/groups/actions.ts` imports `isReactionType` from here and `ReactionType` from `@/types/db` (per the canonical chain above and **D2**).

## Feed data layer

### `SamplePost` (`src/lib/sampleFeed.ts`)

Extend the interface so a feed item can carry reaction state and distinguish real posts from placeholders (FR-14):

```ts
export interface SamplePost {
  id: string;
  authorName: string;
  handle: string;
  timeAgo: string;
  body: string;
  hashtags: string[];
  likes: number;        // retained: used only as the Like-count source; see note
  comments: number;
  reposts: number;      // retained for type stability; no longer rendered
  // ── reaction state ──
  isReal: boolean;                 // true = real DB post with a usable id/groupId
  groupId: string | null;          // owning group for the comment link; null for placeholders
  reactions: { like: number; love: number; dislike: number };
  myReaction: "like" | "love" | "dislike" | null;
}
```

The three static `samplePosts` are updated to satisfy the extended type with inert defaults: `isReal: false`, `groupId: null`, `reactions: { like: <existing likes number>, love: 0, dislike: 0 }`, `myReaction: null`. Their existing `likes`/`comments`/`reposts` numbers stay as display flavor; because `isReal` is `false`, `PostCard` renders inert controls for them (FR-20, AC-13).

Design note on `likes`/`reposts` fields: rather than remove them (which would ripple through sample data and `rankByEngagement`), they are retained. `reactions.like` is the authoritative Like count for real posts; for sample posts `reactions.like` is seeded from the old `likes` value. `reposts` is kept in the type to avoid churn but is no longer rendered (Repost removed from the card, FR-19). Documented assumption **D3**.

### `fetchFeedPosts` (`src/lib/feed.ts`)

The function signature stays `(supabase: SupabaseClient, limit?: number)` — no new parameters. The internal addition of `getUser()` (below) is intentional: on the server, `createClient()` shares the same cookie context as every other call in the request, so the internal `getUser()` retrieves the same session without ambiguity. This adds one extra round-trip compared to threading a `userId` parameter, but keeps the public API unchanged and avoids forcing every caller to obtain the user first. The trade-off is acceptable because the call is cheap (session cookie lookup, not a DB query) and already happens elsewhere in the same request.

Change the `likes` fetch to a `reactions` fetch that returns `type` and `user_id`, and populate the new fields:

- Determine the viewer once: add `const { data: { user } } = await supabase.auth.getUser();` at the top (the feed currently never reads the user; it needs it to compute `myReaction`). This is a safe addition — `getUser()` returns `{ user: null }` when unauthenticated.
- Replace the `likes` query in the `Promise.all` with a **typed** reactions query. The Supabase client is untyped here, so a bare `select` returns `type` as `string`; without an explicit row type, tallying `counts[row.type]` or assigning `myReaction: ReactionType` would not compile (finding #2). Use `.returns<...>()` to type the rows as `ReactionType`:
  ```ts
  supabase
    .from("reactions")
    .select("post_id, user_id, type")
    .in("post_id", postIds)
    .returns<{ post_id: string; user_id: string; type: ReactionType }[]>()
  ```
  Import `ReactionType` into `feed.ts` from `@/types/db`. The `.data ?? []` fallback is already typed by the `.returns<...>()` call, so the tally below sees `row.type: ReactionType` and indexes `counts`/assigns `myReaction` without a cast.
- Build two maps from the reaction rows: `reactionCounts: Map<string, {like,love,dislike}>` (tallied by `type`) and `myReaction: Map<string, ReactionType>` (set when `user && row.user_id === user.id`).
- In the final `posts.map`, set `isReal: true`, `groupId: p.group_id` (already on `Post`), `reactions: reactionCounts.get(p.id) ?? {like:0,love:0,dislike:0}`, `myReaction: myReaction.get(p.id) ?? null`, and set the retained `likes` field to `likes: reactionCounts.get(p.id)?.like ?? 0` (chosen as the single authoritative expression — it reuses the map lookup already done; finding #8).
- `comments` tally is unchanged.
- **Retain the `satisfies SamplePost` assertion** on the `posts.map` return object (it is already present in `feed.ts`). Once `SamplePost` grows the required `isReal`/`groupId`/`reactions`/`myReaction` fields, `satisfies SamplePost` is what forces the compiler to flag any field the map forgets to populate — it is the compile-time guard that keeps the shaped object and the extended interface in sync. Do not drop or weaken it to `as SamplePost`.

No new query count beyond swapping `likes`→`reactions` and adding the single `getUser()` call.

### `rankByEngagement` (`src/lib/feed.ts`, FR-16, AC-14)

Updated definition — rank by **positive** engagement only, ignoring dislikes (A5):

```ts
/** Rank by positive engagement: like + love + comments (dislikes ignored). */
export function rankByEngagement(posts: SamplePost[]): SamplePost[] {
  const score = (p: SamplePost) => p.reactions.like + p.reactions.love + p.comments;
  return [...posts].sort((a, b) => score(b) - score(a));
}
```

This reads `reactions.like`/`reactions.love` (authoritative) rather than the retained `likes` field, so trending reflects both positive reaction types. The Trending/Latest split in `src/app/page.tsx` is unchanged — it still calls `rankByEngagement(allPosts)` and slices.

**Sample-fallback path is unchanged (resolves finding #5).** The sample-fallback branch in `page.tsx` continues to pass `trendingPosts={[]}` and render `samplePosts` as latest-only, exactly as today. `rankByEngagement` is applied only to the real feed (`allPosts.length > 0` guard). Sample posts' `reactions.like` is seeded from their existing display `likes` value, but this is irrelevant because `rankByEngagement` is never called on them. An implementer must NOT "helpfully" rank the samples — doing so would surface a trending section in the no-Supabase/empty-feed state where it never appeared, drifting into the frozen home layout (NFR-6).

## Reaction UI

### `ReactionBar` client component (`src/components/ReactionBar.tsx`)

Adapted from `LikeButton.tsx` (same `"use client"`, `useState` + `useTransition` optimistic pattern), generalized to three buttons.

```ts
interface Props {
  postId: string;
  initialCounts: { like: number; love: number; dislike: number };
  initialMine: "like" | "love" | "dislike" | null;
  disabled?: boolean; // true for placeholder/sample posts → render inert
}
```

State: `const [counts, setCounts] = useState(initialCounts)`, `const [mine, setMine] = useState(initialMine)`, `const [isPending, startTransition] = useTransition()`.

Rendering: three `<button type="button">` elements for 👍 Like / ❤️ Love / 👎 Dislike, each showing its emoji glyph (A6) and `counts[type]`. The active button (`mine === type`) carries the active token styling.

Click handler `onPick(type)` (FR-10):
1. Capture `prevCounts`, `prevMine`.
2. Compute next state optimistically:
   - `mine === type` → clearing: `mine' = null`, `counts[type] -= 1`.
   - `mine === null` → adding: `mine' = type`, `counts[type] += 1`.
   - `mine === other` → switching: `counts[mine] -= 1`, `counts[type] += 1`, `mine' = type`.
   Apply with `setCounts`/`setMine`.
3. `startTransition(async () => { const r = await setReaction({ postId, type }); if (r.ok) { setCounts(r.counts); setMine(r.mine); } else { setCounts(prevCounts); setMine(prevMine); } })` — reconcile with server truth on success, revert on `{ ok: false }`.

Inert mode: when `disabled` is `true` (placeholder posts), all buttons render `disabled` and `onPick` is not wired (or short-circuits), so they display counts but perform no action and never call `setReaction` (FR-20, AC-13). This mirrors how the current `PostCard` renders `disabled` buttons.

Accessibility (FR-11, NFR-2, AC-8):
- Native `<button>` elements → keyboard operable for free.
- Active button `aria-pressed="true"`, the other two `aria-pressed="false"`.
- Each button `aria-label` includes its label and live count. The three templates are explicit (resolves finding #7):
  - `` `Like, ${counts.like} ${counts.like === 1 ? "like" : "likes"}` ``
  - `` `Love, ${counts.love} ${counts.love === 1 ? "love" : "loves"}` ``
  - `` `Dislike, ${counts.dislike} ${counts.dislike === 1 ? "dislike" : "dislikes"}` ``

  These match the existing `LikeButton` label style.
- **`aria-label` tracks the live `counts` state (resolves finding #6).** Because each label is derived from the `counts` state (not from the immutable `initialCounts` prop), it reflects the **optimistic** value immediately on click and then the **reconciled** value after the server responds — or the **reverted** value if `setReaction` returns `{ ok: false }`. A screen-reader user re-querying the control always hears the current displayed count.
- All three buttons `disabled` while `isPending` (and when `disabled` prop is set).
- Focus states use the existing `focus-visible:ring-accent` idiom from `PostCard`'s `engagementBtn`.

### Color tokens (`src/app/globals.css`, FR-12, NFR-1, AC-12)

Add muted, desaturated reaction tokens to the `:root` block and map them in `@theme inline`, consistent with the existing variable → `--color-*` token system. No bright/neon/saturated red or orange; no hard-coded Tailwind palette classes in the reaction UI.

```css
/* in :root */
--reaction-like:    #5b6b7f;  /* soft slate / blue-grey */
--reaction-love:    #a97e86;  /* muted rose / dusty-pink */
--reaction-dislike: #938a73;  /* muted amber / taupe */
--reaction-bg:      #eef2fb;  /* active chip background — reuse the faint-blue family */

/* in @theme inline */
--color-reaction-like:    var(--reaction-like);
--color-reaction-love:    var(--reaction-love);
--color-reaction-dislike: var(--reaction-dislike);
--color-reaction-bg:      var(--reaction-bg);
```

`ReactionBar` references these as Tailwind tokens: the inactive button uses `text-text-secondary` (existing), and an active button uses the matching `text-reaction-*` token plus a muted `bg-reaction-bg` chip — e.g. active Love → `text-reaction-love bg-reaction-bg`. The exact hex values are muted (all desaturated, lightness in a readable mid-range on the `#f5f7fd` card) and may be tuned at implementation; the requirement is only that they are variable-backed and non-bright.

Note on `--reaction-bg: #eef2fb`: this intentionally equals `--side-card` (the faint-blue side-column family), so the active-chip background stays within the established palette rather than introducing a new tint. The active chip sits inside a card whose background is `#f5f7fd` (`--card-bg`), so there is a slight contrast between chip and card; if in practice the two read as too similar, nudge `--reaction-bg` 1–2 lightness steps darker (e.g. toward `--side-border` `#d7e0f2`) without leaving the muted blue family. The match is deliberate, not an oversight.

## Wiring — group detail page (`src/app/groups/[id]/page.tsx`, FR-13)

- Replace `import LikeButton` with `import ReactionBar from "@/components/ReactionBar"`, and add `import type { ReactionType } from "@/types/db"` (needed to type the reactions query and the `reactionsByPost` map; finding #2).
- Change the `likesRes` query from `supabase.from("likes").select("post_id,user_id")` to a **typed** reactions query. The current page uses an inline-typed query with a `{ post_id: string; user_id: string }[]` fallback; the reactions replacement must type `type` as `ReactionType` for both branches of the `postIds.length` guard, or the `counts[row.type]`/`mine = row.type` assignments will not compile (finding #2):
  ```ts
  postIds.length
    ? supabase
        .from("reactions")
        .select("post_id,user_id,type")
        .in("post_id", postIds)
        .returns<{ post_id: string; user_id: string; type: ReactionType }[]>()
    : Promise.resolve({
        data: [] as { post_id: string; user_id: string; type: ReactionType }[],
      })
  ```
  Keep it inside the existing `Promise.all`, keep the `postIds.length` guard.
- Replace the `likesByPost` map builder with a `reactionsByPost: Map<string, { counts: {like,love,dislike}; mine: ReactionType | null }>` builder: tally per `type`, and set `mine` when `user && row.user_id === user.id`.
- In the post `map`, replace `likeInfo` lookup and the `<LikeButton .../>` with:
  ```tsx
  <ReactionBar
    postId={post.id}
    initialCounts={info.counts}
    initialMine={info.mine}
  />
  ```
  where `info = reactionsByPost.get(post.id) ?? { counts: {like:0,love:0,dislike:0}, mine: null }`.
- The comment list, `CommentForm`, `PostBody`, media rendering, and membership/join logic are **untouched** (NFR-6, AC-15). The posts here always have real ids, so `ReactionBar` is always active (no `disabled` prop needed).
- Out-of-scope note: the group page's existing hard-coded palette classes (e.g. `text-teal-400` on the group-name header, `bg-gray-900/50` / `bg-gray-800` card and surface styling) are **not** modified by this change (NFR-6). Removing `LikeButton` eliminates its `bg-teal-600/20 text-teal-300` usage, but no other teal/gray cleanup is in scope here; `ReactionBar` introduces its own CSS-variable-backed tokens and does not touch those surrounding styles.

## Wiring — home feed `PostCard` (`src/components/dashboard/PostCard.tsx`, FR-17/18/19/20)

The engagement row is rebuilt:

- **Reactions:** render `<ReactionBar postId={post.id} initialCounts={post.reactions} initialMine={post.myReaction} disabled={!post.isReal} />`. For real posts it is fully active; for placeholders (`isReal === false`) it renders inert.
- **Signed-out viewers on real posts (decision — resolves finding #1):** `ReactionBar` is driven **only** by `disabled={!post.isReal}` — it does **not** receive or inspect an auth flag. The chosen behavior is therefore: for a real post, `ReactionBar` is active regardless of auth state. A signed-out user who clicks a reaction gets the normal optimistic update, which then **reverts** when `setReaction` returns `{ ok: false, error: "Sign in to react to posts." }`. This optimistic-then-revert flicker for anonymous users is **accepted**; the alternative (threading an `isAuthed` flag into `ReactionBar` and rendering a sign-in prompt on click instead of an optimistic update) is explicitly **NOT** chosen, because it would add an auth prop and a second interaction mode to the component for an edge case the requirements never call out (requirements distinguish only placeholder-vs-real, not authed-vs-anon). Anonymous viewers always see `myReaction: null` and zero `mine` state because `fetchFeedPosts` computes `myReaction` from `getUser()`, which returns `null` when unauthenticated (see Feed data layer). The group detail page is unaffected: it already redirects/guards unauthenticated access to post composition, but the `ReactionBar` there follows the same active-regardless-of-auth rule.
- **Comment control (FR-18, AC-11):** for a real post with a `groupId`, render a Next `<Link href={`/groups/${post.groupId}`}>` styled like the old comment button, showing `💬 {post.comments}` (keep the count per OQ-2 default). For a placeholder (`!post.isReal || !post.groupId`), render the same markup as a `disabled` `<button>` (inert) so it does not navigate.
- **Repost + Bookmark (FR-19, AC-11):** both buttons are **removed** from the card entirely (not faked).
- The "Post options" `⋯` button and the rest of the card (author row, `PostBody`, hashtags) are unchanged.

Because `PostCard` currently renders `likes` directly, and the engagement row now pulls from `post.reactions`/`post.myReaction`/`post.isReal`/`post.groupId`, no other call site changes — `CenterFeed` passes `SamplePost[]` straight through and is untouched. `page.tsx` is untouched (it already feeds `latestPosts`/`trendingPosts`; both now carry the richer `SamplePost`). When Supabase is unconfigured or the feed is empty, `page.tsx` still falls back to `samplePosts`, which are now `isReal: false` → inert controls (NFR-3, AC-13).

`PostCard` becomes partly interactive but remains a server component wrapping the `ReactionBar` client component and a `Link`; no `"use client"` is needed on `PostCard` itself (it renders a client child, which is the existing React Server Component pattern).

## Error handling (per operation)

- **`setReaction` — Supabase not configured:** recoverable, non-fatal. Returns `{ ok: false, error: "Supabase is not configured. See README.md." }`. Not logged (expected in local/dev without env). Client reverts optimistic state.
- **`setReaction` — not signed in (`user` null):** recoverable. Returns `{ ok: false, error: "Sign in to react to posts." }`. Not logged. Client reverts.
- **`setReaction` — invalid `postId`:** recoverable. Returns `{ ok: false, error: "Not found or not allowed." }`. Not logged (matches `toggleLike`/`addComment` wording and silence). Client reverts.
- **`setReaction` — invalid `type`:** recoverable. Returns `{ ok: false, error: "Invalid reaction." }`. Not logged. Client reverts. (Should be unreachable from the UI, which only sends the three literals, but guards against crafted calls.)
- **`setReaction` — insert DB error (incl. RLS `42501` denial):** recoverable. INSERT with a failing `with check` raises Postgres `42501`, which surfaces as a non-null `error`. `console.error("[setReaction] insert", error.message)` then returns `{ ok: false, error: "Could not update reaction. Try again." }`. No information leak about why. Client reverts.
- **`setReaction` — update/delete silently filters to zero rows (RLS `using` denial, concurrent delete, or visibility loss):** recoverable. Unlike INSERT, a failing UPDATE/DELETE `using` predicate filters to zero matched rows with NO raised error (Postgres `UPDATE … WHERE` affecting 0 rows is not an error). The action detects this via `.select("post_id")` and asserts the returned set is non-empty; a zero-row result yields `return { ok: false, error: "Not found or not allowed." }`. This is preferred over silently returning `{ ok: true, counts: {0,0,0}, mine: null }`, which would confuse the user. Client reverts. (Resolves finding #3 error-handling correction.)
- **`setReaction` — update/delete raised DB error (non-RLS):** rare but possible (connectivity, serialization). `console.error("[setReaction] <op>", error.message)` then returns `{ ok: false, error: "Could not update reaction. Try again." }`. Client reverts.
- **`setReaction` — post-write re-read fails:** treat as DB error → log + `{ ok: false, error: "Could not update reaction. Try again." }`. The write may have succeeded, but since counts can't be confirmed the client reverts; the next successful action reconciles. Documented assumption **D4**.
- **`setReaction` — group-id lookup for revalidation fails or returns nothing:** non-fatal. The write and count re-read already succeeded, so the action still returns `{ ok: true, counts, mine }`. `revalidatePath("/")` runs unconditionally; the `revalidatePath(\`/groups/\${groupId}\`)` is simply skipped when `group_id` is unavailable. Not logged (a missing lookup only means the group page misses one revalidation; the next write or natural cache expiry corrects it).
- **`fetchFeedPosts` — reactions query fails:** the feed already fetches via `Promise.all` without throwing on individual query errors (it reads `.data ?? []`). A failed reactions read yields zero counts for all posts (graceful degradation, NFR-3); the home page still renders. No new try/catch is added; the existing outer `try/catch` in `page.tsx` remains the backstop.
- **Group page reactions query fails:** same pattern — `reactionsByPost` stays empty, posts render with zeroed `ReactionBar`s; page does not crash.

## Input validation rules (external inputs to `setReaction`)

- **`postId`** — required, type `string`, must match the project `UUID_RE` via `isUUID`. On failure: return `{ ok: false, error: "Not found or not allowed." }` (no throw). Enforced in the server action.
- **`type`** — required, type `string`, must be one of `"like" | "love" | "dislike"` via `isReactionType`. On failure: return `{ ok: false, error: "Invalid reaction." }` (no throw). Enforced in the server action.
- Server-side validation is authoritative; the client only ever sends the three literals, but the server never trusts that (NFR-5).

## Invariant ownership

- **At most one reaction per (post, user):** owned by the **database** — the `(post_id, user_id)` primary key. Chosen here (not the application) because a PK makes the invariant unbreakable regardless of races or buggy callers; the application's three-way branch is a UX convenience, not the enforcement point.
- **Reaction type ∈ {like, love, dislike}:** owned by the **database** CHECK constraint, re-asserted at the **application** boundary by `isReactionType` for a clean error message. The DB constraint is the real guarantee; the app check exists only to return `{ ok: false }` instead of surfacing a raw constraint error.
- **A user may only react as themselves / only on readable posts:** owned by **RLS** (`user_id = auth.uid()` + `can_read_post`). The server action's `getUser()` check is a fast-fail/UX layer; RLS is the security boundary (NFR-5).
- **Exactly-one-reaction UX (switch/clear):** owned by the **client** (`ReactionBar`) for responsiveness and the **server action** branch for correctness; reconciled against the server's returned `counts`/`mine` so the client can never drift permanently.

## Testability

- **Unit-testable (pure, no network):**
  - `isReactionType` — truth table over valid/invalid inputs.
  - `rankByEngagement` — ordering by `like + love + comments` with dislikes proven to be ignored (two posts differing only in `dislike` count must rank equal/stable).
  - The optimistic next-state computation in `ReactionBar` — it SHOULD be extracted to a pure `computeNext(mine, counts, picked)` helper so it is directly unit-testable for the three branches (add/switch/clear). This is a recommendation, not a hard requirement.
- **Integration-testable (needs Supabase / RLS):**
  - `setReaction` insert/switch/delete against a seeded DB, asserting the returned `counts`/`mine` and that the PK prevents duplicates.
  - RLS: an anon or non-owner cannot INSERT/UPDATE/DELETE another user's reaction; SELECT visibility follows `can_read_post` (private-group post not visible → no counts).
  - The migration block against a fixture DB with `likes` rows: assert row-for-row backfill as `type='like'`, no loss, no dupes, `likes` dropped, and that a second run is a no-op.
- **Build/lint (NFR-4, AC-7):** `npm run build` must pass. The design keeps all types explicit (`ReactionType`, extended `SamplePost`, `SetReactionResult`) specifically so the compiler catches any lingering `likes`/`toggleLike` reference. `npm run dev` is already running and must not be started.

A design concern worth flagging: `ReactionBar`'s optimistic logic is the most error-prone piece. Extracting the pure `computeNext` reducer (above) is the key testability lever — if it stays inline in the component it is only reachable via integration/DOM tests. The design treats the extraction as a SHOULD-level recommendation (consistent with the Testability bullet above): recommended for testability, but not a correctness requirement, so an implementer may inline it if they prefer, accepting the reduced unit-test coverage.

## Assumptions (explicit)

- **D1.** `setReaction` calls `revalidatePath("/")` and `revalidatePath(\`/groups/\${groupId}\`)` (after a cheap PK lookup of the owning group) to prevent stale counts on server-rendered pages after client-side reactions. This mirrors the existing `addComment` pattern. The reacting user sees correct counts immediately via the action's return value + client reconciliation; `revalidatePath` ensures subsequent server renders for other viewers and after navigations also reflect the new state.
- **D2.** `ReactionType` is defined once in `src/types/db.ts` and imported by both `validation.ts` (which derives `REACTION_TYPES` from it) and `groups/actions.ts` to avoid a divergent duplicate union.
- **D3.** The `likes` and `reposts` fields on `SamplePost` are retained (not removed) to minimize churn; `reactions.like` is authoritative for real posts, and `reposts` is no longer rendered. Removing them is a possible cleanup but is out of this change's minimal scope.
- **D4.** If the post-write re-read fails, the action reports failure and the client reverts even though the write may have landed; the next action reconciles. Acceptable because there is no realtime guarantee and the DB state is still correct.
- **D5.** Emoji glyphs (👍 ❤️ 👎) render acceptably across the project's target browsers, consistent with the existing emoji-in-UI convention; no icon library is added.
- **D6.** `getUser()` added to `fetchFeedPosts` does not meaningfully change feed latency (it is already called elsewhere per request) and returns `{ user: null }` without error when unauthenticated.

## Changelog — responses to the FIRST design review (historical)

This section records how the *previous* review round was resolved. Its numbering (#1–#8) belongs to that earlier review and is NOT the current review's findings; see "Responses to the second design review" below for the latest round.

- **#1 [HIGH] — Migration step 4 not re-runnable (`DROP POLICY IF EXISTS … ON public.likes` errors once `likes` is gone).** Addressed. Step 4 of the incremental migration is now wrapped in a `do $$ … if to_regclass('public.likes') is not null then … end $$;` guard that fences the three `drop policy` statements and the `drop table`, matching the step-3 guard. The surrounding prose was corrected: `IF EXISTS` on a policy suppresses only "policy not found," never "relation not found," so the table-existence guard is what makes step 4 a true no-op on re-run. The earlier incorrect claim that step 4's drops self-guard was removed.

- **#2 [MEDIUM] — `fetchFeedPosts` signature/`getUser()` undocumented.** Addressed. The Feed data layer section now states explicitly that the signature stays `(supabase: SupabaseClient, limit?: number)` with no new parameters, and that the internal `getUser()` is intentional and safe because server-side `createClient()` shares the request's cookie context. The one-extra-round-trip trade-off versus threading a `userId` param is noted and justified (cheap session read, keeps the API stable).

- **#3 [MEDIUM] — `ReactionType` defined in three places.** Addressed. A canonical chain is stated in the Row type section: `src/types/db.ts` is the single definition; `src/lib/validation.ts` imports it and derives `REACTION_TYPES: readonly ReactionType[]` (compiler-checked against the union, no re-declaration); `src/app/groups/actions.ts` imports it. The standalone `export type ReactionType = …` was removed from the action-contract snippet and replaced with an `import type { ReactionType } from "@/types/db"` line, and the validation snippet now imports rather than re-declares. D2 updated accordingly.

- **#4 [MEDIUM] — No `revalidatePath` → stale server-rendered counts.** Addressed. The decision is reversed: `setReaction` now calls `revalidatePath("/")` unconditionally and `revalidatePath(\`/groups/\${groupId}\`)` after a single-row PK lookup of the owning group (same pattern as `addComment`). The `revalidatePath` subsection explains the RSC/Data-Cache staleness problem the change solves, the setReaction logic gained an explicit step 7, the count-aggregation note was reconciled, error handling covers a failed/empty group lookup (non-fatal, home still revalidates), and D1 was rewritten to document the new behavior.

- **#5 [MEDIUM] — `satisfies SamplePost` must be retained.** Addressed. The Feed data layer section now explicitly instructs retaining the `satisfies SamplePost` assertion on the `posts.map` return (not weakening it to `as SamplePost`), noting it is the compile-time guard that forces every new required field to be populated.

- **#6 [NIT] — Existing teal/gray on the group page out of scope.** Addressed. The group-page wiring section notes that `text-teal-400` on the group-name header and `bg-gray-900/50` / `bg-gray-800` surfaces are not modified (NFR-6); only `LikeButton`'s own teal classes are removed by deleting that component.

- **#7 [NIT] — Contradictory `computeNext` language.** Addressed. Both the Testability bullet and the follow-up paragraph now use SHOULD consistently — the `computeNext` extraction is a testability recommendation, not a correctness requirement; an implementer may inline it.

- **#8 [NIT] — `--reaction-bg` equals `--side-card`.** Addressed. The Color tokens section now notes the match is intentional (staying within the faint-blue family), explains the chip-vs-card contrast, and gives a concrete tuning direction (nudge toward `--side-border`) if the two read as too similar in practice.

## Responses to the second design review

This revision resolves every finding in the latest `design-review.json` / `design-review.md` (verdict CHANGES_REQUESTED: 2 HIGH, 3 MEDIUM, 4 NIT). All HIGH and MEDIUM findings are addressed in the design body above; the numbering below matches that review.

- **#1 [HIGH] — Signed-out viewer behavior on real-post `ReactionBar` unspecified.** Addressed. The home-feed `PostCard` wiring section adds an explicit "Signed-out viewers on real posts" decision: `ReactionBar` is driven only by `disabled={!post.isReal}` and does not take an auth flag, so real-post reactions are active regardless of auth; a signed-out click gets an optimistic update that reverts on `{ ok: false, error: "Sign in to react to posts." }`. The optimistic-then-revert flicker is explicitly accepted, and the alternative (`isAuthed` flag + sign-in prompt) is explicitly rejected with reasoning. It also states anonymous viewers always receive `myReaction: null` because `fetchFeedPosts` computes it from `getUser()`.

- **#2 [HIGH] — New `reactions` SELECT row type unspecified; `type: string` will not satisfy `ReactionType` maps (build break).** Addressed. Both the `fetchFeedPosts` reactions query and the group-page reactions query now specify `.returns<{ post_id: string; user_id: string; type: ReactionType }[]>()`, the group-page empty branch returns a matching typed `data: [] as {…}[]`, and the design directs importing `ReactionType` into both `feed.ts` and `groups/[id]/page.tsx` so the count tally and `mine` assignment compile without a cast (NFR-4/AC-7).

- **#3 [MEDIUM] — UPDATE/DELETE RLS denial does not raise an error; error-handling claim wrong for switch/clear.** Addressed. `setReaction` step 5 adds a "Write-outcome checking" subsection: INSERT relies on the raised `42501`; UPDATE and DELETE use `.select("post_id")` and assert a non-empty returned set, returning `{ ok: false, error: "Not found or not allowed." }` on a zero-row (silently RLS-filtered) write. The Error-handling section was split into separate insert / zero-row / raised-error bullets, correcting the earlier false claim that all writes surface a `42501`.

- **#4 [MEDIUM] — Count re-read correctness (post-level SELECT gate) left as unstated reasoning.** Addressed. The Count aggregation subsection now states explicitly that `reactions_select` is post-level (`can_read_post(post_id)`), so a viewer who can read the post sees every reaction row on it; the single `select("type, user_id").eq("post_id", postId)` therefore yields complete per-type counts with no per-user filter and no `count: "exact"` head query.

- **#5 [MEDIUM] — Sample-fallback trending behavior unspecified; home-layout scope-drift risk.** Addressed. The `rankByEngagement` section now states the sample-fallback branch in `page.tsx` is unchanged (`trendingPosts={[]}`, `samplePosts` latest-only) and that `rankByEngagement` runs only on the real feed (the `allPosts.length > 0` path), with an explicit instruction not to rank samples (NFR-6).

- **#6 [NIT] — `aria-label` count reconciliation during pending state unspecified.** Addressed. The `ReactionBar` Accessibility section now states the `aria-label` is derived from live `counts` state, so it reflects the optimistic value during a transition and the reconciled/reverted value afterward.

- **#7 [NIT] — Love/Dislike `aria-label` pluralization left as "analogous".** Addressed. The Accessibility section now gives all three explicit label templates (Like/Love/Dislike) with `n === 1` singular/plural handling.

- **#8 [NIT] — "use X or Y" ambiguity for the retained `likes` field in `feed.ts`.** Addressed. The `fetchFeedPosts` bullet now pins a single expression: `likes: reactionCounts.get(p.id)?.like ?? 0`; the alternative was dropped.

- **#9 [NIT] — "Responses to design review" numbering could be confused with this review.** Addressed. The prior responses section was relabeled "Changelog — responses to the FIRST design review (historical)" with a note that its #1–#8 numbering belongs to the earlier round, and this current round's responses live under this distinct heading.
