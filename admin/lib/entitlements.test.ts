import { describe, expect, it } from "vitest";
import { ENTITLEMENTS, featureList } from "@/lib/entitlements";
import { checkCanActivateSubscription } from "@/lib/plan-limits";
import { DEFAULT_SETTINGS, effectiveSettings, validateSettingsUpdate } from "@/lib/user-settings";

describe("plan contents (agreed table)", () => {
  it("subscription limits: Free 5, Starter 20, Pro unlimited", () => {
    expect(ENTITLEMENTS.free.maxActiveSubscriptions).toBe(5);
    expect(ENTITLEMENTS.starter.maxActiveSubscriptions).toBe(20);
    expect(ENTITLEMENTS.pro.maxActiveSubscriptions).toBeNull();
  });

  it("SMS: Starter and Pro; WhatsApp: Pro only", () => {
    expect([ENTITLEMENTS.free.smsReminders, ENTITLEMENTS.starter.smsReminders, ENTITLEMENTS.pro.smsReminders]).toEqual([false, true, true]);
    expect([ENTITLEMENTS.free.whatsappReminders, ENTITLEMENTS.starter.whatsappReminders, ENTITLEMENTS.pro.whatsappReminders]).toEqual([false, false, true]);
  });

  it("feature lists for the Plans screen", () => {
    expect(featureList("starter")).toEqual([
      "Track up to 20 subscriptions",
      "Choose when you're reminded (1 day / 3 days / 7 days before)",
      "Monthly & yearly spending breakdown",
      "One monthly budget with alerts",
      "SMS reminders",
      "See foreign subscriptions in MWK",
    ]);
    expect(featureList("pro")).toContain("SMS & WhatsApp reminders");
    expect(featureList("pro")).toContain("Export your data (CSV)");
    expect(featureList("free")[0]).toBe("Track up to 5 subscriptions");
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
    expect(validateSettingsUpdate({ reminderDays: [7] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: true, value: { reminderDays: [7] } });
    expect(validateSettingsUpdate({ reminderDays: [1, 7] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
    expect(validateSettingsUpdate({ reminderDays: [14] }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
  });

  it("Pro can have up to three reminders", () => {
    expect(validateSettingsUpdate({ reminderDays: [7, 1, 3] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: true, value: { reminderDays: [1, 3, 7] } });
  });

  it("after a downgrade, stored choices are kept but only what the plan allows applies", () => {
    const stored = { reminderDays: [1, 3, 7], smsReminders: true, whatsappReminders: true, reminderPhone: "0991234567" };
    expect(effectiveSettings(stored, ENTITLEMENTS.starter)).toEqual({ reminderDays: [1], smsReminders: true, whatsappReminders: false, reminderPhone: "0991234567" });
    expect(effectiveSettings(stored, ENTITLEMENTS.free)).toEqual({ reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: "0991234567" });
  });

  it("SMS needs Starter+ and a phone; WhatsApp needs Pro", () => {
    expect(validateSettingsUpdate({ smsReminders: true, reminderPhone: "0991234567" }, ENTITLEMENTS.free, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
    expect(validateSettingsUpdate({ smsReminders: true }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
    expect(validateSettingsUpdate({ smsReminders: true, reminderPhone: "+265 99 123 4567" }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({
      ok: true,
      value: { smsReminders: true, reminderPhone: "0991234567" },
    });
    expect(validateSettingsUpdate({ whatsappReminders: true, reminderPhone: "0991234567" }, ENTITLEMENTS.starter, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 403 });
    expect(validateSettingsUpdate({ whatsappReminders: true, reminderPhone: "0991234567" }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: true });
  });

  it("rejects malformed input", () => {
    expect(validateSettingsUpdate({ reminderDays: [] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
    expect(validateSettingsUpdate({ reminderDays: ["7"] }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
    expect(validateSettingsUpdate({ smsReminders: "yes" }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
    expect(validateSettingsUpdate({ reminderPhone: "12345" }, ENTITLEMENTS.pro, DEFAULT_SETTINGS)).toMatchObject({ ok: false, status: 400 });
  });
});
