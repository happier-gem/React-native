import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const payments = vi.hoisted(() => ({
  getPaymentByProviderReference: vi.fn(),
  transitionPaymentStatus: vi.fn(),
}));
const handleSuccessfulPayment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments", () => payments);
vi.mock("@/lib/plan-activation", () => ({ handleSuccessfulPayment }));

import { POST } from "./route";

const SECRET = "test-webhook-secret";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

function webhook(event: object, signature?: string | null) {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {};
  const sig = signature === undefined ? sign(body) : signature;
  if (sig !== null) headers["x-infipay-signature"] = sig;
  return new Request("http://x/api/payments/webhook", { method: "POST", body, headers });
}

beforeEach(() => {
  process.env.INFI_PAY_WEBHOOK_SECRET = SECRET;
  payments.getPaymentByProviderReference.mockReset().mockResolvedValue({ id: "pay-1", user_id: "user_a", plan: "pro" });
  payments.transitionPaymentStatus.mockReset().mockResolvedValue({ ok: true, alreadyProcessed: false });
  handleSuccessfulPayment.mockReset().mockResolvedValue({ ok: true, outcome: "applied", events: [] });
});

describe("POST /api/payments/webhook", () => {
  it.each([
    ["missing", null],
    ["forged", "0".repeat(64)],
  ])("a %s signature cannot mark a payment paid or activate a plan", async (_label, signature) => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }, signature));
    expect(res.status).toBe(401);
    expect(payments.transitionPaymentStatus).not.toHaveBeenCalled();
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("a verified SUCCESS activates the plan", async () => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(payments.transitionPaymentStatus).toHaveBeenCalledWith("pay-1", "SUCCESS", { failureReason: undefined });
    expect(handleSuccessfulPayment).toHaveBeenCalledWith(expect.objectContaining({ id: "pay-1" }));
  });

  it("a replayed SUCCESS is handed to the idempotent activation (which no-ops)", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: true, alreadyProcessed: true });
    handleSuccessfulPayment.mockResolvedValue({ ok: true, outcome: "duplicate" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyProcessed: true });
  });

  it("a failed activation returns 500 so the provider retries", async () => {
    handleSuccessfulPayment.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(500);
  });

  it("a FAILED payment never activates a plan", async () => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "FAILED", failureReason: "insufficient funds" }));
    expect(res.status).toBe(200);
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });
});
