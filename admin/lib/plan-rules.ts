import { PAID_PERIOD_MONTHS, TIER_RANK, type PlanId, type TierId } from "@/lib/plans";

/**
 * Pure plan business rules — no I/O, no clock reads. Every function takes the
 * instant it should evaluate at, so the rules can be tested deterministically
 * (see lib/plan-rules.test.ts). Persistence lives in lib/user-plans.ts; the
 * payment-driven entry point is lib/plan-activation.ts.
 *
 * Final behavior (mobile money has no auto-debit, so every period is paid for
 * manually — there is no "auto-renew" to cancel):
 *
 *   ACTIVATION   No active paid plan -> the plan starts at the payment time and
 *                lasts PAID_PERIOD_MONTHS calendar months.
 *   RENEWAL      Same plan, still active -> extend from the CURRENT expiry, not
 *                from the payment time. Already expired -> treated as a fresh
 *                activation from the payment time.
 *   UPGRADE      Higher plan while a lower one is active -> the higher plan
 *                starts at the payment time. No proration, no credit for the
 *                unused part of the lower plan.
 *   DOWNGRADE    Lower plan paid for while a higher one is active -> NOT applied
 *                immediately. It is queued (pending_plan/pending_months) and
 *                starts exactly when the higher plan expires. Paying for the
 *                queued plan again queues one more month.
 *   EXPIRATION   expires_at <= now -> a queued downgrade (if any) takes over,
 *                otherwise the user is effectively on FREE. The stored row is
 *                kept (status EXPIRED) as history; nothing is deleted.
 */

export type PlanStatus = "ACTIVE" | "EXPIRED";

/** A user's stored paid-plan state (one row of `user_plans`, minus bookkeeping). */
export type PlanState = {
  plan: PlanId;
  status: PlanStatus;
  startedAt: Date;
  expiresAt: Date;
  paymentId: string | null;
  previousPlan: TierId | null;
  pendingPlan: PlanId | null;
  pendingMonths: number;
  pendingPaymentId: string | null;
};

export type PlanEventType =
  | "activated"
  | "renewed"
  | "upgraded"
  | "downgrade_scheduled"
  | "downgrade_applied"
  | "expired";

/** One row of `user_plan_events` — the history/idempotency ledger. */
export type PlanEvent = {
  event: PlanEventType;
  paymentId: string | null;
  fromPlan: TierId | null;
  toPlan: TierId | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

/**
 * Calendar-month arithmetic in UTC. The day of month is kept when it exists in
 * the target month and clamped to that month's last day when it doesn't:
 *   2026-09-25 + 1 -> 2026-10-25
 *   2026-01-31 + 1 -> 2026-02-28   (2028-01-31 + 1 -> 2028-02-29)
 *   2026-03-31 + 1 -> 2026-04-30
 * Time of day is preserved. Clamping means a renewal chain that started on the
 * 31st drifts to the 28th/30th and stays there (each renewal adds a month to
 * the previous expiry) — the user never gets less than a full calendar month
 * and never spills into the month after next, which adding 30 days can't
 * guarantee. UTC (not Malawi time, UTC+2) is used so the result never depends
 * on the server's timezone.
 */
export function addMonths(date: Date, months: number): Date {
  const targetMonthIndex = date.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(date.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      targetMonthIndex,
      Math.min(date.getUTCDate(), lastDayOfTarget),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

/** Paid access is active only while `at` is strictly before expires_at. */
export function isPaidAccessActive(state: PlanState | null, at: Date): state is PlanState {
  return state !== null && state.status === "ACTIVE" && state.expiresAt.getTime() > at.getTime();
}

/**
 * Brings a stored state up to date at `at`: promotes a queued downgrade when
 * the current period has ended, and marks a lapsed plan EXPIRED. Returns the
 * events that happened so they can be persisted/audited. Never invents paid
 * time — a lapsed plan with nothing queued simply expires.
 */
export function rollForward(state: PlanState | null, at: Date): { state: PlanState | null; events: PlanEvent[] } {
  const events: PlanEvent[] = [];
  let current = state;

  while (current && current.status === "ACTIVE" && current.expiresAt.getTime() <= at.getTime()) {
    if (current.pendingPlan && current.pendingMonths > 0) {
      const next: PlanState = {
        plan: current.pendingPlan,
        status: "ACTIVE",
        startedAt: current.expiresAt,
        expiresAt: addMonths(current.expiresAt, current.pendingMonths),
        paymentId: current.pendingPaymentId,
        previousPlan: current.plan,
        pendingPlan: null,
        pendingMonths: 0,
        pendingPaymentId: null,
      };
      events.push({
        event: "downgrade_applied",
        paymentId: null,
        fromPlan: current.plan,
        toPlan: next.plan,
        periodStart: next.startedAt,
        periodEnd: next.expiresAt,
      });
      current = next; // loop again: the promoted period may itself have lapsed
    } else {
      current = { ...current, status: "EXPIRED" };
      events.push({
        event: "expired",
        paymentId: null,
        fromPlan: current.plan,
        toPlan: "free",
        periodStart: null,
        periodEnd: current.expiresAt,
      });
    }
  }

  return { state: current, events };
}

/**
 * The state after a verified successful payment for `payment.plan` at `at`.
 * Rolls the stored state forward to `at` first, so "is the current plan still
 * active?" is always answered at the payment time.
 */
export function applySuccessfulPayment(
  stored: PlanState | null,
  payment: { id: string; plan: PlanId },
  at: Date
): { state: PlanState; events: PlanEvent[] } {
  const rolled = rollForward(stored, at);
  const events = [...rolled.events];
  const current = rolled.state;

  if (!isPaidAccessActive(current, at)) {
    const state: PlanState = {
      plan: payment.plan,
      status: "ACTIVE",
      startedAt: at,
      expiresAt: addMonths(at, PAID_PERIOD_MONTHS),
      paymentId: payment.id,
      // The effective tier before this payment was FREE (nothing active), even
      // if an older paid period exists — that history is in user_plan_events.
      previousPlan: "free",
      pendingPlan: null,
      pendingMonths: 0,
      pendingPaymentId: null,
    };
    events.push({ event: "activated", paymentId: payment.id, fromPlan: "free", toPlan: state.plan, periodStart: state.startedAt, periodEnd: state.expiresAt });
    return { state, events };
  }

  if (payment.plan === current.plan) {
    const state: PlanState = {
      ...current,
      expiresAt: addMonths(current.expiresAt, PAID_PERIOD_MONTHS),
      paymentId: payment.id,
    };
    events.push({ event: "renewed", paymentId: payment.id, fromPlan: current.plan, toPlan: state.plan, periodStart: current.expiresAt, periodEnd: state.expiresAt });
    return { state, events };
  }

  if (TIER_RANK[payment.plan] > TIER_RANK[current.plan]) {
    const state: PlanState = {
      plan: payment.plan,
      status: "ACTIVE",
      startedAt: at,
      expiresAt: addMonths(at, PAID_PERIOD_MONTHS),
      paymentId: payment.id,
      previousPlan: current.plan,
      // A queued downgrade only ever exists below the current plan; an upgrade
      // past it makes no sense to keep, and with three tiers can't occur anyway.
      pendingPlan: null,
      pendingMonths: 0,
      pendingPaymentId: null,
    };
    events.push({ event: "upgraded", paymentId: payment.id, fromPlan: current.plan, toPlan: state.plan, periodStart: state.startedAt, periodEnd: state.expiresAt });
    return { state, events };
  }

  // Downgrade: queue it behind the current paid period.
  const monthsBefore = current.pendingPlan === payment.plan ? current.pendingMonths : 0;
  const state: PlanState = {
    ...current,
    pendingPlan: payment.plan,
    pendingMonths: monthsBefore + PAID_PERIOD_MONTHS,
    pendingPaymentId: payment.id,
  };
  events.push({
    event: "downgrade_scheduled",
    paymentId: payment.id,
    fromPlan: current.plan,
    toPlan: payment.plan,
    periodStart: addMonths(current.expiresAt, monthsBefore),
    periodEnd: addMonths(current.expiresAt, state.pendingMonths),
  });
  return { state, events };
}

export type EffectivePlan = {
  /** The tier the user actually has right now. FREE when no paid access. */
  plan: TierId;
  status: PlanStatus;
  isActive: boolean;
  /** Null for FREE — it has no period. */
  startedAt: Date | null;
  expiresAt: Date | null;
  /** A queued downgrade and the window it will cover, if any. */
  pendingChange: { plan: PlanId; startsAt: Date; expiresAt: Date } | null;
  /** The stored paid-plan record as of `at` (after roll-forward), kept even
   * once it has expired so history stays visible. Null if never paid. */
  storedPlan: { plan: PlanId; status: PlanStatus; startedAt: Date; expiresAt: Date } | null;
};

/** Dynamic resolution — correct even if no background job has ever run. */
export function resolveEffectivePlan(stored: PlanState | null, at: Date): EffectivePlan {
  const { state } = rollForward(stored, at);
  const storedPlan = state
    ? { plan: state.plan, status: state.status, startedAt: state.startedAt, expiresAt: state.expiresAt }
    : null;

  if (isPaidAccessActive(state, at)) {
    return {
      plan: state.plan,
      status: "ACTIVE",
      isActive: true,
      startedAt: state.startedAt,
      expiresAt: state.expiresAt,
      pendingChange: state.pendingPlan
        ? { plan: state.pendingPlan, startsAt: state.expiresAt, expiresAt: addMonths(state.expiresAt, state.pendingMonths) }
        : null,
      storedPlan,
    };
  }

  // FREE is always available and never expires.
  return { plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null, pendingChange: null, storedPlan };
}
