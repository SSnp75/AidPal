# Like/Love/Dislike post reactions

Replaces AidPal's single boolean `like` with three mutually-exclusive reactions (👍 Like / ❤️ Love / 👎 Dislike), enforced as one row per `(post, user)` by a composite primary key, and makes the engagement controls on both the group detail page and the home feed actually work. The change spans the Supabase schema + RLS, a new `setReaction` server action replacing `toggleLike`, a new `ReactionBar` client component replacing `LikeButton`, the feed data layer, and the two rendering surfaces. The old `likes` table is removed with a guarded one-time backfill migration. The implementation tracks the approved design closely and the coder's verification records a clean `npm run build`, `npm run lint` (0 errors), and `npm run test` (54 passing).

Watch for: nothing blocking. One behavioral note worth a conscious sign-off — a signed-out viewer clicking a reaction on a real feed post gets an optimistic update that then reverts (confirmed, and explicitly accepted in the design). Everything the task flagged to check is present and correct.

**Verdict**: APPROVED

## High-level view

The `reactions` table is the former `likes` table plus a `type text check (type in ('like','love','dislike'))` column, keeping the same `(post_id, user_id)` PK so "at most one reaction per user per post" is a hard database invariant. RLS mirrors the former likes policies through the existing `can_read_post(post_id)` SECURITY DEFINER helper (no direct `posts` subselect), with SELECT open to anon+authenticated and INSERT/UPDATE/DELETE gated on `user_id = auth.uid()`; an UPDATE policy is added because switching reaction type mutates an existing row. `schema.sql` reflects the end state (reactions present, likes absent) and stays re-runnable, with a clearly separated, `to_regclass`-guarded one-time migration appended below it that creates reactions, backfills likes as `type='like'`, and drops the old table and policies.

`setReaction` honors the exact `{ ok:true, counts, mine } | { ok:false, error }` contract, requires auth, validates `postId`/`type`, and does read-then-branch (insert / switch / toggle-off). It correctly treats a zero-row UPDATE/DELETE (silent RLS filtering) as failure, re-reads post-write state for counts, and revalidates `/` plus the owning group page.

`ReactionBar` renders three buttons with live counts, optimistic add/switch/clear, `aria-pressed` on the active button, count-bearing `aria-label`s derived from live state, and disables all buttons while pending or inert. Colors are muted CSS-variable tokens in `globals.css` with no bright/neon values. Both surfaces are wired with active reactions, the feed comment control is a working `Link` to the owning group, repost/bookmark are removed outright, sample posts render inert, and `rankByEngagement` scores `like + love + comments` (dislikes ignored) while the Trending/Latest split and the 15:70:15 faint-blue layout are untouched.

<details>
<summary>Issues (1)</summary>

1. **Signed-out optimistic revert on feed reactions** — a logged-out viewer clicking a reaction on a real post sees a brief optimistic bump that reverts when `setReaction` returns `{ ok:false, "Sign in to react to posts." }`. Confirmed and explicitly accepted in the design (resolves prior design-review finding #1); informational, not a blocker.

</details>

<details>
<summary>Details</summary>

### Data model and the one-row invariant

`public.reactions` carries `post_id`/`user_id` FKs with `on delete cascade`, `type text not null check (type in ('like','love','dislike'))`, `created_at`, and `primary key (post_id, user_id)` (confirmed, `schema.sql`). The composite PK is what makes "one reaction per user per post" unbreakable regardless of races or buggy callers — the application's three-way branch is UX, not the enforcement point. `create table if not exists` keeps the DDL re-runnable; the CHECK and PK are inline so they are created once with the table.

### RLS through the readability helper

All four `reactions_*` policies gate through `public.can_read_post(post_id)` with no inline `posts` subselect (confirmed). SELECT is `to anon, authenticated using (can_read_post(post_id))`; INSERT is `with check (user_id = auth.uid() and can_read_post(post_id))`; UPDATE uses `user_id = auth.uid()` and re-checks `user_id = auth.uid() and can_read_post(post_id)` on the new row; DELETE uses `user_id = auth.uid()`. The added UPDATE policy is the one deliberate difference from the former likes policies and is justified by the type-switch mutating an existing row. Because SELECT is a post-level gate, a viewer who can read a post sees every reaction row on it, which is what makes the single post-write re-read in `setReaction` yield complete counts.

### Schema re-runnability plus a no-data-loss migration

The canonical schema is the end state — a fresh DB never creates `likes` — and every `create table if not exists` / `drop policy if exists` idiom is preserved, so re-running top to bottom is error-free (confirmed). The one-time migration is appended in a clearly commented `ONE-TIME MIGRATION: likes → reactions` region, not folded into the canonical body. It creates reactions idempotently, enables RLS, drops-and-creates the four policies, backfills with `insert ... select l.post_id, l.user_id, 'like', l.created_at from public.likes on conflict (post_id, user_id) do nothing`, and drops the old policies + table. Both the backfill and the drop sit inside `do $$ ... if to_regclass('public.likes') is not null then ... end $$;` guards, so a re-run after `likes` is gone is a true no-op — the guard is what prevents `drop policy if exists ... on public.likes` from raising "relation does not exist" (confirmed, matching the design's reasoning). `created_at` is preserved and the PK + `on conflict do nothing` guarantee one row per original pair with no duplicates.

### `setReaction` contract and write-outcome checking

The signature and `SetReactionResult` union match the design exactly: `{ ok: true; counts: { like; love; dislike }; mine: ReactionType | null } | { ok: false; error: string }` (confirmed, `actions.ts`). The action runs config guard → `getUser()` (returns, no redirect) → `isUUID(postId)` → `isReactionType(type)`, then reads the viewer's current reaction with `maybeSingle()` and branches: no row → insert; different type → update; same type → delete.

The switch and clear branches use `.select("post_id")` and treat a zero-row result as `{ ok: false, "Not found or not allowed." }` — the correct handling, since a denied UPDATE/DELETE `using` predicate filters to zero rows with no raised error, whereas INSERT relies on the raised `42501`. Post-write state is re-read via `.select("type, user_id").eq("post_id", postId).returns<...>()` with a `readError` check, counts are tallied in JS, and `mine` is set from the viewer's row. Revalidation calls `revalidatePath("/")` unconditionally and `revalidatePath(\`/groups/\${groupId}\`)` after a `maybeSingle()` group lookup, skipping the group revalidation when the lookup returns nothing (confirmed).

`toggleLike` is deleted and no caller references it; `grep` for `from("likes")`, `toggleLike`, and `LikeButton` across `src/` returns zero matches (confirmed independently).

### `ReactionBar` interaction and accessibility

Three native `<button type="button">` elements render glyph + `counts[type]` (confirmed, `ReactionBar.tsx`). `onPick` short-circuits when `disabled || isPending`, captures previous state, computes the optimistic next state (clear / add / switch), applies it, then reconciles against the server's returned `counts`/`mine` on `ok` or reverts on `{ ok: false }`. Exactly-one-active holds because `mine` is a single value and the active button is `mine === type`; clicking the active reaction clears it. `aria-pressed` is set per button, all three are `disabled` while `isPending` or when the `disabled` prop is set, `aria-label` is derived from live `counts` (so it reflects optimistic and reconciled values), and focus uses the existing `focus-visible:ring-accent` idiom. The `labelFor` helper produces explicit singular/plural nouns for all three types.

### Muted color tokens

`globals.css` defines `--reaction-like: #5b6b7f`, `--reaction-love: #a97e86`, `--reaction-dislike: #938a73`, and `--reaction-bg: #eef2fb` in `:root`, each mapped to a `--color-reaction-*` token in `@theme inline` (confirmed). All are desaturated mid-lightness values with no bright/neon red or orange, and `--reaction-bg` deliberately reuses the faint-blue side-column family. `ReactionBar` references only these tokens plus existing `text-text-*` classes — no raw palette classes.

### Both surfaces wired, comment link, removed controls

The group detail page swaps the likes query for the typed reactions query in both branches of the `postIds.length` guard, builds a `reactionsByPost` map (counts by type, `mine` set when `user && row.user_id === user.id`), and renders an active `<ReactionBar>` per post; comments, `CommentForm`, `PostBody`, media, and the existing teal/gray classes are untouched (confirmed). `PostCard` renders `<ReactionBar ... disabled={!post.isReal} />`, a comment control that is a `Link href={/groups/${post.groupId}}` for real posts and an inert disabled `<button>` for placeholders, and has no repost or bookmark buttons — they are removed, not faked (confirmed). The signed-out-viewer optimistic-revert behavior noted in the summary follows from `ReactionBar` being driven only by `disabled={!post.isReal}` with no auth flag, which is the explicitly chosen design.

### Feed shaping, sample inertness, and ranking

`SamplePost` gains `isReal`, `groupId`, `reactions`, and `myReaction` while retaining `likes`/`reposts` for type stability; the three static sample posts set `isReal: false`, `groupId: null`, `reactions: { like: <old likes>, love: 0, dislike: 0 }`, `myReaction: null`, so `PostCard` renders them inert without crashing (confirmed). `fetchFeedPosts` keeps its `(supabase, limit?)` signature, adds a single `getUser()`, replaces the likes query with a typed reactions query, builds `reactionCounts` and `myReaction` maps, and populates the new fields behind a retained `satisfies SamplePost` assertion. `rankByEngagement` scores `p.reactions.like + p.reactions.love + p.comments` and does not mutate its input; `page.tsx` applies it only on the real-feed path (`allPosts.length > 0`) and keeps the sample-fallback branch as latest-only with `trendingPosts={[]}`, so the Trending/Latest split and the no-Supabase home layout are unchanged. The 15:70:15 grid and faint-blue columns in `page.tsx`/`globals.css` are untouched, and `PostBody`/`linkify` still render http(s) URLs as clickable links while the group-page comment form still renders for members.

### Verification evidence

The coder recorded `npm run build` (clean, no TS/lint errors), `npm run lint` (0 errors, 2 pre-existing `<img>` warnings outside this change), and `npm run test` (54 passing, including new `isReactionType` and `rankByEngagement` cases). The evidence is specific and consistent with the diff; no re-run was warranted and none was performed.

</details>

<details>
<summary>File map</summary>

- `supabase/schema.sql` — `reactions` table + four RLS policies replace `likes`; appended guarded one-time migration.
- `src/types/db.ts` — `ReactionType` union + `Reaction` interface replace `Like`.
- `src/lib/validation.ts` — `REACTION_TYPES` + `isReactionType` guard (imports the canonical union).
- `src/app/groups/actions.ts` — `setReaction` added, `toggleLike` removed.
- `src/components/ReactionBar.tsx` — new three-button optimistic client component.
- `src/components/LikeButton.tsx` — deleted.
- `src/app/globals.css` — four muted reaction color tokens.
- `src/lib/sampleFeed.ts` — `SamplePost` extended; samples set inert defaults.
- `src/lib/feed.ts` — reactions query, maps, extended shaping, updated `rankByEngagement`.
- `src/app/groups/[id]/page.tsx` — reactions query/map + `ReactionBar` wiring.
- `src/components/dashboard/PostCard.tsx` — `ReactionBar` + comment `Link`; repost/bookmark removed.
- `tests/validation.test.ts`, `tests/feed.test.ts` — guard + ranking tests.

Full diff: `git diff 3e2be09 1dbd0a7` (commit `1dbd0a7`).

</details>
