import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getPaymentForUser } from "@/lib/payments";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const { id } = await params;
  // Scoped to the authenticated user — never returns another user's payment,
  // and there is no route/action anywhere that lets a client set a payment's
  // status directly (it only ever changes via transitionPaymentStatus(),
  // called from the webhook handler).
  let payment;
  try {
    payment = await getPaymentForUser(auth.userId, id);
  } catch {
    return Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }
  if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });

  return Response.json({
    id: payment.id,
    status: payment.status,
    plan: payment.plan,
    amount: payment.amount,
    currency: payment.currency,
  });
}
