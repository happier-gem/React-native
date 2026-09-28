import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "@clerk/expo";
import { createApiClient } from "@/lib/api-client";

// The app's own tiers (not the subscriptions users track). Everything here is
// display state fetched from the admin server's GET /api/me/plan — the server
// alone decides price, payment success, activation and expiry. Nothing in the
// app computes or changes a plan; after a payment, call refresh().
//
// Also refreshes whenever the app returns to the foreground, so a payment
// completed outside the app shows up without the original polling session.

export type TierId = "free" | "starter" | "pro";
export type PaidTierId = Exclude<TierId, "free">;
export type PlanStatus = "ACTIVE" | "EXPIRED";

export type CurrentPlan = {
    plan: TierId;
    status: PlanStatus;
    isActive: boolean;
    startedAt: string | null;
    expiresAt: string | null;
    /** A paid downgrade queued behind the current period, if any. */
    pendingChange: { plan: PaidTierId; startsAt: string; expiresAt: string } | null;
    /** When back on FREE: the paid plan that most recently ended, if any. */
    endedPlan: { plan: PaidTierId; endedAt: string } | null;
};

export type AvailablePlan = {
    id: TierId;
    name: string;
    price: number;
    currency: string;
    interval: "monthly" | null;
    /** Plain-language list of what the plan includes (from the server). */
    features?: string[];
};

/** What the user's current plan includes — mirrors admin/lib/entitlements.ts.
 * Used only to decide what to show; the server enforces every rule. */
export type Entitlements = {
    maxActiveSubscriptions: number | null;
    reminderDayOptions: number[];
    maxRemindersPerSubscription: number;
    insights: "basic" | "breakdown" | "full";
    budgets: "none" | "overall" | "per_category";
    export: boolean;
    smsReminders: boolean;
    whatsappReminders: boolean;
    currencyConversion: boolean;
};

/** Until the server answers, assume the most limited plan — never show more
 * than the user has. */
export const FREE_ENTITLEMENTS: Entitlements = {
    maxActiveSubscriptions: 5,
    reminderDayOptions: [1],
    maxRemindersPerSubscription: 1,
    insights: "basic",
    budgets: "none",
    export: false,
    smsReminders: false,
    whatsappReminders: false,
    currencyConversion: false,
};

export type ReminderSettings = {
    reminderDays: number[];
    smsReminders: boolean;
    whatsappReminders: boolean;
    reminderPhone: string | null;
};

const DEFAULT_REMINDERS: ReminderSettings = { reminderDays: [1], smsReminders: false, whatsappReminders: false, reminderPhone: null };

type PlanResponse = { plan: CurrentPlan; availablePlans: AvailablePlan[]; entitlements?: Entitlements };

type PlanContextValue = {
    /** Null until the first successful load (or while signed out). */
    currentPlan: CurrentPlan | null;
    availablePlans: AvailablePlan[];
    loading: boolean;
    error: string | null;
    /** Re-fetches from the server and resolves with the server's plan (null
     * if the request failed — see `error`). */
    refresh: () => Promise<CurrentPlan | null>;
    entitlements: Entitlements;
    /** Reminder settings as they apply under the current plan (server's view). */
    reminderSettings: ReminderSettings;
    /** Saves a change; the server refuses anything the plan doesn't include
     * (throws ApiError with code "plan_limit"). */
    updateReminderSettings: (changes: Partial<ReminderSettings>) => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, userId, getToken } = useAuth();
    const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
    const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [entitlements, setEntitlements] = useState<Entitlements>(FREE_ENTITLEMENTS);
    const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);

    // getToken's identity isn't guaranteed stable across renders; reading it
    // through a ref keeps the client — and therefore refresh() — stable, so
    // effects depending on refresh (focus/foreground refetches) can't loop.
    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);
    const api = useMemo(() => createApiClient(() => getTokenRef.current()), []);

    // Only the latest request may write state, so a slow older response can
    // never overwrite a newer one (e.g. focus refresh racing a post-payment one).
    const requestSeq = useRef(0);

    const refresh = useCallback(async (): Promise<CurrentPlan | null> => {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<PlanResponse>("/api/me/plan");
            if (seq === requestSeq.current) {
                setCurrentPlan(data.plan);
                setAvailablePlans(data.availablePlans);
                setEntitlements(data.entitlements ?? FREE_ENTITLEMENTS);
            }
            // Settings follow the plan (e.g. trimmed after a downgrade) —
            // best-effort, the defaults stand if it fails.
            api.get<{ settings: ReminderSettings }>("/api/me/settings")
                .then(({ settings }) => {
                    if (seq === requestSeq.current) setReminderSettings(settings);
                })
                .catch(() => {});
            return data.plan;
        } catch (e) {
            if (seq === requestSeq.current) {
                setError(e instanceof Error ? e.message : "Failed to load your plan");
            }
            return null;
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            // Never let a previous user's plan linger for whoever signs in next.
            requestSeq.current++;
            setCurrentPlan(null);
            setAvailablePlans([]);
            setEntitlements(FREE_ENTITLEMENTS);
            setReminderSettings(DEFAULT_REMINDERS);
            setLoading(false);
            setError(null);
            return;
        }
        refresh();
        // Same keying as SubscriptionsProvider: refetch when the signed-in
        // identity changes, not whenever the api client's identity does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, isSignedIn, userId]);

    useEffect(() => {
        if (!isSignedIn) return;
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") refresh();
        });
        return () => subscription.remove();
    }, [isSignedIn, refresh]);

    const updateReminderSettings = useCallback(
        async (changes: Partial<ReminderSettings>) => {
            const { settings } = await api.put<{ settings: ReminderSettings }>("/api/me/settings", changes);
            setReminderSettings(settings);
        },
        [api]
    );

    return (
        <PlanContext.Provider
            value={{ currentPlan, availablePlans, loading, error, refresh, entitlements, reminderSettings, updateReminderSettings }}
        >
            {children}
        </PlanContext.Provider>
    );
}

export function usePlan() {
    const ctx = useContext(PlanContext);
    if (!ctx) {
        throw new Error("usePlan must be used within a PlanProvider");
    }
    return ctx;
}
