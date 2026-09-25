import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { createApiClient } from "@/lib/api-client";
import { usePlan } from "@/context/plan-context";
import type { PaidTierId } from "@/context/plan-context";
import {
    createPaymentApi,
    createPaymentCheckout,
    type CheckoutState,
    type PaymentApi,
    type PendingPaymentStore,
} from "@/lib/payment-flow";

// Per-user key so a pending payment is never resumed under another account.
const pendingKey = (userId: string) => `payments:pending:${userId}`;

function asyncStoragePendingStore(userId: string): PendingPaymentStore {
    return {
        save: (entry) => AsyncStorage.setItem(pendingKey(userId), JSON.stringify(entry)),
        clear: () => AsyncStorage.removeItem(pendingKey(userId)),
    };
}

async function loadPending(userId: string): Promise<{ paymentId: string; plan: PaidTierId } | null> {
    try {
        const raw = await AsyncStorage.getItem(pendingKey(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return typeof parsed?.paymentId === "string" && (parsed.plan === "starter" || parsed.plan === "pro") ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * One checkout flow per screen. Polling is owned by a single controller, so
 * there is never more than one loop; it stops when the screen unmounts, and an
 * unfinished payment is remembered and re-checked next time the screen opens
 * or the app returns to the foreground.
 */
export function usePaymentCheckout(overrides: { api?: PaymentApi } = {}) {
    const { userId, getToken } = useAuth();
    const { refresh } = usePlan();
    const [state, setState] = useState<CheckoutState>({ phase: "idle" });

    // Latest refresh without re-creating the controller when its identity changes.
    const refreshRef = useRef(refresh);
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    // Stable across renders (getToken's identity may not be): recreating the
    // controller would dispose it and silently stop polling mid-payment.
    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);
    const api = useMemo(
        () => overrides.api ?? createPaymentApi(createApiClient(() => getTokenRef.current())),
        [overrides.api]
    );

    const checkout = useMemo(
        () =>
            createPaymentCheckout({
                api,
                refreshPlan: () => refreshRef.current(),
                onChange: setState,
                pendingStore: userId ? asyncStoragePendingStore(userId) : undefined,
            }),
        [api, userId]
    );

    useEffect(() => {
        let active = true;
        if (userId) {
            loadPending(userId).then((entry) => {
                if (active && entry) checkout.resume(entry);
            });
        }
        return () => {
            active = false;
            checkout.dispose();
        };
    }, [checkout, userId]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active" && checkout.getState().phase === "still_pending") checkout.checkAgain();
        });
        return () => subscription.remove();
    }, [checkout]);

    return { state, checkout };
}
