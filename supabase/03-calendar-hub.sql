-- =====================================================================
-- Homebase — update 03: Google Calendar sync, hub weather, photo frame
-- Run AFTER schema.sql and 02-grocery-library.sql. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Weather location + time zone (per family)
-- ---------------------------------------------------------------------
alter table public.households add column if not exists timezone      text not null default 'America/New_York';
alter table public.households add column if not exists weather_place text not null default 'Sarasota, FL';
alter table public.households add column if not exists weather_lat   double precision not null default 27.3364;
alter table public.households add column if not exists weather_lon   double precision not null default -82.5307;
grant update (name, timezone, weather_place, weather_lat, weather_lon) on public.households to authenticated;

-- ---------------------------------------------------------------------
-- Connected Google accounts. The refresh token is NEVER readable by the
-- app — only the server function (service role) can see it.
-- ---------------------------------------------------------------------
create table if not exists public.google_accounts (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  google_email   text not null,
  refresh_token  text not null,
  status         text not null default 'ok',     -- 'ok' | 'reconnect'
  last_sync      timestamptz,
  created_at     timestamptz not null default now(),
  unique (household_id, google_email)
);
alter table public.google_accounts enable row level security;
drop policy if exists ga_select on public.google_accounts;
create policy ga_select on public.google_accounts for select to authenticated
  using (household_id = public.my_household_id());
revoke all on public.google_accounts from authenticated, anon;
grant select (id, household_id, member_id, google_email, status, last_sync, created_at)
  on public.google_accounts to authenticated;

-- Calendars inside each Google account
create table if not exists public.calendars (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.google_accounts(id) on delete cascade,
  google_calendar_id  text not null,
  name                text not null,
  google_color        text,
  color               text,                       -- color shown in Homebase (defaults to the person's color)
  member_id           uuid references public.members(id) on delete set null,  -- whose calendar it is
  is_work             boolean not null default false,  -- work = details hidden from everyone but the owner
  show                boolean not null default false,
  can_write           boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (account_id, google_calendar_id)
);
alter table public.calendars enable row level security;
drop policy if exists cal_select on public.calendars;
create policy cal_select on public.calendars for select to authenticated
  using (household_id = public.my_household_id());
-- only the person who connected the account can change its calendar settings
drop policy if exists cal_update on public.calendars;
create policy cal_update on public.calendars for update to authenticated
  using (household_id = public.my_household_id()
         and account_id in (select id from public.google_accounts where member_id = public.my_member_id()))
  with check (household_id = public.my_household_id());
revoke all on public.calendars from authenticated, anon;
grant select on public.calendars to authenticated;
grant update (color, member_id, is_work, show) on public.calendars to authenticated;

-- Cached events (the server function keeps these in step with Google)
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  calendar_id      uuid not null references public.calendars(id) on delete cascade,
  google_event_id  text not null,
  recurring_id     text,
  title            text not null,
  location         text,
  notes            text,
  all_day          boolean not null default false,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  start_date       date,
  end_date         date,          -- all-day: day AFTER the last day (Google's convention)
  private          boolean not null default false,
  updated_at       timestamptz not null default now(),
  unique (calendar_id, google_event_id)
);
create index if not exists events_time_idx on public.events(household_id, start_at);
alter table public.events enable row level security;
drop policy if exists ev_select on public.events;
create policy ev_select on public.events for select to authenticated
  using (household_id = public.my_household_id());
revoke all on public.events from authenticated, anon;
grant select on public.events to authenticated;

-- Real titles of work events — readable ONLY by the calendar's owner
create table if not exists public.event_private (
  event_id      uuid primary key references public.events(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  title         text,
  location      text,
  notes         text
);
alter table public.event_private enable row level security;
drop policy if exists evp_select on public.event_private;
create policy evp_select on public.event_private for select to authenticated
  using (member_id = public.my_member_id());
revoke all on public.event_private from authenticated, anon;
grant select on public.event_private to authenticated;

-- Short-lived codes used while connecting a Google account (server only)
create table if not exists public.oauth_states (
  state         text primary key,
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  created_at    timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from authenticated, anon;

-- ---------------------------------------------------------------------
-- Photo frame
-- ---------------------------------------------------------------------
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  path          text not null,
  uploaded_by   uuid references public.members(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.photos enable row level security;
drop policy if exists photos_all on public.photos;
create policy photos_all on public.photos for all to authenticated
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
grant select, insert, delete on public.photos to authenticated;

insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', false)
on conflict (id) do nothing;

drop policy if exists "family photos select" on storage.objects;
create policy "family photos select" on storage.objects for select to authenticated
  using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "family photos insert" on storage.objects;
create policy "family photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'family-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "family photos delete" on storage.objects;
create policy "family photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['households','calendars','events','photos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
