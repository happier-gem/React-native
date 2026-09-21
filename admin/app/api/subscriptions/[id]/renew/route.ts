import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { renewSubscriptionForUser } from "@/lib/subscriptions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const { id } = await params;
  const result = await renewSubscriptionForUser(auth.userId, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ subscription: result.row });
}
