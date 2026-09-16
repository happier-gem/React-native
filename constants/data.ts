import { icons, IconKey } from "./icons";

export const tabs = [
    { name: "home", title: "Home", icon: icons.home },
    { name: "subscriptions", title: "Subscriptions", icon: icons.wallet },
    { name: "insights", title: "Insights", icon: icons.activity },
    { name: "settings", title: "Settings", icon: icons.setting },
];

export type BillingCycle = "monthly" | "yearly";

export type Subscription = {
    id: string;
    name: string;
    icon: IconKey;
    price: number;
    cycle: BillingCycle;
    category: string;
    renewalDate: string;
};

export const subscriptions: Subscription[] = [
    { id: "spotify", name: "Spotify", icon: "spotify", price: 11.99, cycle: "monthly", category: "Music", renewalDate: "2026-10-01" },
    { id: "claude", name: "Claude Max", icon: "claude", price: 100, cycle: "monthly", category: "AI", renewalDate: "2026-10-05" },
    { id: "figma", name: "Figma", icon: "figma", price: 15, cycle: "monthly", category: "Design", renewalDate: "2026-10-18" },
    { id: "adobe", name: "Adobe Creative Cloud", icon: "adobe", price: 59.99, cycle: "monthly", category: "Design", renewalDate: "2026-10-09" },
    { id: "notion", name: "Notion", icon: "notion", price: 96, cycle: "yearly", category: "Productivity", renewalDate: "2027-03-12" },
    { id: "github", name: "GitHub Pro", icon: "github", price: 4, cycle: "monthly", category: "Developer Tools", renewalDate: "2026-10-22" },
];

export const monthlyEquivalent = (sub: Subscription) =>
    sub.cycle === "yearly" ? sub.price / 12 : sub.price;

export const totalMonthlySpend = subscriptions.reduce(
    (sum, sub) => sum + monthlyEquivalent(sub),
    0
);

export const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

export const formatRenewalDate = (isoDate: string) =>
    new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
