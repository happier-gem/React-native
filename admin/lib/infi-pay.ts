import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * ============================================================================
 * NOT YET VERIFIED AGAINST REAL INFI-PAY DOCUMENTATION.
 *
 * No INFI-PAY API docs, SDK, or sandbox credentials were available when this
 * was written. The request/response shape and endpoint paths below follow the
 * most common convention for mobile-money collection APIs (Bearer-token REST,
 * JSON body) as a reasonable starting structure — they are NOT confirmed real.
 * Same for the webhook signature scheme (HMAC-SHA256 over the raw body) below.
 *
 * Do not treat calls through this file as tested. With INFI_PAY_API_URL unset
 * (the current state), every call fails closed with a clear error instead of
 * silently pretending to succeed. Replace the marked sections once real
 * INFI-PAY documentation/credentials are available.
 * ============================================================================
 */

export type InfiPayProvider = "airtel_money" | "tnm_mpamba";

export type InitiateCollectionParams = {
  amount: number;
  currency: string;
  phoneNumber: string;
  provider: InfiPayProvider;
  /** Our internal_reference — sent so INFI-PAY can echo it back on the webhook
   * for reconciliation, and so retries on their end are idempotent too. */
  reference: string;
};

export type InfiPayResult =
  | { ok: true; providerReference: string; status: "PENDING" | "SUCCESS" }
  | { ok: false; error: string };

function requireConfig() {
  const apiUrl = process.env.INFI_PAY_API_URL;
  const apiKey = process.env.INFI_PAY_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error(
      "INFI_PAY_API_URL and INFI_PAY_API_KEY are not set. Payment initiation cannot proceed without " +
        "real INFI-PAY credentials — see admin/lib/infi-pay.ts."
    );
  }
  return { apiUrl, apiKey };
}

/** Never logs the API key itself — only safe, non-secret context. */
function logError(context: string, detail: unknown) {
  console.error(`[infi-pay:${context}]`, detail);
}

export async function initiateCollection(params: InitiateCollectionParams): Promise<InfiPayResult> {
  let apiUrl: string;
  let apiKey: string;
  try {
    ({ apiUrl, apiKey } = requireConfig());
  } catch (e) {
    logError("initiateCollection:config", e instanceof Error ? e.message : e);
    return { ok: false, error: "Payment provider is not configured yet." };
  }

  try {
    // PLACEHOLDER endpoint/shape — see file header.
    const response = await fetch(`${apiUrl}/collections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        phone_number: params.phoneNumber,
        provider: params.provider,
        reference: params.reference,
      }),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      logError("initiateCollection:response", { status: response.status });
      return { ok: false, error: "INFI-PAY rejected the payment request." };
    }

    const providerReference = data?.reference ?? data?.id;
    if (!providerReference) {
      logError("initiateCollection:missing-reference", { hasData: Boolean(data) });
      return { ok: false, error: "INFI-PAY response did not include a transaction reference." };
    }

    return { ok: true, providerReference: String(providerReference), status: "PENDING" };
  } catch (e) {
    logError("initiateCollection:network", e instanceof Error ? e.message : e);
    return { ok: false, error: "Could not reach the payment provider. Please try again." };
  }
}

export type InfiPayStatusResult =
  | { ok: true; status: "PENDING" | "SUCCESS" | "FAILED" }
  | { ok: false; error: string };

export async function checkTransactionStatus(providerReference: string): Promise<InfiPayStatusResult> {
  let apiUrl: string;
  let apiKey: string;
  try {
    ({ apiUrl, apiKey } = requireConfig());
  } catch (e) {
    logError("checkTransactionStatus:config", e instanceof Error ? e.message : e);
    return { ok: false, error: "Payment provider is not configured yet." };
  }

  try {
    // PLACEHOLDER endpoint/shape — see file header.
    const response = await fetch(`${apiUrl}/collections/${encodeURIComponent(providerReference)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      logError("checkTransactionStatus:response", { status: response.status });
      return { ok: false, error: "Could not check transaction status." };
    }

    const status = data?.status === "successful" ? "SUCCESS" : data?.status === "failed" ? "FAILED" : "PENDING";
    return { ok: true, status };
  } catch (e) {
    logError("checkTransactionStatus:network", e instanceof Error ? e.message : e);
    return { ok: false, error: "Could not reach the payment provider." };
  }
}

/**
 * PLACEHOLDER signature scheme (HMAC-SHA256 of the raw body, hex-encoded) —
 * the most common convention among payment webhook providers, not yet
 * confirmed against real INFI-PAY documentation. Replace once available.
 * Fails closed (returns false) if the secret isn't configured.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.INFI_PAY_WEBHOOK_SECRET;
  if (!secret) {
    logError("verifyWebhookSignature", "INFI_PAY_WEBHOOK_SECRET not configured — rejecting");
    return false;
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
