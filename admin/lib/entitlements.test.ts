import { describe, expect, it } from "vitest";
import { ENTITLEMENTS, featureList } from "@/lib/entitlements";
import { checkCanActivateSubscription } from "@/lib/plan-limits";
import { DEFAULT_SETTINGS, effectiveSettings, validateSettingsUpdate } from "@/lib/user-settings";

describe("plan contents (agreed table, no outside services)", () => {
  it("subscription limits: Free 5, Starter 20, Pro unlimited", () => {
    expect(ENTITLEMENTS.free.maxActiveSubscriptions).toBe(5);
    expect(ENTITLEMENTS.starter.maxActiveSubscriptions).toBe(20);
    expect(ENTITLEMENTS.pro.maxActiveSubscriptions).toBeNull();
  });

  it("feature lists for the Plans screen", () => {
    expect(featureList("free")).toEqual(["Track up to 5 subscriptions", "Reminder 1 day before renewal", "This month's total spending"]);
    expect(featureList("starter")).toEqual([
      "Track up to 20 subscriptions",
      "Choose when you're reminded (1 day / 3 days / 7 days before)",
      "Monthly & yearly spending breakdown",
      "One monthly budget with alerts",
    ]);
    expect(featureList("pro")).toEqual([
      "Unlimited subscriptions",
      "Up to 3 reminders per renewal (1 day / 3 days / 7 days before)",
      "Full insights, including spending by category",
      "Budgets for each category",
      "Export your data (CSV)",
    ]);
  });

  it("nothing needing an outside service is offered", () => {
    for (const tier of ["free", "starter", "pro"] as const) {
      expect(featureList(tier).join(" ")).not.toMatch(/SMS|WhatsApp|MWK/);
    }
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

describe("reminder settings", () => {
  it("Free is always reminded 1 day before and can't choose", () => {
    expect(effectiveSettings(null, ENTITLEMENTS.free).reminderDays).toEqual([1]);
    expect(validateSettingsUpdate({ reminderDays: [7] }, ENTITLEMENTS.free, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403, code: "plan_limit" });
  });

  it("Starter chooses one of 1/3/7 days", () => {
    expect(validateSettingsUpdate({ reminderDays: [7] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toEqual({ ok: true, value: { reminderDays: [7] } });
    expect(validateSettingsUpdate({ reminderDays: [1, 7] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
    expect(validateSettingsUpdate({ reminderDays: [14] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
  });

  it("Pro can have up to three reminders", () => {
    expect(validateSettingsUpdate({ reminderDays: [7, 1, 3] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toEqual({ ok: true, value: { reminderDays: [1, 3, 7] } });
  });

  it("after a downgrade, stored choices are kept but only what the plan allows applies", () => {
    expect(effectiveSettings({ reminderDays: [1, 3, 7] }, ENTITLEMENTS.starter)).toEqual({ reminderDays: [1] });
    expect(effectiveSettings({ reminderDays: [3, 7] }, ENTITLEMENTS.free)).toEqual({ reminderDays: [1] });
  });

  it("rejects malformed input", () => {
    expect(validateSettingsUpdate({ reminderDays: [] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
    expect(validateSettingsUpdate({ reminderDays: ["7"] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
  });
});
