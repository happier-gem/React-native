import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getPlan } from "@/lib/plans";
import { getPaymentProvider } from "@/lib/infi-pay";
import type { MobileMoneyNetwork } from "@/lib/payment-provider";
import { paymentLog } from "@/lib/payment-log";
import {
  attachProviderReference,
  createPendingPayment,
  findByInternalReference,
  findReusablePendingPayment,
  markFailed,
  markInitiationUncertain,
  type PaymentRecord,
} from "@/lib/payments";

const VALID_NETWORKS = new Set<MobileMoneyNetwork>(["airtel_money", "tnm_mpamba"]);

// General Malawi mobile format: 0 or +265, then a mobile-range digit (8/9), then 8 digits.
const MW_PHONE_REGEX = /^(\+265|0)[89]\d{8}$/;

const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

function toClientPayment(row: Pick<PaymentRecord, "id" | "status" | "plan" | "amount" | "currency">) {
  return { id: row.id, status: row.status, plan: row.plan, amount: row.amount, currency: row.currency };
}

const unavailable = () =>
  Response.json({ error: "Payment provider is temporarily unavailable. Please try again later." }, { status: 503 });

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  let body: { plan?: string; provider?: string; phoneNumber?: string; idempotencyKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Server derives the plan (and therefore the price) — a client-supplied
  // amount is never read or trusted anywhere in this flow.
  const plan = getPlan(typeof body.plan === "string" ? body.plan : "");
  if (!plan) return Response.json({ error: "Invalid plan" }, { status: 400 });

  const network = body.provider as MobileMoneyNetwork | undefined;
  if (!network || !VALID_NETWORKS.has(network)) {
    return Response.json({ error: "Invalid payment provider" }, { status: 400 });
  }

  const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  if (!MW_PHONE_REGEX.test(phoneNumber)) {
    return Response.json({ error: "Invalid Malawi phone number" }, { status: 400 });
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return Response.json({ error: "Invalid idempotency key" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  // Refuse up front — no payment row — when payments can't work at all.
  if (!provider.config().configured) {
    paymentLog("error", "initiate.provider_not_configured", { source: "initiate", userId: auth.userId });
    return Response.json({ error: "Payments aren't available right now. Please try again later." }, { status: 503 });
  }

  try {
    if (idempotencyKey) {
      const existing = await findByInternalReference(auth.userId, idempotencyKey);
      if (existing) return Response.json({ payment: toClientPayment(existing) }, { status: 200 });
    }

    // Reuse also covers an earlier attempt whose outcome was uncertain: it stays
    // PENDING, and re-sending could put a second charge prompt on the phone.
    const reusable = await findReusablePendingPayment(auth.userId, plan.id, network, phoneNumber);
    if (reusable) return Response.json({ payment: toClientPayment(reusable) }, { status: 200 });
  } catch {
    return Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }

  const created = await createPendingPayment({
    userId: auth.userId,
    plan: plan.id,
    provider: network,
    phoneNumber,
    idempotencyKey: idempotencyKey || undefined,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });
  const payment = created.row;

  const result = await provider.initiateCollection({
    amount: payment.amount,
    currency: payment.currency,
    phoneNumber,
    network,
    reference: payment.internal_reference,
  });

  switch (result.kind) {
    case "accepted":
      await attachProviderReference(payment.id, result.providerReference);
      paymentLog("info", "initiate.accepted", {
        source: "initiate",
        paymentId: payment.id,
        providerReference: result.providerReference,
        userId: auth.userId,
        plan: plan.id,
      });
      return Response.json({ payment: toClientPayment(payment) }, { status: 201 });

    case "rejected":
      // The provider definitely didn't create a collection: safe to fail it.
      await markFailed(payment.id, `initiation_rejected:${result.reason}`);
      paymentLog("warn", "initiate.rejected", { source: "initiate", paymentId: payment.id, reason: result.reason });
      return Response.json(
        { error: "Couldn't start the payment. Please check your number and provider, then try again." },
        { status: 502 }
      );

    case "uncertain":
      // We can't tell whether a charge prompt was sent. Keep it PENDING and
      // flag it for reconciliation — failing it could strand a real charge.
      await markInitiationUncertain(payment.id, result.reason);
      paymentLog("error", "initiate.uncertain", { source: "initiate", paymentId: payment.id, reason: result.reason });
      return unavailable();
  }
}
