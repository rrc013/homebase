-- =====================================================================
-- Homebase — update 06: phone notifications (task assigned, reminders due,
-- kid needs approval). Run AFTER 05. Safe to re-run.
-- =====================================================================
create extension if not exists pgcrypto;

-- Each phone that turned notifications on
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists ps_own on public.push_subscriptions;
create policy ps_own on public.push_subscriptions for all to authenticated
  using (member_id = public.my_member_id())
  with check (member_id = public.my_member_id() and household_id = public.my_household_id());
grant select, insert, delete on public.push_subscriptions to authenticated;

-- Server-only settings (notification keys). The app can never read these.
create table if not exists public.app_secrets (
  key    text primary key,
  value  text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from authenticated, anon;
insert into public.app_secrets (key, value)
values ('cron_key', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Remember which reminders were already sent; changing the time re-arms it
alter table public.list_items add column if not exists reminded_at timestamptz;
create or replace function public.list_items_rearm_reminder()
returns trigger language plpgsql as $$
begin
  if new.due_at is distinct from old.due_at then new.reminded_at := null; end if;
  return new;
end $$;
drop trigger if exists list_items_rearm_reminder on public.list_items;
create trigger list_items_rearm_reminder before update on public.list_items
  for each row execute function public.list_items_rearm_reminder();
