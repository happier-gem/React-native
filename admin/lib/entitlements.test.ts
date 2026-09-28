import { describe, expect, it } from "vitest";
import { ENTITLEMENTS, featureList } from "@/lib/entitlements";
import { checkCanActivateSubscription } from "@/lib/plan-limits";

describe("plan contents", () => {
  it("plans differ only in subscription limits: Free 5, Starter 20, Pro unlimited", () => {
    expect(ENTITLEMENTS).toEqual({
      free: { maxActiveSubscriptions: 5 },
      starter: { maxActiveSubscriptions: 20 },
      pro: { maxActiveSubscriptions: null },
    });
  });

  it("feature lists for the Plans screen", () => {
    expect(featureList("free")).toEqual(["Track up to 5 subscriptions"]);
    expect(featureList("starter")).toEqual(["Track up to 20 subscriptions"]);
    expect(featureList("pro")).toEqual(["Unlimited subscriptions"]);
  });
});

describe("subscription limit", () => {
  const deps = (plan: "free" | "starter" | "pro", active: number) => ({
    getPlan: async () => ({ plan }),
    countActive: async () => active,
  });

  it.each([
    ["free", 4, true],
    ["free", 5, false],
    ["starter", 19, true],
    ["starter", 20, false],
    ["pro", 500, true],
  ] as const)("%s with %i active: allowed=%s", async (plan, active, allowed) => {
    expect((await checkCanActivateSubscription("user_a", deps(plan, active))).ok).toBe(allowed);
  });

  it("explains the limit and marks it for an upgrade prompt", async () => {
    expect(await checkCanActivateSubscription("user_a", deps("free", 5))).toEqual({
      ok: false,
      status: 403,
      code: "plan_limit",
      error: "Your Free plan tracks up to 5 active subscriptions. Upgrade your plan to add more.",
    });
  });

  it("a lookup failure refuses safely (500), never silently allows", async () => {
    const failing = { getPlan: async () => ({ plan: "free" as const }), countActive: async () => Promise.reject(new Error("db")) };
    expect(await checkCanActivateSubscription("user_a", failing)).toMatchObject({ ok: false, status: 500 });
  });
});
