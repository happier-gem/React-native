import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAdminAction, SYSTEM_ACTOR, type AuditAction } from "@/lib/audit-log";
import type { PlanId, TierId } from "@/lib/plans";
import {
  resolveEffectivePlan,
  rollForward,
  type EffectivePlan,
  type PlanEvent,
  type PlanEventType,
  type PlanState,
  type PlanStatus,
} from "@/lib/plan-rules";

// Mirrors the `user_plans` table (supabase/migrations/20260925000000_user_plans.sql).
type UserPlanRow = {
  id: string;
  user_id: string;
  plan: PlanId;
  status: PlanStatus;
  started_at: string;
  expires_at: string;
  payment_id: string | null;
  previous_plan: TierId | null;
  pending_plan: PlanId | null;
  pending_months: number;
  pending_payment_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

// Mirrors the `user_plan_events` table.
export type UserPlanEventRow = {
  id: string;
  user_id: string;
  event: PlanEventType;
  payment_id: string | null;
  from_plan: TierId | null;
  to_plan: TierId | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export type StoredUserPlan = { state: PlanState; version: number };

export type TransitionOutcome = "applied" | "conflict" | "duplicate";

/**
 * Storage boundary for plan state. The production implementation is
 * supabasePlanStore below; tests run the same SQL function through an
 * in-process Postgres instead (lib/plan-activation.test.ts).
 */
export type PlanStore = {
  getUserPlan(userId: string): Promise<StoredUserPlan | null>;
  hasEventForPayment(paymentId: string): Promise<boolean>;
  /** Atomic write of the new state plus its events — see
   * apply_user_plan_transition() in the migration for the outcomes. */
  applyTransition(input: {
    userId: string;
    expectedVersion: number;
    state: PlanState;
    events: PlanEvent[];
  }): Promise<TransitionOutcome>;
};

export function rowToStoredPlan(row: UserPlanRow): StoredUserPlan {
  return {
    version: row.version,
    state: {
      plan: row.plan,
      status: row.status,
      startedAt: new Date(row.started_at),
      expiresAt: new Date(row.expires_at),
      paymentId: row.payment_id,
      previousPlan: row.previous_plan,
      pendingPlan: row.pending_plan,
      pendingMonths: row.pending_months,
      pendingPaymentId: row.pending_payment_id,
    },
  };
}

/** Named arguments for apply_user_plan_transition(), shared by every store. */
export function toTransitionArgs(input: Parameters<PlanStore["applyTransition"]>[0]) {
  const { state } = input;
  return {
    p_user_id: input.userId,
    p_expected_version: input.expectedVersion,
    p_plan: state.plan,
    p_status: state.status,
    p_started_at: state.startedAt.toISOString(),
    p_expires_at: state.expiresAt.toISOString(),
    p_payment_id: state.paymentId,
    p_previous_plan: state.previousPlan,
    p_pending_plan: state.pendingPlan,
    p_pending_months: state.pendingMonths,
    p_pending_payment_id: state.pendingPaymentId,
    p_events: input.events.map((e) => ({
      event: e.event,
      payment_id: e.paymentId,
      from_plan: e.fromPlan,
      to_plan: e.toPlan,
      period_start: e.periodStart?.toISOString() ?? null,
      period_end: e.periodEnd?.toISOString() ?? null,
    })),
  };
}

function dbError(context: string, error: { message: string; code?: string }): Error {
  console.error(`[user-plans:${context}]`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
  return new Error("Plan storage error");
}

export const supabasePlanStore: PlanStore = {
  async getUserPlan(userId) {
    const { data, error } = await supabaseAdmin().from("user_plans").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw dbError("getUserPlan", error);
    return data ? rowToStoredPlan(data as UserPlanRow) : null;
  },

  async hasEventForPayment(paymentId) {
    const { data, error } = await supabaseAdmin()
      .from("user_plan_events")
      .select("id")
      .eq("payment_id", paymentId)
      .limit(1);
    if (error) throw dbError("hasEventForPayment", error);
    return (data ?? []).length > 0;
  },

  async applyTransition(input) {
    const { data, error } = await supabaseAdmin().rpc("apply_user_plan_transition", toTransitionArgs(input));
    if (error) throw dbError("applyTransition", error);
    if (data !== "applied" && data !== "conflict" && data !== "duplicate") {
      throw dbError("applyTransition", { message: `unexpected result ${String(data)}` });
    }
    return data;
  },
};

/** Best-effort mirror of committed plan events into admin_audit_log. The
 * authoritative record is user_plan_events, written in the same transaction
 * as the state change; payment credentials/phone numbers are never included. */
export async function auditPlanEvents(userId: string, events: PlanEvent[]): Promise<void> {
  for (const e of events) {
    await logAdminAction({
      actorUserId: SYSTEM_ACTOR,
      action: `plan.${e.event}` as AuditAction,
      targetUserId: userId,
      metadata: {
        paymentId: e.paymentId,
        fromPlan: e.fromPlan,
        toPlan: e.toPlan,
        periodStart: e.periodStart?.toISOString() ?? null,
        periodEnd: e.periodEnd?.toISOString() ?? null,
      },
    });
  }
}

/** Read-only: the user's effective plan right now. No writes, so it's safe
 * anywhere (admin pages included). Expiry is computed, not stored-then-read. */
export async function getEffectiveUserPlan(
  userId: string,
  store: PlanStore = supabasePlanStore,
  now: Date = new Date()
): Promise<EffectivePlan> {
  const stored = await store.getUserPlan(userId);
  return resolveEffectivePlan(stored?.state ?? null, now);
}

const MAX_WRITE_ATTEMPTS = 3;

/**
 * Like getEffectiveUserPlan(), but also persists anything that has lapsed
 * since the last write (status -> EXPIRED, or a queued downgrade taking over)
 * and records it as history. Correctness never depends on this having run —
 * resolution is always dynamic — it just keeps the stored status and history
 * honest without a cron job. A write failure is logged, not surfaced: the
 * computed answer is still right.
 */
export async function syncUserPlan(
  userId: string,
  store: PlanStore = supabasePlanStore,
  now: Date = new Date()
): Promise<EffectivePlan> {
  let stored = await store.getUserPlan(userId);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    if (!stored) break;
    const { state, events } = rollForward(stored.state, now);
    if (!state || events.length === 0) break;

    try {
      const outcome = await store.applyTransition({ userId, expectedVersion: stored.version, state, events });
      if (outcome === "applied") {
        await auditPlanEvents(userId, events);
        return resolveEffectivePlan(state, now);
      }
    } catch {
      break; // already logged by the store
    }
    // conflict (or an impossible duplicate — these events carry no payment):
    // someone else wrote first; re-read and try again.
    stored = await store.getUserPlan(userId);
  }

  return resolveEffectivePlan(stored?.state ?? null, now);
}

/** Recent plan history for the admin view, newest first. */
export async function listPlanEventsForUser(userId: string, limit: number): Promise<UserPlanEventRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("user_plan_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError("listPlanEventsForUser", error);
  return (data as UserPlanEventRow[] | null) ?? [];
}
