import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

export type AdminCheck =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: 401 | 403 };

/**
 * Authoritative admin check. Reads publicMetadata.role from Clerk on the server
 * (publicMetadata can only be written through Clerk's Backend API / Dashboard, so
 * a client cannot grant itself the role). Memoized per request.
 */
export const checkAdmin = cache(async (): Promise<AdminCheck> => {
  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401 };

  const user = await currentUser();
  if (user?.publicMetadata?.role !== "admin") return { ok: false, status: 403 };

  return {
    ok: true,
    userId,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  };
});

/** For pages and server actions: redirects instead of returning. */
export async function requireAdmin() {
  const result = await checkAdmin();
  if (!result.ok) {
    redirect(result.status === 401 ? "/sign-in" : "/not-authorized");
  }
  return result;
}
