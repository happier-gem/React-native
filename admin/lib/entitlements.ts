import type { TierId } from "@/lib/plans";

/**
 * ============================================================================
 * WHAT EACH PLAN INCLUDES — the single source of truth.
 *
 * Agreed with the business on 2026-09-28: only features that need no outside
 * service (no SMS/WhatsApp, no exchange-rate feed). Every limit is enforced on
 * the server; the app only reads these to decide what to show. Change a rule
 * here and it changes everywhere.
 * ============================================================================
 */

export type InsightsLevel = "basic" | "breakdown" | "full";
export type BudgetLevel = "none" | "overall" | "per_category";

export type Entitlements = {
  /** Active subscriptions a user can track. null = unlimited. */
  maxActiveSubscriptions: number | null;
  /** Days-before-renewal the user may choose reminders for. */
  reminderDayOptions: number[];
  /** How many of those reminder days can be active at once. */
  maxRemindersPerSubscription: number;
  insights: InsightsLevel;
  budgets: BudgetLevel;
  export: boolean;
};

export const ENTITLEMENTS: Record<TierId, Entitlements> = {
  free: {
    maxActiveSubscriptions: 5,
    reminderDayOptions: [1],
    maxRemindersPerSubscription: 1,
    insights: "basic",
    budgets: "none",
    export: false,
  },
  starter: {
    maxActiveSubscriptions: 20,
    reminderDayOptions: [1, 3, 7],
    maxRemindersPerSubscription: 1,
    insights: "breakdown",
    budgets: "overall",
    export: false,
  },
  pro: {
    maxActiveSubscriptions: null,
    reminderDayOptions: [1, 3, 7],
    maxRemindersPerSubscription: 3,
    insights: "full",
    budgets: "per_category",
    export: true,
  },
};

export function entitlementsFor(tier: TierId): Entitlements {
  return ENTITLEMENTS[tier];
}

/** Plain-language feature list for the Plans screen. */
export function featureList(tier: TierId): string[] {
  const e = ENTITLEMENTS[tier];
  const days = (list: number[]) => list.map((d) => `${d} day${d === 1 ? "" : "s"}`).join(" / ");
  return [
    e.maxActiveSubscriptions === null ? "Unlimited subscriptions" : `Track up to ${e.maxActiveSubscriptions} subscriptions`,
    e.maxRemindersPerSubscription > 1
      ? `Up to ${e.maxRemindersPerSubscription} reminders per renewal (${days(e.reminderDayOptions)} before)`
      : e.reminderDayOptions.length > 1
        ? `Choose when you're reminded (${days(e.reminderDayOptions)} before)`
        : `Reminder ${days(e.reminderDayOptions)} before renewal`,
    e.insights === "full"
      ? "Full insights, including spending by category"
      : e.insights === "breakdown"
        ? "Monthly & yearly spending breakdown"
        : "This month's total spending",
    ...(e.budgets === "per_category" ? ["Budgets for each category"] : e.budgets === "overall" ? ["One monthly budget with alerts"] : []),
    ...(e.export ? ["Export your data (CSV)"] : []),
  ];
}
