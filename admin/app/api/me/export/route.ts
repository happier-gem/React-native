import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getEffectiveUserPlan } from "@/lib/user-plans";
import { entitlementsFor } from "@/lib/entitlements";
import { listSubscriptionsForUser } from "@/lib/subscriptions";
import { subscriptionsToCsv } from "@/lib/csv-export";

// The signed-in user's subscriptions as CSV — a Pro feature, enforced here.
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  try {
    const plan = await getEffectiveUserPlan(auth.userId);
    if (!entitlementsFor(plan.plan).export) {
      return Response.json({ error: "Exporting your data is available on Pro.", code: "plan_limit" }, { status: 403 });
    }
    const subs = await listSubscriptionsForUser(auth.userId);
    if (!subs.ok) throw new Error(subs.error);
    return new Response(subscriptionsToCsv(subs.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscriptions-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[me/export]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }
}
