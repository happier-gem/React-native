import type { SubscriptionRecord } from "@/lib/subscriptions";

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas: a
 * value starting with = + - @ (or a tab/CR) would otherwise be run as a
 * formula when the file is opened in Excel/Sheets ("CSV injection").
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADERS = ["name", "category", "price", "currency", "cycle", "monthly_equivalent", "renewal_date", "status", "added_on"];

export function subscriptionsToCsv(rows: SubscriptionRecord[]): string {
  const lines = rows.map((r) => {
    const price = Number(r.price);
    const monthly = r.cycle === "yearly" ? price / 12 : price;
    return [
      r.name,
      r.category,
      price.toFixed(2),
      r.currency,
      r.cycle,
      monthly.toFixed(2),
      r.renewal_date,
      r.status,
      r.created_at.slice(0, 10),
    ].map(csvCell).join(",");
  });
  // CRLF line endings and a UTF-8 BOM so Excel opens it correctly.
  return "﻿" + [HEADERS.join(","), ...lines].join("\r\n") + "\r\n";
}
