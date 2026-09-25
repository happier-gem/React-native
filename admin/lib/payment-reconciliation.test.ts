import { describe, expect, it } from "vitest";
import { findReconciliationIssues } from "@/lib/payment-reconciliation";
import type { PaymentOverviewRow } from "@/lib/payments";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const POLICY = { recoveryMinAgeMinutes: 10, pendingReviewAfterHours: 24 };
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const row = (over: Partial<PaymentOverviewRow>): PaymentOverviewRow => ({
  id: "p1",
  user_id: "user_a",
  plan: "pro",
  amount: 5000,
  currency: "MWK",
  provider: "airtel_money",
  phone_number: "0991234567",
  provider_reference: "ref-1",
  internal_reference: "int-1",
  status: "PENDING",
  failure_reason: null,
  metadata: {},
  created_at: minutesAgo(1),
  completed_at: null,
  updated_at: minutesAgo(1),
  plan_applied: false,
  ...over,
});

const types = (rows: PaymentOverviewRow[]) => findReconciliationIssues(rows, POLICY, NOW).map((i) => i.type);

describe("reconciliation", () => {
  it("a fresh pending payment is fine", () => {
    expect(types([row({})])).toEqual([]);
  });

  it("pending older than the review threshold needs a human (never auto-failed)", () => {
    expect(types([row({ created_at: minutesAgo(25 * 60) })])).toEqual(["pending_needs_review"]);
  });

  it("pending without a provider reference after the grace period", () => {
    const issues = findReconciliationIssues(
      [row({ provider_reference: null, created_at: minutesAgo(15), metadata: { initiation_uncertain: { reason: "network_or_timeout" } } })],
      POLICY,
      NOW
    );
    expect(issues).toMatchObject([{ type: "pending_without_reference", severity: "action" }]);
    expect(issues[0].detail).toContain("network_or_timeout");
  });

  it("successful payment whose plan was never applied", () => {
    expect(types([row({ status: "SUCCESS", completed_at: minutesAgo(5), plan_applied: false })])).toEqual(["success_without_plan"]);
    expect(types([row({ status: "SUCCESS", completed_at: minutesAgo(1), plan_applied: false })])).toEqual([]); // grace period
    expect(types([row({ status: "SUCCESS", completed_at: minutesAgo(5), plan_applied: true })])).toEqual([]);
  });

  it("provider disagreeing with a final status", () => {
    expect(
      types([row({ status: "FAILED", metadata: { provider_conflict: { reportedStatus: "SUCCESS", source: "webhook" } } })])
    ).toEqual(["provider_conflict"]);
  });

  it("unknown provider status is a watch item", () => {
    const issues = findReconciliationIssues([row({ metadata: { provider_check: { result: "unknown_status", status: "REVERSED" } } })], POLICY, NOW);
    expect(issues).toMatchObject([{ type: "unknown_provider_status", severity: "watch" }]);
  });

  it("two successful payments for the same user and plan within minutes", () => {
    const a = row({ id: "a", status: "SUCCESS", completed_at: minutesAgo(30), plan_applied: true });
    const b = row({ id: "b", status: "SUCCESS", completed_at: minutesAgo(27), plan_applied: true });
    const otherUser = row({ id: "c", user_id: "user_b", status: "SUCCESS", completed_at: minutesAgo(28), plan_applied: true });
    const later = row({ id: "d", status: "SUCCESS", completed_at: minutesAgo(1), plan_applied: true });
    const issues = findReconciliationIssues([a, b, otherUser, later], POLICY, NOW);
    expect(issues.map((i) => [i.type, i.paymentId])).toEqual([["possible_duplicate_charge", "b"]]);
  });
});
