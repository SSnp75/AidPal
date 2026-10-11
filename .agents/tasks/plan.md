# Implementation Plan — Group Detail Page Redesign (aidPAL)

## Context & decisions (grounded in the worktree)

- **Stack:** Next.js 16.3.8 (App Router), React 19, Tailwind v4 (`@import "tailwindcss"` + `@theme inline` tokens in `src/app/globals.css`). The page `src/app/groups/[id]/page.tsx` is an **async server component**; all interactivity lives in `"use client"` children. Verified against `node_modules/next/dist/docs/01-app/01-getting-started/{05-server-and-client-components,11-css,12-images}.md` — nothing here changes rendering model, so the re-theme is pure markup/className work.
- **Theme tokens already exist** in `globals.css` and are consumed everywhere else (home page, `CenterFeed`, `MyEventsPanel`, `RelatedGroups`, `ReactionBar`, `BookmarkButton`, `ShareButton`): `bg-primary`, `bg-card`, `bg-secondary`, `border-border`, `text-text-primary`, `text-text-secondary`, `text-accent`/`bg-accent`, `hover:bg-accent-light`, `bg-side-card`/`border-side-border`, reaction tokens, `text-success`. Error text convention already in the codebase is `text-reaction-love` (muted dusty-rose — see `RelatedGroups.tsx`); we adopt it for all error text we touch to kill bright `text-red-400` without introducing a new color.
- **Dark utilities to remove are confined to exactly 5 files** (confirmed by grep): `src/app/groups/[id]/page.tsx`, `src/components/MediaUploadForm.tsx`, `src/components/CommentForm.tsx`, `src/app/groups/[id]/OpenGroupChatButton.tsx`, `src/components/JoinButton.tsx`. Other dark-themed files (login/register/profile/`groups/page.tsx`) are **out of scope** — do not touch.
- **Shared-component blast radius checked:** `MediaUploadForm`, `CommentForm`, `JoinButton`, `OpenGroupChatButton` are imported/rendered **only** by `src/app/groups/[id]/page.tsx` (grep-verified). Re-theming them cannot affect the home feed or any other page.
- **Composer reference:** `src/components/dashboard/CenterFeed.tsx` is the light-theme composer to mirror — `bg-secondary` textarea with `focus:ring-accent`, `rounded-full bg-secondary` tool chips, `rounded-full bg-accent text-white` Post button. Match that visual language (the group composer is a real `<form>`, so keep it functional, not `readOnly`/`disabled` like the sample one).
- **Baseline is green:** `npm run test` → 102 passed (7 files). No test inspects group-page markup, so re-theming will not break tests; the risk surface is `npm run build` (type/lint) only.

### Hard "DO NOT TOUCH" list (applies to every item below)
- No changes to Supabase queries, `.rpc("is_group_member")`, server actions (`createPost`, `addComment`, `setReaction`, `toggleBookmark`, `joinGroup`, `addRelatedGroup`, `removeRelatedGroup`, `setRelationsOpen`, `getOrCreateGroupConversation`), RLS, schema, or the data fetched/shaped in `page.tsx` (lines ~1–236: all the `supabase.from(...)`, `Promise.all`, Map-building logic). **Only JSX returned from `page.tsx` (the `return (...)` block, ~line 237 onward) and classNames/markup in the 4 components change.**
- Do NOT change image sizing semantics. The post `<img>` keeps `w-full max-h-[42rem] rounded-lg object-contain` (proportion-preserving, no stretch). Keep raw `<img>` + `publicUrl(...)` — do NOT convert to `next/image`.
- Do NOT change reaction/comment/bookmark/share/related-groups/owner-toggle **behavior** — only classNames in those already-light components stay as-is (they need no changes). `ReactionBar`, `BookmarkButton`, `ShareButton`, `MyEventsPanel`, `RelatedGroups` are **already light-themed — leave them unchanged**.
- Do NOT change `src/app/page.tsx`, its 15/70/15 grid, `CenterFeed`, or `globals.css`.
- Do NOT touch deploy config: `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, `public/_headers`.
- Do NOT run `npm run dev` (dev server already on :3000). Do NOT delete the `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md`; commit it with the work.
- Preserve the `SupabaseNotConfigured` early-return path, the auth/membership gating (member → composer, non-member public → Join, non-member private → message, signed-out → sign-in prompt), and the private-group messaging.

---

## Token replacement cheat-sheet (apply consistently)

| Dark utility (remove) | Light token (use) |
| --- | --- |
| `text-teal-400` / `text-teal-300` (headings/links) | `text-text-primary` (headings) / `text-accent` (links/accents) |
| `bg-gray-900` / `bg-gray-900/50` (surfaces) | `bg-card` (cards) or `bg-secondary` (inputs) |
| `bg-gray-800` (chips/badges) | `bg-secondary` (chips) |
| `border-gray-800` / `border-gray-700` | `border-border` |
| `text-gray-200` | `text-text-primary` |
| `text-gray-300` / `text-gray-400` / `text-gray-500` | `text-text-secondary` |
| `bg-teal-600` / `hover:bg-teal-500` (buttons) | `bg-accent` / `hover:bg-accent-light` |
| `file:bg-gray-700` / `hover:file:bg-gray-600` / `file:text-white` | `file:bg-secondary` / `hover:file:bg-accent-light hover:file:text-white` / `file:text-text-primary` |
| `focus-visible:ring-teal-500` | `focus-visible:ring-accent` |
| `hover:bg-gray-800` (ghost button) | `hover:bg-side-card` |
| `text-white` on accent buttons | keep `text-white` (correct contrast on `bg-accent`) |
| `text-red-400` (error text) | `text-reaction-love` |

---

## Ordered items

- [ ] 1. Re-theme the composer `MediaUploadForm.tsx` to the light theme, mirroring `CenterFeed`'s composer styling, and give it comfortable padding + an inviting look. Keep the `<form action={formAction}>`, `useActionState`, `createPost` call, `handleFileChange` validation, hidden `groupId` input, `name="body"`/`name="image"`, `maxLength`, `accept`, and all `id`/`htmlFor`/`sr-only` label wiring exactly as-is.
      - Form wrapper: `rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3` → `rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3`.
      - Heading `<h2>`: `text-gray-300` → `text-text-primary` (keep `text-sm font-semibold`; this is the "New Post" label).
      - Error `<p>`: `text-red-400` → `text-reaction-love` (keep `role="alert"`).
      - Textarea: `border-gray-700 bg-gray-900 text-white focus-visible:ring-teal-500` → `border-border bg-secondary text-text-primary placeholder:text-text-secondary/60 focus-visible:ring-accent`; bump `rows={2}` → `rows={3}` and keep `w-full rounded ... px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2` (change `rounded` → `rounded-xl` for consistency with the home composer).
      - Image label: `text-gray-400` → `text-text-secondary`.
      - File input: swap `file:bg-gray-700 file:text-white hover:file:bg-gray-600` → `file:bg-secondary file:text-text-primary hover:file:bg-accent-light hover:file:text-white`; wrapper text `text-gray-400` → `text-text-secondary`; keep `file:rounded file:border-0 file:px-3 file:py-1.5 file:text-sm` (round file button to `file:rounded-full` to match chip style).
      - Submit button: `bg-teal-600 hover:bg-teal-500 text-white` → `bg-accent hover:bg-accent-light text-white`; keep `disabled:opacity-50 transition-colors`, keep `rounded` (change to `rounded-full px-5` to match home Post button), keep `{pending ? "Posting…" : "Post"}` and `disabled={pending}`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card` for a visible focus ring.
      Files: `src/components/MediaUploadForm.tsx`
      Verify: `npm run build` compiles with no type/lint errors; grep this file for `teal|gray-|red-400` returns nothing. (Behavior unchanged: `createPost`, `useActionState`, `formRef.reset()` untouched.)

- [ ] 2. Re-theme the comment input `CommentForm.tsx` for readable light-theme typography and a clean input, preserving all behavior. Keep `<form action={formAction}>`, `addComment` call, hidden `postId`, `name="body"`, `required`, `maxLength={1000}`, `aria-describedby`, the `id={`comment-${postId}`}` + `sr-only` label, and the error `<p id={`comment-err-${postId}`}>` wiring.
      - Text input: `border-gray-700 bg-gray-900 text-white focus-visible:ring-teal-500` → `border-border bg-secondary text-text-primary placeholder:text-text-secondary/60 focus-visible:ring-accent` (keep `flex-1 rounded px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2`; change `rounded` → `rounded-full`).
      - Submit button: `bg-teal-600 hover:bg-teal-500 text-white` → `bg-accent hover:bg-accent-light text-white` (keep `rounded px-3 py-1.5 text-sm disabled:opacity-50 transition-colors`; change `rounded` → `rounded-full`; add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`). Keep `{pending ? "…" : "Post"}`.
      - Error `<p>`: `text-red-400` → `text-reaction-love`.
      Files: `src/components/CommentForm.tsx`
      Verify: `npm run build` clean; grep file for `teal|gray-|red-400` → none. (`addComment` + reset behavior untouched.)

- [ ] 3. Re-theme `JoinButton.tsx` (used only on the group page's non-member public path) to light tokens, preserving join behavior. Keep `useTransition`, `joinGroup({ groupId })`, the `joined` state branch, and `disabled={isPending}`.
      - "You've joined" `<p>`: `text-teal-300` → `text-success` (muted green, signals success without neon).
      - Button: `bg-teal-600 hover:bg-teal-500 text-white` → `bg-accent hover:bg-accent-light text-white` (keep `rounded px-4 py-2 text-sm disabled:opacity-50 transition-colors`; change `rounded` → `rounded-full`; add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`). Keep `{isPending ? "Joining…" : "Join Group"}`.
      - Error `<p>`: `text-red-400` → `text-reaction-love` (keep `role="alert"`).
      Files: `src/components/JoinButton.tsx`
      Verify: `npm run build` clean; grep file for `teal|red-400` → none. (`joinGroup` call untouched.)

- [ ] 4. Re-theme `OpenGroupChatButton.tsx` to a light muted "ghost/outline" button matching the sidebar "Create a Group" link, preserving navigation behavior. Keep `useTransition`, `getOrCreateGroupConversation({ groupId })`, `router.push`, the `isPending`/`error` state, and all aria attributes.
      - `btnClass`: `border-gray-700 text-gray-200 hover:bg-gray-800` → `border-border text-text-primary hover:bg-side-card`. Keep the rest (`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-default disabled:opacity-60`). Change `rounded-xl` → `rounded-xl` (unchanged). Drop `mt-2` since the sidebar now controls spacing via `space-y` (set in item 6) — remove `mt-2` from `btnClass`.
      - Error `<p>`: `text-gray-400` → `text-text-secondary`.
      Files: `src/app/groups/[id]/OpenGroupChatButton.tsx`
      Verify: `npm run build` clean; grep file for `gray-` → none. (Chat-conversation action untouched.)

- [ ] 5. Rebuild the group **header** as one well-spaced card and re-theme the join/post control fallbacks, editing ONLY the JSX in `page.tsx` (the `<header>…</header>` block ~lines 238–286 and the join/post control `<p>` fallbacks ~lines 290–297). Do NOT touch any code above the `return (` statement.
      - Wrap the header content in a card: change `<header>` → `<header className="rounded-2xl border border-border bg-card p-5 sm:p-6">`.
      - Group name `<h1>`: `text-2xl font-bold text-teal-400` → `text-2xl sm:text-3xl font-bold text-text-primary` (largest element, clear hierarchy).
      - "Private" badge `<span>`: `bg-gray-800 text-gray-400` → `bg-secondary text-text-secondary` (keep `inline-block mt-1 rounded px-2 py-0.5 text-xs`; change `rounded` → `rounded-full`). Keep it gated on `group.is_private`.
      - Description `<p>`: `text-gray-300` → `text-text-secondary` (keep `mt-2`; add `leading-relaxed` for readability).
      - Metadata row `<div>`: `text-gray-400` → `text-text-secondary` (keep `mt-3 flex flex-wrap items-center gap-2 text-xs`).
        - Category chip `<span>`: `bg-gray-800` → `bg-secondary text-text-primary` (keep `rounded-full px-2 py-0.5`).
        - Scope chip `<span>`: `bg-gray-800` → `bg-secondary text-text-primary` (keep `rounded-full px-2 py-0.5 capitalize`).
        - Keep the country/city `<span>` and the `🌍 Global` fallback exactly (text only, no dark class).
      - Tags block `<div>`/`<span>`: tag chip `bg-gray-800 text-teal-300` → `bg-secondary text-accent` (keep `rounded-full px-2 py-0.5 text-xs` and the `#{t.tag}` content, keep the `groupTags && groupTags.length > 0` guard and `key={t.tag}`).
      - Join/post fallback `<p>`s (private-group message and "Sign in to join" message): `text-gray-400` → `text-text-secondary` (keep `text-sm`). Keep the exact gating structure (`user ? isMember ? <MediaUploadForm/> : !is_private ? <JoinButton/> : <p/> : <p/>`) unchanged.
      Files: `src/app/groups/[id]/page.tsx`
      Verify: `npm run build` clean; grep the `<header>`…join-control region for `teal|gray-` → none. Confirm the gating ternary and all `<MediaUploadForm/>`/`<JoinButton/>` placements are byte-identical except classNames on the fallback `<p>`s.

- [ ] 6. Tidy the overall page layout, posts-section spacing, and sidebar rhythm in `page.tsx` JSX (outer `<div>`, `<main>`, `Posts` `<section>`, and `<aside>`). Markup/className only; do NOT alter the posts `.map`, the per-post `<img>` classes, `<ReactionBar>`/`<BookmarkButton>`/`<ShareButton>`/`<CommentForm>` placements, or the comment-rendering `<ul>`/`<li>` logic.
      - Outer container: keep `mx-auto w-full max-w-6xl px-4 py-8`. Keep the responsive grid `grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]` (sidebar already collapses below main under `lg`). Confirm nothing overflows: `<main className="min-w-0 space-y-6">` stays (the `min-w-0` prevents flex/grid overflow — keep it).
      - For a readable measure, constrain the main column content width: add `max-w-2xl` is **too narrow** for image posts; instead leave `<main>` full-width within its grid track (the `20rem` sidebar + `1fr` already yields a comfortable measure at `max-w-6xl`). No change needed to measure — document this decision; do not add a width that would shrink images.
      - Posts section heading `<h2>` ("Posts") and empty-state `<p>` are already `text-text-primary`/`text-text-secondary` — leave unchanged. Keep `<ul className="space-y-3">`.
      - Post card `<li>`: already `overflow-hidden rounded-xl border border-border bg-card p-2` — bump padding for comfort: `p-2` → `p-3 sm:p-4`. Keep `overflow-hidden rounded-xl border border-border bg-card`.
      - Author line `<p>`: already `text-[10px] text-text-secondary mb-1` — leave (optionally bump to `text-xs` for legibility; keep token classes).
      - Post body `PostBody`: keep `text-[15px] text-text-primary whitespace-pre-wrap leading-snug mb-1.5` unchanged.
      - Post `<img>`: **leave `mb-1.5 w-full max-h-[42rem] rounded-lg object-contain` byte-for-byte** (image sizing is frozen).
      - Action bar `<div>` (`border-t border-border pt-1`) and comments block (`mt-1.5 border-t border-border pt-1.5`): already light — keep; optionally widen gaps to `pt-2`/`mt-2` for rhythm (token/spacing only, no behavior).
      - Comment `<li>` typography is `text-[15px] leading-snug` with `text-text-secondary`(author)/`text-text-primary`(body) — already readable; leave unchanged.
      - Sidebar `<aside>`: keep `space-y-4 lg:sticky lg:top-8 lg:self-start`. The "Create a Group" link, "Create Event" link, `<RelatedGroups>`, `<OpenGroupChatButton>`, `<MyEventsPanel>` are already light-themed; keep their order and props. The `space-y-4` gives consistent card rhythm. Because item 4 removed `mt-2` from the chat button, the `space-y-4` now owns its spacing — confirm it sits flush with other cards.
      Files: `src/app/groups/[id]/page.tsx`
      Verify: `npm run build` clean. Manually confirm (read the diff) that: the posts `.map` body, the `<img>` className, and the `<ReactionBar initialCounts/initialMine>`, `<BookmarkButton initialBookmarked>`, `<ShareButton groupId>`, `<CommentForm postId>` props/placements are unchanged; only wrapper spacing/token classes differ.

- [ ] 7. Full-file dark-utility sweep of the 5 touched files to guarantee none remain.
      Files: `src/app/groups/[id]/page.tsx`, `src/components/MediaUploadForm.tsx`, `src/components/CommentForm.tsx`, `src/app/groups/[id]/OpenGroupChatButton.tsx`, `src/components/JoinButton.tsx`
      Verify: from the worktree root, grep each touched file for `text-teal|text-teal-\d|bg-teal|border-gray-|bg-gray-|text-gray-|focus-visible:ring-teal|text-red-|file:bg-gray` — expect **zero** matches in all 5 files. (The out-of-scope files login/register/profile/`groups/page.tsx` will still match — that is expected and correct; they are not part of this task.)

- [ ] 8. Final verification: build + test green and no regressions to protected code paths.
      Files: (none — verification only)
      Verify, run from `c:\Projects\AidPal\.worktrees\group-redesign`:
      1. `npm run test` → still **102 passed (7 files)**, no new failures.
      2. `npm run build` → completes successfully (no type errors, no ESLint errors). Do NOT run `npm run dev`.
      3. `git diff --stat` touches only the 5 files above (plus possibly `AGENTS.md`'s auto-added rules block — leave it, do not revert). Confirm NO changes to: `src/app/page.tsx`, `src/components/dashboard/*`, `src/app/globals.css`, `src/components/{ReactionBar,BookmarkButton,ShareButton,MyEventsPanel}.tsx`, `src/app/groups/[id]/RelatedGroups.tsx`, `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, `public/_headers`, `supabase/*`, `src/app/groups/actions.ts`.
      4. Manual-confirmation checklist (read the final diff, confirm each is UNCHANGED): (a) all `supabase.from(...)` queries and the `.rpc` call in `page.tsx`; (b) every server action import/call (`createPost`, `addComment`, `setReaction`, `toggleBookmark`, `joinGroup`, `addRelatedGroup`, `removeRelatedGroup`, `setRelationsOpen`, `getOrCreateGroupConversation`); (c) the post `<img>` sizing classes `w-full max-h-[42rem] object-contain`; (d) reaction/bookmark/share/related-groups/owner-toggle component props and placements; (e) the auth/membership gating ternary and `SupabaseNotConfigured` early return.

---

## Notes / assumptions
- Error-text color: the task's token list doesn't name an error token, so we reuse the codebase's existing `text-reaction-love` (used for errors in `RelatedGroups.tsx`) rather than inventing one or keeping bright `text-red-400`. This satisfies "no bright/neon" while staying consistent.
- Success text in `JoinButton` uses `text-success` (`#5b9a8b`, a muted green already in the palette) — appropriate for a positive confirmation and still muted.
- Readable measure: we deliberately keep `max-w-6xl` with the `1fr / 20rem` grid rather than clamping the main column narrower, because the posts contain full-width images whose proportion logic must not be disturbed; shrinking the column would effectively shrink images. Vertical rhythm is improved via `space-y-6` (main), `space-y-3` (posts), and `space-y-4` (sidebar), which are already present.
- `rounded` → `rounded-full`/`rounded-xl` upgrades are cosmetic consistency with the home composer and sidebar; they carry no behavior and are safe.
