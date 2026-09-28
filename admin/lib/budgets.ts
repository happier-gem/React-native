import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Entitlements } from "@/lib/entitlements";

/** Pro can have an overall budget plus this many category budgets in total. */
export const MAX_BUDGETS = 20;
/** Share of the limit at which a budget counts as "near". */
export const NEAR_THRESHOLD = 0.8;

export type BudgetRecord = {
  id: string;
  category: string | null;
  monthly_limit: number;
  currency: string;
};

export type BudgetView = {
  id: string;
  /** null = overall budget. */
  category: string | null;
  monthlyLimit: number;
  currency: string;
  /** Monthly cost of the active subscriptions it covers (same currency only). */
  spent: number;
  percent: number;
  status: "ok" | "near" | "over";
  /** False when the user's current plan doesn't include this budget (e.g.
   * after a downgrade) — kept, but not tracked or alerted. */
  active: boolean;
};

type SpendItem = { price: number; cycle: "monthly" | "yearly"; currency: string; category: string; status: string };

const monthly = (s: Pick<SpendItem, "price" | "cycle">) => (s.cycle === "yearly" ? Number(s.price) / 12 : Number(s.price));
const sameCategory = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function isBudgetAllowed(category: string | null, e: Entitlements): boolean {
  if (e.budgets === "none") return false;
  return category === null || e.budgets === "per_category";
}

/** Pure: each budget's spending and status, given the user's subscriptions. */
export function computeBudgetViews(budgets: BudgetRecord[], subscriptions: SpendItem[], e: Entitlements): BudgetView[] {
  const active = subscriptions.filter((s) => s.status === "active");
  return budgets
    .map((b) => {
      const limit = Number(b.monthly_limit);
      const spent = active
        .filter((s) => s.currency === b.currency && (b.category === null || sameCategory(s.category, b.category)))
        .reduce((sum, s) => sum + monthly(s), 0);
      const ratio = limit > 0 ? spent / limit : 0;
      return {
        id: b.id,
        category: b.category,
        monthlyLimit: limit,
        currency: b.currency,
        spent: Math.round(spent * 100) / 100,
        percent: Math.round(ratio * 100),
        status: (ratio >= 1 ? "over" : ratio >= NEAR_THRESHOLD ? "near" : "ok") as BudgetView["status"],
        active: isBudgetAllowed(b.category, e),
      };
    })
    .sort((a, b) => (a.category === null ? -1 : b.category === null ? 1 : a.category.localeCompare(b.category)));
}

export type BudgetInput = { category: string | null; monthlyLimit: number; currency: string };
export type BudgetValidation =
  | { ok: true; value: BudgetInput }
  | { ok: false; status: 400 | 403 | 409; error: string; code?: "plan_limit" };

/** Validates a new or edited budget against the user's plan. */
export function validateBudget(
  input: unknown,
  e: Entitlements,
  existing: BudgetRecord[],
  editingId?: string
): BudgetValidation {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const rawCategory = body.category;
  let category: string | null = null;
  if (rawCategory !== undefined && rawCategory !== null && rawCategory !== "") {
    if (typeof rawCategory !== "string" || rawCategory.trim().length === 0 || rawCategory.trim().length > 60) {
      return { ok: false, status: 400, error: "Category must be 1–60 characters." };
    }
    category = rawCategory.trim();
  }

  const limit = typeof body.monthlyLimit === "number" ? body.monthlyLimit : Number(body.monthlyLimit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 1_000_000_000) {
    return { ok: false, status: 400, error: "Enter a monthly limit greater than 0." };
  }

  const currency = body.currency === undefined ? "MWK" : body.currency;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, status: 400, error: "Currency must be a 3-letter code, e.g. MWK." };
  }

  if (e.budgets === "none") {
    return { ok: false, status: 403, code: "plan_limit", error: "Budgets are available on Starter and Pro." };
  }
  if (category !== null && e.budgets !== "per_category") {
    return { ok: false, status: 403, code: "plan_limit", error: "Budgets for each category are available on Pro." };
  }

  const others = existing.filter((b) => b.id !== editingId);
  const duplicate = others.find((b) =>
    category === null ? b.category === null : b.category !== null && sameCategory(b.category, category)
  );
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: category === null ? "You already have an overall budget." : `You already have a budget for ${category}.`,
    };
  }
  if (!editingId) {
    const cap = e.budgets === "overall" ? 1 : MAX_BUDGETS;
    if (others.length >= cap) {
      return {
        ok: false,
        status: 403,
        code: "plan_limit",
        error: e.budgets === "overall" ? "Starter includes one monthly budget. Upgrade to Pro for budgets per category." : `You can have up to ${cap} budgets.`,
      };
    }
  }

  return { ok: true, value: { category, monthlyLimit: Math.round(limit * 100) / 100, currency } };
}

// --- persistence (every query is scoped to the user) ------------------------

export async function listBudgets(userId: string): Promise<BudgetRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from("budgets")
    .select("id, category, monthly_limit, currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`budgets read failed: ${error.message}`);
  return (data as BudgetRecord[] | null) ?? [];
}

const UNIQUE_VIOLATION = "23505";

export async function createBudget(userId: string, b: BudgetInput): Promise<"created" | "duplicate"> {
  const { error } = await supabaseAdmin()
    .from("budgets")
    .insert({ user_id: userId, category: b.category, monthly_limit: b.monthlyLimit, currency: b.currency });
  if (error?.code === UNIQUE_VIOLATION) return "duplicate";
  if (error) throw new Error(`budget create failed: ${error.message}`);
  return "created";
}

export async function updateBudget(userId: string, id: string, b: BudgetInput): Promise<"updated" | "not_found" | "duplicate"> {
  const { data, error } = await supabaseAdmin()
    .from("budgets")
    .update({ category: b.category, monthly_limit: b.monthlyLimit, currency: b.currency })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error?.code === UNIQUE_VIOLATION) return "duplicate";
  if (error) throw new Error(`budget update failed: ${error.message}`);
  return (data ?? []).length ? "updated" : "not_found";
}

export async function deleteBudget(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("budgets").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw new Error(`budget delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}
