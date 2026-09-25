import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import type { PaymentStatus } from "@/lib/payments";
import { rowToStoredPlan, toTransitionArgs, type PlanStore, type TransitionOutcome } from "@/lib/user-plans";

const supabaseDir = join(__dirname, "..", "supabase");

export const readSql = (relative: string) => readFileSync(join(supabaseDir, relative), "utf8");

export const migrationFiles = () =>
  readdirSync(join(supabaseDir, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `migrations/${f}`);

/**
 * An in-process Postgres loaded with the real schema.sql (+ migrations, the
 * upgrade path). Supabase's built-in roles are created first because the
 * migrations grant/revoke on them.
 */
export async function createTestDb({ withMigrations = true } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
  `);
  await db.exec(readSql("schema.sql"));
  if (withMigrations) {
    for (const file of migrationFiles()) await db.exec(readSql(file));
  }
  return db;
}

export async function insertPayment(
  db: PGliteInterface,
  p: { userId: string; plan: "starter" | "pro"; status?: string; completedAt?: string | null }
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.payments (user_id, plan, amount, currency, provider, phone_number, internal_reference, status, completed_at)
     values ($1, $2, $3, 'MWK', 'airtel_money', '0991234567', gen_random_uuid()::text, $4, $5)
     returning id`,
    [p.userId, p.plan, p.plan === "pro" ? 5000 : 2000, p.status ?? "SUCCESS", p.completedAt ?? null]
  );
  return rows[0].id;
}

export async function getPaymentRow(db: PGliteInterface, id: string) {
  const { rows } = await db.query<{ id: string; user_id: string; plan: "starter" | "pro"; status: string; completed_at: Date | null }>(
    "select id, user_id, plan, status, completed_at from public.payments where id = $1",
    [id]
  );
  const row = rows[0];
  return row ? { ...row, status: row.status as PaymentStatus, completed_at: row.completed_at?.toISOString() ?? null } : null;
}

/** Same contract as supabasePlanStore, calling the same SQL function. */
export function pglitePlanStore(db: PGliteInterface): PlanStore {
  return {
    async getUserPlan(userId) {
      const { rows } = await db.query("select * from public.user_plans where user_id = $1", [userId]);
      return rows[0] ? rowToStoredPlan(rows[0] as Parameters<typeof rowToStoredPlan>[0]) : null;
    },
    async hasEventForPayment(paymentId) {
      const { rows } = await db.query("select 1 from public.user_plan_events where payment_id = $1 limit 1", [paymentId]);
      return rows.length > 0;
    },
    async applyTransition(input) {
      const a = toTransitionArgs(input);
      const { rows } = await db.query<{ r: TransitionOutcome }>(
        "select public.apply_user_plan_transition($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) as r",
        [
          a.p_user_id,
          a.p_expected_version,
          a.p_plan,
          a.p_status,
          a.p_started_at,
          a.p_expires_at,
          a.p_payment_id,
          a.p_previous_plan,
          a.p_pending_plan,
          a.p_pending_months,
          a.p_pending_payment_id,
          JSON.stringify(a.p_events),
        ]
      );
      return rows[0].r;
    },
  };
}
