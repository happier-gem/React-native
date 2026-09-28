import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEffectiveUserPlan } from "@/lib/user-plans";
import { entitlementsFor } from "@/lib/entitlements";
import { FREE_PLAN, getPlan } from "@/lib/plans";

export type LimitCheck = { ok: true } | { ok: false; status: 403 | 500; error: string; code?: "plan_limit" };

export type LimitDeps = {
  getPlan: (userId: string) => Promise<{ plan: "free" | "starter" | "pro" }>;
  countActive: (userId: string) => Promise<number>;
};

const defaultDeps: LimitDeps = {
  getPlan: (userId) => getEffectiveUserPlan(userId),
  async countActive(userId) {
    const { count, error } = await supabaseAdmin()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};

/**
 * May this user have one more ACTIVE subscription? Checked before creating a
 * subscription and before re-activating a cancelled one. Existing
 * subscriptions are never removed — after a downgrade a user just can't add
 * more until they're under the limit.
 */
export async function checkCanActivateSubscription(userId: string, deps: LimitDeps = defaultDeps): Promise<LimitCheck> {
  try {
    const { plan } = await deps.getPlan(userId);
    const limit = entitlementsFor(plan).maxActiveSubscriptions;
    if (limit === null) return { ok: true };
    if ((await deps.countActive(userId)) < limit) return { ok: true };
    const name = plan === "free" ? FREE_PLAN.name : (getPlan(plan)?.name ?? plan);
    return {
      ok: false,
      status: 403,
      code: "plan_limit",
      error: `Your ${name} plan tracks up to ${limit} active subscriptions. Upgrade your plan to add more.`,
    };
  } catch (e) {
    console.error("[plan-limits]", e instanceof Error ? e.message : e);
    return { ok: false, status: 500, error: "Something went wrong on our end. Please try again." };
  }
}
