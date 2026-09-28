-- Plan features, stage 2: monthly spending budgets. Safe to run more than
-- once. Changes no existing rows.
--
-- Who may have which budgets is enforced by the server (lib/entitlements.ts):
-- Starter one overall budget, Pro an overall budget plus per-category ones.

create table if not exists public.budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,                              -- Clerk user id
  category       text,                                       -- null = overall budget
  monthly_limit  numeric(12, 2) not null check (monthly_limit > 0),
  currency       text not null default 'MWK',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint budgets_category_check check (category is null or length(btrim(category)) between 1 and 60)
);

-- One overall budget and one per category (case-insensitive) per user.
create unique index if not exists budgets_user_category_unique_idx
  on public.budgets (user_id, lower(coalesce(category, '')));

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;
revoke all on table public.budgets from anon, authenticated;
