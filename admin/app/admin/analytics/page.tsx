import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSubscriptionAnalytics } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  await requireAdmin();

  const [userCount, analytics] = await Promise.all([
    (async () => {
      try {
        const clerk = await clerkClient();
        return { ok: true as const, value: await clerk.users.getCount() };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Unknown error" };
      }
    })(),
    getSubscriptionAnalytics(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Live figures computed from Clerk and Supabase — nothing here is fabricated or estimated.
      </p>

      {!analytics.ok ? (
        <p className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load subscription analytics from Supabase: {analytics.error}
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Registered users" value={userCount.ok ? String(userCount.value) : "—"} />
            <StatCard label="Total subscriptions" value={String(analytics.totalCount)} />
            <StatCard label="Active" value={String(analytics.activeCount)} />
            <StatCard label="Canceled" value={String(analytics.canceledCount)} />
          </div>
          {!userCount.ok ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Couldn&apos;t load the user count from Clerk: {userCount.error}
            </p>
          ) : null}

          <h2 className="mt-8 text-sm font-semibold text-black/60 dark:text-white/60">
            Spend (active subscriptions only)
          </h2>
          {analytics.spendByCurrency.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              No active subscriptions to calculate spend from yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {analytics.spendByCurrency.map((row) => (
                <div key={row.currency} className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
                  <p className="text-sm text-black/60 dark:text-white/60">{row.currency} spend</p>
                  <div className="mt-2 flex gap-6">
                    <div>
                      <p className="text-2xl font-semibold">{formatMoney(row.monthly, row.currency)}</p>
                      <p className="text-xs text-black/50 dark:text-white/50">monthly</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{formatMoney(row.yearly, row.currency)}</p>
                      <p className="text-xs text-black/50 dark:text-white/50">projected yearly</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {analytics.spendByCurrency.length > 1 ? (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">
              Shown per currency rather than combined — adding different currencies together would be a misleading
              total.
            </p>
          ) : null}

          <h2 className="mt-8 text-sm font-semibold text-black/60 dark:text-white/60">
            Spending by service (active subscriptions)
          </h2>
          {analytics.topServices.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              No active subscriptions yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {(() => {
                const max = Math.max(...analytics.topServices.map((s) => s.monthly));
                return analytics.topServices.map((s) => (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span>{formatMoney(s.monthly, s.currency)}/mo</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-2 rounded-full bg-foreground"
                        style={{ width: `${max > 0 ? (s.monthly / max) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          <h2 className="mt-8 text-sm font-semibold text-black/60 dark:text-white/60">Renewal trends</h2>
          <p className="mt-3 rounded-2xl border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            No historical/renewal-event data is tracked yet, so a trend chart would have to be invented. Once
            subscription changes are logged over time, this section can show real trends.
          </p>
        </>
      )}
    </>
  );
}
