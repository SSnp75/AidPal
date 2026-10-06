# Design Review — Post Reactions

**Reviewed document:** `design.md` (Post Reactions — Technical Design)
**Requirements:** `requirements.md` (Post Reactions — Requirements)
**Reviewer:** Design Review Sub-Agent
**Round:** 3

---

## Findings

### 1. [NIT] `addComment` pattern claim slightly inaccurate — `revalidatePath("/")` is new

**Where:** setReaction §, step 7 / `revalidatePath` subsection.

The design says *"This mirrors the existing `addComment` pattern."* In reality, `addComment` revalidates only `/groups/${post.group_id}` — it does **not** call `revalidatePath("/")`. The design's `setReaction` adds `revalidatePath("/")` as a new behaviour, which is correct and justified (the home feed now shows reaction counts), but calling it the "`addComment` pattern" is misleading.

**Fix:** Change "This mirrors the existing `addComment` pattern" to "This extends the existing `addComment` pattern (which revalidates only the group page) by also revalidating `/` so the home feed's reaction counts stay fresh."

### 2. [NIT] `PostCard` server-component claim needs caveat about `Link` import

**Where:** Wiring — home feed `PostCard` section, last paragraph.

The design says `PostCard` *"remains a server component wrapping the `ReactionBar` client component and a `Link`; no `"use client"` is needed."* This is correct — `next/link` can be used in server components. But the current `PostCard` does not import `Link`. The design should note that `import Link from "next/link"` is a new addition to the file (minor, but avoids implementer confusion about why it's not there already).

**Fix:** Add a note: "Add `import Link from 'next/link'` to `PostCard.tsx` (new import, not currently present)."

### 3. [NIT] `setReaction` signature uses object param but `toggleLike` used named params

**Where:** Server action contract.

`setReaction` takes `{ postId, type }` as a single object parameter. The existing `toggleLike` takes `{ postId, liked }` the same way, so this is actually consistent. No issue — this NIT is withdrawn on verification.

*Withdrawn — no action needed.*

### 4. [NIT] Group page dark-theme class names will look wrong on the white-themed app

**Where:** Wiring — group detail page section, out-of-scope note.

The group page uses `bg-gray-900/50`, `bg-gray-800`, `text-gray-200`, `text-gray-300`, `text-gray-400`, `text-gray-500`, `border-gray-800` extensively — these are dark-theme colors. The design correctly says these are out of scope for this change (NFR-6). However, `ReactionBar` will use muted CSS-variable-backed tokens (light theme), which will visually clash against the dark card backgrounds on the group page. The active chip `bg-reaction-bg: #eef2fb` on a `bg-gray-900/50` card will look odd.

The design intentionally leaves this as-is (NFR-6), but the visual mismatch should be acknowledged as a known limitation for the group page.

**Fix:** Add a brief note under the group-page wiring: "Known limitation: `ReactionBar`'s light-theme token colors will contrast against the group page's dark card surfaces. Aligning the group page to the white theme is out of scope (NFR-6) but should be tracked as follow-up work."

### 5. [NIT] Comment link `href` destination is the group page, not the specific post

**Where:** Wiring — home feed `PostCard`, Comment control.

The comment button for real posts links to `/groups/${post.groupId}`, which loads the group detail page. This is the same page where comments are displayed. However, if the group has many posts, the user will land at the top of the group page and have to scroll to find the specific post. There's no anchor or post-specific route.

This is acceptable given current scope (no post-detail route exists), and the design matches FR-18 exactly. No change needed, just noting the UX gap for awareness.

**Fix:** None required — matches FR-18. Could note as future improvement.

---

## Verified Assumptions

The following design claims were checked against the actual codebase and confirmed correct:

1. **`can_read_post(pid)` exists as a SECURITY DEFINER helper** — confirmed in `schema.sql` lines 106–114. It calls `can_read_group(p.group_id)`, which checks `is_private` + membership. The design's RLS policies correctly reference this helper rather than inlining a `posts` subselect.

2. **Existing `likes` RLS policies use `can_read_post`** — confirmed: `likes_select` uses `can_read_post(post_id)`, `likes_insert` uses `user_id = auth.uid() and can_read_post(post_id)`, `likes_delete` uses `user_id = auth.uid()`. The design's `reactions` policies correctly mirror these plus an UPDATE policy.

3. **`schema.sql` is re-runnable / idempotent** — confirmed: all `create table` use `IF NOT EXISTS`, all policies use `drop policy if exists` before `create policy`. The design's `reactions` DDL and policies follow the same pattern.

4. **`toggleLike` exists in `src/app/groups/actions.ts`** — confirmed. Its signature is `({ postId, liked }) => Promise<{ ok: true; count: number } | { ok: false; error: string }>`. Only callers: `LikeButton.tsx` (imported in `groups/[id]/page.tsx`). The design's claim that removing `toggleLike` and `LikeButton` has a single-caller-chain blast radius is correct.

5. **`SamplePost` interface** — confirmed in `sampleFeed.ts`. Current fields: `id, authorName, handle, timeAgo, body, hashtags, likes, comments, reposts`. No `isReal`, `groupId`, `reactions`, or `myReaction` — the design correctly identifies these as new additions.

6. **`feed.ts` uses `satisfies SamplePost`** — confirmed at the `return { ... } satisfies SamplePost` in the `posts.map()`. The design correctly instructs retaining this.

7. **`Post` type has `group_id`** — confirmed in `db.ts`. The design correctly uses `p.group_id` in the feed shaping.

8. **`fetchFeedPosts` signature is `(supabase: SupabaseClient, limit?: number)`** — confirmed. The design correctly keeps this signature and adds `getUser()` internally.

9. **`isUUID` exists in `validation.ts`** — confirmed. `isReactionType` does not yet exist (to be added per the design).

10. **`globals.css` uses `:root` variables + `@theme inline` mapping** — confirmed. Existing tokens: `--card-bg: #f5f7fd`, `--side-card: #eef2fb`, `--side-border: #d7e0f2`. The design's new reaction tokens follow the same pattern and the `--reaction-bg: #eef2fb` matching `--side-card` is intentional and documented.

11. **15:70:15 layout** — confirmed in `page.tsx`: `grid-cols-[15%_minmax(0,70%)_15%]`. The design explicitly leaves this untouched (NFR-6).

12. **Faint-blue side columns** — confirmed via `--side-card: #eef2fb`. The design leaves these untouched (NFR-6).

13. **`addComment` does a group-id lookup for `revalidatePath`** — confirmed. It queries `posts` for `group_id` then calls `revalidatePath(\`/groups/${post.group_id}\`)`. The design mirrors this pattern for `setReaction`.

14. **`Like` interface exists in `db.ts`** — confirmed. The design correctly notes it should be replaced by `Reaction` + `ReactionType`.

15. **`PostCard` currently renders disabled engagement buttons** — confirmed. The engagement row has four disabled buttons (❤ like, 💬 comment, 🔁 repost, 🔖 bookmark). The design replaces these with `ReactionBar` + active comment link, removing repost and bookmark.

16. **`CenterFeed` passes `SamplePost[]` through to `PostCard` unchanged** — confirmed. It maps over `latestPosts` and `trendingPosts`, rendering `<PostCard post={post} />`.

17. **`page.tsx` sample-fallback path passes `trendingPosts={[]}` when no real feed** — confirmed. The design correctly notes `rankByEngagement` only runs on the real-feed path.

18. **Reaction colors are muted (no bright/neon)** — confirmed. `--reaction-like: #5b6b7f` (slate), `--reaction-love: #a97e86` (dusty rose), `--reaction-dislike: #938a73` (taupe) are all desaturated mid-tones. NFR-1/FR-12 satisfied.

19. **Migration step 4 `drop policy if exists` on a dropped table would error** — the design correctly wraps step 4 in a `to_regclass` guard. Verified that `IF EXISTS` on a policy only suppresses missing-policy errors, not missing-table errors (Postgres behavior).

20. **UPDATE RLS silent zero-row behavior** — the design correctly identifies that Postgres UPDATE/DELETE with a `USING` clause that filters to zero rows returns no error (just `affected_rows = 0`), and adds `.select("post_id")` + zero-row assertion. This is correct Postgres/Supabase behavior.

## Unverified / Potentially Wrong Assumptions

1. **D5 — Emoji glyph rendering** — the design assumes 👍 ❤️ 👎 render acceptably across target browsers. This cannot be verified from the codebase alone; it depends on the deployment environment and user agents. Given the existing use of emoji in the app (📷 🎬 😊 🔁 🔖 ❤), this is a reasonable assumption. **Risk: LOW.**

2. **D6 — `getUser()` latency** — the design claims adding `getUser()` to `fetchFeedPosts` is cheap because "it is already called elsewhere per request." While this is true for server-side requests (same cookie context), the actual round-trip cost depends on the Supabase client implementation. For the server helper, `getUser()` typically validates the JWT locally without a network call, so the claim is reasonable. **Risk: LOW.**

3. **`.returns<...>()` type narrowing** — the design relies on Supabase client's `.returns<T>()` to type-narrow the query result. This is a documented Supabase JS v2 feature and should work as described. Cannot verify without running the build, but the pattern is standard. **Risk: LOW.**

---

## Summary

The design is thorough, well-structured, and has addressed the concerns from two prior review rounds. All critical paths (schema, RLS, server action, feed pipeline, UI component, migration) are specified with sufficient detail for implementation. The `setReaction` contract is fully specified with all three branches, error handling covers all failure modes including the subtle UPDATE/DELETE zero-row case, the migration is correctly guarded for re-runnability, sample-post/placeholder handling is explicit, reaction colors are muted, and the 15:70:15 layout is explicitly preserved.

The only findings are four NITs — none of which block implementation.

**Verdict: APPROVED** (0 HIGH, 0 MEDIUM, 4 NIT)
