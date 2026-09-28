import "server-only";
import { getEffectiveUserPlan } from "@/lib/user-plans";
import { entitlementsFor, type Entitlements } from "@/lib/entitlements";
import { listSubscriptionsForUser } from "@/lib/subscriptions";
import { computeBudgetViews, listBudgets, type BudgetRecord, type BudgetView } from "@/lib/budgets";

/** The user's plan rules, their budgets, and each budget's current spending. */
export async function loadBudgetState(userId: string): Promise<{
  entitlements: Entitlements;
  records: BudgetRecord[];
  views: BudgetView[];
}> {
  const [plan, records, subs] = await Promise.all([
    getEffectiveUserPlan(userId),
    listBudgets(userId),
    listSubscriptionsForUser(userId),
  ]);
  if (!subs.ok) throw new Error(subs.error);
  const entitlements = entitlementsFor(plan.plan);
  return { entitlements, records, views: computeBudgetViews(records, subs.rows, entitlements) };
}

export const serverError = () =>
  Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
