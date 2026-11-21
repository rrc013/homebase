-- =====================================================================
-- Homebase — update 05: chores, points, rewards, routines, Buddy pet
-- Run AFTER 04. Safe to re-run.
-- =====================================================================

-- Per-kid settings: pet + routine times
create table if not exists public.kid_profiles (
  member_id      uuid primary key references public.members(id) on delete cascade,
  household_id   uuid not null references public.households(id) on delete cascade,
  pet_kind       text,                                  -- null until the kid picks one on the Buddy
  pet_name       text not null default 'Buddy',
  morning_start  time not null default '06:45',
  wake_time      time not null default '07:00',         -- OK-to-wake: sun comes up
  bedtime_start  time not null default '19:15',         -- bedtime routine begins
  sleep_time     time not null default '20:00',         -- moon / sleep clock
  voice          boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists public.chores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid references public.members(id) on delete cascade,  -- null = every kid
  title         text not null,
  emoji         text not null default '⭐',
  points        int  not null default 1 check (points >= 0),
  schedule      text not null default 'days' check (schedule in ('days','weekly','once')),
  days          int[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday
  due_date      date,
  time_of_day   text not null default 'anytime' check (time_of_day in ('morning','afternoon','evening','anytime')),
  photo_proof   boolean not null default false,
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.routines (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  kind          text not null check (kind in ('morning','bedtime')),
  points        int  not null default 5 check (points >= 0),
  steps         jsonb not null default '[]',   -- [{ "emoji": "🪥", "title": "Brush teeth" }, ...]
  unique (member_id, kind)
);

create table if not exists public.rewards (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid references public.members(id) on delete cascade,  -- null = every kid
  title         text not null,
  emoji         text not null default '🎁',
  cost          int  not null check (cost > 0),
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

-- The points ledger: every chore, routine, bonus and prize
create table if not exists public.completions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,  -- the kid
  kind          text not null check (kind in ('chore','routine','bonus','redeem')),
  ref_id        uuid,               -- chore / routine / reward id
  title         text not null,
  emoji         text not null default '⭐',
  day           date not null,      -- the kid's local date
  points        int  not null,      -- negative for prizes
  status        text not null default 'approved' check (status in ('approved','pending','rejected')),
  photo_path    text,
  note          text,
  created_by    uuid references public.members(id) on delete set null,
  reviewed_by   uuid references public.members(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists completions_kid_idx on public.completions(member_id, day);

-- Family-only access, same as everything else
do $$
declare t text;
begin
  foreach t in array array['kid_profiles','chores','routines','rewards','completions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format(
      'create policy %1$s_all on public.%1$s for all to authenticated
         using (household_id = public.my_household_id())
         with check (household_id = public.my_household_id())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Chore photo proof (private, family folder only)
insert into storage.buckets (id, name, public)
values ('chore-photos', 'chore-photos', false)
on conflict (id) do nothing;

drop policy if exists "chore photos select" on storage.objects;
create policy "chore photos select" on storage.objects for select to authenticated
  using (bucket_id = 'chore-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "chore photos insert" on storage.objects;
create policy "chore photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chore-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "chore photos delete" on storage.objects;
create policy "chore photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chore-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
