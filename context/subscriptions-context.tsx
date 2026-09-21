import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { IconKey } from "@/constants/icons";
import { BillingCycle } from "@/constants/data";
import {
    cancelRenewalReminder,
    notifySubscriptionCanceled,
    scheduleRenewalReminder,
} from "@/lib/notifications";
import { useNotificationsSettings } from "@/context/notifications-context";

export type SubscriptionStatus = "active" | "canceled";

export type Subscription = {
    id: string;
    name: string;
    icon: IconKey;
    brandColor: string;
    price: number;
    cycle: BillingCycle;
    category: string;
    renewalDate: string;
    status: SubscriptionStatus;
};

const initialSubscriptions: Subscription[] = [
    { id: "spotify", name: "Spotify", icon: "spotify", brandColor: "#1DB954", price: 11.99, cycle: "monthly", category: "Music", renewalDate: "2026-10-01", status: "active" },
    { id: "claude", name: "Claude Max", icon: "claude", brandColor: "#DA7756", price: 100, cycle: "monthly", category: "AI", renewalDate: "2026-10-05", status: "active" },
    { id: "figma", name: "Figma", icon: "figma", brandColor: "#A259FF", price: 15, cycle: "monthly", category: "Design", renewalDate: "2026-10-18", status: "active" },
    { id: "adobe", name: "Adobe Creative Cloud", icon: "adobe", brandColor: "#FF0000", price: 59.99, cycle: "monthly", category: "Design", renewalDate: "2026-10-09", status: "active" },
    { id: "notion", name: "Notion", icon: "notion", brandColor: "#9B9A97", price: 96, cycle: "yearly", category: "Productivity", renewalDate: "2027-03-12", status: "active" },
    { id: "github", name: "GitHub Pro", icon: "github", brandColor: "#6E7681", price: 4, cycle: "monthly", category: "Developer Tools", renewalDate: "2026-10-22", status: "active" },
];

export const monthlyEquivalent = (sub: Subscription) =>
    sub.cycle === "yearly" ? sub.price / 12 : sub.price;

const addCycle = (isoDate: string, cycle: BillingCycle) => {
    const date = new Date(isoDate);
    if (cycle === "monthly") {
        date.setMonth(date.getMonth() + 1);
    } else {
        date.setFullYear(date.getFullYear() + 1);
    }
    return date.toISOString().slice(0, 10);
};

export type SubscriptionEdits = {
    price: number;
    cycle: BillingCycle;
};

type SubscriptionsContextValue = {
    subscriptions: Subscription[];
    activeSubscriptions: Subscription[];
    totalMonthlySpend: number;
    getSubscription: (id: string) => Subscription | undefined;
    cancelSubscription: (id: string) => void;
    renewSubscription: (id: string) => void;
    updateSubscription: (id: string, edits: SubscriptionEdits) => void;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue | undefined>(undefined);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
    const { enabled: notificationsEnabled } = useNotificationsSettings();

    const cancelSubscription = (id: string) => {
        const target = subscriptions.find((sub) => sub.id === id);
        setSubscriptions((prev) =>
            prev.map((sub) => (sub.id === id ? { ...sub, status: "canceled" } : sub))
        );
        cancelRenewalReminder(id);
        if (notificationsEnabled && target) {
            notifySubscriptionCanceled(id, target.name);
        }
    };

    const renewSubscription = (id: string) => {
        setSubscriptions((prev) =>
            prev.map((sub) =>
                sub.id === id
                    ? { ...sub, status: "active", renewalDate: addCycle(sub.renewalDate, sub.cycle) }
                    : sub
            )
        );
    };

    const updateSubscription = (id: string, edits: SubscriptionEdits) => {
        setSubscriptions((prev) =>
            prev.map((sub) => (sub.id === id ? { ...sub, ...edits } : sub))
        );
    };

    const getSubscription = (id: string) => subscriptions.find((sub) => sub.id === id);

    const activeSubscriptions = useMemo(
        () => subscriptions.filter((sub) => sub.status === "active"),
        [subscriptions]
    );

    const totalMonthlySpend = useMemo(
        () => activeSubscriptions.reduce((sum, sub) => sum + monthlyEquivalent(sub), 0),
        [activeSubscriptions]
    );

    useEffect(() => {
        if (!notificationsEnabled) return;
        activeSubscriptions.forEach((sub) => {
            scheduleRenewalReminder(sub.id, sub.name, sub.renewalDate);
        });
    }, [notificationsEnabled, activeSubscriptions]);

    return (
        <SubscriptionsContext.Provider
            value={{
                subscriptions,
                activeSubscriptions,
                totalMonthlySpend,
                getSubscription,
                cancelSubscription,
                renewSubscription,
                updateSubscription,
            }}
        >
            {children}
        </SubscriptionsContext.Provider>
    );
}

export function useSubscriptions() {
    const ctx = useContext(SubscriptionsContext);
    if (!ctx) {
        throw new Error("useSubscriptions must be used within a SubscriptionsProvider");
    }
    return ctx;
}
