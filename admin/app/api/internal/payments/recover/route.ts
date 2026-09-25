import { createHash, timingSafeEqual } from "crypto";
import { recoverPendingPayments } from "@/lib/payment-recovery";

// Scheduled pending-payment recovery (e.g. Vercel Cron every 5–10 minutes, or
// any scheduler that can send an Authorization header). Server-to-server only:
// it requires `Authorization: Bearer <CRON_SECRET>` and is disabled entirely
// while CRON_SECRET is unset. It returns counts only — no payment details.
function authorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const ok = authorized(request);
  if (ok === null) return Response.json({ error: "Recovery endpoint is not configured" }, { status: 503 });
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await recoverPendingPayments();
  return Response.json({ ok: true, summary });
}

export const GET = handle; // Vercel Cron sends GET
export const POST = handle;
