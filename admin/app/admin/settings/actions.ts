"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { THEME_COOKIE, isThemePreference } from "@/lib/theme";

export async function setThemeAction(formData: FormData) {
  await requireAdmin();

  const value = formData.get("theme");
  if (!isThemePreference(value)) throw new Error("Invalid theme");

  const store = await cookies();
  store.set(THEME_COOKIE, value, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  revalidatePath("/admin", "layout");
}
