import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AuditAction = "user.ban" | "user.unban" | "user.delete";

/**
 * Best-effort audit trail for destructive/administrative actions. Never blocks
 * or fails the action it's logging for — a missing/misconfigured audit table
 * shouldn't stop an admin from doing their job, so failures are swallowed
 * (and would show up in server logs, not user-facing errors).
 */
export async function logAdminAction(entry: {
  actorUserId: string;
  action: AuditAction;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabaseAdmin().from("admin_audit_log").insert({
      actor_user_id: entry.actorUserId,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error("[audit-log] insert failed:", error.message);
  } catch (e) {
    console.error("[audit-log] insert failed:", e instanceof Error ? e.message : e);
  }
}
