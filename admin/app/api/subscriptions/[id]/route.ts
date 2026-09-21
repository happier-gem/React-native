import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { deleteSubscriptionForUser, updateSubscriptionForUser } from "@/lib/subscriptions";
import type { SubscriptionEdits } from "@/lib/subscriptions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const { id } = await params;
  let edits: SubscriptionEdits;
  try {
    edits = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await updateSubscriptionForUser(auth.userId, id, edits);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ subscription: result.row });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  const { id } = await params;
  const result = await deleteSubscriptionForUser(auth.userId, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return new Response(null, { status: 204 });
}
