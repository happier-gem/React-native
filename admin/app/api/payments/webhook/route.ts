import { verifyWebhookSignature } from "@/lib/infi-pay";
import { getPaymentByProviderReference, transitionPaymentStatus } from "@/lib/payments";
import { handleSuccessfulPayment } from "@/lib/plan-activation";

// Server-to-server: INFI-PAY is the caller, not a mobile user, so this
// deliberately does NOT call authenticateMobileRequest(). Authenticity comes
// entirely from the signature check below.
//
// NOTE: the exact header name and payload shape are placeholders — see the
// file header in lib/infi-pay.ts. Update both once real docs are available.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-infipay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[payments:webhook] signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { providerReference?: string; status?: string; failureReason?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!event.providerReference) {
    return Response.json({ error: "Missing providerReference" }, { status: 400 });
  }

  const payment = await getPaymentByProviderReference(event.providerReference);
  if (!payment) {
    // Ack with 200 so the provider doesn't retry forever, but log it — this
    // means either a stale/foreign event or a reference mismatch worth
    // investigating, not something the caller should keep retrying.
    console.error("[payments:webhook] no local payment for providerReference", event.providerReference);
    return Response.json({ ok: true });
  }

  const nextStatus = event.status === "SUCCESS" ? "SUCCESS" : event.status === "FAILED" ? "FAILED" : null;
  if (!nextStatus) {
    return Response.json({ error: "Unrecognized status" }, { status: 400 });
  }

  const result = await transitionPaymentStatus(payment.id, nextStatus, { failureReason: event.failureReason });
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });

  // Activation is idempotent on its own (keyed on the payment id, see
  // lib/plan-activation.ts), so it runs on replays too: a replay for an
  // already-activated payment is a no-op, and a replay after a failed
  // activation is what completes it. Activation re-reads the payment and only
  // acts if the database says SUCCESS, so a SUCCESS replay for a payment that
  // actually settled as FAILED grants nothing.
  if (nextStatus === "SUCCESS") {
    const activation = await handleSuccessfulPayment(payment);
    if (!activation.ok) {
      // Non-2xx so INFI-PAY retries delivery; the payment itself stays SUCCESS.
      return Response.json({ error: "Plan activation failed" }, { status: 500 });
    }
  }

  return Response.json({ ok: true, alreadyProcessed: result.alreadyProcessed });
}
