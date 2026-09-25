import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real INFI-PAY adapter (signature check + payload parsing) runs here; only
// persistence and activation are mocked.
const payments = vi.hoisted(() => ({
  getPaymentByProviderReference: vi.fn(),
  transitionPaymentStatus: vi.fn(),
  recordProviderConflict: vi.fn(),
}));
const handleSuccessfulPayment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments", () => payments);
vi.mock("@/lib/plan-activation", () => ({ handleSuccessfulPayment }));

import { POST } from "./route";

const SECRET = "test-webhook-secret";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

function webhook(event: unknown, signature?: string | null, rawOverride?: string) {
  const body = rawOverride ?? JSON.stringify(event);
  const headers: Record<string, string> = {};
  const sig = signature === undefined ? sign(body) : signature;
  if (sig !== null) headers["x-infipay-signature"] = sig;
  return new Request("http://x/api/payments/webhook", { method: "POST", body, headers });
}

const ENV = {
  INFI_PAY_API_URL: "https://sandbox.example.test",
  INFI_PAY_API_KEY: "test-key",
  INFI_PAY_WEBHOOK_SECRET: SECRET,
  INFI_PAY_ENVIRONMENT: "sandbox",
};

beforeEach(() => {
  Object.assign(process.env, ENV);
  payments.getPaymentByProviderReference.mockReset().mockResolvedValue({ id: "pay-1", user_id: "user_a", plan: "pro" });
  payments.transitionPaymentStatus.mockReset().mockResolvedValue({ ok: true, alreadyProcessed: false, currentStatus: "SUCCESS" });
  payments.recordProviderConflict.mockReset().mockResolvedValue(undefined);
  handleSuccessfulPayment.mockReset().mockResolvedValue({ ok: true, outcome: "applied", events: [] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  vi.restoreAllMocks();
});

describe("POST /api/payments/webhook", () => {
  it("valid SUCCESS: transitions the payment and activates the plan", async () => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(payments.transitionPaymentStatus).toHaveBeenCalledWith("pay-1", "SUCCESS", { failureReason: undefined });
    expect(handleSuccessfulPayment).toHaveBeenCalledWith(expect.objectContaining({ id: "pay-1" }));
  });

  it.each([
    ["missing", null],
    ["forged", "0".repeat(64)],
    ["for a different body", sign('{"providerReference":"ref-1","status":"FAILED"}')],
  ])("a %s signature is rejected before the payload is read", async (_label, signature) => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }, signature));
    expect(res.status).toBe(401);
    expect(payments.getPaymentByProviderReference).not.toHaveBeenCalled();
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("with no webhook secret configured, every webhook is rejected", async () => {
    delete process.env.INFI_PAY_WEBHOOK_SECRET;
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(401);
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("duplicate SUCCESS is harmless (activation is idempotent and no-ops)", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: true, alreadyProcessed: true, currentStatus: "SUCCESS" });
    handleSuccessfulPayment.mockResolvedValue({ ok: true, outcome: "duplicate" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyProcessed: true });
    expect(payments.recordProviderConflict).not.toHaveBeenCalled();
  });

  it("concurrent duplicate deliveries: one transition, the other a no-op", async () => {
    let settled = false;
    payments.transitionPaymentStatus.mockImplementation(async () => {
      const first = !settled;
      settled = true;
      return { ok: true, alreadyProcessed: !first, currentStatus: "SUCCESS" };
    });
    const [a, b] = await Promise.all([
      POST(webhook({ providerReference: "ref-1", status: "SUCCESS" })),
      POST(webhook({ providerReference: "ref-1", status: "SUCCESS" })),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const bodies = await Promise.all([a.json(), b.json()]);
    expect(bodies.map((x) => x.alreadyProcessed).sort()).toEqual([false, true]);
  });

  it.each([
    ["not JSON", "not json at all"],
    ["a JSON array", "[1,2,3]"],
    ["missing providerReference", JSON.stringify({ status: "SUCCESS" })],
    ["non-string providerReference", JSON.stringify({ providerReference: 42, status: "SUCCESS" })],
  ])("malformed payload (%s) is rejected with 400 and never processed", async (_label, raw) => {
    const res = await POST(webhook(null, undefined, raw));
    expect(res.status).toBe(400);
    expect(payments.transitionPaymentStatus).not.toHaveBeenCalled();
  });

  it("an oversized body is rejected", async () => {
    const res = await POST(webhook(null, undefined, JSON.stringify({ providerReference: "r", pad: "x".repeat(70_000) })));
    expect(res.status).toBe(400);
  });

  it("FAILED never activates a plan", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: true, alreadyProcessed: false, currentStatus: "FAILED" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "FAILED", failureReason: "insufficient funds" }));
    expect(res.status).toBe(200);
    expect(payments.transitionPaymentStatus).toHaveBeenCalledWith("pay-1", "FAILED", { failureReason: "insufficient funds" });
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("CANCELLED never activates a plan", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: true, alreadyProcessed: false, currentStatus: "CANCELLED" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "cancelled" }));
    expect(res.status).toBe(200);
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("an unknown event/status is acknowledged and ignored, not a crash", async () => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "REFUND_REQUESTED" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(payments.transitionPaymentStatus).not.toHaveBeenCalled();
  });

  it("a PENDING event changes nothing", async () => {
    const res = await POST(webhook({ providerReference: "ref-1", status: "pending" }));
    expect(res.status).toBe(200);
    expect(payments.transitionPaymentStatus).not.toHaveBeenCalled();
  });

  it("an unknown provider reference is acknowledged (recovery reconciles our side)", async () => {
    payments.getPaymentByProviderReference.mockResolvedValue(null);
    const res = await POST(webhook({ providerReference: "ref-unknown", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matched: false });
  });

  it("a late contradictory report never moves a final status backwards — it's recorded as a conflict", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: true, alreadyProcessed: true, currentStatus: "FAILED" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(200);
    expect(payments.recordProviderConflict).toHaveBeenCalledWith("pay-1", { localStatus: "FAILED", reportedStatus: "SUCCESS", source: "webhook" });
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("a database failure on lookup is retryable (503), never acknowledged", async () => {
    payments.getPaymentByProviderReference.mockRejectedValue(new Error("db down"));
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("a database failure on transition is retryable (503)", async () => {
    payments.transitionPaymentStatus.mockResolvedValue({ ok: false, error: "db" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(503);
    expect(handleSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("a failed activation is retryable (503); the payment stays SUCCESS", async () => {
    handleSuccessfulPayment.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(webhook({ providerReference: "ref-1", status: "SUCCESS" }));
    expect(res.status).toBe(503);
  });

  it("never logs the payload, signature or secret", async () => {
    const logged: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
    }
    const body = JSON.stringify({ providerReference: "ref-1", status: "SUCCESS", phone: "0991234567" });
    await POST(webhook(null, undefined, body));
    await POST(webhook(null, "bad-signature", body));
    const all = logged.join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("0991234567");
    expect(all).not.toContain(sign(body));
  });
});
