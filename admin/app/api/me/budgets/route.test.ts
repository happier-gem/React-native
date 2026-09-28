import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: { ok: false, status: 401 } as { ok: true; userId: string } | { ok: false; status: 401 } }));
const state = vi.hoisted(() => ({ plan: "starter" as "free" | "starter" | "pro", records: [] as { id: string; category: string | null; monthly_limit: number; currency: string }[] }));
const db = vi.hoisted(() => ({ createBudget: vi.fn(), updateBudget: vi.fn(), deleteBudget: vi.fn(), listBudgets: vi.fn() }));

vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => auth.result }));
vi.mock("@/lib/user-plans", () => ({ getEffectiveUserPlan: async () => ({ plan: state.plan }) }));
vi.mock("@/lib/subscriptions", () => ({
  listSubscriptionsForUser: async () => ({
    ok: true,
    rows: [{ name: "Spotify", price: 3000, cycle: "monthly", currency: "MWK", category: "Music", status: "active", renewal_date: "2026-10-28", created_at: "2026-09-01T10:00:00Z" }],
  }),
}));
vi.mock("@/lib/budgets", async (importOriginal) => ({ ...(await importOriginal<object>()), ...db }));

import * as collection from "./route";
import * as item from "./[id]/route";
import * as exportRoute from "../export/route";

const post = (body: object) => collection.POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  auth.result = { ok: true, userId: "user_a" };
  state.plan = "starter";
  state.records = [];
  db.listBudgets.mockReset().mockImplementation(async () => state.records);
  db.createBudget.mockReset().mockResolvedValue("created");
  db.updateBudget.mockReset().mockResolvedValue("updated");
  db.deleteBudget.mockReset().mockResolvedValue(true);
});

describe("/api/me/budgets", () => {
  it("requires sign-in", async () => {
    auth.result = { ok: false, status: 401 };
    expect((await collection.GET(new Request("http://x"))).status).toBe(401);
    expect((await post({ monthlyLimit: 5000 })).status).toBe(401);
    expect((await item.DELETE(new Request("http://x"), ctx("b1"))).status).toBe(401);
    expect((await exportRoute.GET(new Request("http://x"))).status).toBe(401);
  });

  it("GET returns spending computed on the server", async () => {
    state.records = [{ id: "b1", category: null, monthly_limit: 4000, currency: "MWK" }];
    const body = await (await collection.GET(new Request("http://x"))).json();
    expect(body.budgets).toEqual([
      { id: "b1", category: null, monthlyLimit: 4000, currency: "MWK", spent: 3000, percent: 75, status: "ok", active: true },
    ]);
  });

  it("creates for the token's user only", async () => {
    const res = await post({ monthlyLimit: 5000, userId: "user_b" });
    expect(res.status).toBe(201);
    expect(db.createBudget).toHaveBeenCalledWith("user_a", { category: null, monthlyLimit: 5000, currency: "MWK" });
  });

  it("refuses what the plan doesn't include", async () => {
    state.plan = "free";
    const res = await post({ monthlyLimit: 5000 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "plan_limit" });
    expect(db.createBudget).not.toHaveBeenCalled();
  });

  it("another user's budget can't be edited — it's not found", async () => {
    state.records = []; // user_a has no budget "b-other"
    const res = await item.PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ monthlyLimit: 1 }) }), ctx("b-other"));
    expect(res.status).toBe(404);
    expect(db.updateBudget).not.toHaveBeenCalled();
  });

  it("delete is scoped to the token's user", async () => {
    await item.DELETE(new Request("http://x"), ctx("b1"));
    expect(db.deleteBudget).toHaveBeenCalledWith("user_a", "b1");
  });
});

describe("/api/me/export", () => {
  it("is Pro-only", async () => {
    state.plan = "starter";
    const res = await exportRoute.GET(new Request("http://x"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "plan_limit" });
  });

  it("returns CSV on Pro", async () => {
    state.plan = "pro";
    const res = await exportRoute.GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  });
});
