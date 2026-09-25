import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: { ok: false, status: 401 } as { ok: true; userId: string } | { ok: false; status: 401 } }));
const syncUserPlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => auth.result }));
vi.mock("@/lib/user-plans", () => ({ syncUserPlan }));

import * as route from "./route";

const FREE = { plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null, pendingChange: null, storedPlan: null };

beforeEach(() => {
  syncUserPlan.mockReset();
  syncUserPlan.mockResolvedValue(FREE);
});

describe("GET /api/me/plan", () => {
  it("rejects unauthenticated requests without touching plan storage", async () => {
    auth.result = { ok: false, status: 401 };
    const res = await route.GET(new Request("http://x/api/me/plan"));
    expect(res.status).toBe(401);
    expect(syncUserPlan).not.toHaveBeenCalled();
  });

  it("always reads the token's user, ignoring any user id the client sends", async () => {
    auth.result = { ok: true, userId: "user_a" };
    const res = await route.GET(new Request("http://x/api/me/plan?userId=user_b&user_id=user_b", { headers: { "x-user-id": "user_b" } }));
    expect(res.status).toBe(200);
    expect(syncUserPlan).toHaveBeenCalledTimes(1);
    expect(syncUserPlan).toHaveBeenCalledWith("user_a");
  });

  it("returns the effective plan and the server's plan catalog", async () => {
    auth.result = { ok: true, userId: "user_a" };
    syncUserPlan.mockResolvedValue({
      ...FREE,
      plan: "pro",
      startedAt: new Date("2026-09-25T00:00:00.000Z"),
      expiresAt: new Date("2026-10-25T00:00:00.000Z"),
    });
    const body = await (await route.GET(new Request("http://x/api/me/plan"))).json();
    expect(body.plan).toEqual({
      plan: "pro",
      status: "ACTIVE",
      isActive: true,
      startedAt: "2026-09-25T00:00:00.000Z",
      expiresAt: "2026-10-25T00:00:00.000Z",
      pendingChange: null,
    });
    expect(body.availablePlans).toEqual([
      { id: "free", name: "Free", price: 0, currency: "MWK", interval: null },
      { id: "starter", name: "Starter", price: 2000, currency: "MWK", interval: "monthly" },
      { id: "pro", name: "Pro", price: 5000, currency: "MWK", interval: "monthly" },
    ]);
  });

  it("exposes no way to write a plan", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
  });
});
