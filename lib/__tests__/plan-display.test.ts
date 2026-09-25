import type { AvailablePlan, CurrentPlan } from "@/context/plan-context";
import {
    describeCurrentPlan,
    formatPlanPrice,
    planActionFor,
    purchasablePlans,
    purchaseExplanation,
    settingsPlanSummary,
} from "@/lib/plan-display";

// Exactly what GET /api/me/plan returns today.
const PLANS: AvailablePlan[] = [
    { id: "free", name: "Free", price: 0, currency: "MWK", interval: null },
    { id: "starter", name: "Starter", price: 2000, currency: "MWK", interval: "monthly" },
    { id: "pro", name: "Pro", price: 5000, currency: "MWK", interval: "monthly" },
];

const NOW = new Date("2026-09-25T10:00:00.000Z");

const free: CurrentPlan = {
    plan: "free", status: "ACTIVE", isActive: true, startedAt: null, expiresAt: null, pendingChange: null, endedPlan: null,
};
const paid = (plan: "starter" | "pro", expiresAt = "2026-10-25T10:00:00.000Z"): CurrentPlan => ({
    plan, status: "ACTIVE", isActive: true, startedAt: "2026-09-25T10:00:00.000Z", expiresAt, pendingChange: null, endedPlan: null,
});

describe("prices come from the server list", () => {
    it("formats '2,000 MWK / month' and '5,000 MWK / month'", () => {
        const [starter, pro] = purchasablePlans(PLANS);
        expect(formatPlanPrice(starter)).toBe("2,000 MWK / month");
        expect(formatPlanPrice(pro)).toBe("5,000 MWK / month");
    });

    it("shows whatever price the server sends — nothing is hard-coded", () => {
        const repriced = PLANS.map((p) => (p.id === "pro" ? { ...p, price: 7500 } : p));
        expect(formatPlanPrice(purchasablePlans(repriced)[1])).toBe("7,500 MWK / month");
    });

    it("never offers FREE for purchase", () => {
        expect(purchasablePlans(PLANS).map((p) => p.id)).toEqual(["starter", "pro"]);
    });
});

describe("plan display", () => {
    it("Free", () => {
        expect(describeCurrentPlan(free, PLANS)).toEqual({ title: "Free", lines: ["Choose a plan below to unlock more features."] });
        expect(settingsPlanSummary(free, PLANS)).toBe("Free · Upgrade");
        expect(planActionFor("starter", free, PLANS, NOW)).toEqual({ kind: "upgrade", label: "Upgrade" });
        expect(planActionFor("pro", free, PLANS, NOW)).toEqual({ kind: "upgrade", label: "Upgrade" });
    });

    it("Starter", () => {
        const current = paid("starter");
        expect(describeCurrentPlan(current, PLANS)).toEqual({ title: "Starter", lines: ["Active until 25 October 2026"] });
        expect(settingsPlanSummary(current, PLANS)).toBe("Starter · Active until 25 Oct");
        // Already on Starter with plenty of time left: nothing to buy.
        expect(planActionFor("starter", current, PLANS, NOW)).toEqual({ kind: "current", label: "Current plan" });
        expect(planActionFor("pro", current, PLANS, NOW)).toEqual({ kind: "upgrade", label: "Upgrade to Pro" });
    });

    it("Pro — no unnecessary Pro purchase; Starter is a queued switch", () => {
        const current = paid("pro");
        expect(describeCurrentPlan(current, PLANS).title).toBe("Pro");
        expect(settingsPlanSummary(current, PLANS)).toBe("Pro · Active until 25 Oct");
        expect(planActionFor("pro", current, PLANS, NOW)).toEqual({ kind: "current", label: "Current plan" });
        expect(planActionFor("starter", current, PLANS, NOW)).toEqual({ kind: "downgrade", label: "Switch to Starter" });
    });

    it("Pro with a queued Starter shows it as scheduled, not as current", () => {
        const current: CurrentPlan = {
            ...paid("pro"),
            pendingChange: { plan: "starter", startsAt: "2026-10-25T10:00:00.000Z", expiresAt: "2026-11-25T10:00:00.000Z" },
        };
        const header = describeCurrentPlan(current, PLANS);
        expect(header.title).toBe("Pro");
        expect(header.lines).toEqual([
            "Active until 25 October 2026",
            "Starter scheduled — starts after your Pro plan ends, and runs until 25 November 2026.",
        ]);
        expect(planActionFor("starter", current, PLANS, NOW)).toEqual({ kind: "scheduled", label: "Starter scheduled" });
    });

    it("expired plan: shows Free and when the paid plan ended", () => {
        const expired: CurrentPlan = { ...free, endedPlan: { plan: "pro", endedAt: "2026-09-01T10:00:00.000Z" } };
        expect(describeCurrentPlan(expired, PLANS)).toEqual({
            title: "Free",
            lines: ["Your Pro plan ended on 1 September 2026.", "Choose a plan below to unlock more features."],
        });
        expect(settingsPlanSummary(expired, PLANS)).toBe("Free · Upgrade");
        expect(planActionFor("pro", expired, PLANS, NOW).kind).toBe("upgrade");
    });

    it("offers renewal of the current plan only in the last days before it ends", () => {
        const endingSoon = paid("pro", "2026-09-30T10:00:00.000Z");
        expect(planActionFor("pro", endingSoon, PLANS, NOW)).toEqual({ kind: "renew", label: "Renew Pro" });
    });

    it("no plan loaded yet", () => {
        expect(settingsPlanSummary(null, PLANS)).toBe("—");
    });
});

describe("explanations shown before paying", () => {
    it("Starter -> Pro: immediate, no proration or credit", () => {
        expect(purchaseExplanation("upgrade", "pro", paid("starter"), PLANS)).toBe(
            "Pro starts as soon as your payment is confirmed and lasts one month. Your remaining Starter time is not refunded or credited."
        );
    });

    it("Pro -> Starter: begins after the current Pro period", () => {
        expect(purchaseExplanation("downgrade", "starter", paid("pro"), PLANS)).toBe(
            "Starter will begin after your current Pro period ends on 25 October 2026. You keep Pro until then."
        );
    });

    it("Free -> paid", () => {
        expect(purchaseExplanation("upgrade", "pro", free, PLANS)).toBe(
            "Your Pro access begins after successful payment and lasts one month."
        );
    });
});
