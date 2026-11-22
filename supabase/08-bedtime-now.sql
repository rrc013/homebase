-- =====================================================================
-- Homebase — update 08: "Start bedtime now" button for the kid's Buddy.
-- Run AFTER 05. Safe to re-run.
-- =====================================================================
-- the date a grown-up started bedtime early (cleared automatically by the next day)
alter table public.kid_profiles add column if not exists bedtime_now date;
