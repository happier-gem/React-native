import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Entitlements } from "@/lib/entitlements";

export type ReminderSettings = {
  /** Days before each renewal to remind, ascending. */
  reminderDays: number[];
};

const DEFAULTS: ReminderSettings = { reminderDays: [1] };

/**
 * What actually applies under the user's CURRENT plan. Stored choices are
 * kept as-is (so an upgrade brings them back), but anything the plan doesn't
 * include is dropped here — e.g. after a downgrade or expiry.
 */
export function effectiveSettings(stored: ReminderSettings | null, e: Entitlements): ReminderSettings {
  const s = stored ?? DEFAULTS;
  const days = [...new Set(s.reminderDays)]
    .filter((d) => e.reminderDayOptions.includes(d))
    .sort((a, b) => a - b)
    .slice(0, e.maxRemindersPerSubscription);
  return { reminderDays: days.length ? days : [e.reminderDayOptions[0]] };
}

export type SettingsValidation =
  | { ok: true; value: ReminderSettings }
  | { ok: false; status: 400 | 403; error: string; code?: "plan_limit" };

const planLimit = (error: string): SettingsValidation => ({ ok: false, status: 403, code: "plan_limit", error });

/** Validates a requested change against the user's plan. Nothing the plan
 * doesn't include can be saved. */
export function validateSettingsUpdate(input: unknown, e: Entitlements, current: ReminderSettings): SettingsValidation {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const next: ReminderSettings = { ...current };

  if (body.reminderDays !== undefined) {
    const days = body.reminderDays;
    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d))) {
      return { ok: false, status: 400, error: "reminderDays must be a non-empty list of whole numbers" };
    }
    const unique = [...new Set(days as number[])].sort((a, b) => a - b);
    if (!unique.every((d) => e.reminderDayOptions.includes(d))) {
      return planLimit(
        e.reminderDayOptions.length > 1
          ? `Your plan can remind you ${e.reminderDayOptions.join(", ")} days before a renewal.`
          : "Upgrade your plan to choose when you're reminded."
      );
    }
    if (unique.length > e.maxRemindersPerSubscription) {
      return planLimit(
        e.maxRemindersPerSubscription === 1
          ? "Upgrade to Pro to get more than one reminder per renewal."
          : `Your plan allows up to ${e.maxRemindersPerSubscription} reminders per renewal.`
      );
    }
    next.reminderDays = unique;
  }

  return { ok: true, value: next };
}

/** The user's stored choices (not clamped), or null if they never saved any. */
export async function getStoredSettings(userId: string): Promise<ReminderSettings | null> {
  const { data, error } = await supabaseAdmin()
    .from("user_settings")
    .select("reminder_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`user_settings read failed: ${error.message}`);
  return data ? { reminderDays: (data as { reminder_days: number[] }).reminder_days } : null;
}

export async function saveSettings(userId: string, s: ReminderSettings): Promise<void> {
  const { error } = await supabaseAdmin().from("user_settings").upsert({ user_id: userId, reminder_days: s.reminderDays });
  if (error) throw new Error(`user_settings write failed: ${error.message}`);
}

export const DEFAULT_SETTINGS = DEFAULTS;
