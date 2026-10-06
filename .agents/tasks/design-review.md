# AidPal Thin-Slice Design Review (v3)

**Reviewer:** Design review subagent (fresh read, no prior authoring context)
**Design under review:** `c:\Projects\AidPal\.agents\tasks\design.md` (Design v3)
**Scope source:** `c:\Projects\AidPal\REQUIREMENTS.md` + the locked thin-slice scope in the step brief
**Date:** fresh review

---

## How this review was conducted

I read the full design top to bottom, read `REQUIREMENTS.md`, and inspected the actual
project tree (`c:\Projects\AidPal`). The project is greenfield: only `REQUIREMENTS.md` and the
`.agents/tasks/*` docs exist — there is no `package.json`, no `node_modules`, no `src/`, and no
`supabase/schema.sql` yet. That means every claim about library behavior (`@supabase/ssr`
cookie adapters, `verifyOtp`, `storage.objects.owner`, Next.js cookie-write rules, Postgres
`SECURITY DEFINER` semantics) could **not** be verified against installed source — there is
no installed source. Those claims are assessed against general knowledge of the stack and are
listed in the Unverified Assumptions section with that caveat stated explicitly, as the brief
requires. The design-internal consistency checks (policy predicates vs. the stated rules,
schema vs. validation vs. action tables) were fully verifiable from the document itself.

The design is unusually complete and well-structured for a thin slice. Most of the findings
below are precision/consistency issues rather than architectural problems. However, two of
them (Findings 1 and 2) are genuine internal contradictions that would send an implementer
down a path the design elsewhere forbids, so the verdict is CHANGES_REQUESTED.

---

## Findings

### 1. HIGH — `media` INSERT policy uses a direct `posts` subselect, which §4.3 explicitly forbids

**Where:** §4.4, the `media` INSERT bullet.

The `media` INSERT policy is specified as:

> INSERT: `authenticated`, `uploader_id = auth.uid()` AND member of the post's group
> (`public.is_group_member((select group_id from posts where id = post_id))` via the author
> being a member; enforced together with the `createPost` server action).

That predicate contains a **direct `select group_id from posts where id = post_id`** subselect
inside the `media` policy. The mandatory cross-table rule in §4.3 says, verbatim:

> never put a direct `exists (select 1 from posts ...)` subselect in a `media`/`comments`/`likes`
> policy (that re-triggers `posts` RLS under the invoker).

A `(select group_id from posts where id = post_id)` scalar subselect is the same forbidden
thing: it reads `posts` directly from inside a `media` policy and therefore re-evaluates the
`posts` SELECT policy under the invoker. The design contradicts its own load-bearing rule in
the one place the rule matters most. An implementer following §4.4 literally writes a policy
that §4.3 says must never exist; an implementer following §4.3 has no specified predicate for
`media` INSERT membership enforcement.

**Concrete fix:** Add a `SECURITY DEFINER` helper that answers "may this user post into the
group that owns this post" without the invoker touching `posts`/`groups` under RLS, and use it
in the `media` INSERT `WITH CHECK`. For example:

```sql
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

Then:

```sql
create policy media_insert on public.media
  for insert to authenticated
  with check ( uploader_id = auth.uid() and public.can_write_post_media(post_id) );
```

Alternatively, if membership-at-insert enforcement is considered redundant with the
`createPost` server action and the `posts` INSERT policy (which already requires
`is_group_member`), simplify the `media` INSERT check to
`uploader_id = auth.uid() and public.can_read_post(post_id)` (mirroring the `comments`/`likes`
INSERT policies, which already use `can_read_post`). Either way, remove the direct `posts`
subselect. Pick one and state it as the single predicate.

### 2. MEDIUM — Storage `media` bucket is created in `schema.sql` run from the SQL editor, but §4.5's own owner-population argument makes that insert fragile and the bucket-create path is underspecified

**Where:** §4.5 ("created in `schema.sql` via a `storage.buckets` insert") and README step 4.

Two concrete problems:

(a) Inserting into `storage.buckets`/`storage.objects` policies from the SQL editor requires
owner/elevated privileges, and the design never says the SQL editor runs as a role allowed to
write `storage.*`. On a default project this generally works in the dashboard SQL editor
(runs as `postgres`), but the design asserts the schema is "self-contained" and "run verbatim"
— a user running it via a non-dashboard connection (e.g. `psql` with the anon/service
distinction unclear) may hit `permission denied for schema storage`. The design does not state
which connection/role runs `schema.sql`.

(b) Re-running `schema.sql` (explicitly a documented, repeatable step) will fail on a plain
`insert into storage.buckets` the second time with a unique-violation, because there is no
idempotency guard, whereas every other object in the file is `create ... if not exists` /
`create or replace`.

**Concrete fix:** State that `schema.sql` is run in the Supabase **dashboard SQL editor**
(role `postgres`), and make the bucket insert idempotent:

```sql
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
```

Also specify that the storage `create policy` statements are wrapped so a re-run does not
error (either `drop policy if exists` first, or document that the schema is run once).

### 3. MEDIUM — `createPost` member-enforcement for the `posts` row is specified two different ways

**Where:** §4.4 `posts` INSERT vs. §10 "Media + post atomicity" flow.

§4.4 says a `posts` INSERT requires `author_id = auth.uid()` AND `public.is_group_member(group_id)`
("must be a member to post"). But the §10 numbered `createPost` flow (steps 1–5) never mentions
a membership check and never says the action verifies membership before uploading the image —
step 2 uploads to Storage *before* step 3 inserts the `posts` row. So for a non-member posting
an image, the flow uploads bytes to Storage, then the `posts` INSERT is rejected by RLS at
step 3, then the compensating delete (step 5, described as firing on *media/post insert
failure*) must clean it up. The design does not explicitly state that a non-member's image
upload is compensated — step 5's trigger condition is written as "if the `media` insert (or
the `posts` insert) fails after a successful upload," which does cover it, but the error-table
row for "not a member" (`createPost | not a member / not allowed`) implies a clean rejection
with no mention of the orphaned object.

**Concrete fix:** In §10, add an explicit **step 0**: "Verify `is_group_member(groupId)` via
`getUser()`+a membership read (or let the `posts` INSERT RLS reject); if the user is not a
member, return `{ ok: false, error: 'You must join this group to post.' }` **before** any
Storage upload." Ordering the membership check before the upload avoids uploading bytes that
will always be rejected, and makes the orphan-cleanup path an exceptional case rather than the
normal non-member path.

### 4. MEDIUM — `signUp` success contract conflicts between §6.1 and the confirmation-flow narrative

**Where:** §6.1 `signUp` row vs. §6 Registration steps 3–4.

§6.1 says `signUp` "returns `{ ok: true }` then the page shows 'check your email' (confirmation
on) **or** `redirect('/profile/edit')` (confirmation off)." The problem: the action cannot
reliably know at runtime whether email confirmation is enabled in the Supabase project — that
is a server-side Auth setting not exposed to the client SDK response in a documented boolean.
`supabase.auth.signUp` returns a `session` that is `null` when confirmation is required and
populated when it is not; the design never says the branch is decided by inspecting
`data.session`. As written, the implementer has two success behaviors and no stated rule for
choosing between them.

**Concrete fix:** Specify the discriminator explicitly: "After `signUp`, if `data.session` is
non-null (confirmation disabled), call `ensureProfile()` and `redirect('/profile/edit')`; if
`data.session` is null (confirmation required), return `{ ok: true }` and the page renders the
'check your email' notice." Also note `ensureProfile()` cannot run in the confirmation-required
branch because there is no session yet (it runs later in `/auth/callback`) — which is already
consistent with §6, but should be stated at the `signUp` contract so the two branches are
unambiguous.

### 5. MEDIUM — `ensureProfile` display-name fallback can violate the `profiles.display_name` CHECK and the §9 validator

**Where:** §6 Profile-row creation, §4.1 `profiles.display_name` (NOT NULL, length 1–60),
§9 `displayName` (length 1–60).

`ensureProfile()` inserts `display_name = <fallback derived from the email local-part>`. Email
local-parts can be up to 64 characters (RFC 5321), which exceeds the 60-char CHECK, and can
contain characters that are fine for a column but may later fail the §9 edit-form validator
when the user opens `/profile/edit` and tries to save without changing the name. More
immediately: a 61–64 char local-part makes the `ensureProfile` insert itself fail the CHECK,
which turns a routine login into the "fatal-to-action → redirect to `/login?error=auth`" path
(§10) — a login that silently fails for users with long email local-parts.

**Concrete fix:** Specify truncation/sanitization of the fallback: e.g.
`left(split_part(email,'@',1), 60)` and, if the result is empty, a constant like `'New user'`.
State it as: "`<fallback>` = the email local-part trimmed to 1–60 chars (CHECK-safe); if empty
after trimming, use `'New user'`." This guarantees the idempotent insert never trips the CHECK.

### 6. NIT — Vitest + `tests/validation.test.ts` is scope the brief neither requested nor forbade; confirm it is wanted

**Where:** §2 (Vitest locked), §3 (`tests/`, `vitest.config.ts`), §12.

The thin-slice scope list in the brief does not mention a test runner or unit tests. The
project's verification guidance generally favors having tests, and the design's choice to pull
validators/`safeNextPath`/storage-path into pure, unit-tested functions is sound and low-cost.
This is not scope creep in the harmful sense (it does not build any out-of-scope *product*
feature), so it is a NIT rather than a blocker — but it does add `vitest` as a dependency and a
`tests/` surface the brief did not ask for.

**Concrete fix:** Keep it, but add one sentence in §12 confirming Vitest is an
implementer-infrastructure choice (not a product feature) adopted to satisfy the verification
guideline, so a later reader does not mistake it for scope drift. No code change needed if the
team is fine with the dependency.

### 7. NIT — `avatar_url` max length differs between the column and the validator with no stated reason

**Where:** §4.1 `profiles.avatar_url` (type `text`, NULL, no length CHECK) vs. §9 `avatarUrl`
(length ≤ 2048).

The validator caps `avatarUrl` at 2048 chars, but the column has no corresponding CHECK, so the
"DB CHECK constraints are the final backstop" principle (§9 intro) is not upheld for this field.
Minor, but it is an inconsistency between the two layers the design otherwise keeps in lockstep
(e.g. `media.mime_type` was deliberately tightened to match the app allowlist in finding 8 of
the prior round).

**Concrete fix:** Add `CHECK (char_length(avatar_url) <= 2048)` to the `profiles.avatar_url`
column in §4.1, or explicitly note that `avatar_url` length is an app-only rule (like the
body-or-media exception) and why. Prefer the CHECK for consistency.

### 8. NIT — README step 3(a) ("set Supabase min password length ≤ 8") is a weak mitigation and the wording invites a misconfiguration

**Where:** §9 password note and README step 3(a).

The guidance "set the Supabase Auth minimum to ≤ 8 (or rely on our server-side check, which
always runs first)" is correct but the "≤ 8" phrasing is odd: to accept all passwords the app
accepts (min 8), the Supabase minimum must be **≤ 8** so Supabase never rejects something the
app allowed. But since the server-side check (min 8) always runs before `signUp` is called,
the Supabase setting is effectively irrelevant to the happy path — a user can never submit a
<8 char password past the app check. The README makes it sound load-bearing.

**Concrete fix:** Reword to: "The app enforces min 8 server-side before calling Supabase, so
the Supabase Auth minimum only matters if you bypass the app. Leaving the Supabase default
(6) is fine; optionally set it to 8 to keep the two in sync." This removes the implication
that a specific Supabase setting is required for correctness.

---

## Verified Assumptions

These were checkable from the repository itself and are correct:

- **The project is greenfield.** Confirmed by inspecting `c:\Projects\AidPal`: only
  `REQUIREMENTS.md` and `.agents/tasks/*` exist. The design's §3 file list is a create-from-
  scratch plan, consistent with that reality.
- **Scope alignment with the brief and REQUIREMENTS.md.** The design builds exactly the
  thin-slice features (email+password auth, profiles, public/private groups, media+comments+
  likes) and explicitly excludes events, volunteering, "Friend of", donations, ranking,
  search, feed, moderation, phone/social auth. §14 lists those as later work with *no code
  now*, which matches both the brief's OUT OF SCOPE list and REQUIREMENTS §6/§7 (donations
  DECIDED-deferred, email-first). No out-of-scope product build work appears in the design.
- **Donations/money fully excluded.** No money columns, no Stripe, no payment tables anywhere
  in the schema or actions. Matches REQUIREMENTS §7.1 and the brief.
- **SQL schema + RLS plan present for `supabase/schema.sql`.** §4.1–§4.5 provide the tables,
  the `anon, authenticated` read / owner-scoped write policies, and the private-group
  member-only visibility via `can_read_group`. This satisfies the brief's "Design SHOULD
  include SQL schema + RLS plan" requirement, modulo Findings 1 and 2.
- **Windows/PowerShell `;` convention.** §1, §13 and the README outline consistently use `;`
  and never `&&`, and the design explicitly does not auto-launch a dev server. Matches the
  brief's PowerShell constraint.
- **Graceful degradation without env vars.** §8 specifies a no-throw boot path
  (`isSupabaseConfigured()` guards, `<SupabaseNotConfigured />`, no top-level env throws),
  matching the brief's "must run without crashing when Supabase env vars are absent." The
  placeholder-as-sentinel design in §13 is consistent with this.
- **No hardcoded secrets.** §7/§13 reference only `NEXT_PUBLIC_*` env vars via `.env.local`
  (git-ignored) with `.env.example` placeholders; no service-role key anywhere. Matches "never
  hardcode secrets."

## Unverified / Caveated Assumptions

The project has no installed dependencies, so none of the following library/runtime claims
could be checked against source. They are assessed as *plausible and consistent with the
documented behavior of the stack* but are explicitly NOT verified here. If any is wrong, it
becomes a blocker during implementation:

- **`verifyOtp({ type, token_hash })` is the correct default email-confirmation path and
  `?code=`/`exchangeCodeForSession` is PKCE-only.** This matches current `@supabase/ssr`
  guidance (the `token_hash` + `type=email` template with a `/auth/callback` route handler is
  the documented default-flow pattern), but could not be confirmed against an installed SDK.
  The dependency on a manually edited Auth email template (README step 3c) is a real
  operational risk: if the user does not change the template, confirmation silently breaks.
  **Verify against the installed `@supabase/ssr` version during implementation.**
- **`@supabase/ssr` `createServerClient` `getAll`/`setAll` cookie adapter, and that `setAll`
  throws (so needs try/catch) during a Server Component render.** This is the documented SSR
  pattern and the Next.js "cannot set cookies after render" behavior is real, but the exact
  adapter shape should be confirmed against the installed version.
- **`SECURITY DEFINER` + pinned `search_path` makes a helper bypass the invoker's RLS and
  avoids `infinite recursion detected in policy`.** This is correct Postgres/Supabase behavior
  in principle (definer runs as owner; owner is RLS-exempt unless `force row level security`
  is set). The design's §4.3 reasoning is sound. It depends on the helper owner being an
  RLS-bypassing role (default `postgres` in the SQL editor) — the design states this but it is
  an environment assumption, not verified.
- **`storage.objects.owner` is populated only when the upload uses the user's authenticated
  session (not service-role), and the owner-scoped UPDATE/DELETE policy depends on it.**
  Matches documented Storage behavior; could not be verified against a live project.
- **bcrypt 72-**byte** input limit and Supabase Auth default minimum password length of 6.**
  Both are well-established; stated correctly in §9. Not independently re-verified here.
- **Next.js 15 / React 19 / Tailwind v4 are the `create-next-app` scaffold defaults and
  support the `src/` + `@/*` alias layout in §3.** Plausible for current `create-next-app`,
  but version-float ("15.x", "latest 0.x") means the implementer should pin versions and
  re-verify at scaffold time. The §2 note that `node`/`npm` were absent from PATH during
  authoring is a real environment gap the README's prerequisite step addresses.

---

## Verdict

Counting blocking findings: **1 HIGH + 4 MEDIUM = 5 blocking**, plus 3 NITs.

Because the count of HIGH/MEDIUM findings is greater than zero, the verdict is
**CHANGES_REQUESTED**. The two most important fixes are Finding 1 (the `media` INSERT policy
contradicts the design's own mandatory recursion rule — a correctness/security issue in the
RLS layer) and Finding 3 (ordering the membership check before the Storage upload). The rest
tighten contracts and remove layer-to-layer inconsistencies. None requires an architectural
redesign; all are localized edits.
