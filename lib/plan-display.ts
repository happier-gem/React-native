import type { AvailablePlan, CurrentPlan, PaidTierId, TierId } from "@/context/plan-context";

// Presentation rules for the Plans screen and the Settings row. Everything here
// only *describes* what the server returned from GET /api/me/plan — no prices,
// dates or plan states are computed. The one client-side decision is which
// purchase button to offer, and the server still decides what a payment does.

/** Order used to tell an upgrade from a downgrade — mirrors TIER_RANK in
 * admin/lib/plans.ts. */
const TIER_RANK: Record<TierId, number> = { free: 0, starter: 1, pro: 2 };

/** A paid plan can be renewed (paid for again, adding a month to its current
 * end date) only this close to expiry, so a stray tap can't buy months the
 * user doesn't need yet. PROVISIONAL — awaiting business approval
 * (docs/payments.md#business-decisions). */
export const RENEWAL_WINDOW_DAYS = 7;

/** Per-plan feature bullets. The business hasn't defined feature limits yet,
 * so nothing is listed — add bullets here once they're decided and the Plans
 * screen renders them. Don't list features the app doesn't actually gate. */
export const PLAN_FEATURES: Record<TierId, string[]> = {
    free: [],
    starter: [],
    pro: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const formatLongDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const formatShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "2,000 MWK / month" — amount and currency exactly as the server sent them. */
export function formatPlanPrice(plan: Pick<AvailablePlan, "price" | "currency" | "interval">): string {
    const amount = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(plan.price)} ${plan.currency}`;
    return plan.interval === "monthly" ? `${amount} / month` : amount;
}

export const intervalLabel = (interval: AvailablePlan["interval"]) => (interval === "monthly" ? "Monthly" : "One-off");

export function planName(id: TierId, availablePlans: AvailablePlan[]): string {
    return availablePlans.find((p) => p.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Paid plans only, cheapest first — what the user can choose between. */
export function purchasablePlans(availablePlans: AvailablePlan[]): (AvailablePlan & { id: PaidTierId })[] {
    return availablePlans
        .filter((p): p is AvailablePlan & { id: PaidTierId } => p.id !== "free" && p.price > 0)
        .sort((a, b) => TIER_RANK[a.id] - TIER_RANK[b.id]);
}

export type PlanHeader = { title: string; lines: string[] };

/** The "Your Plan" block at the top of the Plans screen. */
export function describeCurrentPlan(current: CurrentPlan, availablePlans: AvailablePlan[]): PlanHeader {
    const title = planName(current.plan, availablePlans);

    if (current.plan === "free") {
        const lines: string[] = [];
        if (current.endedPlan) {
            lines.push(`Your ${planName(current.endedPlan.plan, availablePlans)} plan ended on ${formatLongDate(current.endedPlan.endedAt)}.`);
        }
        lines.push("Choose a plan below to unlock more features.");
        return { title, lines };
    }

    const lines = current.expiresAt ? [`Active until ${formatLongDate(current.expiresAt)}`] : [];
    if (current.pendingChange) {
        lines.push(
            `${planName(current.pendingChange.plan, availablePlans)} scheduled — starts after your ${title} plan ends, ` +
                `and runs until ${formatLongDate(current.pendingChange.expiresAt)}.`
        );
    }
    return { title, lines };
}

/** The Settings "Plan" row: e.g. "Free · Upgrade" or "Pro · Active until 25 Oct". */
export function settingsPlanSummary(current: CurrentPlan | null, availablePlans: AvailablePlan[]): string {
    if (!current) return "—";
    const name = planName(current.plan, availablePlans);
    if (current.plan === "free") return `${name} · Upgrade`;
    return current.expiresAt ? `${name} · Active until ${formatShortDate(current.expiresAt)}` : name;
}

export type PlanAction =
    /** The user's current plan; nothing to buy right now. */
    | { kind: "current"; label: "Current plan" }
    /** Already queued behind the current plan. */
    | { kind: "scheduled"; label: string }
    | { kind: "upgrade" | "downgrade" | "renew"; label: string };

/** What a plan card offers, given the server's current plan. */
export function planActionFor(target: PaidTierId, current: CurrentPlan, availablePlans: AvailablePlan[], now: Date): PlanAction {
    const targetName = planName(target, availablePlans);

    if (current.plan === target) {
        const expiresAt = current.expiresAt ? new Date(current.expiresAt).getTime() : null;
        const inRenewalWindow = expiresAt !== null && expiresAt - now.getTime() <= RENEWAL_WINDOW_DAYS * DAY_MS;
        return inRenewalWindow ? { kind: "renew", label: `Renew ${targetName}` } : { kind: "current", label: "Current plan" };
    }

    if (current.pendingChange?.plan === target) {
        return { kind: "scheduled", label: `${targetName} scheduled` };
    }

    if (TIER_RANK[target] > TIER_RANK[current.plan]) {
        return { kind: "upgrade", label: current.plan === "free" ? "Upgrade" : `Upgrade to ${targetName}` };
    }
    return { kind: "downgrade", label: `Switch to ${targetName}` };
}

/** The explanation shown on the confirmation step, so the user knows exactly
 * what the payment will do before paying (rules from admin/lib/plan-rules.ts). */
export function purchaseExplanation(
    action: Extract<PlanAction, { kind: "upgrade" | "downgrade" | "renew" }>["kind"],
    target: PaidTierId,
    current: CurrentPlan,
    availablePlans: AvailablePlan[]
): string {
    const targetName = planName(target, availablePlans);
    const currentName = planName(current.plan, availablePlans);
    const until = current.expiresAt ? ` on ${formatLongDate(current.expiresAt)}` : "";

    switch (action) {
        case "upgrade":
            return current.plan === "free"
                ? `Your ${targetName} access begins after successful payment and lasts one month.`
                : `${targetName} starts as soon as your payment is confirmed and lasts one month. ` +
                      `Your remaining ${currentName} time is not refunded or credited.`;
        case "downgrade":
            return `${targetName} will begin after your current ${currentName} period ends${until}. You keep ${currentName} until then.`;
        case "renew":
            return `Adds one month to your ${targetName} plan, starting when the current period ends${until}.`;
    }
}
