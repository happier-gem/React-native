import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal stand-in for the Supabase query builder: every chained call returns
// the builder, reads find nothing, and inserts/updates are captured.
const db = vi.hoisted(() => {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const from = () => {
    let payload: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "order", "limit"]) builder[m] = () => builder;
    builder.insert = (p: Record<string, unknown>) => {
      payload = p;
      inserts.push(p);
      return builder;
    };
    builder.update = (p: Record<string, unknown>) => {
      updates.push(p);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.single = async () => ({ data: { id: "pay-1", created_at: new Date().toISOString(), metadata: {}, ...payload }, error: null });
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  };
  return { inserts, updates, client: { from } };
});
const provider = vi.hoisted(() => ({
  name: "TEST",
  config: vi.fn(),
  initiateCollection: vi.fn(),
  getTransactionStatus: vi.fn(),
  parseWebhook: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => db.client }));
vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => ({ ok: true, userId: "user_a" }) }));
vi.mock("@/lib/infi-pay", () => ({ getPaymentProvider: () => provider }));

import { POST } from "./route";

const initiate = (body: object) =>
  POST(new Request("http://x/api/payments/initiate", { method: "POST", body: JSON.stringify(body) }));
const VALID = { plan: "pro", provider: "airtel_money", phoneNumber: "0991234567" };

beforeEach(() => {
  db.inserts.length = 0;
  db.updates.length = 0;
  provider.config.mockReset().mockReturnValue({ configured: true, environment: "sandbox" });
  provider.initiateCollection.mockReset().mockResolvedValue({ kind: "accepted", providerReference: "ref-1" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/payments/initiate pricing", () => {
  it.each([
    ["starter", 2000],
    ["pro", 5000],
  ])("%s is charged the server price, whatever amount the client sends", async (plan, expected) => {
    const res = await initiate({ ...VALID, plan, amount: 1, price: 1, currency: "USD", status: "SUCCESS" });
    expect(res.status).toBe(201);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({ user_id: "user_a", plan, amount: expected, currency: "MWK", status: "PENDING" });
    expect(provider.initiateCollection).toHaveBeenCalledWith(expect.objectContaining({ amount: expected, currency: "MWK" }));
    expect((await res.json()).payment).toMatchObject({ amount: expected, currency: "MWK", status: "PENDING" });
  });

  it("ignores a user id in the body — the payment belongs to the token's user", async () => {
    await initiate({ ...VALID, userId: "user_b", user_id: "user_b" });
    expect(db.inserts[0]).toMatchObject({ user_id: "user_a" });
  });

  it.each(["free", "enterprise", ""])("rejects non-purchasable plan %j", async (plan) => {
    const res = await initiate({ ...VALID, plan });
    expect(res.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });
});

describe("POST /api/payments/initiate reliability", () => {
  it("provider not configured: 503 and no payment row is created", async () => {
    provider.config.mockReturnValue({ configured: false, missing: ["INFI_PAY_API_URL"], invalid: [] });
    const res = await initiate(VALID);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Payments aren't available right now. Please try again later." });
    expect(db.inserts).toHaveLength(0);
    expect(provider.initiateCollection).not.toHaveBeenCalled();
  });

  it("definitive provider rejection marks the payment FAILED", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "rejected", reason: "provider_http_422" });
    const res = await initiate(VALID);
    expect(res.status).toBe(502);
    expect(db.updates).toEqual([expect.objectContaining({ status: "FAILED", failure_reason: "initiation_rejected:provider_http_422" })]);
  });

  it("uncertain outcome (timeout/5xx) keeps the payment PENDING and flags it — never FAILED", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "uncertain", reason: "network_or_timeout" });
    const res = await initiate(VALID);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Payment provider is temporarily unavailable. Please try again later." });
    expect(db.updates.some((u) => u.status === "FAILED")).toBe(false);
  });

  it("provider error details never reach the client", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "rejected", reason: "provider_http_401 invalid api key sk_live_123" });
    const body = JSON.stringify(await (await initiate(VALID)).json());
    expect(body).not.toContain("sk_live_123");
    expect(body).not.toContain("provider_http");
  });

  it("rejects an oversized idempotency key", async () => {
    const res = await initiate({ ...VALID, idempotencyKey: "k".repeat(101) });
    expect(res.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });
});
