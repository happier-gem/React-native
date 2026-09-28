import "server-only";

/**
 * The boundary between our payment logic and a payment provider.
 *
 *   Application payment logic (routes, lib/payments.ts, recovery, activation)
 *           ↓  only these normalized types
 *   PaymentProvider (this interface)
 *           ↓
 *   INFI-PAY adapter (lib/infi-pay.ts) — the ONLY place that knows INFI-PAY's
 *   URLs, headers, field names, status strings and signature scheme.
 *
 * When the official INFI-PAY contract arrives, only the adapter should change.
 * Nothing outside it may read a raw provider response or webhook payload.
 */

/** Mobile-money network the payer uses. Stored in payments.provider. */
export type MobileMoneyNetwork = "airtel_money" | "tnm_mpamba";

/** Payment statuses the provider can report, normalized to ours. */
export type ProviderPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export type ProviderEnvironment = "sandbox" | "production";

export type ProviderConfigStatus =
  | { configured: true; environment: ProviderEnvironment }
  /** `missing`/`invalid` name env vars only — never their values. */
  | { configured: false; missing: string[]; invalid: string[] };

export type InitiateCollectionParams = {
  amount: number;
  currency: string;
  phoneNumber: string;
  network: MobileMoneyNetwork;
  /** Our own reference for this payment (the payment id), sent so the
   * provider can echo it back. The provider assigns its own reference, which
   * is what we store and look the payment up by. */
  reference: string;
};

export type ProviderInitiateResult =
  /** The provider accepted the request and gave us its reference. */
  | {
      kind: "accepted";
      /** The provider's own reference — stored as payments.provider_reference
       * and used for every status lookup. */
      providerReference: string;
      providerTransactionId?: string;
    }
  /** The provider definitely did NOT create a collection (it said no, or we
   * never sent the request). Safe to mark the payment FAILED. */
  | { kind: "rejected"; reason: string }
  /** We can't tell whether the provider created a collection (timeout,
   * connection drop, 5xx, unreadable 2xx). The payment must stay PENDING —
   * marking it FAILED could strand a real charge. */
  | {
      kind: "uncertain";
      reason: string;
      /** Shape of an unexpected provider reply (field names and safe values
       * only — never phone numbers or names), kept for diagnosis. */
      diagnostics?: Record<string, unknown>;
    };

export type ProviderStatusResult =
  | {
      kind: "status";
      status: ProviderPaymentStatus;
      failureReason?: string;
      /** What the provider says was charged — checked against our record
       * before a SUCCESS is accepted. */
      amount?: number;
      currency?: string;
      /** The provider's reference for the transaction looked up (lets a
       * lookup by transaction id be matched to our payment). */
      providerReference?: string;
    }
  /** The provider answered, but with a status we don't recognise. Never
   * treated as success or failure — flagged for investigation. */
  | { kind: "unknown_status"; rawStatus: string }
  /** Couldn't get an answer right now (network, 5xx, not configured). */
  | { kind: "unavailable"; reason: string };

export type ProviderWebhookResult =
  | { kind: "invalid_signature" }
  | { kind: "malformed"; reason: string }
  /** Authentic, but not an event we act on (unknown type/status). */
  | { kind: "ignored"; reason: string }
  /** A verified payment event. Treated as a prompt to re-check with the
   * provider, never as the status itself. `reference` is our reference if the
   * provider included it (INFI-PAY's documented payload doesn't), else null. */
  | { kind: "payment_event"; reference: string | null; providerTransactionId: string | null; reportedStatus: ProviderPaymentStatus };

export type PhoneCheck = { ok: true; normalized: string } | { ok: false; message: string };

export interface PaymentProvider {
  readonly name: string;
  config(): ProviderConfigStatus;
  /** Provider rules for the payer's number on this network; returns the form
   * to store and send. */
  checkPhoneNumber(phoneNumber: string, network: MobileMoneyNetwork): PhoneCheck;
  initiateCollection(params: InitiateCollectionParams): Promise<ProviderInitiateResult>;
  getTransactionStatus(providerReference: string): Promise<ProviderStatusResult>;
  /** Verifies authenticity BEFORE interpreting the payload. */
  parseWebhook(rawBody: string, headers: Headers): ProviderWebhookResult;
}
