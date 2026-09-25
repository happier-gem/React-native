-- Phase 6: payment reliability & database hardening. Safe to run more than
-- once. Run AFTER 20260925000000_user_plans.sql. Changes no existing rows.
--
--   1. payments state machine enforced in the database (not only in app code)
--   2. apply_user_plan_transition() refuses payments that aren't a SUCCESS
--      payment of the same user for the same plan
--   3. payment_overview view for recovery, reconciliation and the admin view
--   4. index for the pending-payment recovery scan
--   5. defense in depth: the publishable/anon and authenticated roles lose all
--      table privileges (RLS with no policies already blocks them; this makes
--      access fail even if a policy were ever added by mistake)

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
