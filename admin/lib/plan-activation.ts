import "server-only";
import type { PaymentRecord } from "@/lib/payments";

/**
 * ============================================================================
 * BILLING/PLAN SERVICE BOUNDARY — intentionally does nothing yet.
 *
 * This is the separation the architecture calls for:
 *   Payment Service (lib/payments.ts) — pure persistence, zero plan business
 *     rules. It knows how to store/transition a payment; it has no idea what
 *     a plan even is.
 *   → Payment SUCCESS (transitionPaymentStatus in lib/payments.ts)
 *   → Billing/Plan Service (this file) — where plan activation/renewal/
 *     upgrade/downgrade/expiry logic will eventually live.
 *
 * SERVER-DRIVEN ONLY: this function is called from exactly one place —
 * admin/app/api/payments/webhook/route.ts, after a signature-verified webhook
 * causes a genuine (non-duplicate) PENDING -> SUCCESS transition. There is no
 * client-callable route that invokes this directly, and there must never be
 * one — a mobile client cannot activate its own plan by calling an endpoint.
 *
 * Inspected before writing this (both in Phase 2 and again now — nothing has
 * changed): there is no existing plan/subscription-tier storage anywhere in
 * this codebase. No FREE/STARTER/PRO column on any user or account record, no
 * plan table, no Clerk publicMetadata field for it (unlike `role`, which does
 * live there). So there is currently nothing to activate a plan *against*,
 * and this function must stay a no-op until the below is decided.
 *
 * OPEN QUESTIONS — need a business decision, not a guess:
 *
 * 1. INITIAL PURCHASE (FREE -> STARTER, or FREE -> PRO)
 *    How long does the plan remain active after one successful payment?
 *    (Implies a billing interval — plans.ts already has `interval: "monthly"`
 *    per plan, but nothing yet reads or acts on it.)
 *
 * 2. UPGRADE (e.g. STARTER -> PRO)
 *    Does the user pay the full Pro amount? A prorated difference? Or does
 *    the upgrade only take effect at their next renewal? Undecided.
 *
 * 3. DOWNGRADE (e.g. PRO -> STARTER)
 *    Immediate, or deferred until the current paid period ends? Undecided.
 *
 * 4. RENEWAL (an existing paid plan is successfully paid again)
 *    Does the new expiry extend from the *current* expiry date, or from the
 *    payment date? These differ whenever someone pays before expiring.
 *    Undecided.
 *
 * 5. EXPIRY (a paid plan's period ends without renewal)
 *    Does the account silently revert to FREE? Become read-only/restricted?
 *    Keep existing data but lose premium features? Undecided — this is a
 *    product decision, not something inferable from the payments table.
 *
 * None of the above is implemented or assumed below. Once answered, this
 * function is the correct place to implement them.
 * ============================================================================
 */
export async function handleSuccessfulPayment(payment: PaymentRecord): Promise<void> {
  console.log(
    `[plan-activation] payment ${payment.id} succeeded (user ${payment.user_id}, plan ${payment.plan}) — ` +
      "activation not yet implemented, see the open questions documented in admin/lib/plan-activation.ts"
  );
}
