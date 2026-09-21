import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listSubscriptions, type SubscriptionStatus } from "@/lib/subscriptions";
import { formatDate, formatMoney, type BillingCycle } from "@/lib/format";

async function resolveOwners(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  try {
    const clerk = await clerkClient();
    // Clerk allows up to 100 user IDs per getUserList call.
    const { data } = await clerk.users.getUserList({ userId: unique.slice(0, 100), limit: 100 });
    return new Map(
      data.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ||
          u.id,
      ])
    );
  } catch {
    return new Map();
  }
}

export default async function AdminSubscriptionsPage({ searchParams }: PageProps<"/admin/subscriptions">) {
  await requireAdmin();
  const sp = await searchParams;

  const query = typeof sp.q === "string" ? sp.q : "";
  const status = (typeof sp.status === "string" ? sp.status : "all") as SubscriptionStatus | "all";
  const cycle = (typeof sp.cycle === "string" ? sp.cycle : "all") as BillingCycle | "all";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const result = await listSubscriptions({ query, status, cycle, page });
  const owners = result.ok ? await resolveOwners(result.rows.map((r) => r.user_id)) : new Map<string, string>();
  const pageSize = 20;
  const pageCount = result.ok ? Math.max(1, Math.ceil(result.total / pageSize)) : 1;

  return (
    <>
      <h1 className="text-2xl font-semibold">Subscriptions</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">Source: Supabase.</p>

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin/subscriptions">
        <div>
          <label className="block text-xs text-black/60 dark:text-white/60">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Name or category"
            className="mt-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </div>
        <div>
          <label className="block text-xs text-black/60 dark:text-white/60">Status</label>
          <select
            name="status"
            defaultValue={status}
            className="mt-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-black/60 dark:text-white/60">Cycle</label>
          <select
            name="cycle"
            defaultValue={cycle}
            className="mt-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          >
            <option value="all">Any</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          Filter
        </button>
      </form>

      <div className="mt-6">
        {!result.ok ? (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load subscriptions from Supabase: {result.error}. Make sure{" "}
            <code>supabase/schema.sql</code> has been run and <code>SUPABASE_URL</code>/
            <code>SUPABASE_SECRET_KEY</code> are set.
          </p>
        ) : result.rows.length === 0 ? (
          <p className="rounded-2xl border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            {result.total === 0
              ? "No subscriptions in the database yet."
              : "No subscriptions match this search/filter."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 text-xs uppercase text-black/50 dark:border-white/15 dark:text-white/50">
                <tr>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Cycle</th>
                  <th className="px-4 py-3">Renewal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((sub) => (
                  <tr key={sub.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                    <td className="px-4 py-3">
                      <div className="font-medium">{sub.name}</div>
                      <div className="text-xs text-black/50 dark:text-white/50">{sub.category}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${sub.user_id}`} className="hover:underline">
                        {owners.get(sub.user_id) ?? sub.user_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatMoney(sub.price, sub.currency)}</td>
                    <td className="px-4 py-3 capitalize">{sub.cycle}</td>
                    <td className="px-4 py-3 text-black/70 dark:text-white/70">{formatDate(sub.renewal_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          sub.status === "canceled"
                            ? "rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
                            : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {sub.status === "canceled" ? "Canceled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-black/70 dark:text-white/70">{formatDate(sub.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.ok && pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-black/50 dark:text-white/50">
              Page {page} of {pageCount} · {result.total} total
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`/admin/subscriptions?q=${encodeURIComponent(query)}&status=${status}&cycle=${cycle}&page=${page - 1}`}
                  className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20"
                >
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link
                  href={`/admin/subscriptions?q=${encodeURIComponent(query)}&status=${status}&cycle=${cycle}&page=${page + 1}`}
                  className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
