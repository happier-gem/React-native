import { icons } from "./icons";

export const tabs = [
    { name: "home", title: "Home", icon: icons.home },
    { name: "subscriptions", title: "Subscriptions", icon: icons.wallet },
    { name: "insights", title: "Insights", icon: icons.activity },
    { name: "settings", title: "Settings", icon: icons.setting },
];

export type BillingCycle = "monthly" | "yearly";

export const formatRenewalDate = (isoDate: string) =>
    new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const daysUntil = (isoDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(isoDate);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const formatDaysUntil = (days: number) => {
    if (days < 0) return "Overdue";
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
};

/** Formats an amount in ITS OWN currency — use this for any individual
 * subscription's price, since each one now carries its own currency and
 * shouldn't be shown with the user's separately-chosen display currency's
 * symbol. Use useCurrency().format() only for the user's own preference
 * (e.g. defaulting the Add Subscription form). */
export const formatMoney = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
};
