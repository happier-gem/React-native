# Device payment test checklist

Run on a real Android phone (then iOS if targeted) against a **sandbox** INFI-PAY
configuration (`INFI_PAY_ENVIRONMENT=sandbox`). Blocked until INFI-PAY sandbox
credentials and documentation exist — see [payments.md](payments.md#infi-pay-integration-status).

## Before you start

- [ ] Migrations applied and `admin/supabase/verify.sql` all `ok = true`.
- [ ] Admin server deployed/running with sandbox INFI-PAY variables and `CRON_SECRET`; admin → Payments shows "Configured · SANDBOX".
- [ ] Webhook URL registered with INFI-PAY sandbox.
- [ ] Recovery scheduled (or be ready to press *Run recovery now*).
- [ ] App built with `EXPO_PUBLIC_API_BASE_URL` pointing at that server.
- [ ] A test user on **Free** (no row in `user_plans`), and a sandbox phone number.
- [ ] Note the time; you'll match log lines by payment id.

## Happy path — Starter (then repeat for Pro)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 1 | Free user opens Settings → Plan | Row shows "Free · Upgrade"; Plans screen opens | |
| 2 | Plans shows current plan | "FREE — Choose a plan below…" | |
| 3 | Tap **Upgrade** on Starter | Confirmation: Starter, 2,000 MWK, Monthly, explanation | |
| 4 | Choose provider, enter phone | Continue enabled only for a valid Malawi number | |
| 5 | Tap **Continue to payment** once, then again quickly | Single "Starting payment…", then "Payment pending"; admin shows **one** PENDING payment | |
| 6 | Approve the prompt on the phone | — | |
| 7 | Confirmation observed | "Payment successful! Your Starter plan is active until …" | |
| 8 | Plan changed | Plans header shows STARTER with the right date | |
| 9 | Settings | "Starter · Active until <date>" | |
| 10 | Admin → Users → user | Plan: Starter, dates, latest payment, history "Activated" | |
| 11 | Admin → Payments | SUCCESS, provider ref set, Plan applied: Yes, no reconcile flags | |
| 12 | Kill and reopen the app | Still Starter | |

Repeat with **Pro** from Free, then **Starter → Pro** (upgrade: Pro starts
immediately), then **Pro → Starter** (Starter shown as scheduled, Pro kept).

## Failure paths

| Scenario | How | Expected |
|---|---|---|
| Failed payment | Decline / insufficient funds | "Payment failed — Your plan has not been changed"; admin FAILED, no plan change |
| Cancelled payment | Cancel on the phone | "Payment cancelled"; admin CANCELLED |
| Interrupted | Airplane mode right after "Continue" | Error with "Try again"; retry does **not** create a second payment (same idempotency key) |
| App closed during payment | Start, approve on phone, force-close app before success | Reopen → Plans screen resumes/checks the payment and shows the result; plan correct |
| Delayed confirmation | Approve after >2 minutes | App says "still being confirmed" (not failed); later webhook or recovery settles it; reopening shows the new plan |
| Webhook never arrives | Temporarily unregister the webhook | Recovery (scheduled or *Run recovery now*) settles the payment and activates the plan |
| Provider down | Wrong `INFI_PAY_API_URL` on a test deployment | "Payment provider is temporarily unavailable"; admin flags "Pending without provider reference" |

After each scenario check admin → Payments for unexpected reconcile flags, and
the server logs for `[payments]` lines with that payment id — no phone numbers
or secrets should appear in them.
