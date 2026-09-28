import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Entitlements } from "@/lib/entitlements";

export type ReminderSettings = {
  /** Days before each renewal to remind, ascending. */
  reminderDays: number[];
  smsReminders: boolean;
  whatsappReminders: boolean;
  /** Local form 0XXXXXXXXX; needed for SMS/WhatsApp reminders. */
  reminderPhone: string | null;
};

const DEFAULTS: ReminderSettings = { reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: null };

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
  return {
    reminderDays: days.length ? days : [e.reminderDayOptions[0]],
    smsReminders: s.smsReminders && e.smsReminders,
    whatsappReminders: s.whatsappReminders && e.whatsappReminders,
    reminderPhone: s.reminderPhone,
  };
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

  if (body.reminderPhone !== undefined) {
    if (body.reminderPhone === null || body.reminderPhone === "") {
      next.reminderPhone = null;
    } else {
      const raw = typeof body.reminderPhone === "string" ? body.reminderPhone.replace(/[\s-]/g, "") : "";
      const local = /^\+?265\d{9}$/.test(raw) ? `0${raw.replace(/^\+?265/, "")}` : raw;
      if (!/^0[89]\d{8}$/.test(local)) return { ok: false, status: 400, error: "Enter a valid Malawi mobile number." };
      next.reminderPhone = local;
    }
  }

  for (const [key, allowed, label] of [
    ["smsReminders", e.smsReminders, "SMS reminders are available on Starter and Pro."],
    ["whatsappReminders", e.whatsappReminders, "WhatsApp reminders are available on Pro."],
  ] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { ok: false, status: 400, error: `${key} must be true or false` };
    if (value && !allowed) return planLimit(label);
    next[key] = value;
  }

  if ((next.smsReminders || next.whatsappReminders) && !next.reminderPhone) {
    return { ok: false, status: 400, error: "Add the phone number to send reminders to." };
  }
  return { ok: true, value: next };
}

type SettingsRow = {
  reminder_days: number[];
  sms_reminders: boolean;
  whatsapp_reminders: boolean;
  reminder_phone: string | null;
};

/** The user's stored choices (not clamped), or null if they never saved any. */
export async function getStoredSettings(userId: string): Promise<ReminderSettings | null> {
  const { data, error } = await supabaseAdmin()
    .from("user_settings")
    .select("reminder_days, sms_reminders, whatsapp_reminders, reminder_phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`user_settings read failed: ${error.message}`);
  if (!data) return null;
  const row = data as SettingsRow;
  return {
    reminderDays: row.reminder_days,
    smsReminders: row.sms_reminders,
    whatsappReminders: row.whatsapp_reminders,
    reminderPhone: row.reminder_phone,
  };
}

export async function saveSettings(userId: string, s: ReminderSettings): Promise<void> {
  const { error } = await supabaseAdmin().from("user_settings").upsert({
    user_id: userId,
    reminder_days: s.reminderDays,
    sms_reminders: s.smsReminders,
    whatsapp_reminders: s.whatsappReminders,
    reminder_phone: s.reminderPhone,
  });
  if (error) throw new Error(`user_settings write failed: ${error.message}`);
}

export const DEFAULT_SETTINGS = DEFAULTS;
