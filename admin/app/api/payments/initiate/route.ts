import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getPlan } from "@/lib/plans";
import { getPaymentProvider } from "@/lib/infi-pay";
import type { MobileMoneyNetwork, PaymentProvider } from "@/lib/payment-provider";
import { paymentLog } from "@/lib/payment-log";
import {
  attachProviderReference,
  clearInitiationUncertain,
  createPendingPayment,
  findByInternalReference,
  findReusablePendingPayment,
  isInitiationUncertain,
  markFailed,
  markInitiationUncertain,
  type PaymentRecord,
} from "@/lib/payments";

const VALID_NETWORKS = new Set<MobileMoneyNetwork>(["airtel_money", "tnm_mpamba"]);
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

function toClientPayment(row: Pick<PaymentRecord, "id" | "status" | "plan" | "amount" | "currency">) {
  return { id: row.id, status: row.status, plan: row.plan, amount: row.amount, currency: row.currency };
}

const json = (body: unknown, status: number) => Response.json(body, { status });
const MSG_UNAVAILABLE = "Payment provider is temporarily unavailable. Please try again later.";
const MSG_REJECTED = "Couldn't start the payment. Please check your number and provider, then try again.";
const MSG_SERVER = "Something went wrong on our end. Please try again.";

/**
 * Sends the collection request for a PENDING payment and records the outcome.
 * The reference is the payment's own id — globally unique, unlike
 * internal_reference (a per-user idempotency key), and INFI-PAY treats a
 * repeated reference as the same transaction. That is what makes calling this
 * again for an "uncertain" payment safe: it can't create a second charge.
 */
async function sendCollection(provider: PaymentProvider, payment: PaymentRecord, successStatus: 200 | 201) {
  const reference = payment.provider_reference ?? payment.id;
  // Stored BEFORE contacting the provider, so every payment that might exist at
  // INFI-PAY can be looked up there by recovery.
  if (!payment.provider_reference && !(await attachProviderReference(payment.id, reference))) {
    await markFailed(payment.id, "initiation_aborted:reference_not_stored"); // nothing was sent
    return json({ error: MSG_SERVER }, 500);
  }

  const result = await provider.initiateCollection({
    amount: Number(payment.amount),
    currency: payment.currency,
    phoneNumber: payment.phone_number,
    network: payment.provider,
    reference,
  });

  switch (result.kind) {
    case "accepted":
      if (isInitiationUncertain(payment)) await clearInitiationUncertain(payment.id);
      paymentLog("info", "initiate.accepted", {
        source: "initiate",
        paymentId: payment.id,
        providerReference: reference,
        userId: payment.user_id,
        plan: payment.plan,
      });
      return json({ payment: toClientPayment(payment) }, successStatus);

    case "rejected":
      // The provider definitely didn't create a collection: safe to fail it.
      await markFailed(payment.id, `initiation_rejected:${result.reason}`);
      paymentLog("warn", "initiate.rejected", { source: "initiate", paymentId: payment.id, reason: result.reason });
      return json({ error: MSG_REJECTED }, 502);

    case "uncertain":
      // A charge prompt may have been sent. Keep it PENDING and flagged;
      // recovery asks INFI-PAY by reference, and a retry resends safely.
      await markInitiationUncertain(payment.id, result.reason);
      paymentLog("error", "initiate.uncertain", { source: "initiate", paymentId: payment.id, reason: result.reason });
      return json({ error: MSG_UNAVAILABLE }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return json({ error: "Unauthorized" }, auth.status);

  let body: { plan?: string; provider?: string; phoneNumber?: string; idempotencyKey?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Server derives the plan (and therefore the price) — a client-supplied
  // amount is never read or trusted anywhere in this flow.
  const plan = getPlan(typeof body.plan === "string" ? body.plan : "");
  if (!plan) return json({ error: "Invalid plan" }, 400);

  const network = body.provider as MobileMoneyNetwork | undefined;
  if (!network || !VALID_NETWORKS.has(network)) return json({ error: "Invalid payment provider" }, 400);

  const provider = getPaymentProvider();
  const phone = provider.checkPhoneNumber(typeof body.phoneNumber === "string" ? body.phoneNumber : "", network);
  if (!phone.ok) return json({ error: phone.message }, 400);

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) return json({ error: "Invalid idempotency key" }, 400);

  // Refuse up front — no payment row — when payments can't work at all.
  if (!provider.config().configured) {
    paymentLog("error", "initiate.provider_not_configured", { source: "initiate", userId: auth.userId });
    return json({ error: "Payments aren't available right now. Please try again later." }, 503);
  }

  let existing: PaymentRecord | null = null;
  try {
    if (idempotencyKey) existing = await findByInternalReference(auth.userId, idempotencyKey);
    // Also reuse a recent PENDING payment for the same plan/network/phone: a
    // second request must never put a second charge prompt on the phone.
    existing ??= await findReusablePendingPayment(auth.userId, plan.id, network, phone.normalized);
  } catch {
    return json({ error: MSG_SERVER }, 500);
  }

  if (existing) {
    // An earlier attempt timed out: resend with the same reference (safe —
    // idempotent at INFI-PAY) instead of leaving the user stuck.
    if (isInitiationUncertain(existing)) return sendCollection(provider, existing, 200);
    return json({ payment: toClientPayment(existing) }, 200);
  }

  const created = await createPendingPayment({
    userId: auth.userId,
    plan: plan.id,
    provider: network,
    phoneNumber: phone.normalized,
    idempotencyKey: idempotencyKey || undefined,
  });
  if (!created.ok) return json({ error: created.error }, created.status);
  if (created.reused) {
    if (isInitiationUncertain(created.row)) return sendCollection(provider, created.row, 200);
    return json({ payment: toClientPayment(created.row) }, 200);
  }

  return sendCollection(provider, created.row, 201);
}
