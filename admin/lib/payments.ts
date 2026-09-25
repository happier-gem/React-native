import "server-only";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlan, type PlanId } from "@/lib/plans";
import type { InfiPayProvider } from "@/lib/infi-pay";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

// Mirrors the `payments` table in supabase/schema.sql.
export type PaymentRecord = {
  id: string;
  user_id: string;
  plan: PlanId;
  amount: number;
  currency: string;
  provider: InfiPayProvider;
  phone_number: string;
  provider_reference: string | null;
  internal_reference: string;
  status: PaymentStatus;
  failure_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

/** Same pattern as lib/subscriptions.ts: log the real error server-side, return
 * a generic message safe to send to a client. */
function safeServerError(context: string, error: { message: string; code?: string }): string {
  console.error(`[payments:${context}]`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
  return "Something went wrong on our end. Please try again.";
}

const RECENT_PENDING_WINDOW_MINUTES = 5;

/**
 * Idempotency layer 1: an explicit client-supplied key (reused on retry after
 * a timeout, for example). Scoped to the authenticated user — a client can
 * never look up another user's payment by guessing/reusing their reference.
 */
export async function findByInternalReference(userId: string, internalReference: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("internal_reference", internalReference)
    .maybeSingle();
  if (error) throw new Error(safeServerError("findByInternalReference", error));
  return (data as PaymentRecord | null) ?? null;
}

/**
 * Idempotency layer 2: even without a client-supplied key, don't create a
 * second PENDING payment for the same user/plan/provider/phone within a short
 * window — guards against a double-tapped Pay button or a naive client retry.
 */
export async function findReusablePendingPayment(
  userId: string,
  plan: PlanId,
  provider: InfiPayProvider,
  phoneNumber: string
): Promise<PaymentRecord | null> {
  const since = new Date(Date.now() - RECENT_PENDING_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("plan", plan)
    .eq("provider", provider)
    .eq("phone_number", phoneNumber)
    .eq("status", "PENDING")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(safeServerError("findReusablePendingPayment", error));
  return (data as PaymentRecord | null) ?? null;
}

export type CreatePendingResult =
  | { ok: true; row: PaymentRecord; reused: boolean }
  | { ok: false; status: 500; error: string };

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function createPendingPayment(input: {
  userId: string;
  plan: PlanId;
  provider: InfiPayProvider;
  phoneNumber: string;
  idempotencyKey?: string;
}): Promise<CreatePendingResult> {
  const planConfig = getPlan(input.plan);
  if (!planConfig) return { ok: false, status: 500, error: "Invalid plan" };

  const internalReference = input.idempotencyKey?.trim() || `pay_${randomUUID()}`;

  const { data, error } = await supabaseAdmin()
    .from("payments")
    .insert({
      user_id: input.userId,
      plan: input.plan,
      amount: planConfig.price,
      currency: planConfig.currency,
      provider: input.provider,
      phone_number: input.phoneNumber,
      internal_reference: internalReference,
      status: "PENDING",
    })
    .select()
    .single();

  if (error) {
    // The (user_id, internal_reference) unique constraint is the ultimate
    // duplicate-prevention backstop — the app-level checks in the initiate
    // route can still race under concurrent requests. Rather than surface a
    // raw 500 for what's actually a legitimate "already exists" case, look up
    // and return the row that won the race.
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      const existing = await findByInternalReference(input.userId, internalReference).catch(() => null);
      if (existing) return { ok: true, row: existing, reused: true };
    }
    return { ok: false, status: 500, error: safeServerError("createPendingPayment", error) };
  }
  return { ok: true, row: data as PaymentRecord, reused: false };
}

/** Guarded to PENDING only — once a payment has settled, its provider
 * reference can never be reassigned, malicious or otherwise. */
export async function attachProviderReference(id: string, providerReference: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("payments")
    .update({ provider_reference: providerReference })
    .eq("id", id)
    .eq("status", "PENDING");
  if (error) safeServerError("attachProviderReference", error);
}

export async function markFailed(id: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("payments")
    .update({ status: "FAILED", failure_reason: reason.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "PENDING"); // only ever transition out of PENDING
  if (error) safeServerError("markFailed", error);
}

/** Ownership-scoped lookup — a client can never retrieve another user's payment.
 * Throws on a DB error (so an outage is a 500, not a misleading 404). */
export async function getPaymentForUser(userId: string, id: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseAdmin().from("payments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(safeServerError("getPaymentForUser", error));
  return (data as PaymentRecord | null) ?? null;
}

/** Server-internal lookup (plan activation) — never expose to a client route;
 * client-facing lookups must use getPaymentForUser(). Throws on a DB error so
 * the caller can distinguish "not found" from "couldn't check". */
export async function getPaymentById(id: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseAdmin().from("payments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(safeServerError("getPaymentById", error));
  return (data as PaymentRecord | null) ?? null;
}

/** Most recent successful payments for a user, newest first (admin view). */
export async function listSuccessfulPaymentsForUser(userId: string, limit: number): Promise<PaymentRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "SUCCESS")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(safeServerError("listSuccessfulPaymentsForUser", error));
  return (data as PaymentRecord[] | null) ?? [];
}

/** Throws on a DB error: a webhook must answer "retry later" during an outage,
 * never "unknown payment" (which would be acknowledged and lost). */
export async function getPaymentByProviderReference(providerReference: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("provider_reference", providerReference)
    .maybeSingle();
  if (error) throw new Error(safeServerError("getPaymentByProviderReference", error));
  return (data as PaymentRecord | null) ?? null;
}

/**
 * Payment state machine (also enforced in the database by the
 * payments_enforce_transition trigger, 20260926000000_payment_hardening.sql):
 *
 *   PENDING ──> SUCCESS     (verified webhook, or provider status via recovery)
 *   PENDING ──> FAILED      (verified webhook/provider status, or the provider
 *                            definitively rejected the initiation request)
 *   PENDING ──> CANCELLED   (verified webhook/provider status)
 *
 * SUCCESS / FAILED / CANCELLED are final. A late or contradictory provider
 * report never moves a payment backwards; it is recorded as a provider
 * conflict for an operator to investigate (recordProviderConflict). Our own
 * polling windows ending never changes a status.
 */
export type TerminalPaymentStatus = Exclude<PaymentStatus, "PENDING">;

export type TransitionResult =
  | { ok: true; alreadyProcessed: boolean; currentStatus: PaymentStatus }
  | { ok: false; error: string };

/**
 * Idempotent PENDING -> SUCCESS/FAILED/CANCELLED. The conditional
 * `.eq("status", "PENDING")` update is atomic in Postgres, so of any number of
 * concurrent callers (duplicate webhooks, webhook + recovery, two recovery
 * runs) exactly one performs the transition; the rest see alreadyProcessed.
 */
export async function transitionPaymentStatus(
  id: string,
  nextStatus: TerminalPaymentStatus,
  opts: { failureReason?: string } = {}
): Promise<TransitionResult> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .update({
      status: nextStatus,
      completed_at: new Date().toISOString(),
      failure_reason: nextStatus === "SUCCESS" ? null : (opts.failureReason?.slice(0, 500) ?? null),
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("status");

  if (error) return { ok: false, error: safeServerError("transitionPaymentStatus:update", error) };
  if (data && data.length > 0) return { ok: true, alreadyProcessed: false, currentStatus: nextStatus };

  // Nothing updated: already settled (or missing). Report what it is now.
  const existing = await supabaseAdmin().from("payments").select("status").eq("id", id).maybeSingle();
  if (existing.error) return { ok: false, error: safeServerError("transitionPaymentStatus:lookup", existing.error) };
  if (!existing.data) return { ok: false, error: "Payment not found" };
  return { ok: true, alreadyProcessed: true, currentStatus: existing.data.status as PaymentStatus };
}

/**
 * Merges diagnostic keys into payments.metadata (never touches status or
 * money columns). Read-modify-write: fine for diagnostics, where the last
 * writer winning is acceptable. Best-effort — failures are logged only.
 */
async function mergePaymentMetadata(id: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin().from("payments").select("metadata").eq("id", id).maybeSingle();
    if (error || !data) return;
    const { error: updateError } = await supabaseAdmin()
      .from("payments")
      .update({ metadata: { ...(data.metadata ?? {}), ...patch } })
      .eq("id", id);
    if (updateError) safeServerError("mergePaymentMetadata", updateError);
  } catch (e) {
    console.error("[payments:mergePaymentMetadata]", e instanceof Error ? e.message : e);
  }
}

/** Initiation outcome unknown (timeout/5xx): the payment stays PENDING and is
 * flagged for reconciliation instead of being marked FAILED. */
export function markInitiationUncertain(id: string, reason: string) {
  return mergePaymentMetadata(id, { initiation_uncertain: { at: new Date().toISOString(), reason } });
}

/** A verified provider report that contradicts a payment's final status. */
export function recordProviderConflict(
  id: string,
  conflict: { localStatus: PaymentStatus; reportedStatus: string; source: "webhook" | "recovery" }
) {
  return mergePaymentMetadata(id, { provider_conflict: { ...conflict, at: new Date().toISOString() } });
}

/** Result of the latest provider status check made by recovery. */
export function recordProviderCheck(id: string, check: { result: string; status?: string }) {
  return mergePaymentMetadata(id, { provider_check: { ...check, at: new Date().toISOString() } });
}

/** A payment row plus whether a plan change was recorded for it — from the
 * payment_overview view (20260926000000_payment_hardening.sql). */
export type PaymentOverviewRow = PaymentRecord & { plan_applied: boolean };

/** PENDING payments old enough to ask the provider about, oldest first. */
export async function listPendingPaymentsOlderThan(olderThan: Date, limit: number): Promise<PaymentRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("status", "PENDING")
    .lt("created_at", olderThan.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(safeServerError("listPendingPaymentsOlderThan", error));
  return (data as PaymentRecord[] | null) ?? [];
}

/** SUCCESS payments with no recorded plan change, settled before `settledBefore`. */
export async function listSuccessfulPaymentsWithoutPlan(settledBefore: Date, limit: number): Promise<PaymentOverviewRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("payment_overview")
    .select("*")
    .eq("status", "SUCCESS")
    .eq("plan_applied", false)
    .lt("completed_at", settledBefore.toISOString())
    .order("completed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(safeServerError("listSuccessfulPaymentsWithoutPlan", error));
  return (data as PaymentOverviewRow[] | null) ?? [];
}

/** Recent payments for the admin/operator view, newest first. */
export async function listPaymentOverview(opts: { status?: PaymentStatus; limit: number }): Promise<PaymentOverviewRow[]> {
  let query = supabaseAdmin().from("payment_overview").select("*").order("created_at", { ascending: false }).limit(opts.limit);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(safeServerError("listPaymentOverview", error));
  return (data as PaymentOverviewRow[] | null) ?? [];
}

/** Shows only the last 3 digits — enough to tell numbers apart in logs/admin. */
export function maskPhone(phone: string): string {
  return phone.length <= 3 ? "***" : `${"*".repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}`;
}
