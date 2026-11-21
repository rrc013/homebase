-- =====================================================================
-- Homebase — update 02: grocery library (item memory, photos, stores)
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run.
-- =====================================================================

-- Stores you shop at. section_order = the order you walk the aisles.
create table if not exists public.stores (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null,
  emoji          text not null default '🏪',
  section_order  text[] not null default '{}',
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);

-- The library: every grocery item you've ever added.
create table if not exists public.catalog (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,
  name_key      text generated always as (lower(btrim(name))) stored,
  emoji         text not null default '🛒',
  photo_path    text,
  notes         text,
  use_count     int not null default 0,
  last_used     timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, name_key)
);

-- Where an item is, per store (e.g. Publix → "Aisle 7", Costco → "Back wall")
create table if not exists public.catalog_locations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  catalog_id    uuid not null references public.catalog(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  section       text not null,
  unique (catalog_id, store_id)
);

alter table public.list_items
  add column if not exists catalog_id uuid references public.catalog(id) on delete set null;

-- Remember an item: returns its library id, creating it if new and
-- counting how often it's bought (used to rank suggestions).
create or replace function public.remember_item(p_name text, p_emoji text default '🛒')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; hid uuid := public.my_household_id();
begin
  if hid is null then raise exception 'Not in a household'; end if;
  insert into public.catalog(household_id, name, emoji, use_count, last_used)
  values (hid, btrim(p_name), coalesce(p_emoji, '🛒'), 1, now())
  on conflict (household_id, name_key)
  do update set use_count = public.catalog.use_count + 1, last_used = now()
  returning id into cid;
  return cid;
end $$;
revoke all on function public.remember_item(text, text) from public, anon;
grant execute on function public.remember_item(text, text) to authenticated;

-- Security: family-only, same as everything else
alter table public.stores            enable row level security;
alter table public.catalog           enable row level security;
alter table public.catalog_locations enable row level security;
do $$
declare t text;
begin
  foreach t in array array['stores','catalog','catalog_locations'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format(
      'create policy %1$s_all on public.%1$s for all to authenticated
         using (household_id = public.my_household_id())
         with check (household_id = public.my_household_id())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Live updates
do $$
declare t text;
begin
  foreach t in array array['stores','catalog','catalog_locations'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Photo storage: private bucket, each family can only see its own folder
-- (files are saved as <household id>/<file name>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

drop policy if exists "item photos select" on storage.objects;
create policy "item photos select" on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "item photos insert" on storage.objects;
create policy "item photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "item photos update" on storage.objects;
create policy "item photos update" on storage.objects for update to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "item photos delete" on storage.objects;
create policy "item photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
