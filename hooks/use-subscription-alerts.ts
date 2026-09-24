import { useMemo } from "react";
import { daysUntil } from "@/constants/data";
import { Subscription, useSubscriptions } from "@/context/subscriptions-context";
import { useNotificationReadState } from "@/context/notification-read-context";

const RENEWAL_WINDOW_DAYS = 7;

export type RenewingSoon = { sub: Subscription; days: number };

// Renewal alerts key on renewalDate so a renewed subscription becomes a fresh,
// unread alert if it re-enters the window later; cancellation alerts key on id
// alone (a re-cancel of the same subscription won't re-surface as unread).
const renewalAlertKey = (sub: Subscription) => `renewal:${sub.id}:${sub.renewalDate}`;
const canceledAlertKey = (sub: Subscription) => `canceled:${sub.id}`;

export function useSubscriptionAlerts() {
    const { activeSubscriptions, subscriptions } = useSubscriptions();
    const { isRead, markRead } = useNotificationReadState();

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

    const alertKeys = useMemo(
        () => [...renewingSoon.map(({ sub }) => renewalAlertKey(sub)), ...canceled.map(canceledAlertKey)],
        [renewingSoon, canceled]
    );

    const unreadCount = useMemo(() => alertKeys.filter((key) => !isRead(key)).length, [alertKeys, isRead]);

    const hasAlerts = renewingSoon.length > 0 || canceled.length > 0;

    const markAllAsRead = () => markRead(alertKeys);

    return { renewingSoon, canceled, hasAlerts, unreadCount, markAllAsRead };
}
