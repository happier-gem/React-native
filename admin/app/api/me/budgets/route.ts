import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { createBudget, validateBudget } from "@/lib/budgets";
import { loadBudgetState, serverError } from "@/lib/budgets-response";

// The signed-in user's monthly budgets. Which budgets a user may have is set by
// their plan (lib/entitlements.ts: Starter one overall, Pro per category) and
// enforced here. Spending is computed on the server from their subscriptions.

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });
  try {
    const { views } = await loadBudgetState(auth.userId);
    return Response.json({ budgets: views });
  } catch (e) {
    console.error("[me/budgets:GET]", e instanceof Error ? e.message : e);
    return serverError();
  }
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { entitlements, records } = await loadBudgetState(auth.userId);
    const result = validateBudget(body, entitlements, records);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    if ((await createBudget(auth.userId, result.value)) === "duplicate") {
      return Response.json({ error: "You already have that budget." }, { status: 409 });
    }
    const { views } = await loadBudgetState(auth.userId);
    return Response.json({ budgets: views }, { status: 201 });
  } catch (e) {
    console.error("[me/budgets:POST]", e instanceof Error ? e.message : e);
    return serverError();
  }
}
