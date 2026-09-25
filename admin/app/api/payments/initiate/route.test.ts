import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal stand-in for the Supabase query builder. Reads return `db.existing`
// (null = nothing found); inserts/updates are captured; an update that asks
// for rows back reports one row changed.
const db = vi.hoisted(() => {
  const state = {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    existing: null as Record<string, unknown> | null,
  };
  const from = () => {
    let payload: Record<string, unknown> = {};
    let isUpdate = false;
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "order", "limit"]) builder[m] = () => builder;
    builder.insert = (p: Record<string, unknown>) => {
      payload = p;
      state.inserts.push(p);
      return builder;
    };
    builder.update = (p: Record<string, unknown>) => {
      isUpdate = true;
      state.updates.push(p);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: state.existing, error: null });
    builder.single = async () => ({
      data: { id: "pay-1", provider_reference: null, metadata: {}, created_at: new Date().toISOString(), ...payload },
      error: null,
    });
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: isUpdate ? [{ id: "pay-1" }] : null, error: null });
    return builder;
  };
  return { state, client: { from } };
});
const provider = vi.hoisted(() => ({
  name: "TEST",
  config: vi.fn(),
  checkPhoneNumber: vi.fn(),
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
const VALID = { plan: "pro", provider: "airtel_money", phoneNumber: "+265991234567", idempotencyKey: "key-1" };

beforeEach(() => {
  db.state.inserts.length = 0;
  db.state.updates.length = 0;
  db.state.existing = null;
  provider.config.mockReset().mockReturnValue({ configured: true, environment: "sandbox" });
  provider.checkPhoneNumber.mockReset().mockReturnValue({ ok: true, normalized: "0991234567" });
  provider.initiateCollection.mockReset().mockResolvedValue({ kind: "accepted", providerReference: "pay-1" });
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
    expect(db.state.inserts).toHaveLength(1);
    expect(db.state.inserts[0]).toMatchObject({ user_id: "user_a", plan, amount: expected, currency: "MWK", status: "PENDING" });
    expect(provider.initiateCollection).toHaveBeenCalledWith(expect.objectContaining({ amount: expected, currency: "MWK" }));
    expect((await res.json()).payment).toMatchObject({ amount: expected, currency: "MWK", status: "PENDING" });
  });

  it("ignores a user id in the body — the payment belongs to the token's user", async () => {
    await initiate({ ...VALID, userId: "user_b", user_id: "user_b" });
    expect(db.state.inserts[0]).toMatchObject({ user_id: "user_a" });
  });

  it.each(["free", "enterprise", ""])("rejects non-purchasable plan %j", async (plan) => {
    expect((await initiate({ ...VALID, plan })).status).toBe(400);
    expect(db.state.inserts).toHaveLength(0);
  });
});

describe("POST /api/payments/initiate — INFI-PAY contract", () => {
  it("sends the payment's own id as the (globally unique) reference, stored before contacting INFI-PAY", async () => {
    await initiate(VALID);
    // internal_reference is the per-user idempotency key — never sent to INFI-PAY.
    expect(db.state.inserts[0]).toMatchObject({ internal_reference: "key-1" });
    expect(db.state.updates[0]).toEqual({ provider_reference: "pay-1" });
    expect(provider.initiateCollection).toHaveBeenCalledWith({
      amount: 5000,
      currency: "MWK",
      phoneNumber: "0991234567",
      network: "airtel_money",
      reference: "pay-1",
    });
  });

  it("stores the normalized phone number", async () => {
    await initiate(VALID);
    expect(provider.checkPhoneNumber).toHaveBeenCalledWith("+265991234567", "airtel_money");
    expect(db.state.inserts[0]).toMatchObject({ phone_number: "0991234567" });
  });

  it("a number on the wrong network is refused before anything is created", async () => {
    provider.checkPhoneNumber.mockReturnValue({ ok: false, message: "That number isn't on Airtel Money (099/098…)." });
    const res = await initiate({ ...VALID, phoneNumber: "0881234567" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That number isn't on Airtel Money (099/098…)." });
    expect(db.state.inserts).toHaveLength(0);
  });
});

describe("POST /api/payments/initiate reliability", () => {
  it("provider not configured: 503 and no payment row is created", async () => {
    provider.config.mockReturnValue({ configured: false, missing: ["INFI_PAY_API_URL"], invalid: [] });
    const res = await initiate(VALID);
    expect(res.status).toBe(503);
    expect(db.state.inserts).toHaveLength(0);
    expect(provider.initiateCollection).not.toHaveBeenCalled();
  });

  it("definitive rejection marks the payment FAILED", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "rejected", reason: "provider_http_422" });
    expect((await initiate(VALID)).status).toBe(502);
    expect(db.state.updates).toContainEqual(expect.objectContaining({ status: "FAILED", failure_reason: "initiation_rejected:provider_http_422" }));
  });

  it("uncertain outcome keeps the payment PENDING and flags it — never FAILED", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "uncertain", reason: "network_or_timeout" });
    const res = await initiate(VALID);
    expect(res.status).toBe(503);
    expect(db.state.updates.some((u) => u.status === "FAILED")).toBe(false);
    expect(db.state.updates).toContainEqual({ metadata: { initiation_uncertain: expect.objectContaining({ reason: "network_or_timeout" }) } });
  });

  it("retrying an uncertain payment resends with the SAME reference and creates nothing new", async () => {
    db.state.existing = {
      id: "pay-1",
      user_id: "user_a",
      plan: "pro",
      amount: 5000,
      currency: "MWK",
      provider: "airtel_money",
      phone_number: "0991234567",
      provider_reference: "pay-1",
      status: "PENDING",
      metadata: { initiation_uncertain: { reason: "network_or_timeout" } },
    };
    const res = await initiate(VALID);
    expect(res.status).toBe(200);
    expect(db.state.inserts).toHaveLength(0);
    expect(provider.initiateCollection).toHaveBeenCalledWith(expect.objectContaining({ reference: "pay-1" }));
    expect(db.state.updates).toContainEqual({ metadata: { initiation_uncertain: null } });
  });

  it("an existing (not uncertain) payment is returned as-is — no second charge prompt", async () => {
    db.state.existing = { id: "pay-1", status: "PENDING", plan: "pro", amount: 5000, currency: "MWK", metadata: {}, provider_reference: "pay-1" };
    const res = await initiate(VALID);
    expect(res.status).toBe(200);
    expect(provider.initiateCollection).not.toHaveBeenCalled();
  });

  it("provider error details never reach the client", async () => {
    provider.initiateCollection.mockResolvedValue({ kind: "rejected", reason: "provider_http_401:UnauthorizedException sk_live_123" });
    const body = JSON.stringify(await (await initiate(VALID)).json());
    expect(body).not.toContain("sk_live_123");
    expect(body).not.toContain("provider_http");
  });

  it("rejects an oversized idempotency key", async () => {
    expect((await initiate({ ...VALID, idempotencyKey: "k".repeat(101) })).status).toBe(400);
    expect(db.state.inserts).toHaveLength(0);
  });
});
