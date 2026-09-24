import { requireAdmin } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-render on every client navigation, so each admin page and
  // action must also call requireAdmin()/checkAdmin() itself.
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <AdminSidebar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
