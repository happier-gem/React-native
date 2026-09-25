-- Phase 4: the app's own subscription tiers (FREE / STARTER / PRO), activated
-- by verified INFI-PAY payments. Safe to run more than once — every statement
-- is idempotent.
--
-- Assumes public.payments and public.set_updated_at() already exist (schema.sql
-- plus 20260924000000_finalize_payments_table.sql).
--
-- Existing users need no backfill: a user with no user_plans row is FREE. Only
-- a paid period ever creates a row, so nothing here touches existing data.

-- One row per user who has ever had paid access: their current (or most
-- recent) paid period. Plan ids are lowercase to match payments.plan.
create table if not exists public.user_plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null unique,                        -- Clerk user id; unique => also the user_id index
  plan                text not null check (plan in ('starter', 'pro')),
  status              text not null default 'ACTIVE' check (status in ('ACTIVE', 'EXPIRED')),
  started_at          timestamptz not null,
  expires_at          timestamptz not null,
  payment_id          uuid references public.payments (id) on delete restrict,  -- payment behind the current period
  previous_plan       text check (previous_plan in ('free', 'starter', 'pro')),
  -- A paid downgrade queued behind the current period (see lib/plan-rules.ts).
  pending_plan        text check (pending_plan in ('starter', 'pro')),
  pending_months      integer not null default 0 check (pending_months >= 0),
  pending_payment_id  uuid references public.payments (id) on delete restrict,
  -- Optimistic-concurrency counter: every write must name the version it read.
  version             integer not null default 1 check (version >= 1),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_plans_period_check check (expires_at > started_at),
  constraint user_plans_pending_check check ((pending_plan is null) = (pending_months = 0))
);

drop trigger if exists user_plans_set_updated_at on public.user_plans;
create trigger user_plans_set_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

alter table public.user_plans enable row level security;

-- Append-only history of every plan change. Also the idempotency ledger: a
-- payment can appear here at most once, so a replayed webhook can never
-- activate or extend a plan twice.
create table if not exists public.user_plan_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  event         text not null check (event in ('activated', 'renewed', 'upgraded', 'downgrade_scheduled', 'downgrade_applied', 'expired')),
  payment_id    uuid references public.payments (id) on delete restrict,
  from_plan     text check (from_plan in ('free', 'starter', 'pro')),
  to_plan       text check (to_plan in ('free', 'starter', 'pro')),
  period_start  timestamptz,
  period_end    timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists user_plan_events_payment_id_unique_idx
  on public.user_plan_events (payment_id) where payment_id is not null;
create index if not exists user_plan_events_user_id_created_at_idx
  on public.user_plan_events (user_id, created_at desc);

alter table public.user_plan_events enable row level security;

-- The ONLY write path for plan state. Supabase's REST API has no multi-
-- statement transactions, so the state row and its history events are written
-- here, atomically:
--   'applied'   state + events committed together
--   'conflict'  someone else changed the row since it was read (version
--               mismatch, or a concurrent first insert) — caller re-reads and
--               recomputes
--   'duplicate' one of the events' payment_id was already recorded — the
--               payment was already applied; nothing was written
-- The plan rules themselves (dates, renewal, upgrade...) are computed by the
-- server in lib/plan-rules.ts and passed in; this function only guarantees
-- they're applied exactly once and never on top of a stale read.
create or replace function public.apply_user_plan_transition(
  p_user_id            text,
  p_expected_version   integer,          -- 0 = the caller saw no row yet
  p_plan               text,
  p_status             text,
  p_started_at         timestamptz,
  p_expires_at         timestamptz,
  p_payment_id         uuid,
  p_previous_plan      text,
  p_pending_plan       text,
  p_pending_months     integer,
  p_pending_payment_id uuid,
  p_events             jsonb             -- [{event, payment_id, from_plan, to_plan, period_start, period_end}]
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_expected_version = 0 then
    insert into public.user_plans
      (user_id, plan, status, started_at, expires_at, payment_id, previous_plan,
       pending_plan, pending_months, pending_payment_id, version)
    values
      (p_user_id, p_plan, p_status, p_started_at, p_expires_at, p_payment_id, p_previous_plan,
       p_pending_plan, p_pending_months, p_pending_payment_id, 1)
    on conflict (user_id) do nothing;
  else
    update public.user_plans
       set plan = p_plan,
           status = p_status,
           started_at = p_started_at,
           expires_at = p_expires_at,
           payment_id = p_payment_id,
           previous_plan = p_previous_plan,
           pending_plan = p_pending_plan,
           pending_months = p_pending_months,
           pending_payment_id = p_pending_payment_id,
           version = version + 1
     where user_id = p_user_id
       and version = p_expected_version;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'conflict';
  end if;

  insert into public.user_plan_events (user_id, event, payment_id, from_plan, to_plan, period_start, period_end)
  select p_user_id, e.event, e.payment_id, e.from_plan, e.to_plan, e.period_start, e.period_end
    from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
      as e(event text, payment_id uuid, from_plan text, to_plan text, period_start timestamptz, period_end timestamptz);

  return 'applied';
exception
  -- Raised by user_plan_events_payment_id_unique_idx; the exception block
  -- rolls back the state change above too.
  when unique_violation then
    return 'duplicate';
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase exposes
-- public-schema functions over its REST API. Without this, anyone holding the
-- publishable key could try to call it. Only the server's secret key
-- (service_role) may.
revoke all on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) from public;
revoke all on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) to service_role;
