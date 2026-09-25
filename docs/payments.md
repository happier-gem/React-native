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

Register it in the INFI-PAY dashboard (Webhooks) for `payment.success` and
`payment.failed`. INFI-PAY signs every delivery with `X-Signature` =
hex HMAC-SHA256 of the raw body, and retries with backoff unless it gets a 2xx
within 15 s.

**A verified webhook is a prompt, not the truth.** INFI-PAY's documented payload
(`{ event, data: { transactionId, amount, currency, status, provider, externalRef } }`)
does not include the reference we sent, so it can't always be tied to one of our
payments. After verifying the signature the route answers 200 immediately and,
in the background (`after()`), asks INFI-PAY for the real status
(`GET /payments/transaction-status/:reference`) of the matching payment — or of
the 25 most recent PENDING payments when it can't be matched — and settles them
through the same code as scheduled recovery.

| Response | When |
|---|---|
| 401 | Signature missing/invalid, or the webhook secret isn't configured |
| 400 | Authentic but malformed (not JSON, no `event`/`data`, > 64 KB) |
| 200 `{accepted: true}` | Verified `payment.success`/`payment.failed` — re-check scheduled |
| 200 | `payment.pending`, or an event we don't use (`payout.*`, `refund.*`, unknown) |

If the background work fails, scheduled recovery settles the payment later.

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

Built from INFI-PAY's API documentation (base URL `https://api.infi-pay.com/api/v1`).

| Area | Status |
|---|---|
| Auth (`x-api-key`, scopes `payments.initiate` + `payments.read`) | Implemented |
| Response envelope `{success, data}` / `{success:false, error}` | Implemented |
| `POST /payments/collections` (airtel / mpamba, reference, amount, currency, phone) | Implemented |
| `GET /payments/transaction-status/:reference` | Implemented |
| Statuses pending/processing/success/failed/expired/cancelled/refunded | Implemented (expired → FAILED; refunded → flagged, never applied) |
| Phone prefixes (Airtel 099/098, Mpamba 088/089) | Implemented, server and app |
| Idempotent `reference` | Relied on: our payment id is the reference; uncertain initiations are resent with it |
| Webhook X-Signature + payload + retry | Implemented; payload used only as a trigger |
| SUCCESS amount/currency must match our record | Implemented (mismatch → flagged, not applied) |
| Sandbox / credentials | **Not available** — nothing has been sent to INFI-PAY |
| Real payment tested end to end | **No** |

### Questions for INFI-PAY (not answered by the docs)

1. **Webhook reference:** can the webhook payload include the `reference` we sent?
   (It currently only has `transactionId`/`externalRef`, which we can't look up with
   an API key.) Works without it — but with it, each event re-checks one payment
   instead of scanning recent ones.
2. **"completed" vs "success":** the transaction-status example returns
   `"completed"`; the status list says `"success"`. Which is real? (Both are accepted.)
3. **Sandbox:** is there a sandbox base URL and test keys (`sk_test_…`?) and test
   phone numbers that simulate success/failure/cancel/timeout?
4. **Unknown reference:** what does `transaction-status` return for a reference it
   has never seen (404?).
5. **Reference rules:** maximum length / allowed characters? (We send a UUID, 36 chars.)
   Is uniqueness per merchant account, forever?
6. **Phone format:** is `+265…` accepted, or only `0…`? (We send `0…`.)
7. **Pending lifetime:** how long before an unconfirmed USSD collection becomes `expired`?
8. **Refunds:** does a refund change the original collection's status to `refunded`?
9. **Webhook retries:** for how long, and from which IP addresses?
10. **Rate limits:** the numbers for collections and transaction-status.
11. **Amounts:** are decimals allowed for MWK?

### Going live

1. Create an API key with only `payments.initiate` + `payments.read`; put it in
   `admin/.env.local` / the host's env (never in code, chat or the mobile app).
2. Register the webhook (HTTPS, public) for `payment.success` and `payment.failed`;
   store the secret as `INFI_PAY_WEBHOOK_SECRET`.
3. Test with sandbox credentials first (`INFI_PAY_ENVIRONMENT=sandbox`; a `sk_live_`
   key is refused in sandbox mode), then run [the device checklist](device-testing.md).
4. Set the pending-policy values from INFI-PAY's answer to question 7.

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
| Webhook verification & handling | READY against the documented contract; untested live |
| Pending recovery & reconciliation | READY; schedule MANUAL DEPLOYMENT REQUIRED |
| Supabase migrations 20260925/20260926 | MANUAL DEPLOYMENT REQUIRED |
| RLS / privileges | READY — privilege revoke applies with the migration |
| INFI-PAY integration | Implemented from docs; credentials + answers to the open questions REQUIRED |
| Real device payment test | BLOCKED (needs provider) |
| Prices, upgrade/downgrade/renewal rules, pending policy | BUSINESS DECISION REQUIRED |
| CI | READY — needs the two publishable-key repository secrets; not yet run on GitHub |
