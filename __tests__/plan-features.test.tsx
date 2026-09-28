import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import Insights from "@/app/(tabs)/insights";
import { ReminderSettingsModal } from "@/components/settings/reminder-settings-modal";
import { ThemeProvider } from "@/context/theme-context";
import { FREE_ENTITLEMENTS, type Entitlements } from "@/context/plan-context";

// Plan-dependent screens, driven by the entitlements the server sends.

jest.mock("expo-router", () => {
    const { useEffect } = jest.requireActual("react");
    return { router: { push: jest.fn() }, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock("react-native-keyboard-aware-scroll-view", () => {
    const { ScrollView: MockScrollView } = jest.requireActual("react-native");
    return { KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => <MockScrollView>{children}</MockScrollView> };
});
jest.mock("@/lib/notifications", () => ({ notifyBudget: jest.fn() }));
jest.mock("@/context/notifications-context", () => ({ useNotificationsSettings: () => ({ enabled: false }) }));
const mockBudgets = { list: [] as object[], save: jest.fn(async () => {}), refresh: jest.fn(async () => {}) };
jest.mock("@/hooks/use-budgets", () => ({
    ...jest.requireActual("@/hooks/use-budgets"),
    useBudgets: () => ({
        budgets: mockBudgets.list,
        loading: false,
        error: null,
        refresh: mockBudgets.refresh,
        save: mockBudgets.save,
        remove: jest.fn(),
    }),
}));
jest.mock("@clerk/expo", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "u", getToken: async () => "t" }) }));

const mockPlan = {
    entitlements: FREE_ENTITLEMENTS as Entitlements,
    reminderSettings: { reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: null },
    updateReminderSettings: jest.fn(async () => {}),
};
jest.mock("@/context/plan-context", () => ({
    ...jest.requireActual("@/context/plan-context"),
    usePlan: () => mockPlan,
}));

const sub = (id: string, category: string, price: number) => ({
    id, name: id, icon: "spotify", brandColor: "#000", price, currency: "MWK", cycle: "monthly",
    category, renewalDate: "2026-10-28", status: "active",
});
const mockSubs = [sub("Netflix", "Entertainment", 3000), sub("Spotify", "Music", 1500), sub("Showmax", "Entertainment", 2000)];
jest.mock("@/context/subscriptions-context", () => ({
    monthlyEquivalent: (s: { price: number; cycle: string }) => (s.cycle === "yearly" ? s.price / 12 : s.price),
    useSubscriptions: () => ({
        activeSubscriptions: mockSubs,
        subscriptions: mockSubs,
        loading: false,
        spendByCurrency: [{ currency: "MWK", monthly: 6500, yearly: 78000 }],
    }),
}));

const PRO: Entitlements = {
    ...FREE_ENTITLEMENTS,
    maxActiveSubscriptions: null,
    reminderDayOptions: [1, 3, 7],
    maxRemindersPerSubscription: 3,
    insights: "full",
};
const STARTER: Entitlements = { ...FREE_ENTITLEMENTS, reminderDayOptions: [1, 3, 7], insights: "breakdown" };

const withTheme = (node: React.ReactElement) => render(<ThemeProvider>{node}</ThemeProvider>);

beforeEach(() => {
    mockBudgets.list = [];
    mockBudgets.save.mockClear();
    mockPlan.entitlements = FREE_ENTITLEMENTS;
    mockPlan.reminderSettings = { reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: null };
    mockPlan.updateReminderSettings.mockClear();
});

describe("Insights by plan", () => {
    it("Free: monthly total only, with an upgrade card", async () => {
        await withTheme(<Insights />);
        expect(screen.getByText("Monthly")).toBeOnTheScreen();
        expect(screen.queryByText("Yearly")).not.toBeOnTheScreen();
        expect(screen.queryByText("Spending by subscription")).not.toBeOnTheScreen();
        expect(screen.getByText("See where your money goes")).toBeOnTheScreen();
    });

    it("Starter: yearly and per-subscription, category locked", async () => {
        mockPlan.entitlements = STARTER;
        await withTheme(<Insights />);
        expect(screen.getByText("Yearly")).toBeOnTheScreen();
        expect(screen.getByText("Spending by subscription")).toBeOnTheScreen();
        expect(screen.getByText("Spending by category")).toBeOnTheScreen(); // the locked card's title
        expect(screen.getByText("Pro shows which categories cost you the most.")).toBeOnTheScreen();
    });

    it("Pro: spending by category, totals per category", async () => {
        mockPlan.entitlements = PRO;
        await withTheme(<Insights />);
        expect(screen.getByText("Spending by category")).toBeOnTheScreen();
        expect(screen.getByText("Entertainment")).toBeOnTheScreen();
        expect(screen.getByText("Music")).toBeOnTheScreen();
        expect(screen.queryByText("Pro shows which categories cost you the most.")).not.toBeOnTheScreen();
    });
});

describe("Reminder settings by plan", () => {
    it("Free: 3 and 7 days are locked; choosing them saves nothing", async () => {
        await withTheme(<ReminderSettingsModal visible onClose={() => {}} />);
        expect(screen.getByLabelText("3 days before, upgrade to unlock")).toBeOnTheScreen();
        await fireEvent.press(screen.getByLabelText("7 days before, upgrade to unlock"));
        expect(mockPlan.updateReminderSettings).not.toHaveBeenCalled();
    });

    it("Starter: picking 7 days replaces the choice", async () => {
        mockPlan.entitlements = STARTER;
        await withTheme(<ReminderSettingsModal visible onClose={() => {}} />);
        await fireEvent.press(screen.getByLabelText("7 days before"));
        expect(mockPlan.updateReminderSettings).toHaveBeenCalledWith({ reminderDays: [7] });
    });

    it("Pro: adds a second reminder", async () => {
        mockPlan.entitlements = PRO;
        await withTheme(<ReminderSettingsModal visible onClose={() => {}} />);
        await fireEvent.press(screen.getByLabelText("7 days before"));
        expect(mockPlan.updateReminderSettings).toHaveBeenCalledWith({ reminderDays: [1, 7] });
    });
});

describe("Budgets by plan", () => {
    const overall = { id: "b1", category: null, monthlyLimit: 5000, currency: "MWK", spent: 6500, percent: 130, status: "over", active: true };

    it("Free: budgets are locked", async () => {
        await withTheme(<Insights />);
        expect(screen.getByText("Monthly budget alerts")).toBeOnTheScreen();
        expect(screen.queryByLabelText("Add budget")).not.toBeOnTheScreen();
    });

    it("Starter: shows the overall budget with a written status; only one allowed", async () => {
        mockPlan.entitlements = { ...STARTER, budgets: "overall" };
        mockBudgets.list = [overall];
        await withTheme(<Insights />);
        expect(screen.getByText("Overall")).toBeOnTheScreen();
        expect(screen.getByText("Over budget")).toBeOnTheScreen(); // text, not just color
        expect(screen.queryByLabelText("Add budget")).not.toBeOnTheScreen();
    });

    it("Pro: can add a category budget", async () => {
        mockPlan.entitlements = { ...PRO, budgets: "per_category" };
        mockBudgets.list = [overall];
        await withTheme(<Insights />);
        await fireEvent.press(screen.getByLabelText("Add budget"));
        await fireEvent.press(screen.getByLabelText("Use category Music"));
        await fireEvent.changeText(screen.getByLabelText("Monthly limit"), "2000");
        await fireEvent.press(screen.getByLabelText("Save budget"));
        expect(mockBudgets.save).toHaveBeenCalledWith({ category: "Music", monthlyLimit: 2000, currency: "MWK" }, undefined);
    });
});
