import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserStats } from "@/lib/users";
import { getSubscriptionAnalytics } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/format";

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {note ? <p className="mt-1 text-xs text-black/40 dark:text-white/40">{note}</p> : null}
    </div>
  );
}

function ErrorCard({ label, source, error }: { label: string; source: string; error: string }) {
  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-2 text-sm text-red-600 dark:text-red-400">Not connected: {error}</p>
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">Source: {source}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [users, analytics] = await Promise.all([getUserStats(), getSubscriptionAnalytics()]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Signed in as {admin.email ?? admin.userId}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.ok ? (
          <>
            <StatCard label="Total users" value={String(users.total)} note="Source: Clerk" />
            <StatCard
              label="Active users"
              value={String(users.active)}
              note={users.sampledAllUsers ? "Source: Clerk" : "Source: Clerk · first 500 users only"}
            />
          </>
        ) : (
          <>
            <ErrorCard label="Total users" source="Clerk" error={users.error} />
            <ErrorCard label="Active users" source="Clerk" error={users.error} />
          </>
        )}

        {analytics.ok ? (
          <>
            <StatCard label="Total subscriptions" value={String(analytics.totalCount)} note="Source: Supabase" />
            <StatCard label="Active subscriptions" value={String(analytics.activeCount)} note="Source: Supabase" />
            <StatCard label="Canceled subscriptions" value={String(analytics.canceledCount)} note="Source: Supabase" />
            {analytics.spendByCurrency.length === 0 ? (
              <StatCard label="Monthly spend" value="—" note="No active subscriptions yet" />
            ) : (
              analytics.spendByCurrency.map((row) => (
                <StatCard
                  key={row.currency}
                  label={`Monthly spend (${row.currency})`}
                  value={formatMoney(row.monthly, row.currency)}
                  note={`This account's own spend — not platform-wide revenue. Yearly: ${formatMoney(row.yearly, row.currency)}`}
                />
              ))
            )}
          </>
        ) : (
          <ErrorCard label="Subscriptions" source="Supabase" error={analytics.error} />
        )}
      </div>

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/admin/users" className="text-black/70 hover:underline dark:text-white/70">
          Manage users →
        </Link>
        <Link href="/admin/subscriptions" className="text-black/70 hover:underline dark:text-white/70">
          View subscriptions →
        </Link>
        <Link href="/admin/analytics" className="text-black/70 hover:underline dark:text-white/70">
          Full analytics →
        </Link>
      </div>
    </>
  );
}
