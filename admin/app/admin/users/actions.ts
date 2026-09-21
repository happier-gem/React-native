"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/audit-log";

// Every action re-verifies the admin role itself — the admin layout's check
// only runs when a page is navigated to, not when a form posts directly here.

export async function banUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("Missing userId");
  if (userId === admin.userId) throw new Error("You can't suspend your own account.");

  const clerk = await clerkClient();
  await clerk.users.banUser(userId);
  await logAdminAction({ actorUserId: admin.userId, action: "user.ban", targetUserId: userId });

  revalidatePath("/admin/users");
}

export async function unbanUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("Missing userId");

  const clerk = await clerkClient();
  await clerk.users.unbanUser(userId);
  await logAdminAction({ actorUserId: admin.userId, action: "user.unban", targetUserId: userId });

  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("Missing userId");
  if (userId === admin.userId) throw new Error("You can't delete your own account from here.");

  const clerk = await clerkClient();
  await clerk.users.deleteUser(userId);
  await logAdminAction({ actorUserId: admin.userId, action: "user.delete", targetUserId: userId });

  revalidatePath("/admin/users");
}
