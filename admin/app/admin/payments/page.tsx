import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, formatMoney } from "@/lib/format";
import { getPaymentProvider } from "@/lib/infi-pay";
import { maskPhone, type PaymentOverviewRow, type PaymentStatus } from "@/lib/payments";
import { paymentPolicy } from "@/lib/payment-recovery";
import { getReconciliationReport, ISSUE_LABELS, type ReconciliationIssue } from "@/lib/payment-reconciliation";
import { runRecoveryAction } from "./actions";

const STATUSES: (PaymentStatus | "all")[] = ["all", "PENDING", "SUCCESS", "FAILED", "CANCELLED"];

const card = "rounded-2xl border border-black/10 p-4 dark:border-white/15";
const muted = "text-black/60 dark:text-white/60";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${formatDate(d)} ${d.toISOString().slice(11, 16)} UTC`;
}

// Operator view. Read-only apart from "Run recovery now", which only asks the
// provider for real statuses — there is deliberately no way to grant a plan or
// force a payment status from here.
export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (typeof sp.status === "string" && STATUSES.includes(sp.status as PaymentStatus) ? sp.status : "all") as
    | PaymentStatus
    | "all";

  const provider = getPaymentProvider();
  const config = provider.config();
  const policy = paymentPolicy();

  let report: Awaited<ReturnType<typeof getReconciliationReport>> | null = null;
  try {
    report = await getReconciliationReport();
  } catch {
    report = null;
  }

  const issuesByPayment = new Map<string, ReconciliationIssue[]>();
  for (const issue of report?.issues ?? []) {
    issuesByPayment.set(issue.paymentId, [...(issuesByPayment.get(issue.paymentId) ?? []), issue]);
  }
  const rows: PaymentOverviewRow[] = (report?.rows ?? [])
    .filter((r) => status === "all" || r.status === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);
  const actionIssues = (report?.issues ?? []).filter((i) => i.severity === "action");
  const watchIssues = (report?.issues ?? []).filter((i) => i.severity === "watch");

  return (
    <>
      <h1 className="text-2xl font-semibold">Payments</h1>
      <p className={`mt-1 text-sm ${muted}`}>Plan payments via {provider.name}. Source: Supabase.</p>

      {sp.recovered === "1" ? (
        <div className={`${card} mt-4 text-sm`} role="status">
          <strong>Recovery run finished.</strong>{" "}
          {sp.configured === "0" ? "Provider not configured — only activation retries ran. " : null}
          Checked {sp.checked} · succeeded {sp.succeeded} · failed/cancelled {sp.failed} · still pending {sp.pending} ·
          provider unavailable/unknown {sp.unavailable} · plans activated {sp.activated} · errors {sp.errors}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <div className={`text-xs ${muted}`}>Provider</div>
          {config.configured ? (
            <div className="mt-1 text-sm font-medium">
              Configured · <span className="uppercase">{config.environment}</span>
            </div>
          ) : (
            <div className="mt-1 text-sm">
              <span className="font-medium">Not configured</span>
              {config.missing.length ? <div className={`mt-1 text-xs ${muted}`}>Missing: {config.missing.join(", ")}</div> : null}
              {config.invalid.length ? <div className={`mt-1 text-xs ${muted}`}>Invalid: {config.invalid.join(", ")}</div> : null}
            </div>
          )}
        </div>
        <div className={card}>
          <div className={`text-xs ${muted}`}>Pending policy (provisional)</div>
          <div className="mt-1 text-sm">
            Ask provider after {policy.recoveryMinAgeMinutes} min · review after {policy.pendingReviewAfterHours} h
          </div>
          <div className={`mt-1 text-xs ${muted}`}>Pending payments are never auto-failed.</div>
        </div>
        <div className={card}>
          <div className={`text-xs ${muted}`}>Recovery</div>
          <form action={runRecoveryAction} className="mt-2">
            <button
              type="submit"
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Run recovery now
            </button>
          </form>
          <div className={`mt-1 text-xs ${muted}`}>Asks the provider about pending payments; retries plan activation.</div>
        </div>
      </div>

      {!report ? (
        <p className={`mt-8 text-sm ${muted}`}>
          Payment data unavailable — check that the migrations up to 20260926000000_payment_hardening.sql have been run.
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold">Needs attention</h2>
          {actionIssues.length === 0 && watchIssues.length === 0 ? (
            <p className={`mt-2 text-sm ${muted}`}>Nothing to reconcile.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {[...actionIssues, ...watchIssues].map((issue) => (
                <li key={`${issue.type}-${issue.paymentId}`} className={`${card} text-sm`}>
                  <span className="font-medium">
                    {issue.severity === "action" ? "Action: " : "Watch: "}
                    {ISSUE_LABELS[issue.type]}
                  </span>{" "}
                  · payment <code className="text-xs">{issue.paymentId}</code> ·{" "}
                  <Link href={`/admin/users/${issue.userId}`} className="underline">
                    user
                  </Link>
                  <div className={`mt-1 ${muted}`}>{issue.detail}</div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent payments</h2>
            <form action="/admin/payments" className="flex items-end gap-2">
              <label className={`text-xs ${muted}`}>
                Status
                <select
                  name="status"
                  defaultValue={status}
                  className="ml-2 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/20"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "All" : s}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-lg border border-black/15 px-3 py-1 text-sm dark:border-white/20">
                Filter
              </button>
            </form>
          </div>

          {rows.length === 0 ? (
            <p className={`mt-2 text-sm ${muted}`}>No payments.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase text-black/50 dark:border-white/15 dark:text-white/50">
                  <tr>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Network / phone</th>
                    <th className="px-4 py-3">Provider ref</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">Plan applied</th>
                    <th className="px-4 py-3">Reconcile</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const flags = issuesByPayment.get(p.id) ?? [];
                    return (
                      <tr key={p.id} className="border-b border-black/5 align-top last:border-0 dark:border-white/10">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/users/${p.user_id}`} className="font-mono text-xs underline">
                            {p.user_id.slice(0, 14)}…
                          </Link>
                        </td>
                        <td className="px-4 py-3 capitalize">{p.plan}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatMoney(Number(p.amount), p.currency)}</td>
                        <td className="px-4 py-3 font-medium">{p.status}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.provider} · {maskPhone(p.phone_number)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{p.provider_reference ?? "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(p.updated_at)}</td>
                        <td className="px-4 py-3">{p.status === "SUCCESS" ? (p.plan_applied ? "Yes" : "No") : "—"}</td>
                        <td className="px-4 py-3">
                          {flags.length === 0 ? "—" : flags.map((f) => <div key={f.type}>{ISSUE_LABELS[f.type]}</div>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
