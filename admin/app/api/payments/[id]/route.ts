import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getPaymentForUser, type PaymentRecord } from "@/lib/payments";
import { recoverPendingPayments } from "@/lib/payment-recovery";

/** Don't ask INFI-PAY about the same payment more often than this, however
 * often the app polls (it polls every 3 s). */
const LIVE_CHECK_INTERVAL_MS = 10_000;

function lastProviderCheck(payment: PaymentRecord): number {
  const check = (payment.metadata ?? {}).provider_check as { at?: unknown } | undefined;
  const at = typeof check?.at === "string" ? Date.parse(check.at) : NaN;
  return Number.isNaN(at) ? 0 : at;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const { id } = await params;
  // Scoped to the authenticated user — never returns another user's payment,
  // and there is no route/action anywhere that lets a client set a payment's
  // status directly.
  let payment;
  try {
    payment = await getPaymentForUser(auth.userId, id);
  } catch {
    return Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }
  if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });

  // While the app waits, ask INFI-PAY directly instead of waiting for a webhook
  // or the scheduled recovery — so a wrong PIN or a success shows up in seconds.
  // Same code path as recovery: only a status INFI-PAY verifiably reports
  // (with a matching amount) changes the payment. Best-effort: if it fails,
  // the app just gets the stored status.
  if (
    payment.status === "PENDING" &&
    payment.provider_reference &&
    Date.now() - lastProviderCheck(payment) >= LIVE_CHECK_INTERVAL_MS
  ) {
    try {
      const pending = payment;
      await recoverPendingPayments({
        minAgeMinutes: 0,
        limit: 1,
        sweepOrphans: false,
        deps: { listPending: async () => [pending] },
      });
      payment = (await getPaymentForUser(auth.userId, id)) ?? payment;
    } catch {
      // keep the stored status
    }
  }

  return Response.json({
    id: payment.id,
    status: payment.status,
    plan: payment.plan,
    amount: payment.amount,
    currency: payment.currency,
  });
}
