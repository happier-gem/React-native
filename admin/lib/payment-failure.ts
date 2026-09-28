/**
 * Turns the network's failure message (stored in payments.failure_reason, e.g.
 * "You have insufficient funds. Please deposit money…") into a short sentence
 * that is safe to show in the app. Only recognised cases get a sentence;
 * anything else returns null and the app shows its generic message — raw
 * provider text is never passed through to users.
 */
const RULES: { test: RegExp; message: string }[] = [
  { test: /insufficient|not enough|low balance|balance is/i, message: "There wasn't enough money in the mobile money account." },
  { test: /wrong pin|incorrect pin|invalid pin|pin (is )?(wrong|incorrect|invalid)/i, message: "The PIN entered was incorrect." },
  { test: /expired|time ?out|timed out|no response/i, message: "The payment request expired before it was approved." },
  { test: /cancel|declined|rejected by (the )?(customer|user|subscriber)/i, message: "The payment was cancelled on the phone." },
  { test: /limit/i, message: "The payment is over the account's transaction limit." },
];

export function friendlyFailureReason(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return RULES.find((rule) => rule.test.test(raw))?.message ?? null;
}
