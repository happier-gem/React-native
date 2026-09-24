import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getPlan } from "@/lib/plans";
import type { InfiPayProvider } from "@/lib/infi-pay";
import { initiateCollection } from "@/lib/infi-pay";
import {
  attachProviderReference,
  createPendingPayment,
  findByInternalReference,
  findReusablePendingPayment,
  markFailed,
  type PaymentRecord,
} from "@/lib/payments";

const VALID_PROVIDERS = new Set<InfiPayProvider>(["airtel_money", "tnm_mpamba"]);

// General Malawi mobile format: 0 or +265, then a mobile-range digit (8/9), then 8 digits.
const MW_PHONE_REGEX = /^(\+265|0)[89]\d{8}$/;

function toClientPayment(row: Pick<PaymentRecord, "id" | "status" | "plan" | "amount" | "currency">) {
  return { id: row.id, status: row.status, plan: row.plan, amount: row.amount, currency: row.currency };
}

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
  const plan = getPlan(body.plan ?? "");
  if (!plan) return Response.json({ error: "Invalid plan" }, { status: 400 });

  const provider = body.provider as InfiPayProvider | undefined;
  if (!provider || !VALID_PROVIDERS.has(provider)) {
    return Response.json({ error: "Invalid payment provider" }, { status: 400 });
  }

  const phoneNumber = body.phoneNumber?.trim() ?? "";
  if (!MW_PHONE_REGEX.test(phoneNumber)) {
    return Response.json({ error: "Invalid Malawi phone number" }, { status: 400 });
  }

  if (body.idempotencyKey) {
    const existing = await findByInternalReference(auth.userId, body.idempotencyKey.trim());
    if (existing) return Response.json({ payment: toClientPayment(existing) }, { status: 200 });
  }

  const reusable = await findReusablePendingPayment(auth.userId, plan.id, provider, phoneNumber);
  if (reusable) return Response.json({ payment: toClientPayment(reusable) }, { status: 200 });

  const created = await createPendingPayment({
    userId: auth.userId,
    plan: plan.id,
    provider,
    phoneNumber,
    idempotencyKey: body.idempotencyKey,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });

  const collection = await initiateCollection({
    amount: created.row.amount,
    currency: created.row.currency,
    phoneNumber,
    provider,
    reference: created.row.internal_reference,
  });

  if (!collection.ok) {
    await markFailed(created.row.id, collection.error);
    return Response.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }

  await attachProviderReference(created.row.id, collection.providerReference);

  return Response.json({ payment: toClientPayment(created.row) }, { status: 201 });
}
