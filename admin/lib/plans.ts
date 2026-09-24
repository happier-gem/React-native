import "server-only";

// No app-plan concept existed anywhere in this codebase before this file —
// confirmed by inspection (no FREE/STARTER/PRO references, no plan table).
// This is the single authoritative source of plan pricing: the server derives
// the amount to charge from here, never from a client-supplied value.

export type PlanId = "starter" | "pro";

export type PlanConfig = {
  id: PlanId;
  name: string;
  /** Whole-unit amount (Malawi Kwacha), not tambala/cents. */
  price: number;
  currency: string;
};

// PLACEHOLDER PRICING — not confirmed by the business. Replace with real,
// approved amounts before any real money flows through this integration.
export const PLANS: Record<PlanId, PlanConfig> = {
  starter: { id: "starter", name: "Starter", price: 2000, currency: "MWK" },
  pro: { id: "pro", name: "Pro", price: 5000, currency: "MWK" },
};

export function getPlan(planId: string): PlanConfig | null {
  return planId === "starter" || planId === "pro" ? PLANS[planId] : null;
}
