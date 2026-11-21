-- =====================================================================
-- Homebase — update 04: choose which calendars appear on the hub's Home
-- screen (all calendars still show on the Calendar screen). Safe to re-run.
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'calendars' and column_name = 'show_on_home') then
    alter table public.calendars add column show_on_home boolean not null default true;
    -- start with work calendars hidden from the Home screen
    update public.calendars set show_on_home = false where is_work;
  end if;
end $$;

-- New work calendars start hidden from Home too
create or replace function public.calendars_home_default()
returns trigger language plpgsql as $$
begin
  if new.is_work then new.show_on_home := false; end if;
  return new;
end $$;
drop trigger if exists calendars_home_default on public.calendars;
create trigger calendars_home_default before insert on public.calendars
  for each row execute function public.calendars_home_default();

-- Any parent in the family can choose what's on the Home screen
create or replace function public.set_calendar_home(p_calendar_id uuid, p_show boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where user_id = auth.uid() and kind = 'parent') then
    raise exception 'Parents only';
  end if;
  update public.calendars set show_on_home = p_show
  where id = p_calendar_id and household_id = public.my_household_id();
end $$;
revoke all on function public.set_calendar_home(uuid, boolean) from public, anon;
grant execute on function public.set_calendar_home(uuid, boolean) to authenticated;
