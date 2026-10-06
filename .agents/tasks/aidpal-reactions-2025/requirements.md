# Post Reactions — Requirements

## Summary

Replace the single `like` on AidPal posts with three mutually-exclusive reactions — **Like (👍)**, **Love (❤️)**, and **Dislike (👎)** — and make the engagement buttons on the home feed and group detail page actually work. A user may hold at most one reaction per post; picking a different one switches it; clicking the active one clears it. This spans the Supabase schema and RLS, server actions, a new client reaction component, the home feed data layer and card, and the group detail page. `npm run build` must stay green.

Non-reaction features (auth, registration, profiles CRUD, media upload, Supabase client/config, the 15:70:15 home layout, faint-blue side columns, PostBody link rendering, comment functionality, donations) are out of scope and must keep working unchanged.

### Assumptions
- A1. The reaction model is one-row-per-(post, user) with a `type` enum column, not three separate boolean columns or three tables. This matches the existing `likes` composite-PK pattern and makes "exactly one active" a primary-key invariant.
- A2. The existing `likes` table is migrated into `reactions` as `type = 'like'` and then dropped, giving a single source of truth. All current `likes` readers/writers (`feed.ts`, `groups/[id]/page.tsx`, `toggleLike`) are updated to use `reactions`.
- A3. Reaction counts are per-type aggregate counts (`{ like, love, dislike }`); the viewer's own reaction is a single value `'like' | 'love' | 'dislike' | null`.
- A4. Reactions are available anywhere a post is shown with a real DB `id`. Static `samplePosts` (fallback with ids `"1"`, `"2"`, `"3"`) have no real post and must render inert, non-crashing buttons.
- A5. "Trending" ranking uses positive engagement only; dislikes are ignored (not subtracted) to keep the score monotonic and avoid negative/zeroed trending. Documented in FR-14.
- A6. Emoji glyphs (👍 ❤️ 👎) are used for the reaction icons, consistent with the existing emoji-in-UI convention (📷 🎬 😊 🔁 🔖).

## Functional Requirements

### Data model (schema.sql + incremental migration)
- FR-1. Add a `public.reactions` table: `post_id uuid` (FK → posts, on delete cascade), `user_id uuid` (FK → profiles, on delete cascade), `type text` constrained to exactly one of `'like' | 'love' | 'dislike'`, `created_at timestamptz default now()`, with primary key `(post_id, user_id)` so a user holds at most one reaction per post.
- FR-2. Enable RLS on `reactions` and add policies that mirror the existing `likes` policies, using the existing `public.can_read_post(post_id)` SECURITY DEFINER helper (no direct `posts` subselect):
  - SELECT to `anon, authenticated` using `can_read_post(post_id)`.
  - INSERT to `authenticated` with check `user_id = auth.uid() AND can_read_post(post_id)`.
  - UPDATE to `authenticated` using `user_id = auth.uid()` with check `user_id = auth.uid() AND can_read_post(post_id)` (needed because switching reaction type updates the existing row).
  - DELETE to `authenticated` using `user_id = auth.uid()`.
- FR-3. `schema.sql` stays fully idempotent / re-runnable: `create table if not exists`, `drop policy if exists` before each `create policy`, and the `likes` → `reactions` data copy guarded so re-runs do not duplicate or error. The canonical schema reflects the end state (reactions present; `likes` removed).
- FR-4. Provide a separate, clearly-commented incremental migration SQL block (for the Supabase SQL editor) that upgrades an existing live DB without data loss: create `reactions` + RLS, copy every `likes` row into `reactions` as `type = 'like'` (conflict-safe), then drop the `likes` table and its policies. The block must be safe to run once on a populated database.

### Server actions
- FR-5. Add `setReaction({ postId, type })` where `type` is `'like' | 'love' | 'dislike'`. It requires an authenticated user, validates `postId` as a UUID and `type` against the allowed set, and relies on RLS to enforce visibility/ownership. Behavior:
  - No existing reaction → insert the given type.
  - Existing reaction of a different type → update the row to the new type.
  - Existing reaction of the same type → delete the row (toggle off).
- FR-6. `setReaction` returns `{ ok: true, counts: { like: number, love: number, dislike: number }, mine: 'like' | 'love' | 'dislike' | null }` on success and `{ ok: false, error: string }` on failure (not configured, not signed in, invalid input, DB error). Counts and `mine` reflect the post's state after the write.
- FR-7. Preserve `toggleLike` so nothing breaks, OR remove it and update every caller. Chosen approach (documented for the design step): keep `LikeButton`/`toggleLike` callers working by migrating them to the reactions model — `toggleLike` is re-pointed at the `reactions` table (type `'like'`) or replaced by `ReactionBar` + `setReaction` at every call site. No caller may reference the dropped `likes` table after this change.
- FR-8. Reaction server actions live in `src/app/groups/actions.ts` or a new `src/app/reactions/actions.ts` and follow the existing action conventions: `"use server"`, `isSupabaseConfigured()` guard first, `createClient()` from `@/lib/supabase/server`, `auth.getUser()` auth check, `isUUID()` validation, `console.error("[setReaction] …")` on failure, and the `revalidatePath` pattern where a server-rendered path must refresh.

### Reaction UI
- FR-9. Add a client component `src/components/ReactionBar.tsx` (adapted from `LikeButton.tsx`) rendering three buttons: 👍 Like, ❤️ Love, 👎 Dislike, each with its live count. Props carry `postId`, initial per-type counts, and the viewer's initial reaction.
- FR-10. Interactions are optimistic: on click, update the active state and the affected counts immediately, call `setReaction`, then reconcile with the returned `counts`/`mine`; on `{ ok: false }` revert to the prior state. Exactly one button is active at a time; clicking the active button clears it; switching moves the active state and adjusts both counts.
- FR-11. Accessibility: the active button has `aria-pressed="true"` (others `false`), every button has a descriptive `aria-label` including its count, buttons are keyboard operable (native `<button>`), and all three are `disabled` while a transition is pending.
- FR-12. Styling uses muted, eye-friendly tones on white cards — no bright/neon red, orange, or saturated colors. New reaction color tokens are added to `globals.css` as CSS variables (muted rose / dusty-pink for Love, soft slate / blue-grey for Like, muted amber / taupe for Dislike) and referenced via the Tailwind v4 `@theme inline` token mapping, consistent with the existing token system.

### Wiring — group detail page
- FR-13. In `src/app/groups/[id]/page.tsx`, replace `LikeButton` with `ReactionBar`. Fetch per-type reaction counts and the viewer's own reaction for the listed posts (reading `reactions` instead of `likes`), and pass them to `ReactionBar`. The comment list and `CommentForm` must keep working unchanged.

### Wiring — home feed
- FR-14. Extend `SamplePost` (in `src/lib/sampleFeed.ts`) so a feed item can carry reaction state: per-type counts (`like`, `love`, `dislike`), the viewer's current reaction (`'like' | 'love' | 'dislike' | null`), the owning `groupId`, and a flag/typing that distinguishes a real DB post from a static placeholder. The static `samplePosts` remain valid under the extended type (no real id, no active reactions).
- FR-15. `fetchFeedPosts` (in `src/lib/feed.ts`) reads `reactions` (not `likes`), returning per-post per-type counts and the current viewer's reaction, plus the real `groupId`, for each post it returns.
- FR-16. `rankByEngagement` ranks by total positive engagement = `like + love + comments`; dislikes are ignored (per A5). The Trending vs Latest split in `src/app/page.tsx` keeps working with the new scoring.
- FR-17. In `src/components/dashboard/PostCard.tsx`, make reactions active by rendering `ReactionBar` for real posts; the previously disabled like/comment/repost/bookmark row is replaced accordingly.
- FR-18. The feed Comment button becomes an active link to `/groups/{groupId}` for real posts.
- FR-19. Repost and Bookmark (no backend) are removed from the feed card rather than faked.
- FR-20. Placeholder/sample posts (no real id) render inert reaction and comment controls that do not crash and are not clickable as live actions. Real posts render fully active controls.

## Non-Functional Requirements

- NFR-1. Muted theme: all reaction colors are desaturated and readable on white/light cards; no bright, neon, or highly-saturated red/orange. Colors come from CSS variables in `globals.css`, not hard-coded Tailwind palette classes like `bg-teal-600` in the reaction UI.
- NFR-2. Accessibility: correct `aria-pressed`, descriptive `aria-label`s with counts, full keyboard operability, visible focus states consistent with existing `focus-visible:ring-accent`, and `disabled` state during pending transitions.
- NFR-3. Graceful degradation: when Supabase env is absent, the home page and group pages must not crash. Server actions return `{ ok: false, error }` when `isSupabaseConfigured()` is false; feed/group reads already fall back to sample/empty data and must continue to.
- NFR-4. Build-green: `npm run build` passes with no TypeScript or lint errors. `npm run dev` is already running and must NOT be started.
- NFR-5. Security: all writes require auth and are gated by RLS via `can_read_post`; `postId` and `type` are validated server-side; no new direct-subselect RLS that bypasses the SECURITY-DEFINER-helper rule.
- NFR-6. Scope containment: no changes to auth, registration, profiles CRUD, media upload, Supabase client/config, the 15:70:15 layout, the faint-blue side columns, PostBody link rendering, or comment functionality beyond what reactions require.
- NFR-7. Data integrity: migration preserves all existing `likes` as `type = 'like'` reactions with no loss and no duplication, and leaves exactly one reaction row per (post, user).

## Acceptance Criteria

1. `public.reactions` exists with PK `(post_id, user_id)`, a `type` check constraint allowing only `'like' | 'love' | 'dislike'`, and FKs to `posts` and `profiles` with `on delete cascade`.
2. RLS is enabled on `reactions`; SELECT is allowed to anon+authenticated via `can_read_post(post_id)`; INSERT/UPDATE/DELETE are restricted to `user_id = auth.uid()` with `can_read_post(post_id)` on INSERT/UPDATE; no policy uses a direct `posts` subselect.
3. Re-running `schema.sql` top-to-bottom on an already-migrated database produces no errors and no duplicate rows or policies.
4. The incremental migration block, run once against a live DB that has `likes` data, creates `reactions`, copies every `likes` row as `type = 'like'`, drops `likes`, and loses no data.
5. `setReaction({ postId, type })` returns `{ ok: true, counts: { like, love, dislike }, mine }` reflecting post-write state; it inserts when none exists, updates when switching type, and deletes when the same type is re-selected.
6. `setReaction` returns `{ ok: false, error }` (no throw) when Supabase is not configured, the user is not signed in, `postId` is not a UUID, or `type` is not an allowed value.
7. No source file references the `likes` table after the change; all former `likes` reads/writes use `reactions`, and `npm run build` passes with no type or lint errors.
8. `ReactionBar` shows three buttons (👍 Like / ❤️ Love / 👎 Dislike) with counts; the active one has `aria-pressed="true"`, all have count-bearing `aria-label`s, all are keyboard operable, and all are disabled while a transition is pending.
9. A signed-in user on a group post can pick Like, Love, or Dislike; the count updates optimistically; switching to another type moves the active state and adjusts both counts; clicking the active type clears it; a failed server call reverts the UI.
10. A signed-in user gets the same working behavior on a real home-feed post.
11. The feed Comment button on a real post is a link to `/groups/{groupId}`; Repost and Bookmark are absent from the feed card.
12. Reaction colors are muted CSS variables defined in `globals.css` (no bright/neon/saturated red or orange, no hard-coded palette classes in the reaction UI).
13. With Supabase env absent, the home page and group detail page render without crashing, and static `samplePosts` render inert (non-crashing, non-live) reaction/comment controls.
14. `rankByEngagement` orders posts by `like + love + comments` (dislikes ignored), and the Trending/Latest split on the home page still renders correctly.
15. The group detail comment list and `CommentForm`, and PostBody link rendering on both pages, continue to work unchanged.

## Out of Scope

- Reposts and bookmarks (no backend) — removed from the feed card, not implemented.
- Reaction notifications, per-user reaction lists ("who reacted"), or reaction history/analytics.
- Changes to auth, registration, profiles CRUD, media upload, or Supabase client/config.
- Changes to the 15:70:15 home layout, side-column colors, composer, trending-tags/suggestions sample data, or donations.
- Realtime live-updating counts across clients (counts refresh on action response and page revalidation only).
- Adding reaction types beyond Like / Love / Dislike.

## Open Questions

- OQ-1. Should the migration drop `likes` immediately (single source of truth, per A2/FR-4) or keep it for one release as a safety net? Default taken: drop it in the same migration.
- OQ-2. Should the `Comment` count on the feed card remain visible next to the new comment link, or just be a labeled link? Default taken: keep the count and make the control a link.
- OQ-3. Should dislikes be purely ignored in ranking (A5) or lightly down-weight a post? Default taken: ignored.
