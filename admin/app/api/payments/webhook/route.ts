import { verifyWebhookSignature } from "@/lib/infi-pay";
import { getPaymentByProviderReference, transitionPaymentStatus } from "@/lib/payments";

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

  // result.alreadyProcessed=true means this payment was already settled by an
  // earlier delivery of this same event — still a 200, not an error, since
  // repeated delivery must be safe (idempotent) rather than treated as a bug.
  return Response.json({ ok: true, alreadyProcessed: result.alreadyProcessed });
}
