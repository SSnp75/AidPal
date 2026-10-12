-- AidPal thin-slice schema
-- Run in the Supabase dashboard SQL editor (role postgres).
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ═══════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 2048),
  bio          text check (bio is null or char_length(bio) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 1000),
  is_private  boolean not null default false,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','moderator','member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text check (body is null or char_length(body) <= 2000),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  uploader_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('like','love','dislike')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.bookmarks (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  verb        text not null check (verb in (
    'created_post','commented','reacted','joined_group','created_group','bookmarked',
    'sent_friend_request','accepted_friend','created_event','volunteered_for_event'
  )),
  target_type text,
  target_id   uuid,
  group_id    uuid references public.groups(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.friendships (
  user_low     uuid not null references public.profiles(id) on delete cascade,
  user_high    uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_low, user_high),
  constraint friendships_canonical_order check (user_low < user_high),
  constraint friendships_requester_is_party check (requester_id in (user_low, user_high))
);

-- ── events ──
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.profiles(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  scope       text not null check (scope in ('individual','group','public')),
  title       text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  location    text check (location is null or char_length(location) <= 200),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint events_scope_group_chk check (
    (scope = 'group'                 and group_id is not null) or
    (scope in ('individual','public') and group_id is null)
  )
);

-- ── event_tasks ──
create table if not exists public.event_tasks (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  status      text not null default 'todo' check (status in ('todo','in_progress','done')),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── event_volunteers ──
create table if not exists public.event_volunteers (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text check (role is null or char_length(role) <= 100),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── event_interests ──
-- Per-user "Interested" flag on events, independent of volunteering.
-- Structurally identical to event_volunteers minus the role column.
create table if not exists public.event_interests (
  event_id   uuid not null references public.events(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── messaging: conversations / conversation_members / messages ──
-- Two conversation kinds: 'dm' (two accepted friends, membership materialized
-- in conversation_members) and 'group' (one implicit thread per group, access
-- derived from is_group_member — no member rows materialized).
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('dm','group')),
  group_id   uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_kind_group_chk check (
    (kind = 'group' and group_id is not null) or
    (kind = 'dm'    and group_id is null)
  )
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id)      on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

create index if not exists bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);
create index if not exists activities_user_created_idx on public.activities (user_id, created_at desc);
create index if not exists friendships_user_high_idx on public.friendships (user_high);
create index if not exists friendships_status_idx    on public.friendships (status);
create index if not exists events_group_id_idx       on public.events (group_id);
create index if not exists events_creator_id_idx     on public.events (creator_id);
create index if not exists events_starts_at_idx      on public.events (starts_at);
create index if not exists event_tasks_event_id_idx  on public.event_tasks (event_id);
create index if not exists event_volunteers_user_idx on public.event_volunteers (user_id);
create index if not exists event_interests_user_idx  on public.event_interests (user_id);
-- messaging: one group conversation per group; thread read by (conversation, time).
create unique index if not exists conversations_group_uq
  on public.conversations (group_id) where kind = 'group';
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- ═══════════════════════════════════════════════
-- RLS: Enable on all tables
-- ═══════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.posts         enable row level security;
alter table public.media         enable row level security;
alter table public.comments      enable row level security;
alter table public.reactions     enable row level security;
alter table public.bookmarks     enable row level security;
alter table public.activities    enable row level security;
alter table public.friendships   enable row level security;
alter table public.events           enable row level security;
alter table public.event_tasks      enable row level security;
alter table public.event_volunteers enable row level security;
alter table public.event_interests  enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- ═══════════════════════════════════════════════
-- Helper functions (SECURITY DEFINER)
-- ═══════════════════════════════════════════════

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

-- can_moderate_group: owner of the group OR a 'moderator' member. Single
-- source of truth for the "owner OR moderator" predicate used by the suspend
-- RPCs and the status-aware visibility helpers below. SECURITY DEFINER so its
-- base-table reads bypass RLS and never re-enter a policy (keeps the graph
-- acyclic). The owner branch is checked independently so the owner is covered
-- even if their group_members row were ever missing.
create or replace function public.can_moderate_group(_group uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from groups g
    where g.id = _group and g.owner_id = auth.uid()
  )
  or exists (
    select 1 from group_members gm
    where gm.group_id = _group
      and gm.user_id = auth.uid()
      and gm.role = 'moderator'
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
      and (g.status = 'active' or public.can_moderate_group(g.id))
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
    where p.id = pid
      and public.can_read_group(p.group_id)
      and (p.status = 'active' or public.can_moderate_group(p.group_id))
  );
$$;

-- can_read_comment: comment visibility that folds in post/group suspension
-- (via can_read_post) and adds comment-level suspension. SECURITY DEFINER →
-- its read of comments/posts bypasses RLS, so comments_select (which points
-- here) never re-enters itself. The DAG is comment → post → group → membership.
create or replace function public.can_read_comment(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from comments c
    join posts p on p.id = c.post_id
    where c.id = cid
      and public.can_read_post(c.post_id)
      and (c.status = 'active' or public.can_moderate_group(p.group_id))
  );
$$;

-- ── Moderation RPCs (SECURITY DEFINER, underscore params) ──
-- All return true after a passing authorization check (success == authorized
-- and the statement ran, NOT == a row changed — these are idempotent). They
-- raise '42501' when unauthorized, '22023' on a bad status, 'P0002' when the
-- target does not exist. DELETE group is owner-only; status setters are
-- owner/moderator (can_moderate_group); DELETE post/comment is author-or-owner
-- (can_moderate_group is deliberately NOT used there — moderators cannot delete).

create or replace function public.delete_group(_group uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from groups g
                 where g.id = _group and g.owner_id = auth.uid()) then
    raise exception 'not group owner' using errcode = '42501';
  end if;
  delete from groups where id = _group;
  return true;
end;
$$;

-- leave_group: a member removes their own membership. The owner may NOT leave
-- their own group (raise '42501'). No RLS change is needed — gm_delete already
-- permits `user_id = auth.uid()`; the owner-guard lives here. Idempotent:
-- deleting zero rows (already not a member) is treated as success.
create or replace function public.leave_group(_group uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from groups g
             where g.id = _group and g.owner_id = auth.uid()) then
    raise exception 'owner cannot leave own group' using errcode = '42501';
  end if;
  delete from group_members
  where group_id = _group and user_id = auth.uid();
  return true;
end;
$$;

create or replace function public.set_group_status(_group uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if not public.can_moderate_group(_group) then
    raise exception 'not a group moderator' using errcode = '42501';
  end if;
  update groups set status = _status where id = _group;
  return true;
end;
$$;

create or replace function public.delete_post(_post uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_group  uuid;
begin
  select p.author_id, p.group_id into v_author, v_group
  from posts p where p.id = _post;
  if v_group is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if not (
       v_author = auth.uid()
    or exists (select 1 from groups g
               where g.id = v_group and g.owner_id = auth.uid())
  ) then
    raise exception 'not allowed to delete post' using errcode = '42501';
  end if;
  delete from posts where id = _post;
  return true;
end;
$$;

create or replace function public.set_post_status(_post uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select p.group_id into v_group from posts p where p.id = _post;
  if v_group is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if not public.can_moderate_group(v_group) then
    raise exception 'not a group moderator' using errcode = '42501';
  end if;
  update posts set status = _status where id = _post;
  return true;
end;
$$;

create or replace function public.delete_comment(_comment uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_group  uuid;
begin
  select c.author_id, p.group_id into v_author, v_group
  from comments c join posts p on p.id = c.post_id
  where c.id = _comment;
  if v_group is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  if not (
       v_author = auth.uid()
    or exists (select 1 from groups g
               where g.id = v_group and g.owner_id = auth.uid())
  ) then
    raise exception 'not allowed to delete comment' using errcode = '42501';
  end if;
  delete from comments where id = _comment;
  return true;
end;
$$;

create or replace function public.set_comment_status(_comment uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select p.group_id into v_group
  from comments c join posts p on p.id = c.post_id
  where c.id = _comment;
  if v_group is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  if not public.can_moderate_group(v_group) then
    raise exception 'not a group moderator' using errcode = '42501';
  end if;
  update comments set status = _status where id = _comment;
  return true;
end;
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

-- ── Event authorization helpers ──
-- RLS RECURSION / ACYCLIC POLICY GRAPH (NFR-3, AC-8):
--   events SELECT policy            → can_read_event(id)
--   event_tasks SELECT policy       → can_read_event(event_id)
--   event_volunteers SELECT policy  → can_read_event(event_id)
--   can_read_event body             → reads base events / event_tasks /
--                                      event_volunteers / groups / group_members
-- Because can_read_event and can_manage_event are SECURITY DEFINER, their
-- bodies run as the function owner with RLS BYPASSED, so the subselects on
-- event_tasks / event_volunteers do NOT re-enter those tables' SELECT policies.
-- No policy therefore transitively invokes itself → the graph is acyclic and
-- Postgres never raises "infinite recursion detected in policy". The nested
-- can_read_group call (group branch) is itself security definer and references
-- no event table, so it introduces no new cycle. This mirrors how can_read_post
-- selects from posts despite posts having its own SELECT policy.
--
-- Four-persona manual verification (run once in the Supabase SQL editor, NOT
-- executed here) — for each scope individual/group/public, confirm the read
-- matrix for creator / assignee / volunteer / outsider and that no call raises
-- "infinite recursion detected in policy" (see design.md §2.3/§2.4):
--   select can_read_event(:eid);   -- as each persona
--   select can_manage_event(:eid); -- as each persona
create or replace function public.can_read_event(eid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from events e
    where e.id = eid
      and (
        -- public: any authenticated caller
        (e.scope = 'public' and auth.uid() is not null)
        -- group: delegate entirely to the group's own visibility rule
        or (e.scope = 'group' and public.can_read_group(e.group_id))
        -- individual: creator, OR assignee on one of its tasks, OR a volunteer
        or (
          e.scope = 'individual' and (
            e.creator_id = auth.uid()
            or exists (
              select 1 from event_tasks t
              where t.event_id = e.id and t.assignee_id = auth.uid()
            )
            or exists (
              select 1 from event_volunteers v
              where v.event_id = e.id and v.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_event(eid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from events e
    where e.id = eid
      and (
        e.creator_id = auth.uid()
        or (
          e.scope = 'group' and exists (
            select 1 from group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = auth.uid()
              and gm.role = 'owner'
          )
        )
      )
  );
$$;

-- least() / greatest() on uuid is well-defined (uuid has a total btree order).
-- Pure, immutable, no table access → does NOT need security definer.
create or replace function public.friend_pair(a uuid, b uuid)
returns table (user_low uuid, user_high uuid)
language sql
immutable
set search_path = public
as $$
  select least(a, b), greatest(a, b);
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from friendships f
    where f.user_low = least(a, b)
      and f.user_high = greatest(a, b)
      and f.status = 'accepted'
  );
$$;

-- RLS RECURSION / ACYCLIC POLICY GRAPH (messaging; NFR-2, AC-7):
--   conversations SELECT policy         → can_access_conversation(id)
--   conversation_members SELECT policy  → can_access_conversation(conversation_id)
--   messages SELECT policy              → can_access_conversation(conversation_id)
--   messages INSERT policy              → can_access_conversation(conversation_id)
--   can_access_conversation body        → reads base conversations /
--                                          conversation_members, then calls
--                                          is_group_member / are_friends
-- Because can_access_conversation (and the nested is_group_member / are_friends)
-- are SECURITY DEFINER, their bodies run as the function owner with RLS BYPASSED,
-- so the subselects on conversations / conversation_members do NOT re-enter those
-- tables' SELECT policies. No policy therefore transitively invokes itself → the
-- graph is acyclic and Postgres never raises "infinite recursion detected in
-- policy". is_group_member reads group_members and are_friends reads friendships —
-- neither touches a messaging table, so they add no new edge back into messaging
-- policies. This mirrors how can_read_event reads events/event_tasks despite those
-- tables having their own SELECT policies.
--
-- DM "exactly two members" invariant (load-bearing): the DM self-join below is
-- correct only because a DM conversation_members set always holds exactly two
-- rows. start_or_get_dm is the sole writer (inserts both rows in one statement)
-- and no RLS policy permits a client insert/update/delete on conversation_members,
-- so no client can add a third member or delete one. The `other` member is thus
-- the unique user_id <> auth.uid() row.
--
-- Four-persona manual verification (run once in the Supabase SQL editor, NOT
-- executed here) — for a DM and a group conversation, confirm each persona's
-- expected boolean and that no call raises "infinite recursion detected in
-- policy" (design.md §2.4):
--   select can_access_conversation(:cid);  -- as each persona
create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversations c
    where c.id = cid
      and (
        -- group chat: current user is a member of the group
        (c.kind = 'group' and public.is_group_member(c.group_id))
        -- DM: current user is one of the two members AND the pair is still
        -- accepted-friends. are_friends() is the FR-9/FR-10 gate: unfriending
        -- removes read access to the retained history (A-4 intended behavior).
        or (c.kind = 'dm' and exists (
              select 1
              from conversation_members me
              join conversation_members other
                on other.conversation_id = me.conversation_id
               and other.user_id <> me.user_id
              where me.conversation_id = c.id
                and me.user_id = auth.uid()
                and public.are_friends(me.user_id, other.user_id)
           ))
      )
  );
$$;

-- ═══════════════════════════════════════════════
-- create_group RPC (atomic group + owner member)
-- ═══════════════════════════════════════════════

create or replace function public.create_group(
  _name text,
  _description text default null,
  _is_private boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into groups (name, description, is_private, owner_id)
  values (_name, _description, _is_private, auth.uid())
  returning id into new_id;

  insert into group_members (group_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

-- ═══════════════════════════════════════════════
-- create_event RPC (server-side creator_id = auth.uid())
-- ═══════════════════════════════════════════════
-- Mirrors create_group: a SECURITY DEFINER insert so creator_id is stamped
-- from auth.uid() server-side. This is the write path used by the
-- createEvent server action (NOT a direct client insert, which the events
-- RLS with-check rejected). For scope='group' it requires the caller to be a
-- member of _group_id; for individual/public it forces group_id to null so
-- the events_scope_group_chk constraint is satisfied.
create or replace function public.create_event(
  _scope text,
  _title text,
  _description text default null,
  _location text default null,
  _starts_at timestamptz default null,
  _ends_at timestamptz default null,
  _group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  gid uuid;
begin
  if _scope = 'group' then
    if _group_id is null or not public.is_group_member(_group_id) then
      raise exception 'not a member of group %', _group_id
        using errcode = '42501';
    end if;
    gid := _group_id;
  else
    gid := null;
  end if;

  insert into events (
    creator_id, group_id, scope, title, description, location,
    starts_at, ends_at
  )
  values (
    auth.uid(), gid, _scope, _title, _description, _location,
    _starts_at, _ends_at
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- ═══════════════════════════════════════════════
-- messaging RPCs (SECURITY DEFINER; conversation creation)
-- ═══════════════════════════════════════════════

-- start_or_get_dm — create or return the DM conversation between the caller and
-- _friend, only if they are accepted friends; materializes exactly two member
-- rows on first creation (sole writer of conversation_members — see the DM
-- invariant note on can_access_conversation).
create or replace function public.start_or_get_dm(_friend uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _friend is null or _friend = me then
    raise exception 'invalid friend' using errcode = '22023';
  end if;
  if not public.are_friends(me, _friend) then
    raise exception 'not friends' using errcode = '42501';
  end if;

  select c.id into cid
  from conversations c
  where c.kind = 'dm'
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = me)
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = _friend)
  limit 1;
  if cid is not null then
    return cid;
  end if;

  insert into conversations (kind, group_id) values ('dm', null)
  returning id into cid;
  insert into conversation_members (conversation_id, user_id)
  values (cid, me), (cid, _friend);
  return cid;
end;
$$;

-- get_or_create_group_conversation — return the group's single chat conversation,
-- creating it on first use, only if the caller is a member. Race-safe via the
-- conversations_group_uq partial unique index.
-- INVARIANT: keep this block TEXTUALLY IDENTICAL to the §10.2 migration copy —
-- the literal kind='group' insert and `on conflict (group_id) where kind = 'group'`
-- must match the partial-index predicate, else inference raises 42P10 at runtime.
create or replace function public.get_or_create_group_conversation(_group uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _group is null or not public.is_group_member(_group) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  select id into cid from conversations
  where kind = 'group' and group_id = _group
  limit 1;
  if cid is not null then
    return cid;
  end if;

  insert into conversations (kind, group_id) values ('group', _group)
  on conflict (group_id) where kind = 'group' do nothing
  returning id into cid;
  if cid is null then
    select id into cid from conversations
    where kind = 'group' and group_id = _group
    limit 1;
  end if;
  return cid;
end;
$$;

-- ═══════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════

-- ── profiles ──
drop policy if exists profiles_select   on public.profiles;
drop policy if exists profiles_insert   on public.profiles;
drop policy if exists profiles_update   on public.profiles;

create policy profiles_select on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── groups ──
drop policy if exists groups_select on public.groups;
drop policy if exists groups_insert on public.groups;
drop policy if exists groups_update on public.groups;
drop policy if exists groups_delete on public.groups;

create policy groups_select on public.groups
  for select to anon, authenticated using (public.can_read_group(id));

create policy groups_insert on public.groups
  for insert to authenticated with check (owner_id = auth.uid());

create policy groups_update on public.groups
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy groups_delete on public.groups
  for delete to authenticated using (owner_id = auth.uid());

-- ── group_members ──
drop policy if exists gm_select on public.group_members;
drop policy if exists gm_insert on public.group_members;
drop policy if exists gm_delete on public.group_members;

create policy gm_select on public.group_members
  for select to anon, authenticated
  using ( public.can_read_group(group_id) );

create policy gm_insert on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and (select g.is_private = false from groups g where g.id = group_id)
  );

create policy gm_delete on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- ── posts ──
drop policy if exists posts_select on public.posts;
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_update on public.posts;
drop policy if exists posts_delete on public.posts;

create policy posts_select on public.posts
  for select to anon, authenticated
  using (public.can_read_group(group_id)
         and (status = 'active' or public.can_moderate_group(group_id)));

create policy posts_insert on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id));

create policy posts_update on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy posts_delete on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- ── media ──
drop policy if exists media_select on public.media;
drop policy if exists media_insert on public.media;
drop policy if exists media_delete on public.media;

create policy media_select on public.media
  for select to anon, authenticated using (public.can_read_post(post_id));

create policy media_insert on public.media
  for insert to authenticated
  with check (uploader_id = auth.uid() and public.can_write_post_media(post_id));

create policy media_delete on public.media
  for delete to authenticated using (uploader_id = auth.uid());

-- ── comments ──
drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;

create policy comments_select on public.comments
  for select to anon, authenticated using (public.can_read_comment(id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_read_post(post_id));

create policy comments_update on public.comments
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy comments_delete on public.comments
  for delete to authenticated using (author_id = auth.uid());

-- ── reactions ──
-- One row per (post, user); `type` is the enforced reaction kind.
-- Mirrors the former likes_* policies, plus an UPDATE policy because
-- switching reaction type mutates the existing row.
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

-- ── bookmarks ──
-- Self-scoped; INSERT additionally gated by can_read_post so a viewer can
-- only bookmark a post they are allowed to see. No anon grants.
drop policy if exists bookmarks_select on public.bookmarks;
drop policy if exists bookmarks_insert on public.bookmarks;
drop policy if exists bookmarks_delete on public.bookmarks;

create policy bookmarks_select on public.bookmarks
  for select to authenticated using (user_id = auth.uid());

create policy bookmarks_insert on public.bookmarks
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));

create policy bookmarks_delete on public.bookmarks
  for delete to authenticated using (user_id = auth.uid());

-- ── activities ──
-- Append-only self activity log: SELECT + INSERT only (no UPDATE/DELETE).
-- No anon grants.
drop policy if exists activities_select on public.activities;
drop policy if exists activities_insert on public.activities;

create policy activities_select on public.activities
  for select to authenticated using (user_id = auth.uid());

create policy activities_insert on public.activities
  for insert to authenticated with check (user_id = auth.uid());

-- ── friendships ──
-- One row per unordered pair (user_low < user_high); either party may read
-- or delete; only the requester may insert a pending row; only the addressee
-- (the non-requester party) may transition pending → accepted.
drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists friendships_delete on public.friendships;

create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (user_low, user_high));

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and auth.uid() in (user_low, user_high)
    and user_low < user_high
    and status = 'pending'
  );

create policy friendships_update on public.friendships
  for update to authenticated
  using (
    auth.uid() in (user_low, user_high)
    and auth.uid() <> requester_id
    and status = 'pending'
  )
  with check (
    auth.uid() in (user_low, user_high)
    and auth.uid() <> requester_id
    and status = 'accepted'
  );

create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (user_low, user_high));

-- ── events ──
-- Every SELECT routes through can_read_event; management through
-- can_manage_event. No direct events/groups/profiles subselect; no anon grant.
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;

create policy events_select on public.events
  for select to authenticated using (public.can_read_event(id));

create policy events_insert on public.events
  for insert to authenticated
  with check (
    creator_id = auth.uid()
    and (
      (scope in ('individual','public') and group_id is null)
      or (scope = 'group' and group_id is not null and public.is_group_member(group_id))
    )
  );

create policy events_update on public.events
  for update to authenticated
  using (public.can_manage_event(id))
  with check (public.can_manage_event(id));

create policy events_delete on public.events
  for delete to authenticated using (public.can_manage_event(id));

-- ── event_tasks ──
drop policy if exists event_tasks_select on public.event_tasks;
drop policy if exists event_tasks_insert on public.event_tasks;
drop policy if exists event_tasks_update on public.event_tasks;
drop policy if exists event_tasks_delete on public.event_tasks;

create policy event_tasks_select on public.event_tasks
  for select to authenticated using (public.can_read_event(event_id));

create policy event_tasks_insert on public.event_tasks
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_manage_event(event_id));

create policy event_tasks_update on public.event_tasks
  for update to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

create policy event_tasks_delete on public.event_tasks
  for delete to authenticated using (public.can_manage_event(event_id));

-- ── event_volunteers ──
-- Insert is self-only + can_read_event (gate the volunteer to a readable
-- event); delete is self-only (a user may always withdraw their own row).
-- No UPDATE policy — volunteering is insert-or-delete only (like bookmarks).
drop policy if exists event_volunteers_select on public.event_volunteers;
drop policy if exists event_volunteers_insert on public.event_volunteers;
drop policy if exists event_volunteers_delete on public.event_volunteers;

create policy event_volunteers_select on public.event_volunteers
  for select to authenticated using (public.can_read_event(event_id));

create policy event_volunteers_insert on public.event_volunteers
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_event(event_id));

create policy event_volunteers_delete on public.event_volunteers
  for delete to authenticated using (user_id = auth.uid());

-- ── event_interests ──
-- Routed solely through can_read_event (no direct events/groups subselect).
-- Insert is self-only + can_read_event (gate the interest to a readable
-- event); delete is self-only (a user may always withdraw their own row).
-- No UPDATE policy; no anon grant — insert-or-delete only (like event_volunteers).
drop policy if exists event_interests_select on public.event_interests;
drop policy if exists event_interests_insert on public.event_interests;
drop policy if exists event_interests_delete on public.event_interests;

create policy event_interests_select on public.event_interests
  for select to authenticated using (public.can_read_event(event_id));

create policy event_interests_insert on public.event_interests
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_event(event_id));

create policy event_interests_delete on public.event_interests
  for delete to authenticated using (user_id = auth.uid());

-- ── messaging ──
-- All SELECTs (and the message INSERT) route through can_access_conversation —
-- no direct subselect against profiles/groups/friendships/group_members here
-- (FR-12, AC-7). No INSERT/UPDATE/DELETE policies on conversations or
-- conversation_members: those rows are created only by the SECURITY DEFINER
-- RPCs above. messages are immutable (no update/delete policy). No anon grants.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated using (public.can_access_conversation(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
  );

-- ═══════════════════════════════════════════════
-- Storage: media bucket + policies
-- ═══════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_objects_select on storage.objects;
drop policy if exists media_objects_insert on storage.objects;
drop policy if exists media_objects_update on storage.objects;
drop policy if exists media_objects_delete on storage.objects;

create policy media_objects_select on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

create policy media_objects_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'media');

create policy media_objects_update on storage.objects
  for update to authenticated using (bucket_id = 'media' and owner = auth.uid());

create policy media_objects_delete on storage.objects
  for delete to authenticated using (bucket_id = 'media' and owner = auth.uid());

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

-- ============================================================
-- INCREMENTAL MIGRATION: add bookmarks + activities
-- Run ONCE in the Supabase SQL editor — touches no existing data;
-- safe to re-run. References only pre-existing objects
-- (posts, profiles, groups, can_read_post). Byte-identical in
-- effect to the canonical statements above.
-- ============================================================

-- 1. Tables (no-op if already present).
create table if not exists public.bookmarks (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  verb        text not null check (verb in ('created_post','commented','reacted','joined_group','created_group','bookmarked')),
  target_type text,
  target_id   uuid,
  group_id    uuid references public.groups(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 2. Indexes (no-op if already present).
create index if not exists bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);
create index if not exists activities_user_created_idx on public.activities (user_id, created_at desc);

-- 3. Enable RLS.
alter table public.bookmarks  enable row level security;
alter table public.activities enable row level security;

-- 4. Policies (drop-then-create = safe to re-run).
drop policy if exists bookmarks_select on public.bookmarks;
drop policy if exists bookmarks_insert on public.bookmarks;
drop policy if exists bookmarks_delete on public.bookmarks;

create policy bookmarks_select on public.bookmarks
  for select to authenticated using (user_id = auth.uid());
create policy bookmarks_insert on public.bookmarks
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));
create policy bookmarks_delete on public.bookmarks
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists activities_select on public.activities;
drop policy if exists activities_insert on public.activities;

create policy activities_select on public.activities
  for select to authenticated using (user_id = auth.uid());
create policy activities_insert on public.activities
  for insert to authenticated with check (user_id = auth.uid());

-- ============================================================
-- INCREMENTAL MIGRATION: add friendships + verb extension
-- Run ONCE in the Supabase SQL editor. Touches no existing data;
-- safe to re-run. References only pre-existing objects (profiles,
-- activities) plus the new friendships table it creates.
-- ============================================================

-- 1. Table (no-op if present).
create table if not exists public.friendships (
  user_low     uuid not null references public.profiles(id) on delete cascade,
  user_high    uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_low, user_high),
  constraint friendships_canonical_order check (user_low < user_high),
  constraint friendships_requester_is_party check (requester_id in (user_low, user_high))
);

-- 2. Indexes (no-op if present).
create index if not exists friendships_user_high_idx on public.friendships (user_high);
create index if not exists friendships_status_idx    on public.friendships (status);

-- 3. Enable RLS.
alter table public.friendships enable row level security;

-- 4. Helpers (create or replace = safe to re-run).
create or replace function public.friend_pair(a uuid, b uuid)
returns table (user_low uuid, user_high uuid)
language sql
immutable
set search_path = public
as $$
  select least(a, b), greatest(a, b);
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from friendships f
    where f.user_low = least(a, b)
      and f.user_high = greatest(a, b)
      and f.status = 'accepted'
  );
$$;

-- 5. Policies (drop-then-create = safe to re-run).
drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists friendships_delete on public.friendships;

create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (user_low, user_high));

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and auth.uid() in (user_low, user_high)
    and user_low < user_high
    and status = 'pending'
  );

create policy friendships_update on public.friendships
  for update to authenticated
  using (
    auth.uid() in (user_low, user_high)
    and auth.uid() <> requester_id
    and status = 'pending'
  )
  with check (
    auth.uid() in (user_low, user_high)
    and auth.uid() <> requester_id
    and status = 'accepted'
  );

create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (user_low, user_high));

-- 6. activities.verb CHECK extension — guarded drop + add
--    (a CHECK is not create-if-not-exists). Idempotent: dropping a
--    missing constraint is tolerated via IF EXISTS; the add re-creates
--    the full 8-verb list. The constraint name "activities_verb_check"
--    is Postgres's default for an inline column CHECK. VERIFY the actual
--    name against the live DB before running and substitute if it differs:
--      select conname from pg_constraint
--      where conrelid = 'public.activities'::regclass and contype = 'c';
--    A wrong name makes the drop a silent no-op and the add fails on duplicate.
alter table public.activities drop constraint if exists activities_verb_check;
alter table public.activities add constraint activities_verb_check
  check (verb in (
    'created_post','commented','reacted','joined_group','created_group','bookmarked',
    'sent_friend_request','accepted_friend'
  ));

-- ============================================================
-- INCREMENTAL MIGRATION: add events + event_tasks + event_volunteers
-- Run ONCE in the Supabase SQL editor. Touches no existing data;
-- safe to re-run. References only pre-existing objects (profiles,
-- groups, group_members, activities, can_read_group, is_group_member)
-- plus the new objects it creates.
-- ============================================================

-- 1. Tables (no-op if already present).
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.profiles(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  scope       text not null check (scope in ('individual','group','public')),
  title       text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  location    text check (location is null or char_length(location) <= 200),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint events_scope_group_chk check (
    (scope = 'group'                 and group_id is not null) or
    (scope in ('individual','public') and group_id is null)
  )
);

create table if not exists public.event_tasks (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  status      text not null default 'todo' check (status in ('todo','in_progress','done')),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.event_volunteers (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text check (role is null or char_length(role) <= 100),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 2. Indexes (no-op if already present).
create index if not exists events_group_id_idx       on public.events (group_id);
create index if not exists events_creator_id_idx     on public.events (creator_id);
create index if not exists events_starts_at_idx      on public.events (starts_at);
create index if not exists event_tasks_event_id_idx  on public.event_tasks (event_id);
create index if not exists event_volunteers_user_idx on public.event_volunteers (user_id);

-- 3. Enable RLS.
alter table public.events           enable row level security;
alter table public.event_tasks      enable row level security;
alter table public.event_volunteers enable row level security;

-- 4. Helpers (create or replace = safe to re-run). Both SECURITY DEFINER so
--    their bodies read base tables with RLS bypassed → the event_tasks /
--    event_volunteers SELECT policies (which call can_read_event) are never
--    re-entered, so no "infinite recursion detected in policy" (design.md §2.3).
create or replace function public.can_read_event(eid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from events e
    where e.id = eid
      and (
        (e.scope = 'public' and auth.uid() is not null)
        or (e.scope = 'group' and public.can_read_group(e.group_id))
        or (
          e.scope = 'individual' and (
            e.creator_id = auth.uid()
            or exists (
              select 1 from event_tasks t
              where t.event_id = e.id and t.assignee_id = auth.uid()
            )
            or exists (
              select 1 from event_volunteers v
              where v.event_id = e.id and v.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_event(eid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from events e
    where e.id = eid
      and (
        e.creator_id = auth.uid()
        or (
          e.scope = 'group' and exists (
            select 1 from group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = auth.uid()
              and gm.role = 'owner'
          )
        )
      )
  );
$$;

-- 5. Policies (drop-then-create = safe to re-run). Every SELECT routes through
--    can_read_event; management through can_manage_event. No direct
--    events/groups/profiles subselect in any policy; no anon grant.
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;

create policy events_select on public.events
  for select to authenticated using (public.can_read_event(id));

create policy events_insert on public.events
  for insert to authenticated
  with check (
    creator_id = auth.uid()
    and (
      (scope in ('individual','public') and group_id is null)
      or (scope = 'group' and group_id is not null and public.is_group_member(group_id))
    )
  );

create policy events_update on public.events
  for update to authenticated
  using (public.can_manage_event(id))
  with check (public.can_manage_event(id));

create policy events_delete on public.events
  for delete to authenticated using (public.can_manage_event(id));

drop policy if exists event_tasks_select on public.event_tasks;
drop policy if exists event_tasks_insert on public.event_tasks;
drop policy if exists event_tasks_update on public.event_tasks;
drop policy if exists event_tasks_delete on public.event_tasks;

create policy event_tasks_select on public.event_tasks
  for select to authenticated using (public.can_read_event(event_id));

create policy event_tasks_insert on public.event_tasks
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_manage_event(event_id));

create policy event_tasks_update on public.event_tasks
  for update to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

create policy event_tasks_delete on public.event_tasks
  for delete to authenticated using (public.can_manage_event(event_id));

drop policy if exists event_volunteers_select on public.event_volunteers;
drop policy if exists event_volunteers_insert on public.event_volunteers;
drop policy if exists event_volunteers_delete on public.event_volunteers;

create policy event_volunteers_select on public.event_volunteers
  for select to authenticated using (public.can_read_event(event_id));

create policy event_volunteers_insert on public.event_volunteers
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_event(event_id));

create policy event_volunteers_delete on public.event_volunteers
  for delete to authenticated using (user_id = auth.uid());

-- 6. activities.verb CHECK extension — guarded drop + add (a CHECK is NOT
--    create-if-not-exists). The ADD list is the UNION of the current live verbs
--    and the two new ones (10 verbs total); it must NOT drop any live verb or the
--    ADD fails (23514) against existing rows. Run this AFTER the friendships+verb
--    migration; it is still safe before it (this list supersedes that one — it
--    installs the full 10-verb constraint in one step).
--
--    The constraint name "activities_verb_check" is Postgres's default for the
--    inline column CHECK. VERIFY the actual name against the live DB before
--    running and substitute if it differs — a WRONG name makes the drop a silent
--    no-op and the add then fails on duplicate:
--      select conname from pg_constraint
--      where conrelid = 'public.activities'::regclass and contype = 'c';
alter table public.activities drop constraint if exists activities_verb_check;
alter table public.activities add constraint activities_verb_check
  check (verb in (
    'created_post','commented','reacted','joined_group','created_group','bookmarked',
    'sent_friend_request','accepted_friend','created_event','volunteered_for_event'
  ));

-- ============================================================
-- INCREMENTAL MIGRATION: add create_event + event_interests
-- Run ONCE in the Supabase SQL editor. Touches no existing data;
-- safe to re-run (create-or-replace function; create-if-not-exists
-- table; drop/create policies). References only pre-existing objects
-- (events, profiles, groups, is_group_member, can_read_event) plus the
-- table it creates.
--
-- 1) create_event — SECURITY DEFINER insert that stamps creator_id =
--    auth.uid() server-side. This is the createEvent write path (the
--    direct client insert was rejected by the events RLS with-check,
--    which is what made newly created events "go missing"). For
--    scope='group' it requires group membership; otherwise group_id is
--    forced null to satisfy events_scope_group_chk.
-- 2) event_interests — per-user "Interested" flag. No activities.verb
--    change (interest is intentionally NOT logged). Its write path is a
--    DIRECT self-scoped insert/delete (no RPC); the self-scoped insert
--    policy below is satisfiable by the caller's own JWT.
-- ============================================================

create or replace function public.create_event(
  _scope text,
  _title text,
  _description text default null,
  _location text default null,
  _starts_at timestamptz default null,
  _ends_at timestamptz default null,
  _group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  gid uuid;
begin
  if _scope = 'group' then
    if _group_id is null or not public.is_group_member(_group_id) then
      raise exception 'not a member of group %', _group_id
        using errcode = '42501';
    end if;
    gid := _group_id;
  else
    gid := null;
  end if;

  insert into events (
    creator_id, group_id, scope, title, description, location,
    starts_at, ends_at
  )
  values (
    auth.uid(), gid, _scope, _title, _description, _location,
    _starts_at, _ends_at
  )
  returning id into new_id;

  return new_id;
end;
$$;

create table if not exists public.event_interests (
  event_id   uuid not null references public.events(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_interests_user_idx on public.event_interests (user_id);

alter table public.event_interests enable row level security;

drop policy if exists event_interests_select on public.event_interests;
drop policy if exists event_interests_insert on public.event_interests;
drop policy if exists event_interests_delete on public.event_interests;

create policy event_interests_select on public.event_interests
  for select to authenticated using (public.can_read_event(event_id));
create policy event_interests_insert on public.event_interests
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_event(event_id));
create policy event_interests_delete on public.event_interests
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- INCREMENTAL MIGRATION: messaging (DM + group chat)
-- Paste VERBATIM into the Supabase SQL editor (role postgres)
-- against an existing live DB. Idempotent: safe to re-run.
-- Mirrors the objects added to the canonical schema above.
-- Re-run no-op basis: tables/indexes use `if not exists`;
-- `alter table ... enable row level security` is a no-op when RLS
-- is already enabled; the helper and both RPCs are `create or
-- replace`; and each of the four policies is `drop policy if
-- exists ... ; create policy ...` with an IDENTICAL definition,
-- so re-running the whole block changes nothing — a true no-op.
-- ============================================================

-- 1. Tables
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('dm','group')),
  group_id   uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_kind_group_chk check (
    (kind = 'group' and group_id is not null) or
    (kind = 'dm'    and group_id is null)
  )
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id)      on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

-- 2. Indexes
create unique index if not exists conversations_group_uq
  on public.conversations (group_id) where kind = 'group';
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- 3. RLS enable
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- 4. Authorization helper (SECURITY DEFINER; RLS-bypassed body → acyclic, see schema comment)
create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversations c
    where c.id = cid
      and (
        (c.kind = 'group' and public.is_group_member(c.group_id))
        or (c.kind = 'dm' and exists (
              select 1
              from conversation_members me
              join conversation_members other
                on other.conversation_id = me.conversation_id
               and other.user_id <> me.user_id
              where me.conversation_id = c.id
                and me.user_id = auth.uid()
                and public.are_friends(me.user_id, other.user_id)
           ))
      )
  );
$$;

-- 5. RPCs
create or replace function public.start_or_get_dm(_friend uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _friend is null or _friend = me then
    raise exception 'invalid friend' using errcode = '22023';
  end if;
  if not public.are_friends(me, _friend) then
    raise exception 'not friends' using errcode = '42501';
  end if;

  select c.id into cid
  from conversations c
  where c.kind = 'dm'
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = me)
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = _friend)
  limit 1;
  if cid is not null then
    return cid;
  end if;

  insert into conversations (kind, group_id) values ('dm', null)
  returning id into cid;
  insert into conversation_members (conversation_id, user_id)
  values (cid, me), (cid, _friend);
  return cid;
end;
$$;

create or replace function public.get_or_create_group_conversation(_group uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _group is null or not public.is_group_member(_group) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  select id into cid from conversations
  where kind = 'group' and group_id = _group
  limit 1;
  if cid is not null then
    return cid;
  end if;

  insert into conversations (kind, group_id) values ('group', _group)
  on conflict (group_id) where kind = 'group' do nothing
  returning id into cid;
  if cid is null then
    select id into cid from conversations
    where kind = 'group' and group_id = _group
    limit 1;
  end if;
  return cid;
end;
$$;

-- 6. Policies (drop-then-create; SELECT/INSERT routed through can_access_conversation)
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated using (public.can_access_conversation(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
  );
-- No UPDATE/DELETE policies on any messaging table (messages immutable;
-- conversations/members written only by the SECURITY DEFINER RPCs above).
-- No anon grants.

-- ============================================================
-- GROUP ORGANIZATION: countries, categories, tags, group columns
-- Idempotent. Run after the country seed (supabase/seeds/countries.sql).
-- ============================================================

create table if not exists public.countries (
  code text primary key check (char_length(code) = 2 and code = upper(code)),
  name text not null,
  flag text
);

create table if not exists public.group_categories (
  slug  text primary key,
  label text not null
);

create table if not exists public.group_tags (
  group_id uuid not null references public.groups(id) on delete cascade,
  tag      text not null check (char_length(tag) between 1 and 30),
  primary key (group_id, tag)
);

alter table public.groups add column if not exists country_code  text references public.countries(code);
alter table public.groups add column if not exists city          text check (city is null or char_length(city) <= 100);
alter table public.groups add column if not exists category_slug text references public.group_categories(slug);
alter table public.groups add column if not exists scope         text not null default 'local'
  check (scope in ('local','national','global','group'));

create index if not exists groups_country_code_idx on public.groups (country_code);
create index if not exists groups_category_slug_idx on public.groups (category_slug);
create index if not exists groups_scope_idx on public.groups (scope);
create index if not exists group_tags_tag_idx on public.group_tags (tag);

-- Category seed (fixed list; 'community' is the backfill default).
insert into public.group_categories (slug, label) values
  ('environment','Environment'),
  ('education','Education'),
  ('health','Health'),
  ('animals','Animals'),
  ('disaster-relief','Disaster Relief'),
  ('food-hunger','Food & Hunger'),
  ('homelessness','Homelessness'),
  ('arts-culture','Arts & Culture'),
  ('sports','Sports'),
  ('community','Community')
on conflict (slug) do nothing;

-- Country seed: run supabase/seeds/countries.sql (249 ISO 3166-1 rows).

-- Backfill existing groups (idempotent via the where-guard).
update public.groups
   set category_slug = coalesce(category_slug, 'community'),
       scope         = coalesce(scope, 'local')
 where category_slug is null;

-- Extend create_group RPC: set the 4 new columns + insert normalized tags
-- atomically, stamping owner_id = auth.uid(). Backward compatible (all new
-- params defaulted). Mirrors create_event's defaulted-param evolution.
create or replace function public.create_group(
  _name text,
  _description text default null,
  _is_private boolean default false,
  _country_code text default null,
  _city text default null,
  _category_slug text default null,
  _scope text default 'local',
  _tags text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  t text;
begin
  insert into groups (name, description, is_private, owner_id,
                      country_code, city, category_slug, scope)
  values (_name, _description, _is_private, auth.uid(),
          _country_code, _city, _category_slug, coalesce(_scope, 'local'))
  returning id into new_id;

  insert into group_members (group_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  if _tags is not null then
    foreach t in array _tags loop
      if t is not null and char_length(t) between 1 and 30 then
        insert into group_tags (group_id, tag) values (new_id, t)
        on conflict (group_id, tag) do nothing;
      end if;
    end loop;
  end if;

  return new_id;
end;
$$;

-- RLS: reference tables are public-read, SQL-seeded only (no client writes).
alter table public.countries        enable row level security;
alter table public.group_categories enable row level security;
alter table public.group_tags       enable row level security;

drop policy if exists countries_select on public.countries;
create policy countries_select on public.countries
  for select to anon, authenticated using (true);

drop policy if exists group_categories_select on public.group_categories;
create policy group_categories_select on public.group_categories
  for select to anon, authenticated using (true);

-- group_tags: SELECT routes through can_read_group (SECURITY DEFINER, bypasses
-- RLS → never re-enters group_tags' own policy; acyclic). Tag writes happen
-- only inside the create_group SECURITY DEFINER RPC — NO client write policy.
drop policy if exists group_tags_select on public.group_tags;
create policy group_tags_select on public.group_tags
  for select to anon, authenticated using (public.can_read_group(group_id));

-- ============================================================
-- GROUP RELATIONS: link a group to other existing groups (mutual)
-- Idempotent. relations_open controls who may add relations:
--   true  = any member of the group may add (default)
--   false = only the group owner may add
-- ============================================================

alter table public.groups add column if not exists relations_open boolean not null default true;

-- Canonical unordered pair (group_low < group_high) → one row per pair,
-- so a relation is inherently mutual and can't be duplicated/reciprocated.
create table if not exists public.group_relations (
  group_low  uuid not null references public.groups(id) on delete cascade,
  group_high uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_low, group_high),
  constraint group_relations_order check (group_low < group_high)
);

create index if not exists group_relations_high_idx on public.group_relations (group_high);

alter table public.group_relations enable row level security;

-- SECURITY DEFINER helper: may the current user add a relation involving gid?
-- Owner always; members only when the group's relations_open is true.
create or replace function public.can_relate_group(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from groups g
    where g.id = gid
      and (
        g.owner_id = auth.uid()
        or (g.relations_open and public.is_group_member(g.id))
      )
  );
$$;

-- RLS: a relation is readable if BOTH groups are readable to the viewer.
-- Writing requires the user can read both groups AND can_relate at least one
-- of them (the group they are relating from). created_by must be the user.
drop policy if exists group_relations_select on public.group_relations;
drop policy if exists group_relations_insert on public.group_relations;
drop policy if exists group_relations_delete on public.group_relations;

create policy group_relations_select on public.group_relations
  for select to anon, authenticated
  using (public.can_read_group(group_low) and public.can_read_group(group_high));

create policy group_relations_insert on public.group_relations
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_read_group(group_low)
    and public.can_read_group(group_high)
    and (public.can_relate_group(group_low) or public.can_relate_group(group_high))
  );

create policy group_relations_delete on public.group_relations
  for delete to authenticated
  using (
    public.can_relate_group(group_low) or public.can_relate_group(group_high)
  );

-- ============================================================
-- MODERATOR ROLE + member tag editing
-- Idempotent. Adds 'moderator' to group_members.role, an owner-only
-- promote/demote RPC, and member-gated add/remove tag RPCs.
-- ============================================================

-- 1. Extend the role CHECK to allow 'moderator' (guarded drop + add).
--    Constraint name is Postgres's default for the inline column CHECK.
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check
  check (role in ('owner','moderator','member'));

-- 2. Owner-only promote/demote: set a member's role to 'moderator' or 'member'.
--    Cannot change the owner's own row; target must be an existing member.
create or replace function public.set_group_member_role(
  _group uuid, _user uuid, _role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _role not in ('moderator','member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  select exists (
    select 1 from groups g where g.id = _group and g.owner_id = auth.uid()
  ) into is_owner;
  if not is_owner then
    raise exception 'only the owner can change roles' using errcode = '42501';
  end if;

  -- Never change the owner's own membership row.
  update group_members
     set role = _role
   where group_id = _group
     and user_id = _user
     and role <> 'owner';

  return found;
end;
$$;

-- 3. Member-gated tag editing: any member of the group may add/remove tags.
create or replace function public.add_group_tag(_group uuid, _tag text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(_group) then
    raise exception 'must be a group member' using errcode = '42501';
  end if;
  t := _tag;
  if t is null or char_length(t) < 1 or char_length(t) > 30 then
    raise exception 'invalid tag' using errcode = '22023';
  end if;
  insert into group_tags (group_id, tag) values (_group, t)
  on conflict (group_id, tag) do nothing;
  return true;
end;
$$;

create or replace function public.remove_group_tag(_group uuid, _tag text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(_group) then
    raise exception 'must be a group member' using errcode = '42501';
  end if;
  delete from group_tags where group_id = _group and tag = _tag;
  return true;
end;
$$;

-- ============================================================
-- MIGRATION: group & content moderation (status + RPCs + RLS)
-- Idempotent / re-runnable. Run ONCE in the Supabase SQL editor.
-- References only pre-existing objects plus what it creates.
-- Run order matters: columns → role-CHECK prerequisite → can_moderate_group
-- → visibility helpers → RPCs → policy repoints.
-- ============================================================

-- 1. status columns (default 'active' → existing rows become active).
alter table public.groups   add column if not exists status text not null default 'active'
  check (status in ('active','suspended'));
alter table public.posts    add column if not exists status text not null default 'active'
  check (status in ('active','suspended'));
alter table public.comments add column if not exists status text not null default 'active'
  check (status in ('active','suspended'));

-- 1a. Prerequisite: ensure 'moderator' is a legal group_members.role.
--     Idempotent; makes the feature correct whether or not the earlier
--     "MODERATOR ROLE" migration already ran. Without this, a from-canonical
--     build (role CHECK = ('owner','member')) silently degrades moderation to
--     owner-only because no moderator can ever be assigned.
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check
  check (role in ('owner','moderator','member'));

-- 2. moderation helper (owner OR moderator). Depends on step 1a.
create or replace function public.can_moderate_group(_group uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups g
                 where g.id = _group and g.owner_id = auth.uid())
      or exists (select 1 from group_members gm
                 where gm.group_id = _group and gm.user_id = auth.uid()
                   and gm.role = 'moderator');
$$;

-- 3. visibility helpers (status-aware; SECURITY DEFINER → acyclic).
create or replace function public.can_read_group(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups g
    where g.id = gid
      and (g.is_private = false or public.is_group_member(g.id))
      and (g.status = 'active' or public.can_moderate_group(g.id)));
$$;

create or replace function public.can_read_post(pid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from posts p
    where p.id = pid
      and public.can_read_group(p.group_id)
      and (p.status = 'active' or public.can_moderate_group(p.group_id)));
$$;

create or replace function public.can_read_comment(cid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from comments c
    join posts p on p.id = c.post_id
    where c.id = cid
      and public.can_read_post(c.post_id)
      and (c.status = 'active' or public.can_moderate_group(p.group_id)));
$$;

-- 4. privileged RPCs.
create or replace function public.delete_group(_group uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups g where g.id = _group and g.owner_id = auth.uid()) then
    raise exception 'not group owner' using errcode = '42501';
  end if;
  delete from groups where id = _group;
  return true;
end; $$;

create or replace function public.set_group_status(_group uuid, _status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023'; end if;
  if not public.can_moderate_group(_group) then
    raise exception 'not a group moderator' using errcode = '42501'; end if;
  update groups set status = _status where id = _group;
  return true;
end; $$;

create or replace function public.delete_post(_post uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_group uuid;
begin
  select p.author_id, p.group_id into v_author, v_group from posts p where p.id = _post;
  if v_group is null then raise exception 'post not found' using errcode = 'P0002'; end if;
  if not (v_author = auth.uid()
          or exists (select 1 from groups g where g.id = v_group and g.owner_id = auth.uid())) then
    raise exception 'not allowed to delete post' using errcode = '42501'; end if;
  delete from posts where id = _post;
  return true;
end; $$;

create or replace function public.set_post_status(_post uuid, _status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023'; end if;
  select p.group_id into v_group from posts p where p.id = _post;
  if v_group is null then raise exception 'post not found' using errcode = 'P0002'; end if;
  if not public.can_moderate_group(v_group) then
    raise exception 'not a group moderator' using errcode = '42501'; end if;
  update posts set status = _status where id = _post;
  return true;
end; $$;

create or replace function public.delete_comment(_comment uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_group uuid;
begin
  select c.author_id, p.group_id into v_author, v_group
  from comments c join posts p on p.id = c.post_id where c.id = _comment;
  if v_group is null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if not (v_author = auth.uid()
          or exists (select 1 from groups g where g.id = v_group and g.owner_id = auth.uid())) then
    raise exception 'not allowed to delete comment' using errcode = '42501'; end if;
  delete from comments where id = _comment;
  return true;
end; $$;

create or replace function public.set_comment_status(_comment uuid, _status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  if _status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023'; end if;
  select p.group_id into v_group from comments c join posts p on p.id = c.post_id
  where c.id = _comment;
  if v_group is null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  if not public.can_moderate_group(v_group) then
    raise exception 'not a group moderator' using errcode = '42501'; end if;
  update comments set status = _status where id = _comment;
  return true;
end; $$;

-- 5. policy repoints (posts gains inline status conjunct; comments → can_read_comment).
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to anon, authenticated
  using (public.can_read_group(group_id)
         and (status = 'active' or public.can_moderate_group(group_id)));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to anon, authenticated using (public.can_read_comment(id));

-- (groups_select needs no re-create: its policy text is unchanged — only
--  can_read_group's body changed, which create or replace function updates.
--  Same for media/reactions/bookmarks, which route through can_read_post.)

-- 5.1 Manual verification (run once, four personas: owner, moderator, member,
--      outsider). Confirm no call raises "infinite recursion detected in
--      policy" and the read matrix holds for active vs. suspended rows.
--   select can_read_group(:gid);     -- as each persona
--   select can_read_post(:pid);      -- as each persona
--   select can_read_comment(:cid);   -- as each persona
--   select can_moderate_group(:gid); -- true only for owner/moderator
-- Expected: suspended group/post/comment → true only for owner & moderator;
-- active → normal visibility rules.

-- ─────────────────────────────────────────────────────────────────────────
-- Incremental migration: leave_group RPC (engagement → group affinity).
-- Re-runnable: `create or replace function` is inherently idempotent and no
-- RLS/table change is required — gm_delete already allows a user to delete
-- their own membership row, and the owner-guard lives inside this function.
create or replace function public.leave_group(_group uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from groups g
             where g.id = _group and g.owner_id = auth.uid()) then
    raise exception 'owner cannot leave own group' using errcode = '42501';
  end if;
  delete from group_members
  where group_id = _group and user_id = auth.uid();
  return true;
end;
$$;
