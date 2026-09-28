-- Plan features, stage 1: per-user reminder settings. Safe to run more than
-- once. Changes no existing rows (a user with no row gets the defaults).
--
-- What each plan may choose is enforced by the server (lib/entitlements.ts);
-- the constraints below only keep the stored values sane.

create table if not exists public.user_settings (
  user_id             text primary key,                         -- Clerk user id
  -- Days before a renewal to remind; any of 1, 3, 7; at most 3 of them.
  reminder_days       integer[] not null default '{1}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_settings_reminder_days_check
    check (reminder_days <@ array[1, 3, 7] and cardinality(reminder_days) between 1 and 3)
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from anon, authenticated;
