import "server-only";

/**
 * Structured payment logging. The allowed fields are deliberately narrow:
 * correlation ids, statuses and outcomes only — so a phone number, token,
 * secret or raw provider body can't be logged through here by accident.
 * Correlate with paymentId (ours) and providerReference (INFI-PAY's).
 */
export type PaymentLogFields = {
  paymentId?: string;
  providerReference?: string;
  userId?: string;
  plan?: string;
  status?: string;
  outcome?: string;
  reason?: string;
  source?: "initiate" | "webhook" | "recovery" | "activation" | "admin";
  count?: number;
};

export function paymentLog(level: "info" | "warn" | "error", event: string, fields: PaymentLogFields = {}) {
  const line = `[payments] ${event} ${JSON.stringify(fields)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
