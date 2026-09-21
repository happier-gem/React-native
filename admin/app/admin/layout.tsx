import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-render on every client navigation, so each admin page and
  // action must also call requireAdmin()/checkAdmin() itself.
  await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/15">
        <nav className="flex items-center gap-6 text-sm">
          <span className="font-semibold">Subscription Tracker</span>
          <Link href="/admin" className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white">
            Overview
          </Link>
        </nav>
        <UserButton />
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
