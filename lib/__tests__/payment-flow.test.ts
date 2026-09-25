import { ApiError, type ApiClient } from "@/lib/api-client";
import type { CurrentPlan } from "@/context/plan-context";
import {
    createPaymentApi,
    createPaymentCheckout,
    type CheckoutState,
    type ClientPayment,
    type PaymentApi,
} from "@/lib/payment-flow";

const INPUT = { plan: "pro" as const, provider: "airtel_money" as const, phoneNumber: "0991234567" };
const payment = (status: ClientPayment["status"]): ClientPayment => ({ id: "pay-1", status, plan: "pro", amount: 5000, currency: "MWK" });

const FREE: CurrentPlan = { plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null, pendingChange: null, endedPlan: null };
const PRO: CurrentPlan = { ...FREE, plan: "pro", startedAt: "2026-09-25T10:00:00.000Z", expiresAt: "2026-10-25T10:00:00.000Z" };

function setup(opts: { statuses?: ClientPayment["status"][]; initiate?: PaymentApi["initiate"]; plans?: (CurrentPlan | null)[] } = {}) {
    const statuses = [...(opts.statuses ?? [])];
    const plans = [...(opts.plans ?? [PRO])];
    const states: CheckoutState[] = [];
    const api = {
        initiate: jest.fn(opts.initiate ?? (async () => ({ payment: payment("PENDING") }))),
        getPayment: jest.fn(async () => payment(statuses.length > 1 ? statuses.shift()! : (statuses[0] ?? "PENDING"))),
    };
    const refreshPlan = jest.fn(async () => (plans.length > 1 ? plans.shift()! : (plans[0] ?? null)));
    const pendingStore = { save: jest.fn(async () => {}), clear: jest.fn(async () => {}) };
    let keys = 0;
    const checkout = createPaymentCheckout({
        api,
        refreshPlan,
        pendingStore,
        onChange: (s) => states.push(s),
        pollIntervalMs: 3_000,
        pollTimeoutMs: 30_000,
        planConfirmAttempts: 2,
        newIdempotencyKey: () => `key-${++keys}`,
    });
    return { checkout, api, refreshPlan, pendingStore, states, last: () => states[states.length - 1] };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("payment initiation", () => {
    it("successful initiation moves to pending and remembers the payment", async () => {
        const t = setup();
        await t.checkout.start(INPUT);
        expect(t.states.map((s) => s.phase)).toEqual(["starting", "pending"]);
        expect(t.api.initiate).toHaveBeenCalledWith({ ...INPUT, idempotencyKey: "key-1" });
        expect(t.pendingStore.save).toHaveBeenCalledWith({ paymentId: "pay-1", plan: "pro" });
        t.checkout.dispose();
    });

    it("API error shows a message and does not poll", async () => {
        const t = setup({ initiate: async () => Promise.reject(new ApiError(400, "Invalid Malawi phone number")) });
        await t.checkout.start(INPUT);
        expect(t.last()).toEqual({ phase: "error", plan: "pro", message: "Invalid Malawi phone number", payment: null });
        await jest.advanceTimersByTimeAsync(60_000);
        expect(t.api.getPayment).not.toHaveBeenCalled();
    });

    it("network and auth errors get plain-language messages", async () => {
        const offline = setup({ initiate: async () => Promise.reject(new TypeError("Network request failed")) });
        await offline.checkout.start(INPUT);
        expect(offline.last()).toMatchObject({ message: "Couldn't reach the server. Check your connection and try again." });

        const expired = setup({ initiate: async () => Promise.reject(new ApiError(401, "Unauthorized")) });
        await expired.checkout.start(INPUT);
        expect(expired.last()).toMatchObject({ message: "Your session has expired. Please sign in again." });
    });

    it("retrying after an error reuses the same idempotency key (no duplicate payment)", async () => {
        let calls = 0;
        const t = setup({
            initiate: async () => {
                if (++calls === 1) throw new TypeError("Network request failed");
                return { payment: payment("PENDING") };
            },
        });
        await t.checkout.start(INPUT);
        t.checkout.reset();
        await t.checkout.start(INPUT);
        expect(t.api.initiate.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(["key-1", "key-1"]);
        t.checkout.dispose();
    });

    it("sends only plan, provider, phone and idempotency key — never a price or status", async () => {
        const post = jest.fn(async () => ({ payment: payment("PENDING") }));
        const api = createPaymentApi({ post } as unknown as ApiClient);
        await api.initiate({ ...INPUT, idempotencyKey: "k", ...({ amount: 1, status: "SUCCESS" } as object) });
        expect(post).toHaveBeenCalledWith("/api/payments/initiate", { ...INPUT, idempotencyKey: "k" });
    });
});

describe("duplicate interaction", () => {
    it("many taps while a payment starts send exactly one request", async () => {
        let release!: () => void;
        const t = setup({
            initiate: () => new Promise((resolve) => (release = () => resolve({ payment: payment("PENDING") }))),
        });
        const first = t.checkout.start(INPUT);
        const repeats = await Promise.all([t.checkout.start(INPUT), t.checkout.start(INPUT), t.checkout.start(INPUT)]);
        expect(repeats).toEqual([false, false, false]);
        release();
        await first;
        expect(t.api.initiate).toHaveBeenCalledTimes(1);

        // Still refused while pending.
        expect(await t.checkout.start(INPUT)).toBe(false);
        t.checkout.dispose();
    });
});

describe("polling", () => {
    it("pending -> success: stops polling, refreshes the plan and shows the server's plan", async () => {
        const t = setup({ statuses: ["PENDING", "PENDING", "SUCCESS"], plans: [PRO] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(9_000);

        expect(t.api.getPayment).toHaveBeenCalledTimes(3);
        expect(t.refreshPlan).toHaveBeenCalledTimes(1);
        expect(t.last()).toEqual({ phase: "success", plan: "pro", payment: payment("SUCCESS"), serverPlan: PRO, planUpdated: true });
        expect(t.pendingStore.clear).toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(60_000);
        expect(t.api.getPayment).toHaveBeenCalledTimes(3); // polling stopped
    });

    it("success waits for the server's plan to reflect the payment instead of assuming it", async () => {
        const t = setup({ statuses: ["SUCCESS"], plans: [FREE, FREE, PRO] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(3_000); // first poll -> SUCCESS -> plan still FREE
        expect(t.last().phase).toBe("confirming_plan");
        await jest.advanceTimersByTimeAsync(6_000);
        expect(t.refreshPlan).toHaveBeenCalledTimes(3);
        expect(t.last()).toMatchObject({ phase: "success", serverPlan: PRO, planUpdated: true });
    });

    it("if the plan still hasn't updated, says so rather than claiming a plan", async () => {
        const t = setup({ statuses: ["SUCCESS"], plans: [FREE] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(20_000);
        expect(t.last()).toMatchObject({ phase: "success", serverPlan: FREE, planUpdated: false });
    });

    it("pending -> failure: the plan is left as the server has it", async () => {
        const t = setup({ statuses: ["PENDING", "FAILED"], plans: [FREE] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(6_000);
        expect(t.last()).toEqual({ phase: "failed", plan: "pro", payment: payment("FAILED") });
        expect(t.states.some((s) => s.phase === "success")).toBe(false);
        expect(t.pendingStore.clear).toHaveBeenCalled();
    });

    it("pending -> cancelled", async () => {
        const t = setup({ statuses: ["CANCELLED"] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(3_000);
        expect(t.last().phase).toBe("cancelled");
    });

    it("pending -> timeout: 'still being confirmed', never 'failed', and polling stops", async () => {
        const t = setup({ statuses: ["PENDING"] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(45_000);
        expect(t.last().phase).toBe("still_pending");
        expect(t.states.some((s) => s.phase === "failed")).toBe(false);
        const calls = t.api.getPayment.mock.calls.length;
        await jest.advanceTimersByTimeAsync(60_000);
        expect(t.api.getPayment).toHaveBeenCalledTimes(calls);
        // The payment is still remembered so it can be re-checked on reopen.
        expect(t.pendingStore.clear).not.toHaveBeenCalled();
    });

    it("'check again' resumes polling after a timeout", async () => {
        const t = setup({ statuses: ["PENDING"] });
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(45_000);
        t.checkout.checkAgain();
        expect(t.last().phase).toBe("pending");
        t.checkout.dispose();
    });

    it("a transient network error while polling keeps polling", async () => {
        const t = setup();
        t.api.getPayment
            .mockImplementationOnce(async () => Promise.reject(new TypeError("Network request failed")))
            .mockImplementationOnce(async () => payment("SUCCESS"));
        await t.checkout.start(INPUT);
        await jest.advanceTimersByTimeAsync(6_000);
        expect(t.last().phase).toBe("success");
    });

    it("disposing (screen unmount) stops all timers", async () => {
        const t = setup({ statuses: ["PENDING"] });
        await t.checkout.start(INPUT);
        t.checkout.dispose();
        await jest.advanceTimersByTimeAsync(60_000);
        expect(t.api.getPayment).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it("resuming a remembered payment polls it (app reopen)", async () => {
        const t = setup({ statuses: ["SUCCESS"] });
        t.checkout.resume({ paymentId: "pay-1", plan: "pro" });
        await jest.advanceTimersByTimeAsync(0);
        expect(t.api.getPayment).toHaveBeenCalledWith("pay-1");
        expect(t.last()).toMatchObject({ phase: "success", serverPlan: PRO });
    });
});
