import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  InitiateCollectionParams,
  MobileMoneyNetwork,
  PaymentProvider,
  PhoneCheck,
  ProviderConfigStatus,
  ProviderEnvironment,
  ProviderInitiateResult,
  ProviderPaymentStatus,
  ProviderStatusResult,
  ProviderWebhookResult,
} from "@/lib/payment-provider";

/**
 * ============================================================================
 * INFI-PAY ADAPTER — built from the official API documentation
 * (https://api.infi-pay.com/api/v1). Not yet exercised against the live API:
 * no credentials were available when this was written.
 *
 * Documented and implemented:
 *   - Auth: `x-api-key` header (key needs scopes payments.initiate + payments.read)
 *   - Envelope: { success, data, meta } / { success: false, error: { code, message } }
 *   - POST /payments/collections { provider: "airtel"|"mpamba", phoneNumber,
 *     amount, currency, reference } — USSD push; resolves asynchronously.
 *     Idempotent on `reference`: a retry after a timeout doesn't double-charge.
 *   - GET /payments/transaction-status/:reference
 *   - Statuses: pending | processing | success | failed | expired | cancelled | refunded
 *   - Webhooks: X-Signature = hex HMAC-SHA256 of the exact raw body with the
 *     webhook's secret; payload { event, data: { transactionId, amount,
 *     currency, status, provider, externalRef } }; events payment.success |
 *     payment.failed | payment.pending (+ payout.*, refund.*, unused here);
 *     retried with exponential backoff unless we answer 2xx within 15 s.
 *
 * UNCONFIRMED — ask INFI-PAY (see docs/payments.md → INFI-PAY questions):
 *   - The documented webhook payload has no `reference`, so it can't be tied to
 *     our payment directly. Handled safely: a verified webhook only triggers a
 *     status re-check through the API (which is authoritative anyway).
 *   - The transaction-status example returns "completed", the status list says
 *     "success". Both are accepted as SUCCESS.
 *   - Sandbox base URL / test keys, response to an unknown reference,
 *     reference length/charset limits, whether +265 numbers are accepted.
 * ============================================================================
 */

/** @deprecated kept for existing imports — use MobileMoneyNetwork. */
export type InfiPayProvider = MobileMoneyNetwork;

/** Server-only configuration. None of these may ever get a NEXT_PUBLIC_ or
 * EXPO_PUBLIC_ prefix or be referenced from mobile code. */
export const INFI_PAY_ENV_VARS = {
  /** https://api.infi-pay.com/api/v1 (live). */
  apiUrl: "INFI_PAY_API_URL",
  /** API key with scopes payments.initiate and payments.read. */
  apiKey: "INFI_PAY_API_KEY",
  /** Signing secret returned once when the webhook is registered. */
  webhookSecret: "INFI_PAY_WEBHOOK_SECRET",
  /** "sandbox" or "production" — stated explicitly so a test deployment can't
   * be mistaken for a live one. A live key (sk_live_…) is refused in sandbox. */
  environment: "INFI_PAY_ENVIRONMENT",
  /** Our HTTP timeout for calls to INFI-PAY (ms). Default 15000. */
  timeoutMs: "INFI_PAY_TIMEOUT_MS",
} as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_WEBHOOK_BYTES = 64 * 1024;

/** INFI-PAY's names for the networks. */
const NETWORK_CODE: Record<MobileMoneyNetwork, "airtel" | "mpamba"> = {
  airtel_money: "airtel",
  tnm_mpamba: "mpamba",
};

/** Documented prefixes: Airtel 099/098, Mpamba 088/089. */
const NETWORK_PREFIXES: Record<MobileMoneyNetwork, string[]> = {
  airtel_money: ["099", "098"],
  tnm_mpamba: ["088", "089"],
};
const NETWORK_NAMES: Record<MobileMoneyNetwork, string> = { airtel_money: "Airtel Money", tnm_mpamba: "TNM Mpamba" };

type ResolvedConfig = {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  environment: ProviderEnvironment;
  timeoutMs: number;
};

function resolveConfig(): { ok: true; config: ResolvedConfig } | { ok: false; missing: string[]; invalid: string[] } {
  const read = (name: string) => process.env[name]?.trim() ?? "";
  const missing: string[] = [];
  const invalid: string[] = [];

  const apiUrl = read(INFI_PAY_ENV_VARS.apiUrl);
  const apiKey = read(INFI_PAY_ENV_VARS.apiKey);
  const webhookSecret = read(INFI_PAY_ENV_VARS.webhookSecret);
  const environment = read(INFI_PAY_ENV_VARS.environment);
  const timeoutRaw = read(INFI_PAY_ENV_VARS.timeoutMs);

  if (!apiUrl) missing.push(INFI_PAY_ENV_VARS.apiUrl);
  else if (!/^https:\/\//.test(apiUrl)) invalid.push(`${INFI_PAY_ENV_VARS.apiUrl} (must be https://)`);
  if (!apiKey) missing.push(INFI_PAY_ENV_VARS.apiKey);
  if (!webhookSecret) missing.push(INFI_PAY_ENV_VARS.webhookSecret);
  if (!environment) missing.push(INFI_PAY_ENV_VARS.environment);
  else if (environment !== "sandbox" && environment !== "production") {
    invalid.push(`${INFI_PAY_ENV_VARS.environment} (must be "sandbox" or "production")`);
  } else if (environment === "sandbox" && apiKey.startsWith("sk_live_")) {
    invalid.push(`${INFI_PAY_ENV_VARS.apiKey} (a live key is not allowed when ${INFI_PAY_ENV_VARS.environment}=sandbox)`);
  }
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    invalid.push(`${INFI_PAY_ENV_VARS.timeoutMs} (1000–120000)`);
  }

  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return {
    ok: true,
    config: { apiUrl: apiUrl.replace(/\/$/, ""), apiKey, webhookSecret, environment: environment as ProviderEnvironment, timeoutMs },
  };
}

/** Never logs the API key, webhook secret, phone numbers or raw bodies. */
function logError(context: string, detail: Record<string, unknown>) {
  console.error(`[infi-pay:${context}]`, JSON.stringify(detail));
}

function readJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Unwraps the documented envelope. */
function envelope(body: unknown): { success: boolean; data: Record<string, unknown> | null; errorCode: string | null } {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  return {
    success: record?.success === true,
    data: asRecord(record?.data),
    errorCode: typeof error?.code === "string" ? error.code.slice(0, 80) : null,
  };
}

type StatusMapping = { status: ProviderPaymentStatus; failureReason?: string } | { unknown: string };

/** Documented statuses -> ours. "refunded" is deliberately NOT mapped: a
 * refunded collection was once successful, and what that means for a plan is
 * an operator decision, so it is surfaced as unknown for reconciliation. */
function mapStatus(raw: unknown): StatusMapping {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  switch (value) {
    case "pending":
    case "processing":
      return { status: "PENDING" };
    case "success":
    case "completed": // used in the docs' transaction-status example (UNCONFIRMED)
      return { status: "SUCCESS" };
    case "failed":
      return { status: "FAILED" };
    case "expired":
      // The customer never confirmed the USSD prompt; nothing was collected.
      return { status: "FAILED", failureReason: "expired" };
    case "cancelled":
    case "canceled":
      return { status: "CANCELLED" };
    default:
      return { unknown: value.slice(0, 50) || "(none)" };
  }
}

const isNetworkError = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e.name === "TypeError");

export const infiPayProvider: PaymentProvider = {
  name: "INFI-PAY",

  config(): ProviderConfigStatus {
    const resolved = resolveConfig();
    return resolved.ok
      ? { configured: true, environment: resolved.config.environment }
      : { configured: false, missing: resolved.missing, invalid: resolved.invalid };
  },

  checkPhoneNumber(phoneNumber: string, network: MobileMoneyNetwork): PhoneCheck {
    const digits = phoneNumber.replace(/[\s-]/g, "");
    // Accept 0XXXXXXXXX or +265XXXXXXXXX / 265XXXXXXXXX; send the local form
    // the documentation uses in every example.
    const local = /^(\+?265)\d{9}$/.test(digits) ? `0${digits.replace(/^\+?265/, "")}` : digits;
    if (!/^0\d{9}$/.test(local)) return { ok: false, message: "Enter a valid Malawi mobile number." };
    if (!NETWORK_PREFIXES[network].some((p) => local.startsWith(p))) {
      return {
        ok: false,
        message: `That isn't a ${NETWORK_NAMES[network]} number (${NETWORK_PREFIXES[network].join("/")}…).`,
      };
    }
    return { ok: true, normalized: local };
  },

  async initiateCollection(params: InitiateCollectionParams): Promise<ProviderInitiateResult> {
    const resolved = resolveConfig();
    if (!resolved.ok) {
      logError("initiate:config", { missing: resolved.missing, invalid: resolved.invalid });
      return { kind: "rejected", reason: "provider_not_configured" }; // nothing was sent
    }
    const { apiUrl, apiKey, timeoutMs } = resolved.config;

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/payments/collections`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: NETWORK_CODE[params.network],
          phoneNumber: params.phoneNumber,
          amount: params.amount,
          currency: params.currency,
          reference: params.reference,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // May or may not have reached INFI-PAY. Safe to retry later with the
      // same reference (documented idempotency).
      logError("initiate:network", { reference: params.reference, error: e instanceof Error ? e.name : "unknown" });
      return { kind: "uncertain", reason: isNetworkError(e) ? "network_or_timeout" : "request_error" };
    }

    const body = envelope(readJson(await response.text().catch(() => "")));

    if (response.status >= 500 || response.status === 408) {
      logError("initiate:server-error", { reference: params.reference, status: response.status, code: body.errorCode });
      return { kind: "uncertain", reason: `provider_http_${response.status}` };
    }
    if (!response.ok || !body.success) {
      // 4xx (validation, auth, 429 rate limit) — the collection wasn't created.
      logError("initiate:rejected", { reference: params.reference, status: response.status, code: body.errorCode });
      return { kind: "rejected", reason: `provider_http_${response.status}${body.errorCode ? `:${body.errorCode}` : ""}` };
    }

    // INFI-PAY identifies the transaction by our reference and echoes it back.
    if (body.data?.reference !== params.reference) {
      logError("initiate:reference-mismatch", { reference: params.reference, hasData: Boolean(body.data) });
      return { kind: "uncertain", reason: "reference_not_echoed" };
    }
    return { kind: "accepted", providerReference: params.reference };
  },

  async getTransactionStatus(reference: string): Promise<ProviderStatusResult> {
    const resolved = resolveConfig();
    if (!resolved.ok) return { kind: "unavailable", reason: "provider_not_configured" };
    const { apiUrl, apiKey, timeoutMs } = resolved.config;

    try {
      const response = await fetch(`${apiUrl}/payments/transaction-status/${encodeURIComponent(reference)}`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = envelope(readJson(await response.text().catch(() => "")));

      if (response.status === 404) {
        // UNCONFIRMED how INFI-PAY answers an unknown reference. Never treated
        // as a failure — it goes to a human via reconciliation.
        return { kind: "unknown_status", rawStatus: "not_found" };
      }
      if (!response.ok || !body.success || !body.data) {
        logError("status:response", { reference, status: response.status, code: body.errorCode });
        return { kind: "unavailable", reason: `provider_http_${response.status}` };
      }

      const data = body.data;
      if (typeof data.type === "string" && data.type !== "collection") {
        return { kind: "unknown_status", rawStatus: `type:${data.type.slice(0, 20)}` };
      }
      const mapped = mapStatus(data.status);
      if ("unknown" in mapped) {
        logError("status:unknown", { reference, rawStatus: mapped.unknown });
        return { kind: "unknown_status", rawStatus: mapped.unknown };
      }
      return {
        kind: "status",
        status: mapped.status,
        failureReason: mapped.failureReason,
        amount: typeof data.amount === "number" ? data.amount : typeof data.amount === "string" ? Number(data.amount) : undefined,
        currency: typeof data.currency === "string" ? data.currency : undefined,
      };
    } catch (e) {
      logError("status:network", { reference, error: e instanceof Error ? e.name : "unknown" });
      return { kind: "unavailable", reason: "network_or_timeout" };
    }
  },

  parseWebhook(rawBody: string, headers: Headers): ProviderWebhookResult {
    const resolved = resolveConfig();
    if (!resolved.ok) {
      logError("webhook:config", { missing: resolved.missing, invalid: resolved.invalid });
      return { kind: "invalid_signature" }; // can't verify => can't trust
    }
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return { kind: "malformed", reason: "body_too_large" };

    const signature = headers.get("x-signature")?.trim();
    if (!signature) return { kind: "invalid_signature" };
    const expected = Buffer.from(createHmac("sha256", resolved.config.webhookSecret).update(rawBody).digest("hex"), "utf8");
    const actual = Buffer.from(signature.toLowerCase(), "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { kind: "invalid_signature" };

    // Only now is the payload trusted enough to read.
    const payload = asRecord(readJson(rawBody));
    if (!payload) return { kind: "malformed", reason: "not_a_json_object" };
    const event = typeof payload.event === "string" ? payload.event : "";
    const data = asRecord(payload.data);
    if (!event || !data) return { kind: "malformed", reason: "missing_event_or_data" };

    const reportedStatus: ProviderPaymentStatus | null =
      event === "payment.success" ? "SUCCESS" : event === "payment.failed" ? "FAILED" : event === "payment.pending" ? "PENDING" : null;
    if (!reportedStatus) return { kind: "ignored", reason: `event:${event.slice(0, 50)}` }; // payout.*, refund.*, future events

    const str = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 200 ? v.trim() : null);
    return {
      kind: "payment_event",
      // Not in the documented payload; used if INFI-PAY includes it.
      reference: str(data.reference),
      providerTransactionId: str(data.transactionId),
      reportedStatus,
    };
  },
};

/** The provider the app uses. A single seam for tests and a future swap. */
export function getPaymentProvider(): PaymentProvider {
  return infiPayProvider;
}
