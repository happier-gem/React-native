-- Phase 2: finalize the `payments` table (create it if Phase 1's version was
-- never run, or bring it up to spec if it was). Safe to run either way —
-- every statement below is idempotent.
--
-- Assumes public.set_updated_at() already exists (created by schema.sql,
-- already in use by the `subscriptions` table).

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  plan                text not null check (plan in ('starter', 'pro')),
  amount              numeric(12, 2) not null check (amount >= 0),
  currency            text not null default 'MWK',
  provider            text not null check (provider in ('airtel_money', 'tnm_mpamba')),
  phone_number        text not null,
  provider_reference  text,
  internal_reference  text not null,
  status              text not null default 'PENDING' check (status in ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  failure_reason      text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  updated_at          timestamptz not null default now()
);

-- Phase 1 declared internal_reference as globally UNIQUE. That's wrong: it
-- allows two different users' independently-chosen idempotency keys to
-- collide. Drop that constraint if present (Postgres auto-names a single-
-- column inline `unique` as `<table>_<column>_key`) and replace it with
-- per-user uniqueness.
alter table public.payments drop constraint if exists payments_internal_reference_key;
alter table public.payments drop constraint if exists payments_user_internal_reference_key;
alter table public.payments add constraint payments_user_internal_reference_key unique (user_id, internal_reference);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

-- Phase 1 had a plain (non-unique) index on provider_reference. Replace it
-- with a partial unique index: multiple NULLs (not-yet-confirmed payments)
-- are fine, but any reference that IS set must be globally unique.
drop index if exists public.payments_provider_reference_idx;
create unique index if not exists payments_provider_reference_unique_idx
  on public.payments (provider_reference) where provider_reference is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
