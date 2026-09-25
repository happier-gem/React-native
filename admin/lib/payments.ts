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
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("internal_reference", internalReference)
    .maybeSingle();
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
  const { data } = await supabaseAdmin()
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
      const existing = await findByInternalReference(input.userId, internalReference);
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
    .update({ status: "FAILED", failure_reason: reason, completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "PENDING"); // only ever transition out of PENDING
  if (error) safeServerError("markFailed", error);
}

/** Ownership-scoped lookup — a client can never retrieve another user's payment. */
export async function getPaymentForUser(userId: string, id: string): Promise<PaymentRecord | null> {
  const { data } = await supabaseAdmin().from("payments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
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

export async function getPaymentByProviderReference(providerReference: string): Promise<PaymentRecord | null> {
  const { data } = await supabaseAdmin().from("payments").select("*").eq("provider_reference", providerReference).maybeSingle();
  return (data as PaymentRecord | null) ?? null;
}

export type TransitionResult = { ok: true; alreadyProcessed: boolean } | { ok: false; error: string };

/**
 * Idempotent status transition — only ever moves PENDING -> SUCCESS/FAILED.
 * A repeat webhook delivery for an already-settled payment is a safe no-op,
 * not an error, and the `.eq("status", "PENDING")` guard prevents two
 * concurrent webhook deliveries from double-processing the same payment.
 */
export async function transitionPaymentStatus(
  id: string,
  nextStatus: "SUCCESS" | "FAILED",
  opts: { failureReason?: string } = {}
): Promise<TransitionResult> {
  const existing = await supabaseAdmin().from("payments").select("status").eq("id", id).maybeSingle();
  if (existing.error) return { ok: false, error: safeServerError("transitionPaymentStatus:lookup", existing.error) };
  if (!existing.data) return { ok: false, error: "Payment not found" };

  if (existing.data.status !== "PENDING") {
    return { ok: true, alreadyProcessed: true };
  }

  const { error, count } = await supabaseAdmin()
    .from("payments")
    .update(
      {
        status: nextStatus,
        completed_at: new Date().toISOString(),
        failure_reason: nextStatus === "FAILED" ? (opts.failureReason ?? null) : null,
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("status", "PENDING");

  if (error) return { ok: false, error: safeServerError("transitionPaymentStatus:update", error) };
  // count === 0 means another concurrent request already transitioned it first.
  return { ok: true, alreadyProcessed: count === 0 };
}
