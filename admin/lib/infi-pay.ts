import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  InitiateCollectionParams,
  MobileMoneyNetwork,
  PaymentProvider,
  ProviderConfigStatus,
  ProviderEnvironment,
  ProviderInitiateResult,
  ProviderPaymentStatus,
  ProviderStatusResult,
  ProviderWebhookResult,
} from "@/lib/payment-provider";

/**
 * ============================================================================
 * INFI-PAY ADAPTER — NOT YET VERIFIED AGAINST REAL INFI-PAY DOCUMENTATION.
 *
 * No INFI-PAY API docs, SDK or sandbox credentials exist yet. Everything
 * marked PLACEHOLDER below is a guess at a common mobile-money API shape, kept
 * only so the rest of the system can be built and tested:
 *   - endpoint paths (/collections, /collections/:ref)
 *   - request/response field names (amount, phone_number, reference, id, status)
 *   - provider status strings ("successful", "failed", ...)
 *   - webhook header (x-infipay-signature), signature scheme (HMAC-SHA256 hex
 *     of the raw body) and payload fields (providerReference, status, ...)
 *
 * Replace the PLACEHOLDER sections once the official contract is available.
 * Nothing outside this file depends on those guesses — see
 * lib/payment-provider.ts.
 *
 * With configuration missing (the current state) every call fails closed:
 * initiation is refused before a payment row is even created, status checks
 * report "unavailable", and every webhook is rejected.
 * ============================================================================
 */

/** @deprecated kept for existing imports — use MobileMoneyNetwork. */
export type InfiPayProvider = MobileMoneyNetwork;

/** Server-only configuration. None of these may ever get a NEXT_PUBLIC_ or
 * EXPO_PUBLIC_ prefix or be referenced from mobile code. */
export const INFI_PAY_ENV_VARS = {
  apiUrl: "INFI_PAY_API_URL",
  apiKey: "INFI_PAY_API_KEY",
  webhookSecret: "INFI_PAY_WEBHOOK_SECRET",
  /** "sandbox" or "production" — must be stated explicitly, so a sandbox
   * deployment can never be mistaken for a live one (or vice versa). */
  environment: "INFI_PAY_ENVIRONMENT",
  /** Our HTTP timeout for calls to INFI-PAY (ms). Ours to choose — it is not
   * INFI-PAY's payment timeout. Default 15000. */
  timeoutMs: "INFI_PAY_TIMEOUT_MS",
} as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_WEBHOOK_BYTES = 64 * 1024;

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

/** PLACEHOLDER: provider status strings -> ours. Unknown strings are NOT
 * guessed into PENDING/FAILED; they come back as unknown_status. */
function normalizeStatus(raw: unknown): ProviderPaymentStatus | null {
  switch (typeof raw === "string" ? raw.toLowerCase() : "") {
    case "successful":
    case "success":
      return "SUCCESS";
    case "failed":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "pending":
      return "PENDING";
    default:
      return null;
  }
}

const isNetworkError = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e.name === "TypeError");

export const infiPayProvider: PaymentProvider = {
  name: "INFI-PAY",

  config(): ProviderConfigStatus {
    const resolved = resolveConfig();
    return resolved.ok
      ? { configured: true, environment: resolved.config.environment }
      : { configured: false, missing: resolved.missing, invalid: resolved.invalid };
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
      // PLACEHOLDER endpoint and body.
      response = await fetch(`${apiUrl}/collections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
          phone_number: params.phoneNumber,
          provider: params.network,
          reference: params.reference,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // The request may or may not have reached INFI-PAY.
      logError("initiate:network", { reference: params.reference, error: e instanceof Error ? e.name : "unknown" });
      return { kind: "uncertain", reason: isNetworkError(e) ? "network_or_timeout" : "request_error" };
    }

    const data = asRecord(readJson(await response.text().catch(() => "")));

    if (response.status >= 500) {
      logError("initiate:server-error", { reference: params.reference, status: response.status });
      return { kind: "uncertain", reason: `provider_http_${response.status}` };
    }
    if (!response.ok) {
      logError("initiate:rejected", { reference: params.reference, status: response.status });
      return { kind: "rejected", reason: `provider_http_${response.status}` };
    }

    // PLACEHOLDER response field names.
    const providerReference = data?.reference ?? data?.id;
    if (typeof providerReference !== "string" && typeof providerReference !== "number") {
      // 2xx without a usable reference: it may well have been created.
      logError("initiate:missing-reference", { reference: params.reference, hasBody: Boolean(data) });
      return { kind: "uncertain", reason: "missing_provider_reference" };
    }
    return { kind: "accepted", providerReference: String(providerReference) };
  },

  async getTransactionStatus(providerReference: string): Promise<ProviderStatusResult> {
    const resolved = resolveConfig();
    if (!resolved.ok) return { kind: "unavailable", reason: "provider_not_configured" };
    const { apiUrl, apiKey, timeoutMs } = resolved.config;

    try {
      // PLACEHOLDER endpoint.
      const response = await fetch(`${apiUrl}/collections/${encodeURIComponent(providerReference)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = asRecord(readJson(await response.text().catch(() => "")));
      if (!response.ok) {
        logError("status:response", { providerReference, status: response.status });
        return { kind: "unavailable", reason: `provider_http_${response.status}` };
      }
      // PLACEHOLDER field names.
      const status = normalizeStatus(data?.status);
      if (!status) {
        const rawStatus = typeof data?.status === "string" ? data.status.slice(0, 50) : String(data?.status ?? "(none)");
        logError("status:unknown", { providerReference, rawStatus });
        return { kind: "unknown_status", rawStatus };
      }
      const failureReason = typeof data?.failure_reason === "string" ? data.failure_reason.slice(0, 500) : undefined;
      return { kind: "status", status, failureReason };
    } catch (e) {
      logError("status:network", { providerReference, error: e instanceof Error ? e.name : "unknown" });
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

    // PLACEHOLDER header name and signature scheme.
    const signature = headers.get("x-infipay-signature");
    if (!signature) return { kind: "invalid_signature" };
    const expected = Buffer.from(createHmac("sha256", resolved.config.webhookSecret).update(rawBody).digest("hex"), "utf8");
    const actual = Buffer.from(signature, "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { kind: "invalid_signature" };

    // Only now is the payload trusted enough to read.
    const event = asRecord(readJson(rawBody));
    if (!event) return { kind: "malformed", reason: "not_a_json_object" };

    // PLACEHOLDER payload fields.
    const ref = event.providerReference;
    if (typeof ref !== "string" || ref.trim() === "" || ref.length > 200) {
      return { kind: "malformed", reason: "invalid_providerReference" };
    }
    const status = normalizeStatus(event.status);
    if (!status) return { kind: "ignored", reason: `unrecognized_status:${String(event.status).slice(0, 50)}` };

    const failureReason = typeof event.failureReason === "string" ? event.failureReason.slice(0, 500) : undefined;
    return { kind: "payment_status", providerReference: ref.trim(), status, failureReason };
  },
};

/** The provider the app uses. A single seam for tests and a future swap. */
export function getPaymentProvider(): PaymentProvider {
  return infiPayProvider;
}
