import { describe, expect, it } from "vitest";
import { ENTITLEMENTS } from "@/lib/entitlements";
import { computeBudgetViews, validateBudget, type BudgetRecord } from "@/lib/budgets";
import { csvCell, subscriptionsToCsv } from "@/lib/csv-export";
import type { SubscriptionRecord } from "@/lib/subscriptions";

const sub = (name: string, category: string, price: number, extra: Partial<SubscriptionRecord> = {}) =>
  ({ name, category, price, currency: "MWK", cycle: "monthly", status: "active", ...extra }) as SubscriptionRecord;

const SUBS = [
  sub("Netflix", "Entertainment", 6000),
  sub("Showmax", "entertainment", 3000), // case-insensitive match
  sub("Spotify", "Music", 1200),
  sub("Adobe", "Design", 120_000, { cycle: "yearly" }), // 10,000 / month
  sub("Old", "Music", 9999, { status: "canceled" }), // not counted
  sub("Figma", "Design", 15, { currency: "USD" }), // other currency: not counted in MWK budgets
];

const overall: BudgetRecord = { id: "b1", category: null, monthly_limit: 25_000, currency: "MWK" };
const ent: BudgetRecord = { id: "b2", category: "Entertainment", monthly_limit: 10_000, currency: "MWK" };
const music: BudgetRecord = { id: "b3", category: "Music", monthly_limit: 1_000, currency: "MWK" };

describe("budget spending", () => {
  it("sums monthly cost of active subscriptions in the budget's currency (and category)", () => {
    const views = computeBudgetViews([overall, ent, music], SUBS, ENTITLEMENTS.pro);
    expect(views.map((v) => [v.category, v.spent, v.percent, v.status])).toEqual([
      [null, 20_200, 81, "near"], // 6000 + 3000 + 1200 + 10000
      ["Entertainment", 9_000, 90, "near"],
      ["Music", 1_200, 120, "over"],
    ]);
  });

  it("after a downgrade, category budgets are kept but inactive", () => {
    const views = computeBudgetViews([overall, ent], SUBS, ENTITLEMENTS.starter);
    expect(views.map((v) => [v.category, v.active])).toEqual([
      [null, true],
      ["Entertainment", false],
    ]);
    expect(computeBudgetViews([overall], SUBS, ENTITLEMENTS.free)[0].active).toBe(false);
  });
});

describe("budget rules by plan", () => {
  it("Free: no budgets", () => {
    expect(validateBudget({ monthlyLimit: 5000 }, ENTITLEMENTS.free, [])).toMatchObject({ ok: false, status: 403, code: "plan_limit" });
  });

  it("Starter: one overall budget, no categories", () => {
    expect(validateBudget({ monthlyLimit: 5000 }, ENTITLEMENTS.starter, [])).toEqual({
      ok: true,
      value: { category: null, monthlyLimit: 5000, currency: "MWK" },
    });
    expect(validateBudget({ category: "Music", monthlyLimit: 5000 }, ENTITLEMENTS.starter, [])).toMatchObject({ ok: false, status: 403 });
    expect(validateBudget({ monthlyLimit: 9000 }, ENTITLEMENTS.starter, [overall])).toMatchObject({ ok: false, status: 409 });
    // …but editing the existing one is fine.
    expect(validateBudget({ monthlyLimit: 9000 }, ENTITLEMENTS.starter, [overall], "b1")).toMatchObject({ ok: true });
  });

  it("Pro: per-category budgets, one per category (case-insensitive)", () => {
    expect(validateBudget({ category: "Music", monthlyLimit: 2000 }, ENTITLEMENTS.pro, [overall])).toMatchObject({ ok: true });
    expect(validateBudget({ category: "music ", monthlyLimit: 2000 }, ENTITLEMENTS.pro, [overall, music])).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects bad input", () => {
    for (const bad of [{ monthlyLimit: 0 }, { monthlyLimit: -5 }, { monthlyLimit: "abc" }, { monthlyLimit: 10, currency: "mwk" }, { monthlyLimit: 10, category: "x".repeat(61) }]) {
      expect(validateBudget(bad, ENTITLEMENTS.pro, [])).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe("CSV export", () => {
  it("escapes quotes/commas and neutralises spreadsheet formulas", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+123")).toBe("'+123");
    expect(csvCell(null)).toBe("");
  });

  it("writes a header and one row per subscription", () => {
    const csv = subscriptionsToCsv([
      { ...sub("Adobe", "Design", 120_000, { cycle: "yearly" }), renewal_date: "2027-01-01", created_at: "2026-09-01T10:00:00Z" } as SubscriptionRecord,
    ]);
    expect(csv.startsWith("﻿name,category,price,currency,cycle,monthly_equivalent,renewal_date,status,added_on\r\n")).toBe(true);
    expect(csv).toContain("Adobe,Design,120000.00,MWK,yearly,10000.00,2027-01-01,active,2026-09-01\r\n");
  });
});
