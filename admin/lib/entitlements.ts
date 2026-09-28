import type { TierId } from "@/lib/plans";

/**
 * ============================================================================
 * WHAT EACH PLAN INCLUDES — the single source of truth.
 *
 * Agreed with the business on 2026-09-28: the plans differ only in how many
 * active subscriptions a user can track. Everything else is the same for
 * everyone. The limit is enforced on the server (lib/plan-limits.ts); the app
 * only shows it.
 * ============================================================================
 */

export type Entitlements = {
  /** Active subscriptions a user can track. null = unlimited. */
  maxActiveSubscriptions: number | null;
};

export const ENTITLEMENTS: Record<TierId, Entitlements> = {
  free: { maxActiveSubscriptions: 5 },
  starter: { maxActiveSubscriptions: 20 },
  pro: { maxActiveSubscriptions: null },
};

export function entitlementsFor(tier: TierId): Entitlements {
  return ENTITLEMENTS[tier];
}

/** Plain-language feature list for the Plans screen. */
export function featureList(tier: TierId): string[] {
  const max = ENTITLEMENTS[tier].maxActiveSubscriptions;
  return [max === null ? "Unlimited subscriptions" : `Track up to ${max} subscriptions`];
}
