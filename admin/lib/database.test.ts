import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGliteInterface } from "@electric-sql/pglite";
import { activatePlanForPayment, type ActivationDeps } from "@/lib/plan-activation";
import { createTestDb, getPaymentRow, insertPayment, pglitePlanStore, readSql } from "@/test/pglite-db";

// Database-level guarantees: these hold no matter what application code does.

vi.mock("@/lib/audit-log", () => ({ SYSTEM_ACTOR: "system", logAdminAction: async () => {} }));

let template: PGliteInterface;
let db: PGliteInterface;

beforeAll(async () => {
  template = await createTestDb();
});
beforeEach(async () => {
  db = await template.clone();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const deps = (): ActivationDeps => ({
  store: pglitePlanStore(db),
  getPayment: (id) => getPaymentRow(db, id),
  audit: async () => {},
  now: () => new Date("2026-09-26T10:00:00.000Z"),
});

const status = async (id: string) =>
  (await db.query<{ status: string }>("select status from public.payments where id = $1", [id])).rows[0].status;

/** The same atomic statement lib/payments.ts transitionPaymentStatus issues. */
const transition = (id: string, next: string) =>
  db.query<{ id: string }>(
    "update public.payments set status = $2, completed_at = now() where id = $1 and status = 'PENDING' returning id",
    [id, next]
  );

describe("verify.sql", () => {
  it("passes every check after the migrations", async () => {
    const { rows } = await db.query<{ check_name: string; ok: boolean }>(readSql("verify.sql"));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    expect(rows.length).toBeGreaterThan(30);
  });

  it("passes on a fresh install from schema.sql alone", async () => {
    const fresh = await createTestDb({ withMigrations: false });
    const { rows } = await fresh.query<{ check_name: string; ok: boolean }>(readSql("verify.sql"));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });

  it("actually detects problems", async () => {
    await db.exec("drop trigger payments_enforce_transition on public.payments; grant select on public.payments to anon;");
    const { rows } = await db.query<{ check_name: string; ok: boolean }>(readSql("verify.sql"));
    expect(rows.filter((r) => !r.ok).map((r) => r.check_name).sort()).toEqual([
      "anon has no access: payments",
      "trigger payments_enforce_transition",
    ]);
  });
});

describe("payment state machine (trigger)", () => {
  it("PENDING -> SUCCESS/FAILED/CANCELLED is allowed", async () => {
    for (const next of ["SUCCESS", "FAILED", "CANCELLED"]) {
      const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING" });
      await transition(id, next);
      expect(await status(id)).toBe(next);
    }
  });

  it.each([
    ["SUCCESS", "PENDING"],
    ["SUCCESS", "FAILED"],
    ["FAILED", "SUCCESS"],
    ["CANCELLED", "SUCCESS"],
    ["FAILED", "PENDING"],
  ])("%s -> %s is refused even by a direct UPDATE", async (from, to) => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: from });
    await expect(db.query("update public.payments set status = $2 where id = $1", [id, to])).rejects.toThrow(/final status/);
    expect(await status(id)).toBe(from);
  });

  it.each([
    ["amount", "1"],
    ["plan", "'starter'"],
    ["user_id", "'user_b'"],
    ["phone_number", "'0881111111'"],
  ])("%s cannot be edited after creation", async (column, value) => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING" });
    await expect(db.query(`update public.payments set ${column} = ${value} where id = $1`, [id])).rejects.toThrow(/immutable/);
  });

  it("a provider reference can be set once, never reassigned", async () => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING" });
    await db.query("update public.payments set provider_reference = 'ref-1' where id = $1", [id]);
    await expect(db.query("update public.payments set provider_reference = 'ref-2' where id = $1", [id])).rejects.toThrow(/cannot change/);
  });

  it("provider references are globally unique", async () => {
    const a = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING" });
    const b = await insertPayment(db, { userId: "user_b", plan: "pro", status: "PENDING" });
    await db.query("update public.payments set provider_reference = 'dup' where id = $1", [a]);
    await expect(db.query("update public.payments set provider_reference = 'dup' where id = $1", [b])).rejects.toThrow(/unique/);
  });

  it("invalid status values are rejected", async () => {
    await expect(insertPayment(db, { userId: "user_a", plan: "pro", status: "REFUNDED" })).rejects.toThrow(/check constraint/);
  });

  it("concurrent transitions of one payment: exactly one wins", async () => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING" });
    const results = await Promise.all([transition(id, "SUCCESS"), transition(id, "SUCCESS"), transition(id, "FAILED")]);
    expect(results.reduce((n, r) => n + r.rows.length, 0)).toBe(1);
  });
});

describe("activation safety (database guard)", () => {
  const callRpc = (userId: string, paymentId: string, toPlan: "starter" | "pro") =>
    pglitePlanStore(db).applyTransition({
      userId,
      expectedVersion: 0,
      state: {
        plan: toPlan,
        status: "ACTIVE",
        startedAt: new Date("2026-09-26T00:00:00Z"),
        expiresAt: new Date("2026-10-26T00:00:00Z"),
        paymentId,
        previousPlan: "free",
        pendingPlan: null,
        pendingMonths: 0,
        pendingPaymentId: null,
      },
      events: [{ event: "activated", paymentId, fromPlan: "free", toPlan, periodStart: null, periodEnd: null }],
    });

  it.each(["PENDING", "FAILED", "CANCELLED"])("a %s payment can never activate a plan", async (paymentStatus) => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: paymentStatus });
    expect(await callRpc("user_a", id, "pro")).toBe("invalid_payment");
    expect((await db.query("select * from public.user_plans")).rows).toEqual([]);
  });

  it("another user's payment can never activate a plan", async () => {
    const id = await insertPayment(db, { userId: "user_b", plan: "pro", status: "SUCCESS" });
    expect(await callRpc("user_a", id, "pro")).toBe("invalid_payment");
  });

  it("a Starter payment can never grant Pro", async () => {
    const id = await insertPayment(db, { userId: "user_a", plan: "starter", status: "SUCCESS" });
    expect(await callRpc("user_a", id, "pro")).toBe("invalid_payment");
  });

  it("even if the app misreads a payment as SUCCESS, the database refuses", async () => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "FAILED" });
    const lying = { ...deps(), getPayment: async () => ({ ...(await getPaymentRow(db, id))!, status: "SUCCESS" as const }) };
    expect(await activatePlanForPayment(id, lying)).toEqual({ ok: false, error: "Payment failed database validation" });
    expect((await db.query("select * from public.user_plan_events")).rows).toEqual([]);
  });

  it("webhook and recovery settling + activating the same payment at once: applied once", async () => {
    const id = await insertPayment(db, { userId: "user_a", plan: "pro", status: "PENDING", completedAt: "2026-09-26T09:00:00.000Z" });
    const settleAndActivate = async () => {
      await transition(id, "SUCCESS");
      return activatePlanForPayment(id, deps());
    };
    const results = await Promise.all([settleAndActivate(), settleAndActivate(), settleAndActivate()]);
    expect(results.filter((r) => r.ok && r.outcome === "applied")).toHaveLength(1);
    expect((await db.query("select * from public.user_plan_events where payment_id = $1", [id])).rows).toHaveLength(1);
    const plan = (await db.query<{ version: number }>("select version from public.user_plans where user_id = 'user_a'")).rows[0];
    expect(plan.version).toBe(1);
  });

  it("queued downgrade through real activation: Pro kept, Starter queued", async () => {
    const pro = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-01T00:00:00.000Z" });
    const starter = await insertPayment(db, { userId: "user_a", plan: "starter", completedAt: "2026-09-10T00:00:00.000Z" });
    await activatePlanForPayment(pro, deps());
    expect(await activatePlanForPayment(starter, deps())).toMatchObject({ ok: true, outcome: "applied" });
    const row = (await db.query<{ plan: string; pending_plan: string; pending_months: number }>(
      "select plan, pending_plan, pending_months from public.user_plans where user_id = 'user_a'"
    )).rows[0];
    expect(row).toEqual({ plan: "pro", pending_plan: "starter", pending_months: 1 });
  });
});

describe("client roles have no access", () => {
  it.each(["subscriptions", "admin_audit_log", "payments", "user_plans", "user_plan_events", "payment_overview"])(
    "anon cannot read %s",
    async (table) => {
      await db.exec("set role anon");
      await expect(db.query(`select * from public.${table} limit 1`)).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  );

  it("authenticated cannot call the plan transition function", async () => {
    await db.exec("set role authenticated");
    await expect(
      db.query("select public.apply_user_plan_transition('u', 0, 'pro', 'ACTIVE', now(), now() + interval '1 month', null, 'free', null, 0, null, '[]'::jsonb)")
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
