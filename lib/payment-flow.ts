import { ApiError, type ApiClient } from "@/lib/api-client";
import type { CurrentPlan, PaidTierId } from "@/context/plan-context";

// Mobile side of the plan checkout. The app only ever talks to our own server:
//   POST /api/payments/initiate  -> server picks the price, starts INFI-PAY
//   GET  /api/payments/[id]      -> status of that payment (user-scoped)
//   GET  /api/me/plan            -> the plan the server says the user has now
// Nothing here decides a price, a payment outcome or a plan: a SUCCESS status
// only triggers a re-fetch of the server's plan, which is what gets shown.

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type PaymentProvider = "airtel_money" | "tnm_mpamba";

/** The providers /api/payments/initiate accepts (VALID_PROVIDERS there). */
export const PAYMENT_PROVIDERS: { id: PaymentProvider; name: string }[] = [
    { id: "airtel_money", name: "Airtel Money" },
    { id: "tnm_mpamba", name: "TNM Mpamba" },
];

/** Same format /api/payments/initiate enforces (MW_PHONE_REGEX there). Checked
 * here only to give instant feedback — the server's check is the real one. */
export const MW_PHONE_REGEX = /^(\+265|0)[89]\d{8}$/;

/** Shape returned by both payment routes. */
export type ClientPayment = { id: string; status: PaymentStatus; plan: PaidTierId; amount: number; currency: string };

export type InitiateInput = { plan: PaidTierId; provider: PaymentProvider; phoneNumber: string };

export type PaymentApi = {
    initiate(body: InitiateInput & { idempotencyKey: string }): Promise<{ payment: ClientPayment }>;
    getPayment(id: string): Promise<ClientPayment>;
};

export function createPaymentApi(api: ApiClient): PaymentApi {
    return {
        // Only what the route reads: plan, provider, phone, idempotency key.
        // Never an amount, currency, status or date.
        initiate: (body) =>
            api.post<{ payment: ClientPayment }>("/api/payments/initiate", {
                plan: body.plan,
                provider: body.provider,
                phoneNumber: body.phoneNumber,
                idempotencyKey: body.idempotencyKey,
            }),
        getPayment: (id) => api.get<ClientPayment>(`/api/payments/${encodeURIComponent(id)}`),
    };
}

export type CheckoutState =
    | { phase: "idle" }
    | { phase: "starting"; plan: PaidTierId }
    | { phase: "pending"; plan: PaidTierId; payment: ClientPayment }
    /** Payment confirmed by the server; now fetching the resulting plan. */
    | { phase: "confirming_plan"; plan: PaidTierId; payment: ClientPayment }
    /** `serverPlan` is the plan from GET /api/me/plan. `planUpdated` is false if
     * the server hadn't reflected the payment yet after a few re-checks. */
    | { phase: "success"; plan: PaidTierId; payment: ClientPayment; serverPlan: CurrentPlan | null; planUpdated: boolean }
    | { phase: "failed"; plan: PaidTierId; payment: ClientPayment }
    | { phase: "cancelled"; plan: PaidTierId; payment: ClientPayment }
    /** Stopped polling without an answer — NOT a failure. */
    | { phase: "still_pending"; plan: PaidTierId; payment: ClientPayment }
    /** Couldn't start or check the payment (network, auth, server error). */
    | { phase: "error"; plan: PaidTierId; message: string; payment: ClientPayment | null };

/** Remembers an unfinished payment across app restarts (see
 * hooks/use-payment-checkout.ts), so it can be checked again on reopen. */
export type PendingPaymentStore = {
    save(entry: { paymentId: string; plan: PaidTierId }): Promise<void>;
    clear(): Promise<void>;
};

type Timers = {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
};

export type CheckoutOptions = {
    api: PaymentApi;
    refreshPlan: () => Promise<CurrentPlan | null>;
    onChange: (state: CheckoutState) => void;
    pendingStore?: PendingPaymentStore;
    pollIntervalMs?: number;
    /** How long to keep polling before showing "still being confirmed". */
    pollTimeoutMs?: number;
    /** Extra plan re-fetches if the plan doesn't reflect the payment yet. */
    planConfirmAttempts?: number;
    timers?: Timers;
    now?: () => number;
    newIdempotencyKey?: () => string;
};

export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_POLL_TIMEOUT_MS = 2 * 60_000;
/** Consecutive polling failures tolerated before giving up to "error". */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

export function describeError(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 401) return "Your session has expired. Please sign in again.";
        if (e.status === 404) return "We couldn't find this payment.";
        if (e.status >= 500) return e.message || "Something went wrong on our end. Please try again.";
        return e.message;
    }
    if (e instanceof TypeError) return "Couldn't reach the server. Check your connection and try again.";
    return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

const randomKey = () => `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

/** True once GET /api/me/plan shows the effect of a successful payment for `plan`. */
const planReflects = (serverPlan: CurrentPlan | null, plan: PaidTierId) =>
    !!serverPlan && (serverPlan.plan === plan || serverPlan.pendingChange?.plan === plan);

export function createPaymentCheckout(opts: CheckoutOptions) {
    const timers: Timers = opts.timers ?? {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    const now = opts.now ?? Date.now;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const planConfirmAttempts = opts.planConfirmAttempts ?? 3;
    const newKey = opts.newIdempotencyKey ?? randomKey;

    let state: CheckoutState = { phase: "idle" };
    // Bumped whenever the flow is reset/disposed/restarted: any async callback
    // from an older run sees a different number and does nothing.
    let generation = 0;
    let timer: unknown = null;
    let deadline = 0;
    let pollErrors = 0;
    // Reused only when retrying the *same* request after an error, so a retry
    // after a timeout returns the payment the server may already have created.
    let attempt: { key: string; signature: string } | null = null;

    const set = (next: CheckoutState) => {
        state = next;
        opts.onChange(next);
    };

    const stopTimer = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
    };

    const isBusy = () => state.phase === "starting" || state.phase === "pending" || state.phase === "confirming_plan";

    async function settle(gen: number, plan: PaidTierId, payment: ClientPayment) {
        if (payment.status === "PENDING") {
            set({ phase: "pending", plan, payment });
            scheduleNextPoll(gen, plan, payment);
            return;
        }

        await opts.pendingStore?.clear().catch(() => {});
        attempt = null;

        if (payment.status === "SUCCESS") {
            set({ phase: "confirming_plan", plan, payment });
            let serverPlan: CurrentPlan | null = null;
            for (let i = 0; i <= planConfirmAttempts; i++) {
                if (i > 0) await wait(pollIntervalMs);
                if (gen !== generation) return;
                serverPlan = (await opts.refreshPlan()) ?? serverPlan;
                if (gen !== generation) return;
                if (planReflects(serverPlan, plan)) break;
            }
            set({ phase: "success", plan, payment, serverPlan, planUpdated: planReflects(serverPlan, plan) });
            return;
        }

        // FAILED / CANCELLED: the plan didn't change, but re-read it anyway so
        // the screen shows the server's truth rather than an assumption.
        void opts.refreshPlan();
        set({ phase: payment.status === "FAILED" ? "failed" : "cancelled", plan, payment });
    }

    function wait(ms: number) {
        return new Promise<void>((resolve) => {
            timer = timers.setTimeout(() => {
                timer = null;
                resolve();
            }, ms);
        });
    }

    function scheduleNextPoll(gen: number, plan: PaidTierId, payment: ClientPayment) {
        stopTimer();
        if (now() >= deadline) {
            set({ phase: "still_pending", plan, payment });
            return;
        }
        timer = timers.setTimeout(() => {
            timer = null;
            void poll(gen, plan, payment);
        }, pollIntervalMs);
    }

    async function poll(gen: number, plan: PaidTierId, payment: ClientPayment) {
        if (gen !== generation) return;
        try {
            const latest = await opts.api.getPayment(payment.id);
            if (gen !== generation) return;
            pollErrors = 0;
            await settle(gen, plan, latest);
        } catch (e) {
            if (gen !== generation) return;
            const fatal = e instanceof ApiError && (e.status === 401 || e.status === 404);
            // A remembered payment the server doesn't know (e.g. another
            // account's, after switching users) is never worth re-checking.
            if (e instanceof ApiError && e.status === 404) await opts.pendingStore?.clear().catch(() => {});
            if (fatal || ++pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
                set({ phase: "error", plan, message: describeError(e), payment });
                return;
            }
            scheduleNextPoll(gen, plan, payment); // transient — keep trying
        }
    }

    function beginPolling(plan: PaidTierId, payment: ClientPayment) {
        stopTimer();
        const gen = ++generation;
        deadline = now() + pollTimeoutMs;
        pollErrors = 0;
        set({ phase: "pending", plan, payment });
        void poll(gen, plan, payment);
    }

    return {
        getState: () => state,

        /** Starts a payment. Ignored (returns false) while one is already in
         * flight, so repeated taps can never create parallel requests. */
        async start(input: InitiateInput): Promise<boolean> {
            if (isBusy()) return false;
            stopTimer();
            const gen = ++generation;

            const signature = `${input.plan}|${input.provider}|${input.phoneNumber}`;
            if (!attempt || attempt.signature !== signature) attempt = { key: newKey(), signature };

            set({ phase: "starting", plan: input.plan });
            try {
                const { payment } = await opts.api.initiate({ ...input, idempotencyKey: attempt.key });
                if (gen !== generation) return true;
                if (payment.status === "PENDING") {
                    await opts.pendingStore?.save({ paymentId: payment.id, plan: input.plan }).catch(() => {});
                }
                deadline = now() + pollTimeoutMs;
                pollErrors = 0;
                await settle(gen, input.plan, payment);
            } catch (e) {
                if (gen !== generation) return true;
                set({ phase: "error", plan: input.plan, message: describeError(e), payment: null });
            }
            return true;
        },

        /** Picks up a payment started earlier (e.g. before the app was closed). */
        resume(entry: { paymentId: string; plan: PaidTierId }) {
            if (isBusy()) return;
            beginPolling(entry.plan, { id: entry.paymentId, status: "PENDING", plan: entry.plan, amount: 0, currency: "" });
        },

        /** From "still being confirmed" (or a polling error): check again. */
        checkAgain() {
            if ((state.phase === "still_pending" || state.phase === "error") && state.payment) {
                beginPolling(state.plan, state.payment);
            }
        },

        /** Back to idle. Stops polling; an unfinished payment stays remembered
         * in the pending store so it's checked again next time. */
        reset() {
            stopTimer();
            generation++;
            if (state.phase !== "error") attempt = null;
            set({ phase: "idle" });
        },

        dispose() {
            stopTimer();
            generation++;
        },
    };
}

export type PaymentCheckout = ReturnType<typeof createPaymentCheckout>;
