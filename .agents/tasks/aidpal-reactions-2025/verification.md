# Verification — Post Reactions

Iteration: FIRST (no `review.json` present at start; only `design-review.json`).
Environment: Windows / PowerShell, project root `c:\Projects\AidPal`.
`npm run dev` was NOT started (it is already running and blocking, per NFR-4).

## Commands run and results

### `npm run test` (vitest)
```
Test Files  3 passed (3)
     Tests  54 passed (54)
```
- `tests/validation.test.ts` — 43 tests pass, including the new `isReactionType`
  block (accepts like/love/dislike; rejects "repost", "", null, numbers, objects).
- `tests/feed.test.ts` — 3 tests pass: `rankByEngagement` orders by
  `like + love + comments`; two posts differing only in dislike count rank
  equal/stable (dislikes ignored, A5); input array is not mutated.
- `tests/avatar.test.ts` — 8 tests pass (unchanged).

### `npm run lint` (eslint)
```
2 problems (0 errors, 2 warnings)
```
- Both warnings are pre-existing `@next/next/no-img-element` `<img>` warnings in
  `src/app/groups/[id]/page.tsx` (the group media `<img>`, untouched by this change)
  and `src/app/profile/page.tsx` (out of scope). NO errors.

### `npm run build` (next build, Next 16.3.8, Turbopack)
```
✓ Compiled successfully in 7.2s
  Finished TypeScript in 12.8s
✓ Generating static pages (12/12)
```
- No TypeScript errors, no lint errors (AC-7, NFR-4). Build succeeds end to end.

## Graceful degradation (NFR-3, AC-13)
- `setReaction` returns `{ ok: false, error: "Supabase is not configured. See README.md." }`
  when `isSupabaseConfigured()` is false (first guard, no throw).
- Home page falls back to static `samplePosts` when Supabase is unconfigured/empty;
  those are `isReal: false` → `ReactionBar` renders with `disabled` (inert, no
  `setReaction` call) and the comment control renders as a disabled `<button>`
  (no navigation). The group detail page renders `<SupabaseNotConfigured />` when
  unconfigured (unchanged). The build's static generation of `/` confirms it does
  not crash without live data.

## Reference-cleanup check
- `grep` for `toggleLike`, `LikeButton`, and `from("likes")` across the live
  `src/` tree returns no matches (remaining hits are only in `.kiro/sessions`
  history snapshots, not the working source). `LikeButton.tsx` was deleted.

## Scope / guardrails
- No changes to auth, registration, profiles CRUD, media upload, or Supabase
  client/config. The 15:70:15 layout and faint-blue side columns were not touched.
- Reaction colors are muted CSS variables in `globals.css`
  (`--reaction-like/-love/-dislike/-bg`); no bright/neon/saturated palette classes
  in the reaction UI.
