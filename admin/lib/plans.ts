import "server-only";

// No app-plan concept existed anywhere in this codebase before this file —
// confirmed by inspection (no FREE/STARTER/PRO references, no plan table, no
// plan-related Clerk publicMetadata). This is the single authoritative source
// of plan pricing: the server derives the amount to charge from here, never
// from a client-supplied value.

/** Paid plans only — matches the `payments` table's `plan` check constraint.
 * FREE needs no payment record at all, so it's intentionally not part of this
 * union; see FREE_PLAN below for its (price-less) identity. */
export type PlanId = "starter" | "pro";

export type BillingInterval = "monthly";

export type PlanConfig = {
  id: PlanId;
  name: string;
  /** Whole-unit amount (Malawi Kwacha), not tambala/cents. */
  price: number;
  currency: string;
  interval: BillingInterval;
};

// ============================================================================
// PLACEHOLDER / DEVELOPMENT PRICING ONLY.
// These amounts are NOT approved by the business and must not be treated as
// real commercial pricing. They exist so the payment pipeline has something
// concrete to compute against during development. Replace with real,
// business-approved amounts before any real money flows through this.
// ============================================================================
export const PLANS: Record<PlanId, PlanConfig> = {
  starter: { id: "starter", name: "Starter", price: 2000, currency: "MWK", interval: "monthly" },
  pro: { id: "pro", name: "Pro", price: 5000, currency: "MWK", interval: "monthly" },
};

/** How long one successful payment buys, in calendar months (see addMonths()
 * in lib/plan-rules.ts for the month arithmetic). Every paid plan is monthly. */
export const PAID_PERIOD_MONTHS = 1;

/** FREE is the default, unpaid tier — always available, never expires. Not
 * part of PlanId since it never generates a payment record. */
export const FREE_PLAN = { id: "free" as const, name: "Free", price: 0, currency: "MWK" };

/** Any tier a user can be on, including the unpaid default. */
export type TierId = typeof FREE_PLAN.id | PlanId;

/** Ordering used to tell an upgrade from a downgrade. Higher = more features. */
export const TIER_RANK: Record<TierId, number> = { free: 0, starter: 1, pro: 2 };

export function getPlan(planId: string): PlanConfig | null {
  return planId === "starter" || planId === "pro" ? PLANS[planId] : null;
}

/** Public catalog for clients: every tier with its server-side price. Display
 * only — the price actually charged is still derived from PLANS at initiation. */
export function listAvailablePlans() {
  return [
    { id: FREE_PLAN.id as TierId, name: FREE_PLAN.name, price: FREE_PLAN.price, currency: FREE_PLAN.currency, interval: null },
    ...Object.values(PLANS).map((plan) => ({
      id: plan.id as TierId,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval as BillingInterval | null,
    })),
  ];
}
