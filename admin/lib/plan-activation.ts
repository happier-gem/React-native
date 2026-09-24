import "server-only";
import type { PaymentRecord } from "@/lib/payments";

/**
 * ============================================================================
 * INTEGRATION POINT FOR A LATER PHASE — intentionally does nothing yet.
 *
 * Inspected before writing this: there is no existing plan/subscription-tier
 * storage anywhere in this codebase. No FREE/STARTER/PRO column on any user
 * or account record, no plan table, no Clerk publicMetadata field for it
 * (unlike `role`, which does live in publicMetadata). So there is currently
 * nothing to activate a plan *against*.
 *
 * Before this function can do anything real, later phases need to decide and
 * implement (none of which this phase invents):
 *   - Where a user's current plan is stored (a new table, e.g.
 *     `user_plans(user_id, plan, expires_at)`, vs. Clerk publicMetadata like
 *     `role` uses — has different tradeoffs since publicMetadata isn't
 *     queryable/joinable the way a Supabase table is).
 *   - How expiration is represented and checked (a timestamp column read on
 *     each request, vs. a scheduled job that downgrades expired plans).
 *   - How renewal works — does a renewal payment extend from the current
 *     expiry, or from the payment date (matters if the user pays early)?
 *   - How an upgrade (Starter -> Pro) should behave — immediate switch,
 *     proration, or effective at the next renewal?
 *   - How a downgrade should behave — immediate, or deferred to the end of
 *     the current paid period?
 *   - What an expired plan means functionally (feature gating? read-only
 *     mode? silent revert to FREE?) — this is a product decision, not
 *     something to infer from the payments table alone.
 *
 * This function is wired up from the webhook handler (called exactly once,
 * only on the delivery that actually transitions a payment to SUCCESS — never
 * on a duplicate/replayed webhook) so the call site already exists and is
 * correct. It currently only logs, and must stay a no-op until the above is
 * designed and approved.
 * ============================================================================
 */
export async function handleSuccessfulPayment(payment: PaymentRecord): Promise<void> {
  console.log(
    `[plan-activation] payment ${payment.id} succeeded (user ${payment.user_id}, plan ${payment.plan}) — ` +
      "activation not yet implemented, see admin/lib/plan-activation.ts"
  );
}
