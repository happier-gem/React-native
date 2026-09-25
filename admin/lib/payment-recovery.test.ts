import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverPendingPayments, type RecoveryDeps } from "@/lib/payment-recovery";
import type { PaymentRecord, PaymentStatus } from "@/lib/payments";
import type { ProviderStatusResult } from "@/lib/payment-provider";

const NOW = new Date("2026-09-26T12:00:00.000Z");

const pendingPayment = (id: string, ref: string | null = `ref-${id}`): PaymentRecord => ({
  id,
  user_id: "user_a",
  plan: "pro",
  amount: 5000,
  currency: "MWK",
  provider: "airtel_money",
  phone_number: "0991234567",
  provider_reference: ref,
  internal_reference: `int-${id}`,
  status: "PENDING",
  failure_reason: null,
  metadata: {},
  created_at: "2026-09-26T11:00:00.000Z",
  completed_at: null,
  updated_at: "2026-09-26T11:00:00.000Z",
});

/** A tiny in-memory payments table with the same atomic PENDING-only rule. */
function makeDeps(opts: { pending: PaymentRecord[]; provider: Record<string, ProviderStatusResult>; configured?: boolean }) {
  const statuses = new Map<string, PaymentStatus>(opts.pending.map((p) => [p.id, p.status]));
  const activated = new Set<string>();
  const deps = {
    provider: {
      config: () => (opts.configured === false ? { configured: false as const, missing: ["X"], invalid: [] } : { configured: true as const, environment: "sandbox" as const }),
      getTransactionStatus: vi.fn(async (ref: string) => opts.provider[ref] ?? { kind: "unavailable" as const, reason: "x" }),
    },
    listPending: vi.fn(async () => opts.pending.filter((p) => statuses.get(p.id) === "PENDING")),
    listSuccessWithoutPlan: vi.fn(async () => [...statuses].filter(([id, s]) => s === "SUCCESS" && !activated.has(id)).map(([id]) => ({ id }))),
    transition: vi.fn(async (id: string, next: Exclude<PaymentStatus, "PENDING">) => {
      const current = statuses.get(id)!;
      if (current !== "PENDING") return { ok: true as const, alreadyProcessed: true, currentStatus: current };
      statuses.set(id, next);
      return { ok: true as const, alreadyProcessed: false, currentStatus: next };
    }),
    activate: vi.fn(async (id: string) => {
      if (statuses.get(id) !== "SUCCESS") return { ok: true as const, outcome: "not_successful" as const };
      if (activated.has(id)) return { ok: true as const, outcome: "duplicate" as const };
      activated.add(id);
      return { ok: true as const, outcome: "applied" as const, events: [] };
    }),
    recordCheck: vi.fn(async () => {}),
    recordConflict: vi.fn(async () => {}),
    now: () => NOW,
  } satisfies RecoveryDeps;
  return { deps, statuses, activated };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("pending payment recovery", () => {
  it("pending -> successful: payment settled and plan activated", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "SUCCESS" } } });
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(t.statuses.get("p1")).toBe("SUCCESS");
    expect(t.activated.has("p1")).toBe(true);
    expect(summary).toMatchObject({ checked: 1, succeeded: 1, activationsApplied: 1, errors: 0 });
  });

  it("pending -> failed: payment failed, no activation", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "FAILED", failureReason: "declined" } } });
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(t.statuses.get("p1")).toBe("FAILED");
    expect(t.deps.transition).toHaveBeenCalledWith("p1", "FAILED", { failureReason: "declined" });
    expect(t.deps.activate).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ failed: 1, activationsApplied: 0 });
  });

  it("pending -> cancelled", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "CANCELLED" } } });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ cancelled: 1 });
    expect(t.statuses.get("p1")).toBe("CANCELLED");
  });

  it("still pending at the provider: left PENDING, never failed for being old", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "PENDING" } } });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ stillPending: 1 });
    expect(t.statuses.get("p1")).toBe("PENDING");
    expect(t.deps.transition).not.toHaveBeenCalled();
  });

  it("provider unavailable: nothing changes, counted, and the check is recorded", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "unavailable", reason: "network_or_timeout" } } });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ providerUnavailable: 1 });
    expect(t.statuses.get("p1")).toBe("PENDING");
    expect(t.deps.recordCheck).toHaveBeenCalledWith("p1", { result: "unavailable" });
  });

  it("unknown provider status: never guessed into success/failure", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "unknown_status", rawStatus: "REVERSED" } } });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ unknownStatus: 1 });
    expect(t.statuses.get("p1")).toBe("PENDING");
    expect(t.deps.recordCheck).toHaveBeenCalledWith("p1", { result: "unknown_status", status: "REVERSED" });
  });

  it("provider not configured: no provider calls, but activation retries still run", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: {}, configured: false });
    t.statuses.set("orphan", "SUCCESS");
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(t.deps.provider.getTransactionStatus).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ providerConfigured: false, activationsRetried: 1, activationsApplied: 1 });
  });

  it("a payment without a provider reference is skipped (flagged by reconciliation)", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1", null)], provider: {} });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ noProviderReference: 1, checked: 0 });
    expect(t.deps.provider.getTransactionStatus).not.toHaveBeenCalled();
  });

  it("repeated reconciliation has no additional effect", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "SUCCESS" } } });
    await recoverPendingPayments({ deps: t.deps });
    const second = await recoverPendingPayments({ deps: t.deps });
    expect(second).toMatchObject({ checked: 0, succeeded: 0, activationsRetried: 0, activationsApplied: 0 });
    expect(t.deps.activate).toHaveBeenCalledTimes(1);
  });

  it("two concurrent runs settle and activate each payment once", async () => {
    const t = makeDeps({
      pending: [pendingPayment("p1"), pendingPayment("p2")],
      provider: { "ref-p1": { kind: "status", status: "SUCCESS" }, "ref-p2": { kind: "status", status: "SUCCESS" } },
    });
    const [a, b] = await Promise.all([recoverPendingPayments({ deps: t.deps }), recoverPendingPayments({ deps: t.deps })]);
    expect(a.succeeded + b.succeeded).toBe(2);
    expect(a.activationsApplied + b.activationsApplied).toBe(2);
    expect(t.activated).toEqual(new Set(["p1", "p2"]));
  });

  it("webhook got there first: counted as already settled; a contradiction is recorded, not applied", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "SUCCESS" } } });
    t.deps.transition.mockResolvedValueOnce({ ok: true, alreadyProcessed: true, currentStatus: "FAILED" });
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(summary).toMatchObject({ alreadySettled: 1, succeeded: 0 });
    expect(t.deps.recordConflict).toHaveBeenCalledWith("p1", { localStatus: "FAILED", reportedStatus: "SUCCESS", source: "recovery" });
    expect(t.deps.activate).not.toHaveBeenCalledWith("p1");
  });

  it("a SUCCESS for a different amount is never applied — recorded for investigation", async () => {
    const t = makeDeps({
      pending: [pendingPayment("p1")],
      provider: { "ref-p1": { kind: "status", status: "SUCCESS", amount: 50, currency: "MWK" } },
    });
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(summary).toMatchObject({ amountMismatch: 1, succeeded: 0 });
    expect(t.statuses.get("p1")).toBe("PENDING");
    expect(t.deps.transition).not.toHaveBeenCalled();
    expect(t.deps.recordConflict).toHaveBeenCalledWith("p1", expect.objectContaining({ source: "recovery", localStatus: "PENDING" }));
  });

  it("a SUCCESS in another currency is never applied", async () => {
    const t = makeDeps({
      pending: [pendingPayment("p1")],
      provider: { "ref-p1": { kind: "status", status: "SUCCESS", amount: 5000, currency: "USD" } },
    });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ amountMismatch: 1 });
    expect(t.statuses.get("p1")).toBe("PENDING");
  });

  it("the matching amount (as a string from the provider) is accepted", async () => {
    const t = makeDeps({
      pending: [pendingPayment("p1")],
      provider: { "ref-p1": { kind: "status", status: "SUCCESS", amount: 5000, currency: "MWK" } },
    });
    expect(await recoverPendingPayments({ deps: t.deps })).toMatchObject({ succeeded: 1, amountMismatch: 0 });
  });

  it("minAgeMinutes: 0 (webhook-triggered) checks brand-new payments", async () => {
    const t = makeDeps({ pending: [pendingPayment("p1")], provider: { "ref-p1": { kind: "status", status: "PENDING" } } });
    await recoverPendingPayments({ minAgeMinutes: 0, deps: t.deps });
    expect(t.deps.listPending).toHaveBeenCalledWith(NOW, 50);
  });

  it("one payment's error doesn't stop the batch", async () => {
    const t = makeDeps({
      pending: [pendingPayment("p1"), pendingPayment("p2")],
      provider: { "ref-p2": { kind: "status", status: "SUCCESS" } },
    });
    t.deps.provider.getTransactionStatus.mockRejectedValueOnce(new Error("boom"));
    const summary = await recoverPendingPayments({ deps: t.deps });
    expect(summary).toMatchObject({ errors: 1, succeeded: 1 });
  });
});
