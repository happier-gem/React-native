import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

export type MobileAuthResult = { ok: true; userId: string } | { ok: false; status: 401 };

/**
 * Authenticates a request from the mobile app, which sends its Clerk session
 * token as `Authorization: Bearer <token>` rather than a browser cookie.
 *
 * The ordinary `auth()`/`currentUser()` helpers (used by lib/admin-auth.ts for
 * the web dashboard) are cookie-based and do NOT read a Bearer token from a
 * cross-origin/native client — `clerkClient().authenticateRequest()` is the
 * correct function for that (verified against the installed @clerk/backend
 * source). `authorizedParties` is intentionally omitted: it's an extra check
 * against the token's origin claim, meaningless for a native app with no web
 * origin, and Clerk skips it entirely when omitted rather than failing closed.
 */
export async function authenticateMobileRequest(req: Request): Promise<MobileAuthResult> {
  const clerk = await clerkClient();
  const requestState = await clerk.authenticateRequest(req, { acceptsToken: "session_token" });

  if (!requestState.isAuthenticated) {
    return { ok: false, status: 401 };
  }

  const { userId } = requestState.toAuth();
  if (!userId) return { ok: false, status: 401 };

  return { ok: true, userId };
}
