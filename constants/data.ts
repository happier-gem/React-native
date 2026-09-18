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
