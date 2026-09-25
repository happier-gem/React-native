import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { listAvailablePlans } from "@/lib/plans";
import { syncUserPlan } from "@/lib/user-plans";

// The only plan endpoint a mobile client can call, and it's read-only. The
// user is always the verified token's subject — no user id is read from the
// query string or body — and there is deliberately no write method here: plans
// change only through a verified payment webhook (lib/plan-activation.ts).
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  let effective;
  try {
    effective = await syncUserPlan(auth.userId);
  } catch {
    return Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }

  return Response.json({
    plan: {
      plan: effective.plan,
      status: effective.status,
      isActive: effective.isActive,
      startedAt: effective.startedAt?.toISOString() ?? null,
      expiresAt: effective.expiresAt?.toISOString() ?? null,
      pendingChange: effective.pendingChange
        ? {
            plan: effective.pendingChange.plan,
            startsAt: effective.pendingChange.startsAt.toISOString(),
            expiresAt: effective.pendingChange.expiresAt.toISOString(),
          }
        : null,
    },
    availablePlans: listAvailablePlans(),
  });
}
