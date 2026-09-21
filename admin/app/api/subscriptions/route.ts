import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { createSubscriptionForUser, listSubscriptionsForUser } from "@/lib/subscriptions";
import type { NewSubscriptionInput } from "@/lib/subscriptions";

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const result = await listSubscriptionsForUser(auth.userId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });

  return Response.json({ subscriptions: result.rows });
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  let body: Partial<NewSubscriptionInput>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // user_id is never read from the body — only the verified token's userId is used.
  const result = await createSubscriptionForUser(auth.userId, {
    name: body.name ?? "",
    price: body.price ?? NaN,
    currency: body.currency ?? "",
    cycle: body.cycle ?? ("monthly" as const),
    category: body.category ?? "",
    renewal_date: body.renewal_date ?? "",
    icon: body.icon,
    brand_color: body.brand_color,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ subscription: result.row }, { status: 201 });
}
