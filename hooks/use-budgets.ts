import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { createApiClient } from "@/lib/api-client";
import { notifyBudget } from "@/lib/notifications";
import { formatMoney } from "@/constants/data";

/** Mirrors admin/lib/budgets.ts BudgetView — computed on the server. */
export type Budget = {
    id: string;
    category: string | null;
    monthlyLimit: number;
    currency: string;
    spent: number;
    percent: number;
    status: "ok" | "near" | "over";
    active: boolean;
};

export type BudgetInput = { category: string | null; monthlyLimit: number; currency: string };

type BudgetsResponse = { budgets: Budget[] };

export const budgetName = (b: Pick<Budget, "category">) => b.category ?? "Overall";

/**
 * Sends a budget alert at most once per budget, per month, per level ("near"
 * at 80%, then "over") — remembered on the device so reopening the app
 * doesn't repeat it.
 */
async function alertIfNeeded(b: Budget) {
    if (!b.active || b.status === "ok") return;
    const month = new Date().toISOString().slice(0, 7);
    const key = `budget-alert:${b.id}:${month}:${b.status}`;
    try {
        if (await AsyncStorage.getItem(key)) return;
        await AsyncStorage.setItem(key, "1");
    } catch {
        return;
    }
    const name = budgetName(b);
    const amounts = `${formatMoney(b.spent, b.currency)} of ${formatMoney(b.monthlyLimit, b.currency)} a month`;
    await notifyBudget(
        b.id,
        b.status === "over" ? `${name} is over budget` : `${name} is close to its budget`,
        `Your subscriptions cost ${amounts} (${b.percent}%).`
    ).catch(() => {});
}

/**
 * The signed-in user's budgets (Starter/Pro). Spending and status come from
 * the server; `alerts` enables the budget notifications.
 */
export function useBudgets({ enabled, alerts }: { enabled: boolean; alerts: boolean }) {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);
    const api = useMemo(() => createApiClient(() => getTokenRef.current()), []);

    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const apply = useCallback(
        (next: Budget[]) => {
            setBudgets(next);
            if (alerts) next.forEach((b) => void alertIfNeeded(b));
        },
        [alerts]
    );

    const refresh = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);
        try {
            apply((await api.get<BudgetsResponse>("/api/me/budgets")).budgets);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load budgets");
        } finally {
            setLoading(false);
        }
    }, [api, apply, enabled]);

    const save = useCallback(
        async (input: BudgetInput, id?: string) => {
            const res = id
                ? await api.put<BudgetsResponse>(`/api/me/budgets/${encodeURIComponent(id)}`, input)
                : await api.post<BudgetsResponse>("/api/me/budgets", input);
            apply(res.budgets);
        },
        [api, apply]
    );

    const remove = useCallback(
        async (id: string) => {
            apply((await api.del<BudgetsResponse>(`/api/me/budgets/${encodeURIComponent(id)}`)).budgets);
        },
        [api, apply]
    );

    return { budgets, loading, error, refresh, save, remove };
}
