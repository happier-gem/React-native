import { useMemo } from "react";
import { daysUntil } from "@/constants/data";
import { Subscription, useSubscriptions } from "@/context/subscriptions-context";

const RENEWAL_WINDOW_DAYS = 7;

export type RenewingSoon = { sub: Subscription; days: number };

export function useSubscriptionAlerts() {
    const { activeSubscriptions, subscriptions } = useSubscriptions();

    const renewingSoon = useMemo<RenewingSoon[]>(
        () =>
            activeSubscriptions
                .map((sub) => ({ sub, days: daysUntil(sub.renewalDate) }))
                .filter(({ days }) => days <= RENEWAL_WINDOW_DAYS)
                .sort((a, b) => a.days - b.days),
        [activeSubscriptions]
    );

    const canceled = useMemo(
        () => subscriptions.filter((sub) => sub.status === "canceled"),
        [subscriptions]
    );

    const hasAlerts = renewingSoon.length > 0 || canceled.length > 0;

    return { renewingSoon, canceled, hasAlerts };
}
