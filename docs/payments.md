# Payments, plans & operations

Everything about the paid tiers: how a payment becomes a plan, how failures are
recovered, what operators look at, and what is still open before production.

## Payment flow

```text
Mobile (Plans screen)
  │ POST /api/payments/initiate {plan, provider, phoneNumber, idempotencyKey}
  ▼
Admin/API ── price from admin/lib/plans.ts (never from the client)
  │          creates payments row: PENDING
  │          PaymentProvider.initiateCollection()  → INFI-PAY
  │            accepted  → provider_reference stored, 201
  │            rejected  → FAILED (provider definitely created nothing), 502
  │            uncertain → stays PENDING + flagged, 503 (timeout/5xx: a charge may exist)
  ▼
User approves on their phone
  ▼
Settlement — whichever comes first, both safe to run at once:
  • POST /api/payments/webhook   signature verified → PENDING→SUCCESS/FAILED/CANCELLED
  • recovery job (every 5–10 min) asks INFI-PAY for the status of old PENDING payments
  ▼
SUCCESS → plan activation (admin/lib/plan-activation.ts) — one DB transaction
  ▼
Mobile polls GET /api/payments/[id] (3 s, up to 2 min; then "still being confirmed")
  → on SUCCESS refreshes GET /api/me/plan and shows the server's plan
```

## Payment state machine

```text
PENDING ──▶ SUCCESS
PENDING ──▶ FAILED
PENDING ──▶ CANCELLED
```

- SUCCESS / FAILED / CANCELLED are **final**. Enforced twice: the application only
  updates `where status = 'PENDING'`, and the `payments_enforce_transition`
  trigger rejects any other status change, even from a manual SQL `UPDATE`.
- The trigger also makes `user_id`, `plan`, `amount`, `currency`, `provider`,
  `phone_number` and `internal_reference` immutable, and lets
  `provider_reference` be set once but never reassigned.
- A late or contradictory provider report (e.g. SUCCESS for a payment we have as
  FAILED) is **not applied**. It is stored in `metadata.provider_conflict` and
  shown on the admin Payments page for a human to resolve.
- Our own timers (mobile polling window, pending-age thresholds) **never** change
  a status. Only a verified provider report does.

## Idempotency & concurrency

| Situation | Protection |
|---|---|
| User taps Pay repeatedly | Mobile controller ignores taps while in flight; server reuses a recent PENDING payment for the same user/plan/network/phone. |
| App retries after a network error | Same `idempotencyKey` → unique `(user_id, internal_reference)` returns the existing payment. |
| Same webhook twice / concurrently | Atomic `PENDING`-only update: one delivery transitions, the rest see `alreadyProcessed`. |
| Webhook and recovery at the same time | Same atomic update; both then call activation, which applies once. |
| Two recovery runs at once | Same as above. |
| Activation run twice / concurrently | `user_plan_events.payment_id` is unique and written in the same transaction as the plan change; `user_plans.version` rejects writes based on a stale read. |
| Activation with a bad payment | `apply_user_plan_transition()` itself refuses (`invalid_payment`) any payment that isn't SUCCESS, isn't the same user's, or is for a different plan. |

All of these are enforced by the database, not only by JavaScript, and are
covered by `admin/lib/database.test.ts` (runs the real SQL in PGlite).

## Webhook contract (`POST /api/payments/webhook`)

| Response | When | Provider should |
|---|---|---|
| 401 | Signature missing/invalid (or webhook secret not configured) | not retry |
| 400 | Authentic but malformed (bad JSON, missing reference, >64 KB) | not retry |
| 200 | Processed, duplicate, unknown event type/status (ignored), or unknown reference | stop |
| 503 + `Retry-After: 60` | Our database or activation failed | retry |

INFI-PAY's actual retry behavior is **unknown**. Nothing depends on it: the
recovery job independently asks INFI-PAY about every PENDING payment and retries
activation for every SUCCESS payment without a plan change.

## Pending-payment recovery

`admin/lib/payment-recovery.ts`, triggered by:

- **Schedule:** `GET /api/internal/payments/recover` with
  `Authorization: Bearer $CRON_SECRET` (disabled while `CRON_SECRET` is unset).
  Suggested every 5–10 minutes.
- **Manually:** admin → Payments → *Run recovery now* (audited as `payments.recovery_run`).

Each run:

1. PENDING payments older than `PAYMENT_RECOVERY_MIN_AGE_MINUTES` with a provider
   reference → ask INFI-PAY:
   - SUCCESS → mark SUCCESS → activate plan
   - FAILED / CANCELLED → mark it so
   - PENDING → leave
   - unknown status / provider unavailable → leave, record the check in `metadata.provider_check`
2. SUCCESS payments with no recorded plan change (older than 2 min) → re-run
   activation (idempotent; re-verified by the database).

Payments without a provider reference can't be asked about; reconciliation
flags them for a human.

### Pending policy — PROVISIONAL

| Setting | Default | Meaning |
|---|---|---|
| `PAYMENT_RECOVERY_MIN_AGE_MINUTES` | 10 | Give the webhook this long before asking INFI-PAY. |
| `PAYMENT_PENDING_REVIEW_AFTER_HOURS` | 24 | Flag a still-PENDING payment for manual review. |

Neither ever fails a payment. The right values depend on INFI-PAY's real payment
lifetime/SLA, which is unknown — **business/provider decision required**.

## Reconciliation (admin → Payments)

Read-only. Flags, never fixes:

| Flag | Meaning / what to do |
|---|---|
| Pending too long | Still PENDING after the review threshold. Check the reference with INFI-PAY. |
| Pending without provider reference | Initiation was interrupted or its outcome was uncertain. Search INFI-PAY for our `internal_reference`. |
| Paid but plan not applied | Recovery retries automatically; if it persists, activation is being refused — investigate. |
| Provider disagrees with our status | A verified report contradicted a final status. Our status was not changed. |
| Unknown provider status | INFI-PAY returned a status string we don't recognize (watch). |
| Possible duplicate charge | Same user paid the same plan twice within 10 minutes; both were applied as separate months (watch). |

There is deliberately **no** admin button to grant a plan or force a payment
status. If an operator must correct a record after investigating with INFI-PAY,
do it with reviewed SQL — and note the `payments_enforce_transition` trigger
will refuse moving a final status (by design).

## Plan rules (summary)

Implemented in `admin/lib/plan-rules.ts`. One calendar month per payment (UTC,
end-of-month clamped). Renewal while active extends from the current expiry;
upgrade Starter→Pro starts immediately with no proration/credit; Starter paid
while on Pro is queued behind Pro; an expired plan falls back to FREE (history
kept). The app offers renewal only within 7 days of expiry.

## Database

### Migrations (run in order on an existing database)

| File | What |
|---|---|
| `20260924000000_finalize_payments_table.sql` | Payments table final shape (idempotent — safe to re-run). |
| `20260925000000_user_plans.sql` | `user_plans`, `user_plan_events`, `apply_user_plan_transition()`. |
| `20260926000000_payment_hardening.sql` | Payment state-machine trigger, activation payment guard, `payment_overview` view, pending index, client-role privilege revokes. |

All are idempotent and change no existing rows. A fresh project runs
`schema.sql` instead (it contains all of the above).

### Deployment status (checked 2026-09-26, read-only)

A read-only probe of the configured Supabase project showed:

- `subscriptions`, `admin_audit_log`, `payments` exist (payments has all expected columns).
- `user_plans`, `user_plan_events`, `apply_user_plan_transition()`, `payment_overview` **do not exist** → Phase 4 and Phase 6 migrations **not applied**.
- The publishable key reads `[]` from every table (RLS works), but still holds table
  privileges — removed by the Phase 6 migration.
- Constraint names couldn't be inspected through the REST API; `verify.sql` checks them.

**Nothing has been executed against the real database.** To deploy:

1. Back up (Supabase → Database → Backups, or `pg_dump`).
2. In the SQL editor, run each migration above in order (the first is safe even if already applied).
3. Run `verify.sql`; every row must be `ok = true`.
4. Deploy the admin server **after** the migrations (the plan endpoints and the Payments page need them).

### Security model

- RLS enabled on every table, no policies.
- `anon` / `authenticated` have no table privileges and can't execute the plan function.
- `payment_overview` is `security_invoker`, so it can't bypass table permissions.
- Only the server's secret key (`service_role`) reads/writes, after authorizing
  the request with Clerk (mobile: verified session token; admin: `role: admin`).

## Environment checklist

### Mobile (bundled into the app — public only)

- [ ] `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] `EXPO_PUBLIC_API_BASE_URL` (HTTPS in production)

### Admin/API (server only)

- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- [ ] `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- [ ] `INFI_PAY_API_URL` (https), `INFI_PAY_API_KEY`, `INFI_PAY_WEBHOOK_SECRET`
- [ ] `INFI_PAY_ENVIRONMENT` = `sandbox` or `production` (explicit; never default)
- [ ] `INFI_PAY_TIMEOUT_MS` (optional, default 15000)
- [ ] `CRON_SECRET`
- [ ] `PAYMENT_RECOVERY_MIN_AGE_MINUTES`, `PAYMENT_PENDING_REVIEW_AFTER_HOURS` (provisional)

Missing INFI-PAY config fails closed: initiation returns 503 before creating a
payment, webhooks are rejected, recovery skips provider calls. The admin
Payments page lists missing/invalid variable **names** (never values).

## INFI-PAY integration status

| Area | Status |
|---|---|
| Provider abstraction (`admin/lib/payment-provider.ts`) | Implemented. Nothing outside the adapter reads provider fields. |
| Adapter (`admin/lib/infi-pay.ts`): config, timeouts, fail-closed, uncertain vs rejected | Implemented. |
| Endpoint paths, request/response fields, status strings | **Placeholder** — waiting for official documentation. |
| Webhook header, signature scheme, payload fields | **Placeholder** — waiting for documentation. |
| Retry semantics, payment lifetime/SLA, idempotency of our `reference` | **Unknown** — waiting for documentation. |
| Sandbox & production credentials | **Not available.** |
| Real payment tested end to end | **No.** |

### When the official contract arrives

1. Compare it with `PaymentProvider` (`payment-provider.ts`). Change the interface
   only if the contract genuinely can't fit it.
2. Replace only the `PLACEHOLDER` sections in `infi-pay.ts`.
3. Update `admin/lib/infi-pay.test.ts` and the webhook tests to the real shapes.
4. With **sandbox** credentials (`INFI_PAY_ENVIRONMENT=sandbox`), test: initiation,
   provider response, status lookup, success, failure, cancellation, webhook
   signature, duplicate webhook, delayed webhook, pending recovery — then run
   [the device checklist](device-testing.md).
5. Set the pending-policy values from INFI-PAY's SLA.

## Logging

`admin/lib/payment-log.ts` logs one line per event (`[payments] <event> {...}`)
with only: payment id, provider reference, user id, plan, status, outcome,
reason. The type doesn't allow phone numbers, tokens, secrets or raw provider
bodies. The adapter logs HTTP status codes and error names only. Admin screens
show phone numbers masked to the last 3 digits.

Correlate with `paymentId` (ours) and `providerReference` (INFI-PAY's).

## Business decisions

| Decision | Current value | Status |
|---|---|---|
| Starter price | 2,000 MWK / month | **Provisional** |
| Pro price | 5,000 MWK / month | **Provisional** |
| Upgrade: no proration, no credit | Implemented | **Needs approval** |
| Downgrade: queued behind current plan | Implemented | **Needs approval** |
| Renewal offered in last 7 days only | Implemented (mobile) | **Needs approval** |
| Pending thresholds (10 min / 24 h) | Configurable | **Needs approval + INFI-PAY SLA** |

## Production readiness

| Item | Status |
|---|---|
| Server-authoritative pricing & activation | READY |
| Idempotency & concurrency (DB-enforced) | READY |
| Payment state machine (DB-enforced) | READY — after migration |
| Webhook verification & handling | READY for the placeholder contract; PROVIDER INFORMATION REQUIRED |
| Pending recovery & reconciliation | READY; schedule MANUAL DEPLOYMENT REQUIRED |
| Supabase migrations 20260925/20260926 | MANUAL DEPLOYMENT REQUIRED |
| RLS / privileges | READY — privilege revoke applies with the migration |
| INFI-PAY contract & credentials | PROVIDER INFORMATION REQUIRED — BLOCKED |
| Real device payment test | BLOCKED (needs provider) |
| Prices, upgrade/downgrade/renewal rules, pending policy | BUSINESS DECISION REQUIRED |
| CI | READY — needs the two publishable-key repository secrets; not yet run on GitHub |
