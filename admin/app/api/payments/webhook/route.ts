import { getPaymentProvider } from "@/lib/infi-pay";
import { getPaymentByProviderReference, recordProviderConflict, transitionPaymentStatus } from "@/lib/payments";
import { handleSuccessfulPayment } from "@/lib/plan-activation";
import { paymentLog } from "@/lib/payment-log";

// Server-to-server: the provider is the caller, not a mobile user, so this
// deliberately does NOT call authenticateMobileRequest(). Authenticity comes
// entirely from the provider adapter's signature check, which runs before any
// part of the payload is read.
//
// Response contract (the provider's retry behavior is NOT known yet — see
// lib/infi-pay.ts — so nothing here depends on it; pending-payment recovery
// re-checks with the provider regardless):
//   401  signature missing/invalid            — never processed
//   400  authentic but malformed payload      — never processed
//   200  processed, duplicate, ignored, or for a payment we don't know
//   503  our database/activation failed       — safe to redeliver
const retryLater = () =>
  Response.json({ error: "Temporarily unable to process; please retry." }, { status: 503, headers: { "Retry-After": "60" } });

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

  const { providerReference, status } = parsed;

  let payment;
  try {
    payment = await getPaymentByProviderReference(providerReference);
  } catch {
    return retryLater();
  }
  if (!payment) {
    // Possibly a webhook that beat attachProviderReference() after initiation,
    // or a foreign event. Acknowledged; recovery will still resolve our side
    // by asking the provider directly.
    paymentLog("warn", "webhook.unmatched", { source: "webhook", providerReference, status });
    return Response.json({ ok: true, matched: false });
  }

  if (status === "PENDING") return Response.json({ ok: true, alreadyProcessed: false });

  const result = await transitionPaymentStatus(payment.id, status, { failureReason: parsed.failureReason });
  if (!result.ok) return retryLater();

  paymentLog("info", "webhook.status", {
    source: "webhook",
    paymentId: payment.id,
    providerReference,
    status,
    outcome: result.alreadyProcessed ? "already_processed" : "transitioned",
  });

  if (result.alreadyProcessed && result.currentStatus !== status) {
    // A final status is never moved backwards (see payments.ts state machine).
    paymentLog("warn", "webhook.conflict", { source: "webhook", paymentId: payment.id, status: result.currentStatus, reason: `provider_reported_${status}` });
    await recordProviderConflict(payment.id, { localStatus: result.currentStatus, reportedStatus: status, source: "webhook" });
  }

  // Activation is idempotent (keyed on the payment id in the database) and
  // re-checks that the payment really is SUCCESS, so running it on a duplicate
  // delivery is a no-op, and running it after an earlier failed attempt
  // completes it.
  if (result.currentStatus === "SUCCESS") {
    const activation = await handleSuccessfulPayment(payment);
    if (!activation.ok) {
      paymentLog("error", "webhook.activation_failed", { source: "webhook", paymentId: payment.id, reason: activation.error });
      return retryLater(); // the payment itself stays SUCCESS; recovery also retries activation
    }
  }

  return Response.json({ ok: true, alreadyProcessed: result.alreadyProcessed });
}
