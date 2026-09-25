"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/audit-log";
import { recoverPendingPayments } from "@/lib/payment-recovery";

// Runs the same recovery as the scheduled job. It only asks the provider for
// the real status of PENDING payments and re-runs idempotent activation for
// SUCCESS payments — it cannot grant a plan by itself.
export async function runRecoveryAction() {
  const admin = await requireAdmin();
  const summary = await recoverPendingPayments();
  await logAdminAction({ actorUserId: admin.userId, action: "payments.recovery_run", metadata: summary });

  const params = new URLSearchParams({
    recovered: "1",
    checked: String(summary.checked),
    succeeded: String(summary.succeeded),
    failed: String(summary.failed + summary.cancelled),
    pending: String(summary.stillPending),
    unavailable: String(summary.providerUnavailable + summary.unknownStatus),
    activated: String(summary.activationsApplied),
    errors: String(summary.errors + summary.activationFailures),
    configured: summary.providerConfigured ? "1" : "0",
  });
  redirect(`/admin/payments?${params}`);
}
