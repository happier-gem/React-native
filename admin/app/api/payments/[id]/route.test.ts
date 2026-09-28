import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: { ok: false, status: 401 } as { ok: true; userId: string } | { ok: false; status: 401 } }));
const getPaymentForUser = vi.hoisted(() => vi.fn());
const recoverPendingPayments = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => auth.result }));
vi.mock("@/lib/payments", () => ({ getPaymentForUser }));
vi.mock("@/lib/payment-recovery", () => ({ recoverPendingPayments }));

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
  recoverPendingPayments.mockReset().mockResolvedValue({});
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
    expect(await res.json()).toEqual({ id: "pay-1", status: "PENDING", plan: "pro", amount: 5000, currency: "MWK", failureReason: null });
  });

  it("a database error is a 500, not a misleading 404", async () => {
    auth.result = { ok: true, userId: "user_a" };
    getPaymentForUser.mockRejectedValue(new Error("db down"));
    expect((await get("pay-1")).status).toBe(500);
  });

  it("while PENDING, asks INFI-PAY (via recovery) and returns the fresh status", async () => {
    auth.result = { ok: true, userId: "user_a" };
    getPaymentForUser.mockReset()
      .mockResolvedValueOnce(PAYMENT) // before the check
      .mockResolvedValueOnce({ ...PAYMENT, status: "FAILED" }); // after
    const res = await get("pay-1");
    expect(recoverPendingPayments).toHaveBeenCalledWith(expect.objectContaining({ minAgeMinutes: 0, limit: 1, sweepOrphans: false }));
    const { deps } = recoverPendingPayments.mock.calls[0][0];
    expect(await deps.listPending()).toEqual([PAYMENT]); // exactly this payment
    expect(await res.json()).toMatchObject({ id: "pay-1", status: "FAILED" });
  });

  it("asks INFI-PAY at most every 10 s, however often the app polls", async () => {
    auth.result = { ok: true, userId: "user_a" };
    getPaymentForUser.mockReset().mockResolvedValue({ ...PAYMENT, metadata: { provider_check: { at: new Date().toISOString() } } });
    await get("pay-1");
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it("never checks another user's payment, nor a settled or unreferenced one", async () => {
    auth.result = { ok: true, userId: "user_b" };
    await get("pay-1");
    auth.result = { ok: true, userId: "user_a" };
    getPaymentForUser.mockReset().mockResolvedValueOnce({ ...PAYMENT, status: "SUCCESS" }).mockResolvedValueOnce({ ...PAYMENT, provider_reference: null });
    await get("pay-1");
    await get("pay-1");
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it("if the live check fails, the stored status is returned", async () => {
    auth.result = { ok: true, userId: "user_a" };
    recoverPendingPayments.mockRejectedValue(new Error("INFI-PAY down"));
    const res = await get("pay-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "PENDING" });
  });

  it("exposes no way to change a payment", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
  });
});
