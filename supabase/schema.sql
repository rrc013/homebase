-- =====================================================================
-- Homebase — database schema (Phase 1: lists, message board, countdowns)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates things that don't exist yet.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One row per family. join_code lets a second parent join.
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

-- Everyone in the family. Parents have a login (user_id); kids don't.
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid unique references auth.users(id) on delete set null,
  name          text not null,
  kind          text not null check (kind in ('parent','kid')),
  color         text not null default '#5B8DEF',
  emoji         text not null default '🙂',
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.lists (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,
  kind          text not null default 'todo' check (kind in ('shopping','todo','reminders','other')),
  emoji         text not null default '📝',
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.list_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  list_id       uuid not null references public.lists(id) on delete cascade,
  text          text not null,
  note          text,
  done          boolean not null default false,
  done_at       timestamptz,
  done_by       uuid references public.members(id) on delete set null,
  assigned_to   uuid references public.members(id) on delete set null,
  due_at        timestamptz,
  created_by    uuid references public.members(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists list_items_list_idx on public.list_items(list_id);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  author_id     uuid references public.members(id) on delete set null,
  body          text not null,
  color         text not null default '#FFE58F',
  pinned        boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.countdowns (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  title         text not null,
  emoji         text not null default '🎉',
  target_date   date not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helper functions (who am I / which family am I in)
-- ---------------------------------------------------------------------
create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() limit 1
$$;

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() limit 1
$$;

-- 6-character code without look-alike characters (no 0/O, 1/I/L)
create or replace function public.new_join_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code  text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where join_code = code);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------------
-- Setup actions called from the app
-- ---------------------------------------------------------------------

-- First parent: creates the family, their own member row, the kids,
-- and three starter lists.
create or replace function public.create_household(
  p_household_name text,
  p_display_name   text,
  p_kids           text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  kid text;
  n   int := 0;
  kid_colors text[] := array['#F28CB1','#7BC67E','#FFB74D','#9C8CF2'];
  kid_emojis text[] := array['🦄','🐻','🦊','🐢'];
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  insert into public.households(name, join_code)
  values (coalesce(nullif(trim(p_household_name),''),'Our Family'), public.new_join_code())
  returning id into hid;

  insert into public.members(household_id, user_id, name, kind, color, emoji, sort)
  values (hid, auth.uid(), coalesce(nullif(trim(p_display_name),''),'Parent'), 'parent', '#5B8DEF', '🧔', 0);

  foreach kid in array coalesce(p_kids, '{}') loop
    if nullif(trim(kid),'') is not null then
      n := n + 1;
      insert into public.members(household_id, name, kind, color, emoji, sort)
      values (hid, trim(kid), 'kid',
              kid_colors[1 + ((n-1) % array_length(kid_colors,1))],
              kid_emojis[1 + ((n-1) % array_length(kid_emojis,1))],
              10 + n);
    end if;
  end loop;

  insert into public.lists(household_id, name, kind, emoji, sort) values
    (hid, 'Groceries', 'shopping',  '🛒', 0),
    (hid, 'To-Do',     'todo',      '✅', 1),
    (hid, 'Reminders', 'reminders', '🔔', 2);

  return hid;
end $$;

-- Second parent: joins with the 6-character code.
create or replace function public.join_household(
  p_code         text,
  p_display_name text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;
  select id into hid from public.households where join_code = upper(trim(p_code));
  if hid is null then raise exception 'That code doesn''t match a household'; end if;

  insert into public.members(household_id, user_id, name, kind, color, emoji, sort)
  values (hid, auth.uid(), coalesce(nullif(trim(p_display_name),''),'Parent'), 'parent', '#E57373', '👩', 1);
  return hid;
end $$;

-- Make a new join code (e.g. after both parents have joined)
create or replace function public.reset_join_code()
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if public.my_household_id() is null then raise exception 'Not in a household'; end if;
  code := public.new_join_code();
  update public.households set join_code = code where id = public.my_household_id();
  return code;
end $$;

revoke all on function public.create_household(text,text,text[]) from public, anon;
revoke all on function public.join_household(text,text)          from public, anon;
revoke all on function public.reset_join_code()                   from public, anon;
grant execute on function public.create_household(text,text,text[]) to authenticated;
grant execute on function public.join_household(text,text)          to authenticated;
grant execute on function public.reset_join_code()                   to authenticated;
grant execute on function public.my_household_id() to authenticated;
grant execute on function public.my_member_id()    to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security: you only ever see your own family's data
-- ---------------------------------------------------------------------
alter table public.households  enable row level security;
alter table public.members     enable row level security;
alter table public.lists       enable row level security;
alter table public.list_items  enable row level security;
alter table public.messages    enable row level security;
alter table public.countdowns  enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select to authenticated
  using (id = public.my_household_id());
drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update to authenticated
  using (id = public.my_household_id()) with check (id = public.my_household_id());

drop policy if exists m_select on public.members;
create policy m_select on public.members for select to authenticated
  using (household_id = public.my_household_id());
-- parents can add kids (not other logins)
drop policy if exists m_insert on public.members;
create policy m_insert on public.members for insert to authenticated
  with check (household_id = public.my_household_id() and kind = 'kid' and user_id is null);
drop policy if exists m_update on public.members;
create policy m_update on public.members for update to authenticated
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
-- only kid profiles can be removed from the app
drop policy if exists m_delete on public.members;
create policy m_delete on public.members for delete to authenticated
  using (household_id = public.my_household_id() and user_id is null);

-- Same rule for the content tables
do $$
declare t text;
begin
  foreach t in array array['lists','list_items','messages','countdowns'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format(
      'create policy %1$s_all on public.%1$s for all to authenticated
         using (household_id = public.my_household_id())
         with check (household_id = public.my_household_id())', t);
  end loop;
end $$;

-- Column guard: members.user_id and household can't be changed by the app
revoke update on public.members from authenticated;
grant  update (name, color, emoji, sort) on public.members to authenticated;
revoke update on public.households from authenticated;
grant  update (name) on public.households to authenticated;

grant select, insert, delete on public.members to authenticated;
grant select on public.households to authenticated;
grant select, insert, update, delete on public.lists, public.list_items,
  public.messages, public.countdowns to authenticated;

-- ---------------------------------------------------------------------
-- Live updates (every phone/tablet refreshes instantly)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['members','lists','list_items','messages','countdowns'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
