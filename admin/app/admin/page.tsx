import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Stat = { ok: true; value: number } | { ok: false; error: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

async function countUsers(): Promise<Stat> {
  try {
    const clerk = await clerkClient();
    return { ok: true, value: await clerk.users.getCount() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

async function countSubscriptions(): Promise<Stat> {
  try {
    const { count, error } = await supabaseAdmin()
      .from("subscriptions")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { ok: true, value: count ?? 0 };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function StatCard({ label, source, stat }: { label: string; source: string; stat: Stat }) {
  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      {stat.ok ? (
        <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
      ) : (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">Not connected: {stat.error}</p>
      )}
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">Source: {source}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [users, subscriptions] = await Promise.all([countUsers(), countSubscriptions()]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Signed in as {admin.email ?? admin.userId}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Registered users" source="Clerk" stat={users} />
        <StatCard label="Subscriptions" source="Supabase" stat={subscriptions} />
      </div>
    </>
  );
}
