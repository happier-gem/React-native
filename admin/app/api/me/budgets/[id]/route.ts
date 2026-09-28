import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { deleteBudget, updateBudget, validateBudget } from "@/lib/budgets";
import { loadBudgetState, serverError } from "@/lib/budgets-response";

// Edit or delete one of the signed-in user's budgets. Every query is scoped to
// the user, so another user's budget is simply "not found".

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { entitlements, records } = await loadBudgetState(auth.userId);
    if (!records.some((b) => b.id === id)) return Response.json({ error: "Budget not found" }, { status: 404 });
    const result = validateBudget(body, entitlements, records, id);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    const outcome = await updateBudget(auth.userId, id, result.value);
    if (outcome === "not_found") return Response.json({ error: "Budget not found" }, { status: 404 });
    if (outcome === "duplicate") return Response.json({ error: "You already have that budget." }, { status: 409 });
    const { views } = await loadBudgetState(auth.userId);
    return Response.json({ budgets: views });
  } catch (e) {
    console.error("[me/budgets:PUT]", e instanceof Error ? e.message : e);
    return serverError();
  }
}

// Deleting is always allowed — even a budget the current plan no longer covers.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;
  try {
    if (!(await deleteBudget(auth.userId, id))) return Response.json({ error: "Budget not found" }, { status: 404 });
    const { views } = await loadBudgetState(auth.userId);
    return Response.json({ budgets: views });
  } catch (e) {
    console.error("[me/budgets:DELETE]", e instanceof Error ? e.message : e);
    return serverError();
  }
}
