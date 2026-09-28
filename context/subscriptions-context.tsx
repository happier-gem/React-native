import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/expo";
import { IconKey, isValidIconKey } from "@/constants/icons";
import { BillingCycle } from "@/constants/data";
import { DEFAULT_BRAND_PRESET } from "@/constants/brand-presets";
import {
    cancelRenewalReminder,
    notifySubscriptionCanceled,
    scheduleRenewalReminder,
} from "@/lib/notifications";
import { useNotificationsSettings } from "@/context/notifications-context";
import { createApiClient } from "@/lib/api-client";

export type SubscriptionStatus = "active" | "canceled";

export type Subscription = {
    id: string;
    name: string;
    icon: IconKey;
    brandColor: string;
    price: number;
    currency: string;
    cycle: BillingCycle;
    category: string;
    renewalDate: string;
    status: SubscriptionStatus;
};

// Shape returned by the admin server's /api/subscriptions routes — matches
// admin/supabase/schema.sql's subscriptions table (snake_case, plus fields the
// UI doesn't need like user_id/created_at/updated_at).
type ServerSubscription = {
    id: string;
    name: string;
    icon: string | null;
    brand_color: string | null;
    price: number;
    currency: string;
    cycle: BillingCycle;
    category: string;
    renewal_date: string;
    status: SubscriptionStatus;
};

const normalizeIcon = (value: string | null): IconKey =>
    value && isValidIconKey(value) ? value : DEFAULT_BRAND_PRESET.icon;

const fromServer = (row: ServerSubscription): Subscription => ({
    id: row.id,
    name: row.name,
    icon: normalizeIcon(row.icon),
    brandColor: row.brand_color ?? DEFAULT_BRAND_PRESET.brandColor,
    price: row.price,
    currency: row.currency,
    cycle: row.cycle,
    category: row.category,
    renewalDate: row.renewal_date,
    status: row.status,
});

export const monthlyEquivalent = (sub: Pick<Subscription, "price" | "cycle">) =>
    sub.cycle === "yearly" ? sub.price / 12 : sub.price;

export type CurrencySpend = { currency: string; monthly: number; yearly: number };

/** Groups by currency rather than summing them together — combining different
 * currencies into one number would be misleading, not just imprecise. */
export const aggregateSpendByCurrency = (
    subscriptions: Pick<Subscription, "price" | "cycle" | "currency">[]
): CurrencySpend[] => {
    const totals = new Map<string, number>();
    for (const sub of subscriptions) {
        const monthly = monthlyEquivalent(sub);
        totals.set(sub.currency, (totals.get(sub.currency) ?? 0) + monthly);
    }
    return [...totals.entries()]
        .map(([currency, monthly]) => ({ currency, monthly, yearly: monthly * 12 }))
        .sort((a, b) => b.monthly - a.monthly);
};

export type NewSubscriptionInput = {
    name: string;
    price: number;
    currency: string;
    cycle: BillingCycle;
    category: string;
    renewalDate: string;
    icon: IconKey;
    brandColor: string;
};

export type SubscriptionEdits = Partial<NewSubscriptionInput>;

const toServerEdits = (edits: SubscriptionEdits) => {
    const body: Record<string, unknown> = {};
    if (edits.name !== undefined) body.name = edits.name;
    if (edits.price !== undefined) body.price = edits.price;
    if (edits.currency !== undefined) body.currency = edits.currency;
    if (edits.cycle !== undefined) body.cycle = edits.cycle;
    if (edits.category !== undefined) body.category = edits.category;
    if (edits.renewalDate !== undefined) body.renewal_date = edits.renewalDate;
    if (edits.icon !== undefined) body.icon = edits.icon;
    if (edits.brandColor !== undefined) body.brand_color = edits.brandColor;
    return body;
};

type SubscriptionsContextValue = {
    subscriptions: Subscription[];
    activeSubscriptions: Subscription[];
    loading: boolean;
    error: string | null;
    spendByCurrency: CurrencySpend[];
    getSubscription: (id: string) => Subscription | undefined;
    addSubscription: (input: NewSubscriptionInput) => Promise<void>;
    updateSubscription: (id: string, edits: SubscriptionEdits) => Promise<void>;
    cancelSubscription: (id: string) => Promise<void>;
    renewSubscription: (id: string) => Promise<void>;
    deleteSubscription: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue | undefined>(undefined);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, userId, getToken } = useAuth();
    const { enabled: notificationsEnabled } = useNotificationsSettings();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const api = useMemo(() => createApiClient(getToken), [getToken]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { subscriptions: rows } = await api.get<{ subscriptions: ServerSubscription[] }>(
                "/api/subscriptions"
            );
            setSubscriptions(rows.map(fromServer));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load subscriptions");
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            // Clear immediately on sign-out (or no session) so a previous user's
            // subscriptions can never linger for whoever signs in next.
            setSubscriptions([]);
            setLoading(false);
            setError(null);
            return;
        }
        refresh();
        // Deliberately keyed on isLoaded/isSignedIn/userId only, not `refresh` —
        // this should refetch when the signed-in identity changes, not on every
        // render where the api client's identity happens to change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, isSignedIn, userId]);

    const addSubscription = async (input: NewSubscriptionInput) => {
        const { subscription } = await api.post<{ subscription: ServerSubscription }>("/api/subscriptions", {
            name: input.name,
            price: input.price,
            currency: input.currency,
            cycle: input.cycle,
            category: input.category,
            renewal_date: input.renewalDate,
            icon: input.icon,
            brand_color: input.brandColor,
        });
        setSubscriptions((prev) => [fromServer(subscription), ...prev]);
    };

    const updateSubscription = async (id: string, edits: SubscriptionEdits) => {
        const { subscription } = await api.patch<{ subscription: ServerSubscription }>(
            `/api/subscriptions/${id}`,
            toServerEdits(edits)
        );
        const updated = fromServer(subscription);
        setSubscriptions((prev) => prev.map((sub) => (sub.id === id ? updated : sub)));
    };

    const cancelSubscription = async (id: string) => {
        const target = subscriptions.find((sub) => sub.id === id);
        const { subscription } = await api.post<{ subscription: ServerSubscription }>(
            `/api/subscriptions/${id}/cancel`
        );
        const updated = fromServer(subscription);
        setSubscriptions((prev) => prev.map((sub) => (sub.id === id ? updated : sub)));
        cancelRenewalReminder(id);
        if (notificationsEnabled && target) {
            notifySubscriptionCanceled(id, target.name);
        }
    };

    const renewSubscription = async (id: string) => {
        const { subscription } = await api.post<{ subscription: ServerSubscription }>(
            `/api/subscriptions/${id}/renew`
        );
        const updated = fromServer(subscription);
        setSubscriptions((prev) => prev.map((sub) => (sub.id === id ? updated : sub)));
    };

    const deleteSubscription = async (id: string) => {
        await api.del<void>(`/api/subscriptions/${id}`);
        cancelRenewalReminder(id);
        setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
    };

    const getSubscription = (id: string) => subscriptions.find((sub) => sub.id === id);

    const activeSubscriptions = useMemo(
        () => subscriptions.filter((sub) => sub.status === "active"),
        [subscriptions]
    );

    const spendByCurrency = useMemo(
        () => aggregateSpendByCurrency(activeSubscriptions),
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
                loading,
                error,
                spendByCurrency,
                getSubscription,
                addSubscription,
                updateSubscription,
                cancelSubscription,
                renewSubscription,
                deleteSubscription,
                refresh,
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
