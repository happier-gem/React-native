import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal stand-in for the Supabase query builder: every chained call returns
// the builder, reads find nothing, and inserts are captured and echoed back.
const db = vi.hoisted(() => {
  const inserts: Record<string, unknown>[] = [];
  const from = () => {
    let payload: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit", "update"]) builder[m] = () => builder;
    builder.insert = (p: Record<string, unknown>) => {
      payload = p;
      inserts.push(p);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.single = async () => ({ data: { id: "pay-1", created_at: new Date().toISOString(), ...payload }, error: null });
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  };
  return { inserts, client: { from } };
});
const collection = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => db.client }));
vi.mock("@/lib/mobile-auth", () => ({ authenticateMobileRequest: async () => ({ ok: true, userId: "user_a" }) }));
vi.mock("@/lib/infi-pay", () => ({ initiateCollection: collection }));

import { POST } from "./route";

const initiate = (body: object) =>
  POST(new Request("http://x/api/payments/initiate", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  db.inserts.length = 0;
  collection.mockReset().mockResolvedValue({ ok: true, providerReference: "ref-1", status: "PENDING" });
});

describe("POST /api/payments/initiate pricing", () => {
  it.each([
    ["starter", 2000],
    ["pro", 5000],
  ])("%s is charged the server price, whatever amount the client sends", async (plan, expected) => {
    const res = await initiate({ plan, provider: "airtel_money", phoneNumber: "0991234567", amount: 1, price: 1, currency: "USD" });
    expect(res.status).toBe(201);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({ user_id: "user_a", plan, amount: expected, currency: "MWK", status: "PENDING" });
    expect(collection).toHaveBeenCalledWith(expect.objectContaining({ amount: expected, currency: "MWK" }));
    expect((await res.json()).payment).toMatchObject({ amount: expected, currency: "MWK" });
  });

  it("ignores a user id in the body — the payment belongs to the token's user", async () => {
    await initiate({ plan: "pro", provider: "airtel_money", phoneNumber: "0991234567", userId: "user_b", user_id: "user_b" });
    expect(db.inserts[0]).toMatchObject({ user_id: "user_a" });
  });

  it.each(["free", "enterprise", ""])("rejects non-purchasable plan %j", async (plan) => {
    const res = await initiate({ plan, provider: "airtel_money", phoneNumber: "0991234567" });
    expect(res.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });
});
