import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import PlansScreen from "@/app/plans";
import { ThemeProvider } from "@/context/theme-context";
import { PlanProvider, type AvailablePlan, type CurrentPlan } from "@/context/plan-context";

// End-to-end through the real Plans screen, PlanProvider, checkout hook and
// sheet. Only the network (our own API, via fetch), Clerk and navigation are
// faked — INFI-PAY is never involved on the client.

jest.mock("@clerk/expo", () => ({
    useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_a", getToken: async () => "token" }),
}));

jest.mock("expo-router", () => {
    const { useEffect } = jest.requireActual("react");
    return {
        router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true },
        useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    };
});
const mockRouter = jest.requireMock("expo-router").router as { back: jest.Mock };

jest.mock("react-native-keyboard-aware-scroll-view", () => {
    const { ScrollView: MockScrollView } = jest.requireActual("react-native");
    return {
        KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => <MockScrollView>{children}</MockScrollView>,
    };
});

const AVAILABLE: AvailablePlan[] = [
    { id: "free", name: "Free", price: 0, currency: "MWK", interval: null },
    { id: "starter", name: "Starter", price: 2000, currency: "MWK", interval: "monthly" },
    { id: "pro", name: "Pro", price: 5000, currency: "MWK", interval: "monthly" },
];
const FREE: CurrentPlan = { plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null, pendingChange: null, endedPlan: null };
const paid = (plan: "starter" | "pro"): CurrentPlan => ({
    ...FREE, plan, startedAt: "2026-09-25T10:00:00.000Z", expiresAt: "2026-10-25T10:00:00.000Z",
});

/** A fake of our admin server. `paymentStatuses` is what successive
 * GET /api/payments/[id] calls return; on SUCCESS the "webhook" has run. */
function fakeServer(opts: { plan: CurrentPlan; paymentStatuses: string[]; planAfterSuccess?: CurrentPlan }) {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    let plan = opts.plan;
    const statuses = [...opts.paymentStatuses];

    const respond = (status: number, body: unknown) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        text: async () => JSON.stringify(body),
    });

    global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        // Match on path only: the base URL is inlined from .env at build time.
        const path = new URL(url).pathname;
        const method = init?.method ?? "GET";
        calls.push({ method, path, body: init?.body ? JSON.parse(init.body) : undefined });

        if (path === "/api/me/plan") return respond(200, { plan, availablePlans: AVAILABLE });
        if (path === "/api/payments/initiate") {
            return respond(201, { payment: { id: "pay-1", status: "PENDING", plan: "pro", amount: 5000, currency: "MWK" } });
        }
        if (path === "/api/payments/pay-1") {
            const status = statuses.length > 1 ? statuses.shift()! : statuses[0];
            if (status === "SUCCESS" && opts.planAfterSuccess) plan = opts.planAfterSuccess;
            return respond(200, { id: "pay-1", status, plan: "pro", amount: 5000, currency: "MWK" });
        }
        return respond(404, { error: "Not found" });
    }) as unknown as typeof fetch;

    return { calls, count: (path: string) => calls.filter((c) => c.path === path).length };
}

const renderScreen = () =>
    render(
        <ThemeProvider>
            <PlanProvider>
                <PlansScreen />
            </PlanProvider>
        </ThemeProvider>
    );

async function choosePlanAndPay(action: string) {
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${action}, 5,000 MWK / month`) }));
    expect(await screen.findByText("Confirm payment")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Mobile money number"), "0991234567");
    await fireEvent.press(screen.getByRole("button", { name: "Continue to payment" }));
}

const tick = (ms: number) => act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
});

beforeEach(async () => {
    // A payment remembered by a previous test would otherwise be resumed.
    await AsyncStorage.clear();
    jest.useFakeTimers();
    mockRouter.back.mockClear();
});
afterEach(() => jest.useRealTimers());

describe("Plans screen", () => {
    it("Free user upgrades to Pro: pending -> success -> server plan refreshed and shown", async () => {
        const server = fakeServer({ plan: FREE, paymentStatuses: ["PENDING", "SUCCESS"], planAfterSuccess: paid("pro") });
        await renderScreen();

        expect(await screen.findByText("Free")).toBeOnTheScreen();
        expect(screen.getByText("Choose a plan below to unlock more features.")).toBeOnTheScreen();
        expect(screen.getByText("2,000 MWK / month")).toBeOnTheScreen();

        await choosePlanAndPay("Upgrade");
        expect(await screen.findByText("Payment pending")).toBeOnTheScreen();

        // The request carried no price, status or dates — only what the route reads.
        const initiate = server.calls.find((c) => c.path === "/api/payments/initiate");
        expect(initiate?.body).toEqual({ plan: "pro", provider: "airtel_money", phoneNumber: "0991234567", idempotencyKey: expect.any(String) });

        const planFetchesBefore = server.count("/api/me/plan");
        await tick(6_000); // polls at 3s (PENDING) and 6s (SUCCESS)
        expect(await screen.findByText("Payment successful!")).toBeOnTheScreen();
        expect(server.count("/api/me/plan")).toBeGreaterThan(planFetchesBefore);
        expect(screen.getByText("Your Pro plan is active until 25 October 2026.")).toBeOnTheScreen();
        // The header now shows what the server returned.
        expect(screen.getByTestId("current-plan-name")).toHaveTextContent("Pro");

        await fireEvent.press(screen.getByRole("button", { name: "Done" }));
        expect(mockRouter.back).toHaveBeenCalled();
    });

    it("a failed payment leaves the existing plan unchanged and offers a retry", async () => {
        fakeServer({ plan: paid("starter"), paymentStatuses: ["PENDING", "FAILED"] });
        await renderScreen();
        expect(await screen.findByText("Active until 25 October 2026")).toBeOnTheScreen();

        await choosePlanAndPay("Upgrade to Pro");
        await tick(6_000);
        expect(await screen.findByText("Payment failed")).toBeOnTheScreen();
        expect(screen.getByText("Your plan has not been changed.")).toBeOnTheScreen();
        expect(screen.getByTestId("current-plan-name")).toHaveTextContent("Starter");
        expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    });

    it("a payment that stays pending is reported as still confirming, not failed", async () => {
        fakeServer({ plan: FREE, paymentStatuses: ["PENDING"] });
        await renderScreen();
        await choosePlanAndPay("Upgrade");
        await tick(150_000);
        expect(await screen.findByText("Payment is still being confirmed")).toBeOnTheScreen();
        expect(screen.queryByText("Payment failed")).not.toBeOnTheScreen();
    });

    it("repeated taps on Continue start only one payment", async () => {
        const server = fakeServer({ plan: FREE, paymentStatuses: ["PENDING"] });
        await renderScreen();
        await fireEvent.press(await screen.findByRole("button", { name: /^Upgrade, 5,000 MWK/ }));
        await fireEvent.changeText(await screen.findByLabelText("Mobile money number"), "0991234567");
        const button = screen.getByRole("button", { name: "Continue to payment" });
        // Tap the same button three times. (Taps within one frame, before the
        // button re-renders, are covered by the controller's in-flight guard —
        // see lib/__tests__/payment-flow.test.ts "duplicate interaction".)
        for (let i = 0; i < 3; i++) {
            await fireEvent.press(button).catch(() => {}); // later taps may hit a button that's gone
        }
        await tick(0);
        expect(await screen.findByText("Payment pending")).toBeOnTheScreen();
        expect(server.count("/api/payments/initiate")).toBe(1);
    });

    it("Pro user: current plan shown, no Pro purchase offered", async () => {
        fakeServer({ plan: paid("pro"), paymentStatuses: [] });
        await renderScreen();
        expect(await screen.findByLabelText("Your current plan")).toBeOnTheScreen();
        expect(screen.queryByRole("button", { name: /Pro, 5,000 MWK/ })).not.toBeOnTheScreen();
        expect(screen.getByRole("button", { name: /^Switch to Starter/ })).toBeOnTheScreen();
    });

    it("an invalid phone number keeps Continue disabled", async () => {
        fakeServer({ plan: FREE, paymentStatuses: [] });
        await renderScreen();
        await fireEvent.press(await screen.findByRole("button", { name: /^Upgrade, 5,000 MWK/ }));
        await fireEvent.changeText(await screen.findByLabelText("Mobile money number"), "12345");
        expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    });
});
