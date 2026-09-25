import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real INFI-PAY adapter verifies and parses; persistence, recovery and
// activation are mocked. `after()` callbacks are captured so each test can
// run the background work explicitly.
const pending = vi.hoisted(() => ({ tasks: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void pending.tasks.push(fn) }));

const payments = vi.hoisted(() => ({
  getPaymentByProviderReference: vi.fn(),
  listRecentPendingPayments: vi.fn(),
}));
const recoverPendingPayments = vi.hoisted(() => vi.fn());
const activatePlanForPayment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments", () => payments);
vi.mock("@/lib/payment-recovery", () => ({ recoverPendingPayments }));
vi.mock("@/lib/plan-activation", () => ({ activatePlanForPayment }));

import { POST, processVerifiedPaymentEvent } from "./route";

const SECRET = "whsec_test";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

/** A delivery in the documented shape. */
const payload = (event: string, data: object = {}) =>
  JSON.stringify({
    event,
    data: { transactionId: "b6b6c6d0", amount: 5000, currency: "MWK", status: "SUCCESS", provider: "airtel", externalRef: "AIRTEL_1", ...data },
  });

function deliver(body: string, signature: string | null = sign(body)) {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["x-signature"] = signature;
  return POST(new Request("http://x/api/payments/webhook", { method: "POST", body, headers }));
}

const runBackground = async () => {
  const tasks = pending.tasks.splice(0);
  for (const task of tasks) await task();
};

const ENV = {
  INFI_PAY_API_URL: "https://api.infi-pay.com/api/v1",
  INFI_PAY_API_KEY: "sk_test_key",
  INFI_PAY_WEBHOOK_SECRET: SECRET,
  INFI_PAY_ENVIRONMENT: "sandbox",
};

const PENDING_PAYMENT = { id: "pay-1", status: "PENDING", provider_reference: "pay-1" };

beforeEach(() => {
  Object.assign(process.env, ENV);
  pending.tasks.length = 0;
  payments.getPaymentByProviderReference.mockReset().mockResolvedValue(PENDING_PAYMENT);
  payments.listRecentPendingPayments.mockReset().mockResolvedValue([PENDING_PAYMENT]);
  recoverPendingPayments.mockReset().mockResolvedValue({});
  activatePlanForPayment.mockReset().mockResolvedValue({ ok: true, outcome: "applied", events: [] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  vi.restoreAllMocks();
});

describe("POST /api/payments/webhook — response", () => {
  it("a verified payment.success is acknowledged immediately (200) and processed in the background", async () => {
    const res = await deliver(payload("payment.success"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: true });
    // Nothing happened yet — the provider isn't kept waiting (15 s limit).
    expect(recoverPendingPayments).not.toHaveBeenCalled();
    expect(pending.tasks).toHaveLength(1);
  });

  it.each([
    ["missing", null],
    ["forged", "0".repeat(64)],
    ["for a different body", sign(payload("payment.failed"))],
  ])("a %s signature is rejected (401) and nothing is scheduled", async (_label, signature) => {
    const res = await deliver(payload("payment.success"), signature);
    expect(res.status).toBe(401);
    expect(pending.tasks).toHaveLength(0);
  });

  it("with no webhook secret configured, every webhook is rejected", async () => {
    delete process.env.INFI_PAY_WEBHOOK_SECRET;
    expect((await deliver(payload("payment.success"))).status).toBe(401);
  });

  it.each([
    ["not JSON", "not json"],
    ["a JSON array", "[1,2,3]"],
    ["missing data", JSON.stringify({ event: "payment.success" })],
    ["missing event", JSON.stringify({ data: {} })],
  ])("malformed payload (%s) is rejected with 400", async (_label, body) => {
    expect((await deliver(body)).status).toBe(400);
    expect(pending.tasks).toHaveLength(0);
  });

  it("an oversized body is rejected", async () => {
    expect((await deliver(payload("payment.success", { pad: "x".repeat(70_000) }))).status).toBe(400);
  });

  it.each(["payout.success", "refund.failed", "payment.chargeback"])("%s (unknown/unused event) is acknowledged and ignored", async (event) => {
    const res = await deliver(payload(event));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(pending.tasks).toHaveLength(0);
  });

  it("payment.pending changes nothing", async () => {
    expect((await deliver(payload("payment.pending"))).status).toBe(200);
    expect(pending.tasks).toHaveLength(0);
  });

  it("never logs the payload, signature or secret", async () => {
    const logged: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
    }
    const body = payload("payment.success", { phoneNumber: "0991234567" });
    await deliver(body);
    await deliver(body, "bad");
    const all = logged.join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("0991234567");
    expect(all).not.toContain(sign(body));
  });
});

describe("background processing — the webhook's status is never trusted on its own", () => {
  it("documented payload (no reference): re-checks recent pending payments with INFI-PAY", async () => {
    await deliver(payload("payment.success"));
    await runBackground();
    expect(recoverPendingPayments).toHaveBeenCalledWith(expect.objectContaining({ minAgeMinutes: 0, limit: 25 }));
    // …using the newest pending payments.
    const { deps } = recoverPendingPayments.mock.calls[0][0];
    expect(await deps.listPending(new Date(), 25)).toEqual([PENDING_PAYMENT]);
    expect(payments.listRecentPendingPayments).toHaveBeenCalledWith(25);
  });

  it("payment.failed is also only a prompt — the status comes from INFI-PAY", async () => {
    await deliver(payload("payment.failed"));
    await runBackground();
    expect(recoverPendingPayments).toHaveBeenCalledTimes(1);
    expect(activatePlanForPayment).not.toHaveBeenCalled();
  });

  it("with our reference: checks exactly that pending payment", async () => {
    await processVerifiedPaymentEvent("pay-1");
    expect(payments.getPaymentByProviderReference).toHaveBeenCalledWith("pay-1");
    const { deps, limit } = recoverPendingPayments.mock.calls[0][0];
    expect(limit).toBe(1);
    expect(await deps.listPending()).toEqual([PENDING_PAYMENT]);
  });

  it("with our reference for an already-SUCCESS payment: only (idempotent) activation", async () => {
    payments.getPaymentByProviderReference.mockResolvedValue({ ...PENDING_PAYMENT, status: "SUCCESS" });
    await processVerifiedPaymentEvent("pay-1");
    expect(activatePlanForPayment).toHaveBeenCalledWith("pay-1");
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it("with our reference for a FAILED payment: nothing (final statuses never change)", async () => {
    payments.getPaymentByProviderReference.mockResolvedValue({ ...PENDING_PAYMENT, status: "FAILED" });
    await processVerifiedPaymentEvent("pay-1");
    expect(activatePlanForPayment).not.toHaveBeenCalled();
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it("an unknown reference falls back to re-checking recent pending payments", async () => {
    payments.getPaymentByProviderReference.mockResolvedValue(null);
    await processVerifiedPaymentEvent("not-ours");
    expect(recoverPendingPayments).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it("duplicate deliveries each trigger a re-check — settlement itself is idempotent", async () => {
    await Promise.all([deliver(payload("payment.success")), deliver(payload("payment.success"))]);
    await runBackground();
    expect(recoverPendingPayments).toHaveBeenCalledTimes(2);
  });

  it("a background failure is logged, not thrown (scheduled recovery picks it up)", async () => {
    recoverPendingPayments.mockRejectedValue(new Error("db down"));
    await deliver(payload("payment.success"));
    await expect(runBackground()).resolves.toBeUndefined();
  });
});
