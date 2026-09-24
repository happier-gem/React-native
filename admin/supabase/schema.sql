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
