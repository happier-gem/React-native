import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, formatMoney } from "@/lib/format";
import { getPlan, FREE_PLAN, type TierId } from "@/lib/plans";
import { listSuccessfulPaymentsForUser } from "@/lib/payments";
import { getEffectiveUserPlan, listPlanEventsForUser } from "@/lib/user-plans";
import { banUserAction, unbanUserAction, deleteUserAction } from "../actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const tierName = (id: TierId | null) => (id === null ? "—" : id === "free" ? FREE_PLAN.name : (getPlan(id)?.name ?? id));

const EVENT_LABELS: Record<string, string> = {
  activated: "Activated",
  renewed: "Renewed",
  upgraded: "Upgraded",
  downgrade_scheduled: "Downgrade scheduled",
  downgrade_applied: "Downgrade applied",
  expired: "Expired",
};

// Read-only by design: there is no approved workflow for admins to grant paid
// plans, so plans change only through verified payments.
async function PlanSection({ userId }: { userId: string }) {
  let data;
  try {
    const [effective, payments, events] = await Promise.all([
      getEffectiveUserPlan(userId),
      listSuccessfulPaymentsForUser(userId, 1),
      listPlanEventsForUser(userId, 10),
    ]);
    data = { effective, lastPayment: payments[0] ?? null, events };
  } catch {
    return (
      <p className="mt-8 text-sm text-black/50 dark:text-white/50">
        Plan data unavailable — check that the user_plans migration has been run.
      </p>
    );
  }
  const { effective, lastPayment, events } = data;
  const stored = effective.storedPlan;

  const cards: [string, string][] = [
    ["Current plan", tierName(effective.plan)],
    ["Stored plan", stored ? `${tierName(stored.plan)} · ${stored.status}` : "None (never paid)"],
    ["Started", effective.startedAt ? formatDate(effective.startedAt) : "—"],
    ["Expires", effective.expiresAt ? formatDate(effective.expiresAt) : "Never (Free)"],
    [
      "Scheduled change",
      effective.pendingChange
        ? `${tierName(effective.pendingChange.plan)} from ${formatDate(effective.pendingChange.startsAt)} to ${formatDate(effective.pendingChange.expiresAt)}`
        : "None",
    ],
    [
      "Latest successful payment",
      lastPayment
        ? `${formatMoney(Number(lastPayment.amount), lastPayment.currency)} · ${tierName(lastPayment.plan)} · ${
            lastPayment.completed_at ? formatDate(lastPayment.completed_at) : "—"
          }`
        : "None",
    ],
  ];

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Plan</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
            <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
            <dd className="mt-1 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold">Plan history</h3>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">No plan changes yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase text-black/50 dark:border-white/15 dark:text-white/50">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                  <td className="px-4 py-3">{formatDate(e.created_at)}</td>
                  <td className="px-4 py-3">{EVENT_LABELS[e.event] ?? e.event}</td>
                  <td className="px-4 py-3">
                    {tierName(e.from_plan)} → {tierName(e.to_plan)}
                  </td>
                  <td className="px-4 py-3">
                    {e.period_start ? formatDate(e.period_start) : "—"} – {e.period_end ? formatDate(e.period_end) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.payment_id ? e.payment_id.slice(0, 8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminUserDetailPage({ params }: PageProps<"/admin/users/[userId]">) {
  const admin = await requireAdmin();
  const { userId } = await params;

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId).catch(() => null);
  if (!user) notFound();

  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  const isAdmin = user.publicMetadata?.role === "admin";
  const isSelf = user.id === admin.userId;

  return (
    <>
      <Link href="/admin/users" className="text-sm text-black/60 hover:underline dark:text-white/60">
        ← Back to users
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <Image src={user.imageUrl} alt="" width={56} height={56} className="rounded-full" unoptimized />
        <div>
          <h1 className="text-2xl font-semibold">
            {[user.firstName, user.lastName].filter(Boolean).join(" ") || "(no name)"}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60">{email ?? "no email on file"}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <dt className="text-xs text-black/50 dark:text-white/50">Role</dt>
          <dd className="mt-1 text-sm font-medium">{isAdmin ? "Admin" : "User"}</dd>
        </div>
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <dt className="text-xs text-black/50 dark:text-white/50">Status</dt>
          <dd className="mt-1 text-sm font-medium">{user.banned ? "Suspended" : "Active"}</dd>
        </div>
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <dt className="text-xs text-black/50 dark:text-white/50">Registered</dt>
          <dd className="mt-1 text-sm font-medium">{formatDate(user.createdAt)}</dd>
        </div>
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <dt className="text-xs text-black/50 dark:text-white/50">Last active</dt>
          <dd className="mt-1 text-sm font-medium">{user.lastActiveAt ? formatDate(user.lastActiveAt) : "never"}</dd>
        </div>
      </dl>

      <PlanSection userId={user.id} />

      {isSelf ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          This is your own account — suspend/delete are disabled here to prevent locking yourself out.
        </p>
      ) : (
        <div className="mt-6 flex gap-3">
          <form action={user.banned ? unbanUserAction : banUserAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {user.banned ? "Reactivate account" : "Suspend account"}
            </button>
          </form>
          <form action={deleteUserAction}>
            <input type="hidden" name="userId" value={user.id} />
            <ConfirmSubmitButton
              confirmMessage={`Permanently delete ${email ?? user.id}? This can't be undone.`}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              Delete account
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </>
  );
}
