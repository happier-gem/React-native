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
};

type PlanResponse = { plan: CurrentPlan; availablePlans: AvailablePlan[] };

type PlanContextValue = {
    /** Null until the first successful load (or while signed out). */
    currentPlan: CurrentPlan | null;
    availablePlans: AvailablePlan[];
    loading: boolean;
    error: string | null;
    /** Re-fetches from the server and resolves with the server's plan (null
     * if the request failed — see `error`). */
    refresh: () => Promise<CurrentPlan | null>;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, userId, getToken } = useAuth();
    const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
    const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const api = useMemo(() => createApiClient(getToken), [getToken]);

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
            }
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

    return (
        <PlanContext.Provider value={{ currentPlan, availablePlans, loading, error, refresh }}>
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
