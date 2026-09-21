import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aggregateSpendByCurrency, monthlyEquivalent, type BillingCycle } from "@/lib/format";

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
