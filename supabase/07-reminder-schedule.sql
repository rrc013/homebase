-- =====================================================================
-- Homebase — update 07: check for due reminders every minute.
-- BEFORE RUNNING: replace YOUR-PROJECT-URL below with your Supabase
-- Project URL (the same one in js/config.js, e.g. https://abcd1234.supabase.co).
-- Run AFTER 06 and after the "notify" function is deployed. Safe to re-run.
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'homebase-reminders';

select cron.schedule(
  'homebase-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'YOUR-PROJECT-URL/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.app_secrets where key = 'cron_key')
    ),
    body    := '{"action":"due"}'::jsonb
  );
  $$
);
