import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listUsers, type AdminUserStatus } from "@/lib/users";
import { formatDate } from "@/lib/format";
import { banUserAction, unbanUserAction, deleteUserAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const query = typeof sp.q === "string" ? sp.q : "";
  const status = (typeof sp.status === "string" ? sp.status : "all") as AdminUserStatus | "all";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const result = await listUsers({ query, status, page });

  return (
    <>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Source: Clerk. Suspending, reactivating and deleting accounts calls Clerk&apos;s Backend API directly and is
        logged to <code>admin_audit_log</code> in Supabase.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin/users">
        <div>
          <label className="block text-xs text-black/60 dark:text-white/60">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Name or email"
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
            <option value="banned">Suspended</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          Filter
        </button>
      </form>

      <div className="mt-6">
        {!result.ok ? (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load users from Clerk: {result.error}
          </p>
        ) : result.rows.length === 0 ? (
          <p className="rounded-2xl border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            No users match this search/filter.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 text-xs uppercase text-black/50 dark:border-white/15 dark:text-white/50">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((user) => (
                  <tr key={user.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                        {user.name}
                      </Link>
                      <div className="text-xs text-black/50 dark:text-white/50">{user.email ?? "no email"}</div>
                    </td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          user.status === "banned"
                            ? "rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
                            : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {user.status === "banned" ? "Suspended" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-black/70 dark:text-white/70">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {user.id === admin.userId ? (
                          <span className="text-xs text-black/40 dark:text-white/40">This is you</span>
                        ) : (
                          <>
                            <form action={user.status === "banned" ? unbanUserAction : banUserAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                              >
                                {user.status === "banned" ? "Reactivate" : "Suspend"}
                              </button>
                            </form>
                            <form action={deleteUserAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <ConfirmSubmitButton
                                confirmMessage={`Permanently delete ${user.email ?? user.name}? This can't be undone.`}
                                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
                              >
                                Delete
                              </ConfirmSubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.ok && result.pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-black/50 dark:text-white/50">
              Page {page} of {result.pageCount} · {result.total} total
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`/admin/users?q=${encodeURIComponent(query)}&status=${status}&page=${page - 1}`}
                  className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20"
                >
                  Previous
                </Link>
              ) : null}
              {page < result.pageCount ? (
                <Link
                  href={`/admin/users?q=${encodeURIComponent(query)}&status=${status}&page=${page + 1}`}
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
