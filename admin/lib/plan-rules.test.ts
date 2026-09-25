import { describe, expect, it } from "vitest";
import { addMonths, applySuccessfulPayment, resolveEffectivePlan, rollForward, type PlanState } from "@/lib/plan-rules";
import type { PlanId } from "@/lib/plans";

const d = (iso: string) => new Date(iso);

function paid(plan: PlanId, startedAt: string, expiresAt: string, extra: Partial<PlanState> = {}): PlanState {
  return {
    plan,
    status: "ACTIVE",
    startedAt: d(startedAt),
    expiresAt: d(expiresAt),
    paymentId: "pay-old",
    previousPlan: "free",
    pendingPlan: null,
    pendingMonths: 0,
    pendingPaymentId: null,
    ...extra,
  };
}

describe("addMonths (calendar months, UTC, end-of-month clamped)", () => {
  it.each([
    ["2026-09-25T10:00:00.000Z", 1, "2026-10-25T10:00:00.000Z"],
    ["2026-01-31T00:00:00.000Z", 1, "2026-02-28T00:00:00.000Z"],
    ["2028-01-31T00:00:00.000Z", 1, "2028-02-29T00:00:00.000Z"], // leap year
    ["2026-03-31T23:59:59.000Z", 1, "2026-04-30T23:59:59.000Z"],
    ["2026-12-15T08:30:00.000Z", 1, "2027-01-15T08:30:00.000Z"], // year rollover
    ["2026-10-31T00:00:00.000Z", 2, "2026-12-31T00:00:00.000Z"],
  ])("%s + %i month(s) = %s", (from, months, expected) => {
    expect(addMonths(d(from), months).toISOString()).toBe(expected);
  });
});

describe("activation", () => {
  const at = d("2026-09-25T09:00:00.000Z");

  it.each(["starter", "pro"] as const)("FREE -> %s starts at payment time and lasts one month", (plan) => {
    const { state, events } = applySuccessfulPayment(null, { id: "pay-1", plan }, at);
    expect(state).toMatchObject({ plan, status: "ACTIVE", paymentId: "pay-1", previousPlan: "free" });
    expect(state.startedAt.toISOString()).toBe("2026-09-25T09:00:00.000Z");
    expect(state.expiresAt.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(events.map((e) => e.event)).toEqual(["activated"]);

    const effective = resolveEffectivePlan(state, at);
    expect(effective).toMatchObject({ plan, status: "ACTIVE", isActive: true });
  });
});

describe("renewal", () => {
  it.each(["starter", "pro"] as const)("active %s renewed extends from the current expiry, not the payment date", (plan) => {
    const current = paid(plan, "2026-09-25T00:00:00.000Z", "2026-10-25T00:00:00.000Z");
    const { state, events } = applySuccessfulPayment(current, { id: "pay-2", plan }, d("2026-10-10T00:00:00.000Z"));
    expect(state.plan).toBe(plan);
    expect(state.startedAt.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(state.expiresAt.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(state.paymentId).toBe("pay-2");
    expect(events.map((e) => e.event)).toEqual(["renewed"]);
  });

  it("paying again after expiry starts a fresh month from the payment time", () => {
    const current = paid("pro", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    const { state, events } = applySuccessfulPayment(current, { id: "pay-3", plan: "pro" }, d("2026-09-20T12:00:00.000Z"));
    expect(state.startedAt.toISOString()).toBe("2026-09-20T12:00:00.000Z");
    expect(state.expiresAt.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(events.map((e) => e.event)).toEqual(["expired", "activated"]);
  });
});

describe("expiration", () => {
  it.each(["starter", "pro"] as const)("expired %s resolves to FREE but keeps the paid record", (plan) => {
    const current = paid(plan, "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    const effective = resolveEffectivePlan(current, d("2026-09-25T00:00:00.000Z"));
    expect(effective).toMatchObject({ plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null });
    expect(effective.storedPlan).toMatchObject({ plan, status: "EXPIRED" });
  });

  it("expires exactly at expires_at (expires_at <= now)", () => {
    const current = paid("pro", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    expect(resolveEffectivePlan(current, d("2026-08-31T23:59:59.999Z")).plan).toBe("pro");
    expect(resolveEffectivePlan(current, d("2026-09-01T00:00:00.000Z")).plan).toBe("free");
  });

  it("no stored plan is FREE", () => {
    expect(resolveEffectivePlan(null, new Date())).toMatchObject({ plan: "free", isActive: true, storedPlan: null });
  });

  it("rollForward records one expired event and is stable afterwards", () => {
    const current = paid("starter", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    const first = rollForward(current, d("2026-09-02T00:00:00.000Z"));
    expect(first.events.map((e) => e.event)).toEqual(["expired"]);
    expect(first.state?.status).toBe("EXPIRED");
    expect(rollForward(first.state, d("2026-12-01T00:00:00.000Z")).events).toEqual([]);
  });
});

describe("upgrade", () => {
  it("STARTER -> PRO starts Pro at the payment time with no proration", () => {
    const current = paid("starter", "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
    const at = d("2026-09-15T00:00:00.000Z");
    const { state, events } = applySuccessfulPayment(current, { id: "pay-4", plan: "pro" }, at);
    expect(state).toMatchObject({ plan: "pro", previousPlan: "starter", paymentId: "pay-4" });
    expect(state.startedAt.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(state.expiresAt.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(events).toMatchObject([{ event: "upgraded", fromPlan: "starter", toPlan: "pro" }]);
  });
});

describe("downgrade", () => {
  const pro = paid("pro", "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");

  it("PRO -> STARTER is queued, not applied immediately", () => {
    const at = d("2026-09-15T00:00:00.000Z");
    const { state, events } = applySuccessfulPayment(pro, { id: "pay-5", plan: "starter" }, at);
    expect(state).toMatchObject({ plan: "pro", pendingPlan: "starter", pendingMonths: 1, pendingPaymentId: "pay-5" });
    expect(state.expiresAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(events).toMatchObject([{ event: "downgrade_scheduled", fromPlan: "pro", toPlan: "starter" }]);

    const effective = resolveEffectivePlan(state, at);
    expect(effective.plan).toBe("pro");
    expect(effective.pendingChange?.plan).toBe("starter");
    expect(effective.pendingChange?.startsAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(effective.pendingChange?.expiresAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("the queued plan takes over when the higher plan expires, then expires itself", () => {
    const { state } = applySuccessfulPayment(pro, { id: "pay-5", plan: "starter" }, d("2026-09-15T00:00:00.000Z"));

    const during = rollForward(state, d("2026-10-10T00:00:00.000Z"));
    expect(during.events.map((e) => e.event)).toEqual(["downgrade_applied"]);
    expect(during.state).toMatchObject({ plan: "starter", status: "ACTIVE", paymentId: "pay-5", pendingPlan: null });
    expect(during.state?.startedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(during.state?.expiresAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");

    // Long after: both periods over -> FREE, never more paid time than paid for.
    const after = rollForward(state, d("2026-12-01T00:00:00.000Z"));
    expect(after.events.map((e) => e.event)).toEqual(["downgrade_applied", "expired"]);
    expect(resolveEffectivePlan(state, d("2026-12-01T00:00:00.000Z")).plan).toBe("free");
  });

  it("renewing the higher plan pushes the queued plan back", () => {
    const queued = applySuccessfulPayment(pro, { id: "pay-5", plan: "starter" }, d("2026-09-15T00:00:00.000Z")).state;
    const { state } = applySuccessfulPayment(queued, { id: "pay-6", plan: "pro" }, d("2026-09-20T00:00:00.000Z"));
    const effective = resolveEffectivePlan(state, d("2026-09-20T00:00:00.000Z"));
    expect(effective.expiresAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(effective.pendingChange?.startsAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
