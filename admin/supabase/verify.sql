-- READ-ONLY post-migration check. Paste into the Supabase SQL editor after
-- running the migrations; changes nothing. Every row should show ok = true —
-- failures sort first. (Also run by admin/lib/database.test.ts.)
with checks(check_name, ok) as (
  values
    -- tables & view
    ('table public.subscriptions exists',      to_regclass('public.subscriptions') is not null),
    ('table public.admin_audit_log exists',    to_regclass('public.admin_audit_log') is not null),
    ('table public.payments exists',           to_regclass('public.payments') is not null),
    ('table public.user_plans exists',         to_regclass('public.user_plans') is not null),
    ('table public.user_plan_events exists',   to_regclass('public.user_plan_events') is not null),
    ('view public.payment_overview exists',    to_regclass('public.payment_overview') is not null),
    ('payment_overview is security_invoker',
      coalesce((select array_to_string(reloptions, ',') like '%security_invoker=true%'
                  from pg_class where oid = to_regclass('public.payment_overview')), false)),

    -- row level security
    ('RLS enabled: subscriptions',    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.subscriptions')), false)),
    ('RLS enabled: admin_audit_log',  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.admin_audit_log')), false)),
    ('RLS enabled: payments',         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.payments')), false)),
    ('RLS enabled: user_plans',       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.user_plans')), false)),
    ('RLS enabled: user_plan_events', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.user_plan_events')), false)),

    -- no table privileges for client-side roles
    ('anon has no access: subscriptions',       not coalesce(has_table_privilege('anon', to_regclass('public.subscriptions'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('anon has no access: admin_audit_log',     not coalesce(has_table_privilege('anon', to_regclass('public.admin_audit_log'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('anon has no access: payments',            not coalesce(has_table_privilege('anon', to_regclass('public.payments'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('anon has no access: user_plans',          not coalesce(has_table_privilege('anon', to_regclass('public.user_plans'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('anon has no access: user_plan_events',    not coalesce(has_table_privilege('anon', to_regclass('public.user_plan_events'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('anon has no access: payment_overview',    not coalesce(has_table_privilege('anon', to_regclass('public.payment_overview'), 'SELECT'), true)),
    ('authenticated has no access: payments',   not coalesce(has_table_privilege('authenticated', to_regclass('public.payments'), 'SELECT,INSERT,UPDATE,DELETE'), true)),
    ('authenticated has no access: user_plans', not coalesce(has_table_privilege('authenticated', to_regclass('public.user_plans'), 'SELECT,INSERT,UPDATE,DELETE'), true)),

    -- plan transition function
    ('function apply_user_plan_transition exists',
      to_regprocedure('public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)') is not null),
    ('function validates payments (phase 6 version)',
      coalesce(pg_get_functiondef(to_regprocedure('public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)')) like '%invalid_payment%', false)),
    ('anon cannot execute apply_user_plan_transition',
      not coalesce(has_function_privilege('anon', to_regprocedure('public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)'), 'EXECUTE'), true)),
    ('authenticated cannot execute apply_user_plan_transition',
      not coalesce(has_function_privilege('authenticated', to_regprocedure('public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)'), 'EXECUTE'), true)),
    ('service_role can execute apply_user_plan_transition',
      coalesce(has_function_privilege('service_role', to_regprocedure('public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)'), 'EXECUTE'), false)),

    -- triggers
    ('trigger payments_enforce_transition',
      exists (select 1 from pg_trigger where tgname = 'payments_enforce_transition' and tgrelid = to_regclass('public.payments'))),
    ('trigger user_plans_set_updated_at',
      exists (select 1 from pg_trigger where tgname = 'user_plans_set_updated_at' and tgrelid = to_regclass('public.user_plans'))),

    -- constraints & indexes
    -- Checked by columns, not name: databases created from older schema.sql
    -- have it auto-named payments_user_id_internal_reference_key.
    ('payments unique (user_id, internal_reference)',
      exists (select 1 from pg_constraint c
               where c.conrelid = to_regclass('public.payments') and c.contype = 'u'
                 and (select array_agg(a.attname::text order by a.attname)
                        from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
                     = array['internal_reference', 'user_id'])),
    ('payments has NO global unique internal_reference (phase 1 leftover)',
      not exists (select 1 from pg_constraint where conname = 'payments_internal_reference_key' and conrelid = to_regclass('public.payments'))),
    ('payments unique provider_reference index',
      coalesce((select indisunique from pg_index where indexrelid = to_regclass('public.payments_provider_reference_unique_idx')), false)),
    ('payments pending index',                 to_regclass('public.payments_pending_created_at_idx') is not null),
    ('user_plans unique user_id',
      exists (select 1 from pg_constraint where conname = 'user_plans_user_id_key' and conrelid = to_regclass('public.user_plans'))),
    ('user_plans period check',
      exists (select 1 from pg_constraint where conname = 'user_plans_period_check' and conrelid = to_regclass('public.user_plans'))),
    ('user_plans pending check',
      exists (select 1 from pg_constraint where conname = 'user_plans_pending_check' and conrelid = to_regclass('public.user_plans'))),
    ('user_plan_events unique payment_id index',
      coalesce((select indisunique from pg_index where indexrelid = to_regclass('public.user_plan_events_payment_id_unique_idx')), false)),
    ('user_plan_events (user_id, created_at) index', to_regclass('public.user_plan_events_user_id_created_at_idx') is not null)
)
select check_name, ok from checks order by ok, check_name;
