-- Subscription Tracker: run this once in the Supabase SQL editor.
-- Access model: RLS is enabled with NO policies on purpose. Nothing can reach these
-- tables with a publishable/anon key. Only this server (secret key) reads and writes
-- them, and it authorizes every request with Clerk before it does.

create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,                      -- Clerk user id, e.g. user_2abc...
  name          text not null,
  icon          text,                               -- brand icon key used by the mobile app, e.g. 'spotify'
  brand_color   text,
  price         numeric(12, 2) not null check (price >= 0),
  currency      text not null default 'USD',
  cycle         text not null check (cycle in ('monthly', 'yearly')),
  category      text not null default 'Other',
  renewal_date  date not null,
  status        text not null default 'active' check (status in ('active', 'canceled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_renewal_date_idx on public.subscriptions (renewal_date);
create index subscriptions_created_at_idx on public.subscriptions (created_at desc);

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  text not null,                     -- the admin who did it
  action         text not null,                     -- e.g. 'user.ban', 'user.unban', 'user.delete'
  target_user_id text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.subscriptions enable row level security;
alter table public.admin_audit_log enable row level security;

-- Payments for the app's own Starter/Pro plans (INFI-PAY), NOT the individual
-- subscriptions users track (that's the `subscriptions` table above).
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,                               -- Clerk user id
  plan                text not null check (plan in ('starter', 'pro')),
  amount              numeric(12, 2) not null check (amount >= 0),  -- server-derived, never client-supplied
  currency            text not null default 'MWK',
  provider            text not null check (provider in ('airtel_money', 'tnm_mpamba')),
  phone_number        text not null,
  provider_reference  text,                                        -- INFI-PAY's transaction reference; globally unique once set
  internal_reference  text not null,                                -- our own idempotency reference; unique per user, not globally
  status              text not null default 'PENDING' check (status in ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  failure_reason      text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  updated_at          timestamptz not null default now(),
  -- Per-user uniqueness, not global: a client-supplied idempotency key is
  -- only meaningful scoped to its own user, otherwise two different users
  -- independently choosing the same key string would collide.
  unique (user_id, internal_reference)
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_status_idx on public.payments (status);
create index payments_created_at_idx on public.payments (created_at desc);
-- Partial (not the whole-column) so multiple NULLs (not-yet-confirmed
-- payments) are allowed, but any reference that IS set must be globally
-- unique — this one really is global, unlike internal_reference above.
create unique index payments_provider_reference_unique_idx
  on public.payments (provider_reference) where provider_reference is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- ---------------------------------------------------------------------------
-- App subscription tiers (FREE/STARTER/PRO). Identical to
-- migrations/20260925000000_user_plans.sql, which is what existing databases
-- should run instead.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Payment reliability & hardening. Identical to
-- migrations/20260926000000_payment_hardening.sql, which is what existing
-- databases should run instead.
-- ---------------------------------------------------------------------------
-- 1. -------------------------------------------------------------------------
-- PENDING -> SUCCESS | FAILED | CANCELLED only; final statuses never change.
-- Money/identity columns are immutable once written, and a provider reference
-- can be set once but never reassigned.
create or replace function public.enforce_payment_transition() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.plan is distinct from old.plan
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider
     or new.phone_number is distinct from old.phone_number
     or new.internal_reference is distinct from old.internal_reference then
    raise exception 'payments %: user, plan, amount, currency, provider, phone and internal_reference are immutable', old.id
      using errcode = 'check_violation';
  end if;

  if old.provider_reference is not null and new.provider_reference is distinct from old.provider_reference then
    raise exception 'payments %: provider_reference cannot change once set', old.id
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status and old.status <> 'PENDING' then
    raise exception 'payments %: % is a final status and cannot become %', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_transition on public.payments;
create trigger payments_enforce_transition
  before update on public.payments
  for each row execute function public.enforce_payment_transition();

-- 2. -------------------------------------------------------------------------
-- Same signature as before (so existing grants are kept); adds one guard in
-- front of the write. Every history event that cites a payment must cite a
-- SUCCESS payment belonging to p_user_id, for the plan the event moves to; the
-- state's current and queued payments must be SUCCESS payments of the user.
-- A FAILED/CANCELLED/PENDING payment, or someone else's, can never activate,
-- renew, upgrade or queue a plan — whatever the application code does.
create or replace function public.apply_user_plan_transition(
  p_user_id            text,
  p_expected_version   integer,
  p_plan               text,
  p_status             text,
  p_started_at         timestamptz,
  p_expires_at         timestamptz,
  p_payment_id         uuid,
  p_previous_plan      text,
  p_pending_plan       text,
  p_pending_months     integer,
  p_pending_payment_id uuid,
  p_events             jsonb
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  if exists (
    select 1
      from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as e(payment_id uuid, to_plan text)
      left join public.payments p on p.id = e.payment_id
     where e.payment_id is not null
       and (p.id is null or p.status <> 'SUCCESS' or p.user_id <> p_user_id or p.plan is distinct from e.to_plan)
  ) or exists (
    select 1
      from (values (p_payment_id), (p_pending_payment_id)) as s(payment_id)
      left join public.payments p on p.id = s.payment_id
     where s.payment_id is not null
       and (p.id is null or p.status <> 'SUCCESS' or p.user_id <> p_user_id)
  ) then
    return 'invalid_payment';
  end if;

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
  when unique_violation then
    return 'duplicate';
end;
$$;

-- Re-assert (create or replace keeps grants, but be explicit).
revoke all on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) from public;
revoke all on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb) to service_role;

-- 3. -------------------------------------------------------------------------
-- security_invoker: the view runs with the caller's privileges, so it can't
-- become a side door around the tables' RLS/grants.
create or replace view public.payment_overview
with (security_invoker = true) as
select p.*,
       exists (select 1 from public.user_plan_events e where e.payment_id = p.id) as plan_applied
  from public.payments p;

revoke all on public.payment_overview from public;
revoke all on public.payment_overview from anon, authenticated;
grant select on public.payment_overview to service_role;

-- 4. -------------------------------------------------------------------------
create index if not exists payments_pending_created_at_idx
  on public.payments (created_at) where status = 'PENDING';

-- 5. -------------------------------------------------------------------------
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.user_plans from anon, authenticated;
revoke all on table public.user_plan_events from anon, authenticated;

-- RLS stays enabled on every table (no policies = no row access for any
-- non-service role). Re-asserted in case an earlier step was skipped.
alter table public.subscriptions enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.payments enable row level security;
alter table public.user_plans enable row level security;
alter table public.user_plan_events enable row level security;
