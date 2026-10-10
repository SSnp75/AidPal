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
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text check (body is null or char_length(body) <= 2000),
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
  for select to anon, authenticated using (public.can_read_group(group_id));

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
  for select to anon, authenticated using (public.can_read_post(post_id));

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
