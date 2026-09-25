import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/expo";
import { createApiClient } from "@/lib/api-client";

// The app's own tiers (not the subscriptions users track). Everything here is
// display state fetched from the admin server's GET /api/me/plan — the server
// alone decides price, payment success, activation and expiry. Nothing in the
// app computes or changes a plan; after a payment, call refresh().

export type TierId = "free" | "starter" | "pro";
export type PlanStatus = "ACTIVE" | "EXPIRED";

export type CurrentPlan = {
    plan: TierId;
    status: PlanStatus;
    isActive: boolean;
    startedAt: string | null;
    expiresAt: string | null;
    /** A paid downgrade queued behind the current period, if any. */
    pendingChange: { plan: Exclude<TierId, "free">; startsAt: string; expiresAt: string } | null;
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
    refresh: () => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, userId, getToken } = useAuth();
    const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
    const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const api = useMemo(() => createApiClient(getToken), [getToken]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<PlanResponse>("/api/me/plan");
            setCurrentPlan(data.plan);
            setAvailablePlans(data.availablePlans);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load your plan");
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            // Never let a previous user's plan linger for whoever signs in next.
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
