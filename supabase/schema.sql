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

create table if not exists public.likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ═══════════════════════════════════════════════
-- RLS: Enable on all tables
-- ═══════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.posts         enable row level security;
alter table public.media         enable row level security;
alter table public.comments      enable row level security;
alter table public.likes         enable row level security;

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

-- ── likes ──
drop policy if exists likes_select on public.likes;
drop policy if exists likes_insert on public.likes;
drop policy if exists likes_delete on public.likes;

create policy likes_select on public.likes
  for select to anon, authenticated using (public.can_read_post(post_id));

create policy likes_insert on public.likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));

create policy likes_delete on public.likes
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
