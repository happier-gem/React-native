import "server-only";
import { getPaymentProvider } from "@/lib/infi-pay";
import type { PaymentProvider } from "@/lib/payment-provider";
import {
  listPendingPaymentsOlderThan,
  listSuccessfulPaymentsWithoutPlan,
  recordProviderCheck,
  recordProviderConflict,
  transitionPaymentStatus,
  type PaymentRecord,
  type PaymentStatus,
  type TerminalPaymentStatus,
  type TransitionResult,
} from "@/lib/payments";
import { activatePlanForPayment, type ActivationResult } from "@/lib/plan-activation";
import { paymentLog } from "@/lib/payment-log";

/**
 * ============================================================================
 * PENDING-PAYMENT POLICY — PROVISIONAL, NOT BUSINESS/PROVIDER APPROVED.
 *
 * INFI-PAY's real payment lifetime/SLA is unknown, so nothing here ever turns
 * a payment FAILED because of its age. Age only decides:
 *   PAYMENT_RECOVERY_MIN_AGE_MINUTES  (default 10) — how old a PENDING payment
 *     must be before recovery asks the provider about it (gives the webhook a
 *     chance first).
 *   PAYMENT_PENDING_REVIEW_AFTER_HOURS (default 24) — when a still-PENDING
 *     payment is flagged for manual investigation (lib/payment-reconciliation.ts).
 * Only a status verifiably reported by the provider changes a payment.
 * ============================================================================
 */
export function paymentPolicy() {
  const num = (name: string, fallback: number, min: number, max: number) => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
  };
  return {
    recoveryMinAgeMinutes: num("PAYMENT_RECOVERY_MIN_AGE_MINUTES", 10, 1, 24 * 60),
    pendingReviewAfterHours: num("PAYMENT_PENDING_REVIEW_AFTER_HOURS", 24, 1, 24 * 30),
  };
}

/** Give an in-flight activation (webhook) time to finish before retrying it. */
const ACTIVATION_GRACE_MS = 2 * 60_000;
const DEFAULT_BATCH = 50;

export type RecoverySummary = {
  providerConfigured: boolean;
  checked: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  stillPending: number;
  alreadySettled: number;
  unknownStatus: number;
  providerUnavailable: number;
  noProviderReference: number;
  /** Provider said SUCCESS but for a different amount/currency — not applied. */
  amountMismatch: number;
  activationsRetried: number;
  activationsApplied: number;
  activationFailures: number;
  errors: number;
};

export type RecoveryDeps = {
  provider: Pick<PaymentProvider, "config" | "getTransactionStatus">;
  listPending: (olderThan: Date, limit: number) => Promise<PaymentRecord[]>;
  listSuccessWithoutPlan: (settledBefore: Date, limit: number) => Promise<Pick<PaymentRecord, "id">[]>;
  transition: (id: string, status: TerminalPaymentStatus, opts: { failureReason?: string }) => Promise<TransitionResult>;
  activate: (paymentId: string) => Promise<ActivationResult>;
  recordCheck: (id: string, check: { result: string; status?: string }) => Promise<void>;
  recordConflict: (
    id: string,
    conflict: { localStatus: PaymentStatus; reportedStatus: string; source: "webhook" | "recovery" }
  ) => Promise<void>;
  now: () => Date;
};

const defaultDeps = (): RecoveryDeps => ({
  provider: getPaymentProvider(),
  listPending: listPendingPaymentsOlderThan,
  listSuccessWithoutPlan: listSuccessfulPaymentsWithoutPlan,
  transition: transitionPaymentStatus,
  activate: (id) => activatePlanForPayment(id),
  recordCheck: recordProviderCheck,
  recordConflict: recordProviderConflict,
  now: () => new Date(),
});

/**
 * Safe to run on a schedule, by hand, or concurrently with itself and with
 * webhooks: every status change goes through the atomic PENDING-only
 * transition, and activation is idempotent in the database.
 */
export async function recoverPendingPayments(
  opts: {
    limit?: number;
    /** Override the policy's minimum age — a verified webhook uses 0 to check
     * recent payments immediately. */
    minAgeMinutes?: number;
    deps?: Partial<RecoveryDeps>;
  } = {}
): Promise<RecoverySummary> {
  const deps = { ...defaultDeps(), ...opts.deps };
  const limit = opts.limit ?? DEFAULT_BATCH;
  const policy = paymentPolicy();
  const now = deps.now();
  const configured = deps.provider.config().configured;

  const summary: RecoverySummary = {
    providerConfigured: configured,
    checked: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    stillPending: 0,
    alreadySettled: 0,
    unknownStatus: 0,
    providerUnavailable: 0,
    noProviderReference: 0,
    amountMismatch: 0,
    activationsRetried: 0,
    activationsApplied: 0,
    activationFailures: 0,
    errors: 0,
  };

  const activate = async (paymentId: string) => {
    const result = await deps.activate(paymentId);
    if (!result.ok) summary.activationFailures++;
    else if (result.outcome === "applied") summary.activationsApplied++;
  };

  // 1. Ask the provider about PENDING payments the webhook hasn't settled.
  if (configured) {
    let pending: PaymentRecord[] = [];
    try {
      const minAge = opts.minAgeMinutes ?? policy.recoveryMinAgeMinutes;
      pending = await deps.listPending(new Date(now.getTime() - minAge * 60_000), limit);
    } catch {
      summary.errors++;
    }

    for (const payment of pending) {
      if (!payment.provider_reference) {
        // Initiation never got a reference (e.g. uncertain outcome). We can't
        // ask the provider; reconciliation flags it for a human.
        summary.noProviderReference++;
        continue;
      }
      summary.checked++;
      try {
        const res = await deps.provider.getTransactionStatus(payment.provider_reference);
        if (res.kind === "unavailable") {
          summary.providerUnavailable++;
          await deps.recordCheck(payment.id, { result: "unavailable" });
          continue;
        }
        if (res.kind === "unknown_status") {
          summary.unknownStatus++;
          await deps.recordCheck(payment.id, { result: "unknown_status", status: res.rawStatus });
          continue;
        }
        await deps.recordCheck(payment.id, { result: "status", status: res.status });
        if (res.status === "PENDING") {
          summary.stillPending++;
          continue;
        }

        // Never accept a SUCCESS for a different amount or currency than we
        // charged — that's either a bug or tampering, and needs a human.
        if (
          res.status === "SUCCESS" &&
          ((res.amount !== undefined && Number(res.amount) !== Number(payment.amount)) ||
            (res.currency !== undefined && res.currency !== payment.currency))
        ) {
          summary.amountMismatch++;
          paymentLog("error", "recovery.amount_mismatch", { source: "recovery", paymentId: payment.id, providerReference: payment.provider_reference });
          await deps.recordConflict(payment.id, {
            localStatus: payment.status,
            reportedStatus: `SUCCESS with ${res.amount ?? "?"} ${res.currency ?? "?"} (expected ${payment.amount} ${payment.currency})`,
            source: "recovery",
          });
          continue;
        }

        const t = await deps.transition(payment.id, res.status, { failureReason: res.failureReason });
        if (!t.ok) {
          summary.errors++;
          continue;
        }
        paymentLog("info", "recovery.status", {
          source: "recovery",
          paymentId: payment.id,
          providerReference: payment.provider_reference,
          status: res.status,
          outcome: t.alreadyProcessed ? "already_processed" : "transitioned",
        });
        if (t.alreadyProcessed) {
          summary.alreadySettled++;
          if (t.currentStatus !== res.status) {
            await deps.recordConflict(payment.id, { localStatus: t.currentStatus, reportedStatus: res.status, source: "recovery" });
          }
        } else if (res.status === "SUCCESS") summary.succeeded++;
        else if (res.status === "FAILED") summary.failed++;
        else summary.cancelled++;

        if (t.currentStatus === "SUCCESS") await activate(payment.id);
      } catch (e) {
        summary.errors++;
        paymentLog("error", "recovery.error", {
          source: "recovery",
          paymentId: payment.id,
          reason: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  }

  // 2. SUCCESS payments with no plan change recorded (activation failed, or a
  // webhook that got a 5xx was never redelivered). Activation re-verifies the
  // payment in the database and is idempotent, so this can't double-apply.
  try {
    const orphans = await deps.listSuccessWithoutPlan(new Date(now.getTime() - ACTIVATION_GRACE_MS), limit);
    for (const payment of orphans) {
      summary.activationsRetried++;
      await activate(payment.id);
    }
  } catch {
    summary.errors++;
  }

  paymentLog(summary.errors || summary.activationFailures ? "warn" : "info", "recovery.summary", {
    source: "recovery",
    count: summary.checked,
    outcome: JSON.stringify(summary),
  });
  return summary;
}
