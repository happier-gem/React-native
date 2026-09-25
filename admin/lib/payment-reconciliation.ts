import "server-only";
import { listPaymentOverview, type PaymentOverviewRow } from "@/lib/payments";
import { paymentPolicy } from "@/lib/payment-recovery";

/**
 * Read-only reconciliation: finds payments an operator should look at. It
 * never changes anything — ambiguous records are surfaced, not "fixed".
 * (Unambiguous, safe work — asking the provider about PENDING payments and
 * re-running idempotent activation — is lib/payment-recovery.ts.)
 */

export type ReconciliationIssueType =
  | "pending_needs_review"
  | "pending_without_reference"
  | "success_without_plan"
  | "provider_conflict"
  | "unknown_provider_status"
  | "possible_duplicate_charge";

export type ReconciliationIssue = {
  type: ReconciliationIssueType;
  /** "action": needs a human decision. "watch": probably fine, worth a look. */
  severity: "action" | "watch";
  paymentId: string;
  userId: string;
  detail: string;
};

export const ISSUE_LABELS: Record<ReconciliationIssueType, string> = {
  pending_needs_review: "Pending too long",
  pending_without_reference: "Pending without provider reference",
  success_without_plan: "Paid but plan not applied",
  provider_conflict: "Provider disagrees with our status",
  unknown_provider_status: "Provider returned an unknown status",
  possible_duplicate_charge: "Possible duplicate charge",
};

const ACTIVATION_GRACE_MS = 2 * 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

const meta = (row: PaymentOverviewRow, key: string) => {
  const value = (row.metadata ?? {})[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
};

/** Pure: which of these rows need attention at `now`. */
export function findReconciliationIssues(
  rows: PaymentOverviewRow[],
  policy: { recoveryMinAgeMinutes: number; pendingReviewAfterHours: number },
  now: Date
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const age = (iso: string | null) => (iso ? now.getTime() - new Date(iso).getTime() : 0);
  const push = (row: PaymentOverviewRow, type: ReconciliationIssueType, severity: "action" | "watch", detail: string) =>
    issues.push({ type, severity, paymentId: row.id, userId: row.user_id, detail });

  for (const row of rows) {
    if (row.status === "PENDING") {
      const uncertain = meta(row, "initiation_uncertain");
      if (!row.provider_reference && age(row.created_at) >= policy.recoveryMinAgeMinutes * 60_000) {
        push(
          row,
          "pending_without_reference",
          "action",
          uncertain
            ? `Initiation outcome unknown (${String(uncertain.reason)}). Check INFI-PAY for reference ${row.internal_reference} before deciding.`
            : `No provider reference — initiation may have been interrupted. Reference ${row.internal_reference}.`
        );
      }
      if (age(row.created_at) >= policy.pendingReviewAfterHours * 3_600_000) {
        push(row, "pending_needs_review", "action", `Still PENDING after ${policy.pendingReviewAfterHours}h. Never auto-failed — confirm with INFI-PAY.`);
      }
      const check = meta(row, "provider_check");
      if (check?.result === "unknown_status") {
        push(row, "unknown_provider_status", "watch", `Last provider check returned "${String(check.status)}".`);
      }
    }

    if (row.status === "SUCCESS" && !row.plan_applied && age(row.completed_at) >= ACTIVATION_GRACE_MS) {
      push(row, "success_without_plan", "action", "Recovery retries activation automatically; if this persists, activation is being refused — investigate.");
    }

    const conflict = meta(row, "provider_conflict");
    if (conflict) {
      push(
        row,
        "provider_conflict",
        "action",
        `We have ${row.status}; ${String(conflict.source)} reported ${String(conflict.reportedStatus)}. Our status was NOT changed.`
      );
    }
  }

  // Two+ successful payments for the same user and plan within minutes.
  const successes = rows
    .filter((r) => r.status === "SUCCESS" && r.completed_at)
    .sort((a, b) => a.completed_at!.localeCompare(b.completed_at!));
  for (let i = 1; i < successes.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const a = successes[j];
      const b = successes[i];
      const gap = new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime();
      if (gap > DUPLICATE_WINDOW_MS) break;
      if (a.user_id === b.user_id && a.plan === b.plan) {
        push(b, "possible_duplicate_charge", "watch", `Also paid ${a.plan} as ${a.id.slice(0, 8)} ${Math.round(gap / 1000)}s earlier. Both are applied as separate months.`);
        break;
      }
    }
  }

  return issues;
}

/** Loads recent payments plus every PENDING one, and reports issues. */
export async function getReconciliationReport(now = new Date()) {
  const [recent, pending] = await Promise.all([
    listPaymentOverview({ limit: 500 }),
    listPaymentOverview({ status: "PENDING", limit: 500 }),
  ]);
  const byId = new Map([...recent, ...pending].map((r) => [r.id, r]));
  const rows = [...byId.values()];
  return { rows, issues: findReconciliationIssues(rows, paymentPolicy(), now) };
}
