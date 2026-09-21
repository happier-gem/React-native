import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addCycle, aggregateSpendByCurrency, monthlyEquivalent, type BillingCycle } from "@/lib/format";

export type SubscriptionStatus = "active" | "canceled";

// Mirrors the `subscriptions` table in supabase/schema.sql.
export type SubscriptionRecord = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  brand_color: string | null;
  price: number;
  currency: string;
  cycle: BillingCycle;
  category: string;
  renewal_date: string;
  status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
};

export type SubscriptionFilters = {
  query?: string;
  status?: SubscriptionStatus | "all";
  cycle?: BillingCycle | "all";
  page?: number;
  pageSize?: number;
};

export type SubscriptionListResult =
  | { ok: true; rows: SubscriptionRecord[]; total: number }
  | { ok: false; error: string };

const DEFAULT_PAGE_SIZE = 20;

export async function listSubscriptions(filters: SubscriptionFilters): Promise<SubscriptionListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let q = supabaseAdmin()
      .from("subscriptions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.cycle && filters.cycle !== "all") q = q.eq("cycle", filters.cycle);
    if (filters.query?.trim()) {
      const term = filters.query.trim();
      q = q.or(`name.ilike.%${term}%,category.ilike.%${term}%`);
    }

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    return { ok: true, rows: (data ?? []) as SubscriptionRecord[], total: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type UserSubscriptionsResult =
  | { ok: true; rows: SubscriptionRecord[] }
  | { ok: false; error: string };

/** All of one user's own subscriptions — no pagination, unlike listSubscriptions()
 * (which is the admin dashboard's cross-user query). A single user's own list
 * is always small. */
export async function listSubscriptionsForUser(userId: string): Promise<UserSubscriptionsResult> {
  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as SubscriptionRecord[] };
}

export type SubscriptionAnalytics =
  | {
      ok: true;
      totalCount: number;
      activeCount: number;
      canceledCount: number;
      spendByCurrency: { currency: string; monthly: number; yearly: number }[];
      topServices: { name: string; monthly: number; currency: string }[];
    }
  | { ok: false; error: string };

/** Fetches every row needed for status/spend aggregates. Not paginated: this
 * is meant for a single admin dashboard, not a public-facing endpoint, and
 * Postgres aggregation on a `subscriptions`-sized table is cheap. If this
 * table grows very large, replace with SQL-side aggregation (a view or RPC). */
export async function getSubscriptionAnalytics(): Promise<SubscriptionAnalytics> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("subscriptions")
      .select("name, price, currency, cycle, status");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Pick<SubscriptionRecord, "name" | "price" | "currency" | "cycle" | "status">[];
    const active = rows.filter((r) => r.status === "active");
    const canceled = rows.filter((r) => r.status === "canceled");

    const perService = new Map<string, { monthly: number; currency: string }>();
    for (const sub of active) {
      const monthly = monthlyEquivalent(sub.price, sub.cycle);
      const existing = perService.get(sub.name);
      perService.set(sub.name, { monthly: (existing?.monthly ?? 0) + monthly, currency: sub.currency });
    }

    return {
      ok: true,
      totalCount: rows.length,
      activeCount: active.length,
      canceledCount: canceled.length,
      spendByCurrency: aggregateSpendByCurrency(active),
      topServices: [...perService.entries()]
        .map(([name, v]) => ({ name, monthly: v.monthly, currency: v.currency }))
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 10),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// --- Mutations, all scoped to a specific (already-authenticated) userId. ---
// The secret-key Supabase client bypasses RLS, so ownership is enforced here,
// in application code, via an explicit .eq("user_id", userId) on every query —
// never trust a user_id value from the caller.

export type SubscriptionResult =
  | { ok: true; row: SubscriptionRecord }
  | { ok: false; status: 400 | 404 | 500; error: string };

export type NewSubscriptionInput = {
  name: string;
  price: number;
  currency: string;
  cycle: BillingCycle;
  category: string;
  renewal_date: string;
  icon?: string | null;
  brand_color?: string | null;
};

export type SubscriptionEdits = Partial<NewSubscriptionInput>;

function validateNewSubscription(input: NewSubscriptionInput): string | null {
  if (!input.name?.trim()) return "name is required";
  if (typeof input.price !== "number" || Number.isNaN(input.price) || input.price < 0) {
    return "price must be a non-negative number";
  }
  if (!input.currency?.trim()) return "currency is required";
  if (input.cycle !== "monthly" && input.cycle !== "yearly") return "cycle must be monthly or yearly";
  if (!input.category?.trim()) return "category is required";
  if (Number.isNaN(new Date(input.renewal_date).getTime())) return "renewal_date is invalid";
  return null;
}

export async function createSubscriptionForUser(
  userId: string,
  input: NewSubscriptionInput
): Promise<SubscriptionResult> {
  const validationError = validateNewSubscription(input);
  if (validationError) return { ok: false, status: 400, error: validationError };

  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      price: input.price,
      currency: input.currency,
      cycle: input.cycle,
      category: input.category.trim(),
      renewal_date: input.renewal_date,
      icon: input.icon ?? null,
      brand_color: input.brand_color ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, row: data as SubscriptionRecord };
}

async function getOwnedSubscription(userId: string, id: string) {
  return supabaseAdmin().from("subscriptions").select("*").eq("id", id).eq("user_id", userId).single();
}

function mapMutationError(error: { code?: string; message: string }): { status: 404 | 500; error: string } {
  // PGRST116 = no row matched the filter (not found, or not owned by this user).
  if (error.code === "PGRST116") return { status: 404, error: "Subscription not found" };
  return { status: 500, error: error.message };
}

export async function updateSubscriptionForUser(
  userId: string,
  id: string,
  edits: SubscriptionEdits
): Promise<SubscriptionResult> {
  if (edits.price !== undefined && (typeof edits.price !== "number" || edits.price < 0 || Number.isNaN(edits.price))) {
    return { ok: false, status: 400, error: "price must be a non-negative number" };
  }
  if (edits.cycle !== undefined && edits.cycle !== "monthly" && edits.cycle !== "yearly") {
    return { ok: false, status: 400, error: "cycle must be monthly or yearly" };
  }
  if (edits.renewal_date !== undefined && Number.isNaN(new Date(edits.renewal_date).getTime())) {
    return { ok: false, status: 400, error: "renewal_date is invalid" };
  }

  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .update(edits)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    const mapped = mapMutationError(error);
    return { ok: false, status: mapped.status, error: mapped.error };
  }
  return { ok: true, row: data as SubscriptionRecord };
}

export async function deleteSubscriptionForUser(
  userId: string,
  id: string
): Promise<{ ok: true } | { ok: false; status: 404 | 500; error: string }> {
  const { error, count } = await supabaseAdmin()
    .from("subscriptions")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, status: 500, error: error.message };
  if (!count) return { ok: false, status: 404, error: "Subscription not found" };
  return { ok: true };
}

export async function cancelSubscriptionForUser(userId: string, id: string): Promise<SubscriptionResult> {
  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    const mapped = mapMutationError(error);
    return { ok: false, status: mapped.status, error: mapped.error };
  }
  return { ok: true, row: data as SubscriptionRecord };
}

export async function renewSubscriptionForUser(userId: string, id: string): Promise<SubscriptionResult> {
  const { data: existing, error: fetchError } = await getOwnedSubscription(userId, id);
  if (fetchError || !existing) {
    return { ok: false, status: 404, error: "Subscription not found" };
  }
  const row = existing as SubscriptionRecord;

  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .update({ status: "active", renewal_date: addCycle(row.renewal_date, row.cycle) })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, row: data as SubscriptionRecord };
}
