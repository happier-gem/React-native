import "server-only";
import { getPaymentById, type PaymentRecord } from "@/lib/payments";
import { applySuccessfulPayment, type PlanEvent } from "@/lib/plan-rules";
import { auditPlanEvents, supabasePlanStore, type PlanStore } from "@/lib/user-plans";
import { paymentLog } from "@/lib/payment-log";

/**
 * ============================================================================
 * BILLING/PLAN SERVICE BOUNDARY.
 *
 *   Payment Service (lib/payments.ts) — pure persistence, zero plan rules.
 *   → Payment SUCCESS (transitionPaymentStatus, from the verified webhook)
 *   → this file — turns one successful payment into a plan change, exactly once.
 *   → Plan rules (lib/plan-rules.ts) — the activation/renewal/upgrade/
 *     downgrade/expiry behavior itself, documented there.
 *
 * SERVER-DRIVEN ONLY: called from exactly one place —
 * admin/app/api/payments/webhook/route.ts, after the webhook signature has been
 * verified. There is no client-callable route that reaches this, and there
 * must never be one — a mobile client cannot activate its own plan.
 *
 * IDEMPOTENT: the payment's id is recorded in user_plan_events under a unique
 * index, in the same transaction as the plan change, so a replayed webhook, a
 * retry after a crash, or two concurrent deliveries can apply a payment at
 * most once. That's also why the webhook may safely call this again for a
 * payment that is already SUCCESS: if activation failed the first time, the
 * provider's retry is what completes it.
 * ============================================================================
 */

export type ActivationResult =
  | { ok: true; outcome: "applied"; events: PlanEvent[] }
  | { ok: true; outcome: "duplicate" | "not_successful" }
  | { ok: false; error: string };

type ActivationPayment = Pick<PaymentRecord, "id" | "user_id" | "plan" | "status" | "completed_at">;

export type ActivationDeps = {
  store: PlanStore;
  getPayment: (id: string) => Promise<ActivationPayment | null>;
  audit: (userId: string, events: PlanEvent[]) => Promise<void>;
  now: () => Date;
};

const defaultDeps: ActivationDeps = {
  store: supabasePlanStore,
  getPayment: getPaymentById,
  audit: auditPlanEvents,
  now: () => new Date(),
};

const MAX_ATTEMPTS = 3;

export async function activatePlanForPayment(
  paymentId: string,
  deps: ActivationDeps = defaultDeps
): Promise<ActivationResult> {
  try {
    // Re-read rather than trusting the caller's copy: only a payment the
    // database itself says is SUCCESS may ever grant access.
    const payment = await deps.getPayment(paymentId);
    if (!payment) return { ok: false, error: "Payment not found" };
    if (payment.status !== "SUCCESS") return { ok: true, outcome: "not_successful" };

    // The access period starts at the moment the payment succeeded, even if
    // this runs later (e.g. on a provider retry after a failed first attempt).
    const at = payment.completed_at ? new Date(payment.completed_at) : deps.now();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (await deps.store.hasEventForPayment(payment.id)) return { ok: true, outcome: "duplicate" };

      const current = await deps.store.getUserPlan(payment.user_id);
      const { state, events } = applySuccessfulPayment(current?.state ?? null, { id: payment.id, plan: payment.plan }, at);

      const outcome = await deps.store.applyTransition({
        userId: payment.user_id,
        expectedVersion: current?.version ?? 0,
        state,
        events,
      });

      if (outcome === "applied") {
        paymentLog("info", "activation.applied", {
          source: "activation",
          paymentId: payment.id,
          userId: payment.user_id,
          outcome: events.map((e) => e.event).join(","),
        });
        await deps.audit(payment.user_id, events);
        return { ok: true, outcome: "applied", events };
      }
      if (outcome === "duplicate") return { ok: true, outcome: "duplicate" };
      if (outcome === "invalid_payment") {
        // The database's own check disagrees with what we read — e.g. the
        // payment isn't SUCCESS any more, or belongs to someone else. Never
        // retried blindly; reconciliation surfaces it as "success without plan".
        paymentLog("error", "activation.invalid_payment", { source: "activation", paymentId: payment.id, userId: payment.user_id });
        return { ok: false, error: "Payment failed database validation" };
      }
      // conflict: another write landed between our read and write — recompute.
    }

    return { ok: false, error: "Plan state kept changing concurrently; retry later" };
  } catch (e) {
    console.error("[plan-activation]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Plan activation failed" };
  }
}

export async function handleSuccessfulPayment(payment: Pick<PaymentRecord, "id">): Promise<ActivationResult> {
  return activatePlanForPayment(payment.id);
}
