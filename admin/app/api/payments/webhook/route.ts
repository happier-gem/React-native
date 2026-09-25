import { after } from "next/server";
import { getPaymentProvider } from "@/lib/infi-pay";
import { getPaymentByProviderReference, listRecentPendingPayments } from "@/lib/payments";
import { activatePlanForPayment } from "@/lib/plan-activation";
import { recoverPendingPayments } from "@/lib/payment-recovery";
import { paymentLog } from "@/lib/payment-log";

// Server-to-server: INFI-PAY is the caller, not a mobile user, so this
// deliberately does NOT call authenticateMobileRequest(). Authenticity comes
// from the adapter's X-Signature check, which runs before the payload is read.
//
// A verified webhook is treated as a PROMPT, not as the truth:
//   - INFI-PAY's documented payload carries its own transactionId, not the
//     reference we sent, so it can't always be matched to our payment; and
//   - GET /payments/transaction-status/:reference is authoritative anyway.
// So after verifying, we answer 2xx immediately (INFI-PAY requires < 15 s and
// retries otherwise) and then, in the background, re-check the affected
// payment(s) with INFI-PAY and settle them through the same code as scheduled
// recovery — atomic, idempotent, amount-checked. If that background work
// fails, scheduled recovery picks the payment up.
//
// Responses: 401 bad/missing signature · 400 authentic but malformed ·
// 200 everything else (processed async, duplicate, or ignored event type).

/** How many recent PENDING payments to re-check when the event can't be
 * matched to a single payment. */
const UNMATCHED_EVENT_CHECK_LIMIT = 25;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const parsed = getPaymentProvider().parseWebhook(rawBody, request.headers);

  switch (parsed.kind) {
    case "invalid_signature":
      paymentLog("warn", "webhook.invalid_signature", { source: "webhook" });
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    case "malformed":
      paymentLog("warn", "webhook.malformed", { source: "webhook", reason: parsed.reason });
      return Response.json({ error: "Malformed payload" }, { status: 400 });
    case "ignored":
      paymentLog("info", "webhook.ignored", { source: "webhook", reason: parsed.reason });
      return Response.json({ ok: true, ignored: true });
  }

  paymentLog("info", "webhook.received", {
    source: "webhook",
    providerReference: parsed.reference ?? undefined,
    status: parsed.reportedStatus,
    reason: parsed.providerTransactionId ? `transactionId:${parsed.providerTransactionId}` : undefined,
  });

  if (parsed.reportedStatus === "PENDING") return Response.json({ ok: true });

  after(async () => {
    try {
      await processVerifiedPaymentEvent(parsed.reference);
    } catch (e) {
      paymentLog("error", "webhook.processing_failed", { source: "webhook", reason: e instanceof Error ? e.message : "unknown" });
    }
  });

  return Response.json({ ok: true, accepted: true });
}

/** Re-checks with INFI-PAY and settles. Exported for tests. */
export async function processVerifiedPaymentEvent(reference: string | null) {
  if (reference) {
    const payment = await getPaymentByProviderReference(reference);
    if (payment?.status === "PENDING") {
      // Check just this one, regardless of age.
      await recoverPendingPayments({ minAgeMinutes: 0, limit: 1, deps: { listPending: async () => [payment] } });
      return;
    }
    if (payment) {
      // Already settled — status never changes again. A SUCCESS still gets its
      // plan applied if that hadn't happened yet (idempotent no-op otherwise).
      if (payment.status === "SUCCESS") await activatePlanForPayment(payment.id);
      return;
    }
    paymentLog("warn", "webhook.unmatched_reference", { source: "webhook", providerReference: reference });
  }
  // No usable reference: re-check the most recent pending payments.
  await recoverPendingPayments({
    minAgeMinutes: 0,
    limit: UNMATCHED_EVENT_CHECK_LIMIT,
    deps: { listPending: (_olderThan, limit) => listRecentPendingPayments(limit) },
  });
}
