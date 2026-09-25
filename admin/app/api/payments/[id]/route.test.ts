import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: { ok: false, status: 401 } as { ok: true; userId: string } | { ok: false; status: 401 } }));
const getPaymentForUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => auth.result }));
vi.mock("@/lib/payments", () => ({ getPaymentForUser }));

import * as route from "./route";

const get = (id: string) => route.GET(new Request(`http://x/api/payments/${id}`), { params: Promise.resolve({ id }) });

const PAYMENT = {
  id: "pay-1",
  user_id: "user_a",
  status: "PENDING",
  plan: "pro",
  amount: 5000,
  currency: "MWK",
  phone_number: "0991234567",
  provider_reference: "ref-1",
  metadata: { secret: "x" },
};

beforeEach(() => {
  // Ownership is enforced by the query itself: only user_a's own payment matches.
  getPaymentForUser.mockReset().mockImplementation(async (userId: string, id: string) =>
    userId === PAYMENT.user_id && id === PAYMENT.id ? PAYMENT : null
  );
});

describe("GET /api/payments/[id]", () => {
  it("unauthenticated lookups are rejected without querying", async () => {
    auth.result = { ok: false, status: 401 };
    expect((await get("pay-1")).status).toBe(401);
    expect(getPaymentForUser).not.toHaveBeenCalled();
  });

  it("another user's payment is indistinguishable from a missing one (404)", async () => {
    auth.result = { ok: true, userId: "user_b" };
    const res = await get("pay-1");
    expect(res.status).toBe(404);
    expect(getPaymentForUser).toHaveBeenCalledWith("user_b", "pay-1");
  });

  it("the owner sees only safe fields — no phone, reference or metadata", async () => {
    auth.result = { ok: true, userId: "user_a" };
    const res = await get("pay-1");
    expect(await res.json()).toEqual({ id: "pay-1", status: "PENDING", plan: "pro", amount: 5000, currency: "MWK" });
  });

  it("a database error is a 500, not a misleading 404", async () => {
    auth.result = { ok: true, userId: "user_a" };
    getPaymentForUser.mockRejectedValue(new Error("db down"));
    expect((await get("pay-1")).status).toBe(500);
  });

  it("exposes no way to change a payment", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
  });
});
