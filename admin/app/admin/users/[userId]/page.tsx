import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/format";
import { banUserAction, unbanUserAction, deleteUserAction } from "../actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

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
