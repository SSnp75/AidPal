# Final Report — Post Reactions (Like / Love / Dislike)

Task: `aidpal-reactions-2025`
Project: `c:\Projects\AidPal` (Next.js 16.3.8 / Turbopack, Supabase)
Status: **Complete, reviewed APPROVED, build green, committed.**

The reactions feature replaces AidPal's single boolean `like` with three
mutually-exclusive reactions (👍 Like / ❤️ Love / 👎 Dislike), enforced as one
row per `(post, user)` by a composite primary key, and makes the engagement
controls on both the group detail page and the home feed actually work.

All feature work is contained in commit **`1dbd0a7`**
(`feat: add Like/Love/Dislike post reactions`) on branch `main`. Per the task,
nothing was pushed to the remote — the user pushes manually. `.env.local`
remains gitignored and was not committed.

---

## (a) Files changed / created

Source and schema:

- `supabase/schema.sql` — `reactions` table + four RLS policies replace `likes`; appended `to_regclass`-guarded one-time migration (likes → reactions).
- `src/types/db.ts` — `ReactionType` union + `Reaction` interface replace `Like`.
- `src/lib/validation.ts` — `REACTION_TYPES` + `isReactionType` type guard.
- `src/app/groups/actions.ts` — new `setReaction` server action; `toggleLike` removed.
- `src/components/ReactionBar.tsx` — **new** three-button optimistic client component.
- `src/components/LikeButton.tsx` — **deleted**.
- `src/components/PostBody.tsx` — **new** body renderer (clickable http(s) links).
- `src/lib/linkify.ts` — **new** URL linkify helper.
- `src/app/globals.css` — four muted reaction color tokens (`--reaction-like/-love/-dislike/-bg`).
- `src/lib/sampleFeed.ts` — `SamplePost` extended (`isReal`, `groupId`, `reactions`, `myReaction`); samples set inert defaults.
- `src/lib/feed.ts` — reactions query, count/mine maps, extended shaping, updated `rankByEngagement`.
- `src/app/page.tsx` — reaction-aware feed wiring; ranking applied only on the real-feed path.
- `src/app/groups/[id]/page.tsx` — reactions query/map + `ReactionBar` wiring.
- `src/components/dashboard/PostCard.tsx` — `ReactionBar` + comment `Link`; repost/bookmark removed.
- `src/components/dashboard/CenterFeed.tsx`, `LeftSidebar.tsx`, `RightSidebar.tsx` — feed surface wiring.

Tests:

- `tests/validation.test.ts` — `isReactionType` guard cases.
- `tests/feed.test.ts` — `rankByEngagement` ordering/immutability cases.

Task docs (also under version control in the same commit / task folder):

- `.agents/tasks/aidpal-reactions-2025/{requirements,design,plan,design-review,verification,review}.md` and `report.md` (this file).

Full diff reference: `git diff 3e2be09 1dbd0a7` (feature commit `1dbd0a7`).

> Note: there are unrelated uncommitted theme-token edits in the working tree
> (`NavBar.tsx`, `SupabaseNotConfigured.tsx`, `auth/callback/route.ts`,
> `auth/verified/page.tsx`, `.agents/tasks/plan.md`). These are **not** part of
> the reactions feature, were out of this task's scope, and were deliberately
> left uncommitted for the user.

---

## (b) New / updated DB objects

New table `public.reactions` (replaces the former `public.likes`):

- Columns: `post_id uuid` (FK → `posts.id`, `on delete cascade`), `user_id uuid`
  (FK → `profiles.id`, `on delete cascade`), `type text not null check (type in
  ('like','love','dislike'))`, `created_at timestamptz not null default now()`.
- Primary key: `primary key (post_id, user_id)` — the hard DB invariant that
  guarantees at most one reaction per user per post. The three-way
  insert/switch/toggle branch in `setReaction` is UX convenience, not the
  enforcement point.
- RLS: enabled.

RLS policies on `public.reactions` (gated through the existing
`public.can_read_post(post_id)` SECURITY DEFINER helper — no inline `posts`
subselect):

- `reactions_select` — `for select to anon, authenticated using (public.can_read_post(post_id))`.
- `reactions_insert` — `for insert to authenticated with check (user_id = auth.uid() and public.can_read_post(post_id))`.
- `reactions_update` — `for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_read_post(post_id))`. This UPDATE policy is the one deliberate addition over the former likes policies, needed because switching reaction type mutates an existing row.
- `reactions_delete` — `for delete to authenticated using (user_id = auth.uid())`.

Dropped `likes` objects (removed by the one-time migration on a live DB):

- Policies `likes_select`, `likes_insert`, `likes_delete`.
- Table `public.likes`.

`schema.sql` reflects the end state (reactions present, likes absent) and stays
fully re-runnable; a fresh DB built from the schema never creates a `likes`
table.

---

## (c) EXACT incremental migration SQL (paste into the live Supabase SQL editor)

Run this ONCE in the Supabase dashboard SQL editor (role `postgres`) against the
existing live DB that still has `public.likes`. It upgrades to the `reactions`
schema **without data loss** (every existing like is backfilled as
`type='like'`, `created_at` preserved) and then drops the old table. Both the
backfill and the drop are `to_regclass`-guarded, so a re-run after `likes` is
already gone is a true no-op. Reproduced verbatim from `supabase/schema.sql`:

```sql
-- ============================================================
-- ONE-TIME MIGRATION: likes → reactions
-- Run ONCE in the Supabase SQL editor against a live DB that
-- still has public.likes. Safe to run on a populated database.
-- This is NOT part of the re-runnable canonical schema above —
-- a fresh DB built from the schema never creates a likes table,
-- so this block only matters for upgrading an existing live DB.
-- Both the backfill and the drop are guarded by to_regclass so a
-- re-run after likes is already gone is a true no-op.
-- ============================================================

-- 1. Create reactions (no-op if the schema above already created it).
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

Prerequisite: the migration references `public.can_read_post(post_id)`, which
already exists in the live DB (it predates this feature). No other helper
changes are required.

---

## (d) Build confirmation

`npm run build` was run one final time in `c:\Projects\AidPal` and is **green**
— no TypeScript errors, no lint errors, all 12 pages generated. Final result:

```
> aidpal@0.1.0 build
> next build
▲ Next.js 16.3.8 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 32ms
  Creating an optimized production build ...
✓ Compiled successfully in 861ms
  ✓ Finished TypeScript in 2.3s
  ✓ Collecting page data using 14 workers in 1329ms
✓ Generating static pages using 14 workers (12/12) in 963ms
  ✓ Finalizing page optimization in 12ms
```

(Exit code 0. `npm run dev` was NOT run, per instructions.)

---

## (e) User-facing behavior trace

Signed-in user, group post (group detail page):

- Each post renders a `ReactionBar` with three buttons showing live per-type counts.
- Clicking **Like/Love/Dislike** optimistically updates the UI, calls `setReaction`, then reconciles against the server's returned `counts`/`mine`.
- Picking a different reaction **switches** (the old row's `type` is UPDATEd); counts move accordingly. Exactly one reaction is active (`aria-pressed` marks it).
- Clicking the **currently active** reaction **clears** it (row DELETEd), count decrements, no reaction active.

Signed-in user, real home-feed post:

- Same `ReactionBar` behavior. `setReaction` revalidates `/` and the owning group page so counts stay consistent across surfaces.
- The **comment** control is a working `Link` to `/groups/{groupId}` (the owning group), labeled with the live comment count.

Switching / clearing correctness:

- The DB composite PK makes "one reaction per user per post" unbreakable. `setReaction` reads current → branches insert / switch / toggle-off, treats a zero-row UPDATE/DELETE (silent RLS filtering) as failure, then re-reads post-write state for authoritative counts and `mine`.

Placeholder / sample posts:

- The three static sample posts have `isReal: false`, `groupId: null`, `reactions: { like, love: 0, dislike: 0 }`, `myReaction: null`. `PostCard` renders `ReactionBar` with `disabled={!post.isReal}` (inert, no `setReaction` call) and the comment control as a disabled `<button>` (no navigation). They render without crashing.

Links in post bodies:

- `PostBody`/`linkify` render http(s) URLs in post text as clickable links on both surfaces.

Known accepted behavior:

- A signed-out viewer who clicks a reaction on a real feed post sees a brief optimistic bump that reverts when `setReaction` returns `{ ok: false, "Sign in to react to posts." }`. This is confirmed and explicitly accepted in the approved design (resolves prior design-review finding #1); informational, not a blocker.

---

## (f) Graceful degradation (Supabase env absent)

- `setReaction` first guards on `isSupabaseConfigured()` and returns `{ ok: false, error: "Supabase is not configured. See README.md." }` without throwing.
- The home page falls back to the static `samplePosts` when Supabase is unconfigured/empty; those are `isReal: false`, so `ReactionBar` renders disabled/inert and the comment control is a disabled button — no network calls, no navigation, no crash.
- The group detail page renders `<SupabaseNotConfigured />` when unconfigured (unchanged).
- The production build's static generation of `/` confirms the no-live-data path does not crash. Verified during the review/verification iteration.

---

## Verification summary (from the approved review/verification)

- `npm run build` — clean, no TS/lint errors (confirmed again here, quoted above).
- `npm run lint` — 0 errors (2 pre-existing `<img>` warnings outside this change).
- `npm run test` — 54 tests passing, including new `isReactionType` and `rankByEngagement` cases.
- Reference cleanup — no remaining `toggleLike`, `LikeButton`, or `from("likes")` in live `src/`.
- Verdict: **APPROVED**.
