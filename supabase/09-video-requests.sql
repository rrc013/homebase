-- =====================================================================
-- Homebase — update 09: kids' "I did something good!" video requests.
-- Run AFTER 05. Safe to re-run.
-- =====================================================================

-- allow a new kind of entry: 'request' (a video the kid sends asking for stars)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.completions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.completions drop constraint %I', c);
  end loop;
end $$;
alter table public.completions
  add constraint completions_kind_check check (kind in ('chore','routine','bonus','redeem','request'));

-- private storage for the videos (family folder only, 50 MB max per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('kid-videos', 'kid-videos', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "kid videos select" on storage.objects;
create policy "kid videos select" on storage.objects for select to authenticated
  using (bucket_id = 'kid-videos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "kid videos insert" on storage.objects;
create policy "kid videos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kid-videos' and (storage.foldername(name))[1] = public.my_household_id()::text);
drop policy if exists "kid videos delete" on storage.objects;
create policy "kid videos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kid-videos' and (storage.foldername(name))[1] = public.my_household_id()::text);
