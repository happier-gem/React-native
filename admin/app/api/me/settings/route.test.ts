import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: { ok: false, status: 401 } as { ok: true; userId: string } | { ok: false; status: 401 } }));
const plans = vi.hoisted(() => ({ getEffectiveUserPlan: vi.fn() }));
const store = vi.hoisted(() => ({ getStoredSettings: vi.fn(), saveSettings: vi.fn() }));

vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => auth.result }));
vi.mock("@/lib/user-plans", () => plans);
vi.mock("@/lib/user-settings", async (importOriginal) => ({ ...(await importOriginal<object>()), ...store }));

import * as route from "./route";

const put = (body: object) => route.PUT(new Request("http://x/api/me/settings", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  plans.getEffectiveUserPlan.mockReset().mockResolvedValue({ plan: "starter" });
  store.getStoredSettings.mockReset().mockResolvedValue(null);
  store.saveSettings.mockReset().mockResolvedValue(undefined);
  auth.result = { ok: true, userId: "user_a" };
});

describe("/api/me/settings", () => {
  it("rejects unauthenticated requests", async () => {
    auth.result = { ok: false, status: 401 };
    expect((await route.GET(new Request("http://x"))).status).toBe(401);
    expect((await put({ reminderDays: [3] })).status).toBe(401);
    expect(store.saveSettings).not.toHaveBeenCalled();
  });

  it("always uses the token's user, ignoring any user id sent", async () => {
    await put({ reminderDays: [3], userId: "user_b", user_id: "user_b" });
    expect(plans.getEffectiveUserPlan).toHaveBeenCalledWith("user_a");
    expect(store.saveSettings).toHaveBeenCalledWith("user_a", expect.objectContaining({ reminderDays: [3] }));
  });

  it("saves what the plan allows and returns the effective settings", async () => {
    const res = await put({ reminderDays: [7] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings: { reminderDays: [7], smsReminders: false, whatsappReminders: false, reminderPhone: null } });
  });

  it("refuses what the plan doesn't include (403 plan_limit) and saves nothing", async () => {
    plans.getEffectiveUserPlan.mockResolvedValue({ plan: "free" });
    const res = await put({ reminderDays: [7] });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "plan_limit" });
    expect(store.saveSettings).not.toHaveBeenCalled();
  });

  it("GET shows only what applies under the current plan", async () => {
    plans.getEffectiveUserPlan.mockResolvedValue({ plan: "free" });
    store.getStoredSettings.mockResolvedValue({ reminderDays: [3, 7], smsReminders: true, whatsappReminders: false, reminderPhone: "0991234567" });
    const res = await route.GET(new Request("http://x"));
    expect(await res.json()).toEqual({ settings: { reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: "0991234567" } });
  });
});
