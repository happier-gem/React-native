// Pure formatting/aggregation helpers, safe to import from client or server
// components. Mirrors the logic in the mobile app's subscriptions-context.tsx
// (monthlyEquivalent) so the two apps agree on how spend is calculated.

export type BillingCycle = "monthly" | "yearly";

export function monthlyEquivalent(price: number, cycle: BillingCycle): number {
  return cycle === "yearly" ? price / 12 : price;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    // Unknown/invalid currency code (e.g. bad data) — fall back rather than throwing.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Moves a YYYY-MM-DD date forward by one billing cycle. Mirrors the mobile
 * app's addCycle() in context/subscriptions-context.tsx exactly — kept in sync
 * by hand since the two apps can't share code without becoming a workspace. */
export function addCycle(isoDate: string, cycle: BillingCycle): string {
  const date = new Date(isoDate);
  if (cycle === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Groups by currency (summing different currencies together would be a
 * misleading number), and within each currency sums the monthly-equivalent
 * spend and the projected yearly spend for active subscriptions.
 */
export function aggregateSpendByCurrency(
  subscriptions: { price: number; cycle: BillingCycle; currency: string }[]
): { currency: string; monthly: number; yearly: number }[] {
  const totals = new Map<string, number>();
  for (const sub of subscriptions) {
    const monthly = monthlyEquivalent(sub.price, sub.cycle);
    totals.set(sub.currency, (totals.get(sub.currency) ?? 0) + monthly);
  }
  return [...totals.entries()]
    .map(([currency, monthly]) => ({ currency, monthly, yearly: monthly * 12 }))
    .sort((a, b) => b.monthly - a.monthly);
}
