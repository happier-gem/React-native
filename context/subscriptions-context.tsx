import React, { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { IconKey } from "@/constants/icons";
import { BillingCycle } from "@/constants/data";

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

type SubscriptionsContextValue = {
    subscriptions: Subscription[];
    activeSubscriptions: Subscription[];
    totalMonthlySpend: number;
    getSubscription: (id: string) => Subscription | undefined;
    cancelSubscription: (id: string) => void;
    renewSubscription: (id: string) => void;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue | undefined>(undefined);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);

    const cancelSubscription = (id: string) => {
        setSubscriptions((prev) =>
            prev.map((sub) => (sub.id === id ? { ...sub, status: "canceled" } : sub))
        );
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

    const getSubscription = (id: string) => subscriptions.find((sub) => sub.id === id);

    const activeSubscriptions = useMemo(
        () => subscriptions.filter((sub) => sub.status === "active"),
        [subscriptions]
    );

    const totalMonthlySpend = useMemo(
        () => activeSubscriptions.reduce((sum, sub) => sum + monthlyEquivalent(sub), 0),
        [activeSubscriptions]
    );

    return (
        <SubscriptionsContext.Provider
            value={{
                subscriptions,
                activeSubscriptions,
                totalMonthlySpend,
                getSubscription,
                cancelSubscription,
                renewSubscription,
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
