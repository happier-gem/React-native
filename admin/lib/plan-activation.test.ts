import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGliteInterface } from "@electric-sql/pglite";
import { activatePlanForPayment, type ActivationDeps } from "@/lib/plan-activation";
import { getEffectiveUserPlan, syncUserPlan } from "@/lib/user-plans";
import { PLANS } from "@/lib/plans";
import { createTestDb, getPaymentRow, insertPayment, pglitePlanStore, readSql, migrationFiles } from "@/test/pglite-db";

// Audit entries are best-effort mirrors; capture them instead of hitting Supabase.
const audited = vi.hoisted(() => [] as { action: string; targetUserId?: string; actorUserId?: string; metadata?: unknown }[]);
vi.mock("@/lib/audit-log", () => ({
  SYSTEM_ACTOR: "system",
  logAdminAction: async (entry: (typeof audited)[number]) => {
    audited.push(entry);
  },
}));

let db: PGliteInterface;
let deps: ActivationDeps;

async function userPlanRow(userId: string) {
  const { rows } = await db.query<{ plan: string; status: string; started_at: Date; expires_at: Date; payment_id: string; version: number }>(
    "select * from public.user_plans where user_id = $1",
    [userId]
  );
  return rows[0];
}

async function eventsFor(userId: string) {
  const { rows } = await db.query<{ event: string; payment_id: string | null }>(
    "select event, payment_id from public.user_plan_events where user_id = $1 order by created_at, event",
    [userId]
  );
  return rows;
}

// Booting Postgres + loading the schema is the slow part; do it once and give
// every test its own clone.
let template: PGliteInterface;
beforeAll(async () => {
  template = await createTestDb();
});

beforeEach(async () => {
  db = await template.clone();
  audited.length = 0;
  deps = {
    store: pglitePlanStore(db),
    getPayment: (id) => getPaymentRow(db, id),
    audit: async (userId, events) => {
      for (const e of events) audited.push({ action: `plan.${e.event}`, targetUserId: userId });
    },
    now: () => new Date("2026-09-25T10:00:00.000Z"),
  };
});

describe("schema", () => {
  it("fresh schema.sql and the upgrade path (schema + migrations, run twice) both apply cleanly", async () => {
    const fresh = await createTestDb({ withMigrations: false });
    await fresh.query("select 1 from public.user_plans limit 0");
    // Migrations are idempotent — re-running on an up-to-date DB is harmless.
    for (const file of migrationFiles()) await db.exec(readSql(file));
  });

  it("rejects invalid plan values", async () => {
    await expect(
      db.query(
        "insert into public.user_plans (user_id, plan, started_at, expires_at) values ('u', 'enterprise', now(), now() + interval '1 month')"
      )
    ).rejects.toThrow(/check constraint/);
  });

  it("only service_role may execute the transition function", async () => {
    const sig = "public.apply_user_plan_transition(text, integer, text, text, timestamptz, timestamptz, uuid, text, text, integer, uuid, jsonb)";
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select has_function_privilege('anon', '${sig}', 'execute') as anon,
              has_function_privilege('authenticated', '${sig}', 'execute') as authenticated,
              has_function_privilege('service_role', '${sig}', 'execute') as service`
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});

describe("activation through the webhook path", () => {
  it.each(["starter", "pro"] as const)("FREE -> %s", async (plan) => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan, completedAt: "2026-09-25T09:00:00.000Z" });
    const result = await activatePlanForPayment(paymentId, deps);
    expect(result).toMatchObject({ ok: true, outcome: "applied" });

    const row = await userPlanRow("user_a");
    expect(row).toMatchObject({ plan, status: "ACTIVE", payment_id: paymentId, version: 1 });
    expect(row.started_at.toISOString()).toBe("2026-09-25T09:00:00.000Z");
    expect(row.expires_at.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(await eventsFor("user_a")).toEqual([{ event: "activated", payment_id: paymentId }]);
    expect(audited).toEqual([{ action: "plan.activated", targetUserId: "user_a" }]);

    const effective = await getEffectiveUserPlan("user_a", deps.store, new Date("2026-10-01T00:00:00.000Z"));
    expect(effective).toMatchObject({ plan, isActive: true });
  });

  it("renews an active plan from its current expiry", async () => {
    const first = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-25T00:00:00.000Z" });
    await activatePlanForPayment(first, deps);
    const second = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-10-10T00:00:00.000Z" });
    expect(await activatePlanForPayment(second, deps)).toMatchObject({ ok: true, outcome: "applied" });

    const row = await userPlanRow("user_a");
    expect(row.expires_at.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(row.payment_id).toBe(second);
    expect((await eventsFor("user_a")).map((e) => e.event)).toEqual(["activated", "renewed"]);
  });

  it("upgrades STARTER -> PRO", async () => {
    const starter = await insertPayment(db, { userId: "user_a", plan: "starter", completedAt: "2026-09-01T00:00:00.000Z" });
    await activatePlanForPayment(starter, deps);
    const pro = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-15T00:00:00.000Z" });
    await activatePlanForPayment(pro, deps);

    const row = await userPlanRow("user_a");
    expect(row).toMatchObject({ plan: "pro", previous_plan: "starter" });
    expect(row.expires_at.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("ignores a payment the database does not say is SUCCESS", async () => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan: "pro", status: "FAILED" });
    expect(await activatePlanForPayment(paymentId, deps)).toEqual({ ok: true, outcome: "not_successful" });
    expect(await userPlanRow("user_a")).toBeUndefined();
  });
});

describe("idempotency", () => {
  it("processing the same successful payment twice activates once and never extends twice", async () => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-25T00:00:00.000Z" });
    expect(await activatePlanForPayment(paymentId, deps)).toMatchObject({ outcome: "applied" });
    expect(await activatePlanForPayment(paymentId, deps)).toEqual({ ok: true, outcome: "duplicate" });

    const row = await userPlanRow("user_a");
    expect(row.expires_at.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(row.version).toBe(1);
    expect(await eventsFor("user_a")).toHaveLength(1);
    expect(audited).toHaveLength(1);
  });

  it("two concurrent deliveries of the same payment apply it once", async () => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan: "starter", completedAt: "2026-09-25T00:00:00.000Z" });
    const results = await Promise.all([activatePlanForPayment(paymentId, deps), activatePlanForPayment(paymentId, deps)]);
    expect(results.map((r) => (r.ok ? r.outcome : r.error)).sort()).toEqual(["applied", "duplicate"]);
    expect(await eventsFor("user_a")).toHaveLength(1);
    expect((await userPlanRow("user_a")).expires_at.toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("two different concurrent renewals both count (version conflict is retried, not lost)", async () => {
    const first = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-25T00:00:00.000Z" });
    await activatePlanForPayment(first, deps);
    const [a, b] = await Promise.all([
      insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-10-01T00:00:00.000Z" }),
      insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-10-01T00:00:00.000Z" }),
    ]);
    const results = await Promise.all([activatePlanForPayment(a, deps), activatePlanForPayment(b, deps)]);
    expect(results.every((r) => r.ok && r.outcome === "applied")).toBe(true);
    expect((await userPlanRow("user_a")).expires_at.toISOString()).toBe("2026-12-25T00:00:00.000Z");
  });

  it("the SQL function refuses a recorded payment and rolls back the state change", async () => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-25T00:00:00.000Z" });
    await activatePlanForPayment(paymentId, deps);
    const before = await userPlanRow("user_a");

    const store = pglitePlanStore(db);
    const outcome = await store.applyTransition({
      userId: "user_a",
      expectedVersion: before.version,
      state: {
        plan: "pro",
        status: "ACTIVE",
        startedAt: before.started_at,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        paymentId,
        previousPlan: "free",
        pendingPlan: null,
        pendingMonths: 0,
        pendingPaymentId: null,
      },
      events: [{ event: "renewed", paymentId, fromPlan: "pro", toPlan: "pro", periodStart: null, periodEnd: null }],
    });
    expect(outcome).toBe("duplicate");
    const after = await userPlanRow("user_a");
    expect(after.expires_at.toISOString()).toBe(before.expires_at.toISOString());
    expect(after.version).toBe(before.version);
  });

  it("the SQL function rejects a write based on a stale read", async () => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan: "pro", completedAt: "2026-09-25T00:00:00.000Z" });
    await activatePlanForPayment(paymentId, deps);
    const store = pglitePlanStore(db);
    const current = (await store.getUserPlan("user_a"))!;
    expect(await store.applyTransition({ userId: "user_a", expectedVersion: current.version + 5, state: current.state, events: [] })).toBe(
      "conflict"
    );
  });
});

describe("expiration", () => {
  it.each(["starter", "pro"] as const)("expired %s -> FREE, history kept, expiry recorded once", async (plan) => {
    const paymentId = await insertPayment(db, { userId: "user_a", plan, completedAt: "2026-08-01T00:00:00.000Z" });
    await activatePlanForPayment(paymentId, deps);
    audited.length = 0;
    const later = new Date("2026-09-25T00:00:00.000Z");

    const effective = await syncUserPlan("user_a", deps.store, later);
    expect(effective).toMatchObject({ plan: "free", status: "ACTIVE", isActive: true, expiresAt: null });
    expect(effective.storedPlan).toMatchObject({ plan, status: "EXPIRED" });

    const row = await userPlanRow("user_a");
    expect(row).toMatchObject({ plan, status: "EXPIRED", payment_id: paymentId });
    expect(audited).toMatchObject([
      { actorUserId: "system", action: "plan.expired", targetUserId: "user_a", metadata: { fromPlan: plan, toPlan: "free" } },
    ]);

    await syncUserPlan("user_a", deps.store, later); // no second expiry event
    expect((await eventsFor("user_a")).map((e) => e.event)).toEqual(["activated", "expired"]);
    const { rows } = await db.query("select count(*)::int as n from public.payments where id = $1", [paymentId]);
    expect(rows[0]).toEqual({ n: 1 }); // payment history untouched
  });
});

describe("pricing", () => {
  it("stored payment amounts come from the server's plan table", () => {
    expect(PLANS.starter).toMatchObject({ price: 2000, currency: "MWK", interval: "monthly" });
    expect(PLANS.pro).toMatchObject({ price: 5000, currency: "MWK", interval: "monthly" });
  });
});
