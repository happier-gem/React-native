import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { useAppTheme } from "@/context/theme-context";
import { usePlan, type AvailablePlan, type CurrentPlan, type PaidTierId } from "@/context/plan-context";
import { usePaymentCheckout } from "@/hooks/use-payment-checkout";
import { CheckoutSheet, type CheckoutSelection } from "@/components/plans/checkout-sheet";
import {
    describeCurrentPlan,
    formatPlanPrice,
    PLAN_FEATURES,
    planActionFor,
    purchasablePlans,
    purchaseExplanation,
} from "@/lib/plan-display";

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings"));

function CurrentPlanCard({ current, availablePlans }: { current: CurrentPlan; availablePlans: AvailablePlan[] }) {
    const { accent } = useAppTheme();
    const header = describeCurrentPlan(current, availablePlans);
    return (
        <View className="rounded-2xl p-5 mb-6" style={{ backgroundColor: accent }} testID="current-plan-card">
            <ThemedText tone="white" className="text-sm font-semibold opacity-80">
                Your Plan
            </ThemedText>
            <ThemedText tone="white" className="text-3xl font-extrabold mt-1 uppercase" testID="current-plan-name">
                {header.title}
            </ThemedText>
            {header.lines.map((line) => (
                <ThemedText key={line} tone="white" className="text-sm mt-2">
                    {line}
                </ThemedText>
            ))}
        </View>
    );
}

function PlanCard({
    plan,
    current,
    availablePlans,
    disabled,
    onSelect,
}: {
    plan: AvailablePlan & { id: PaidTierId };
    current: CurrentPlan;
    availablePlans: AvailablePlan[];
    disabled: boolean;
    onSelect: (selection: CheckoutSelection) => void;
}) {
    const { colors, accent } = useAppTheme();
    const action = planActionFor(plan.id, current, availablePlans, new Date());
    const isCurrent = current.plan === plan.id;
    const features = PLAN_FEATURES[plan.id];
    const purchasable = action.kind === "upgrade" || action.kind === "downgrade" || action.kind === "renew";

    return (
        <Card
            className="rounded-2xl p-5 mb-4"
            style={{ borderWidth: 2, borderColor: isCurrent ? accent : "transparent" }}
            testID={`plan-card-${plan.id}`}
        >
            <View className="flex-row items-center justify-between">
                <ThemedText className="text-xl font-bold">{plan.name}</ThemedText>
                {isCurrent ? (
                    <View
                        className="flex-row items-center px-3 py-1 rounded-full"
                        style={{ backgroundColor: accent + "26" }}
                        accessibilityLabel="Your current plan"
                    >
                        <Ionicons name="checkmark-circle" size={14} color={accent} style={{ marginRight: 4 }} />
                        <ThemedText tone="accent" className="text-xs font-semibold">
                            Current plan
                        </ThemedText>
                    </View>
                ) : null}
            </View>
            <ThemedText className="text-lg font-semibold mt-2">{formatPlanPrice(plan)}</ThemedText>

            {features.length > 0 ? (
                <View className="mt-3">
                    {features.map((feature) => (
                        <View key={feature} className="flex-row items-center mt-1">
                            <Ionicons name="checkmark" size={16} color={colors.success} style={{ marginRight: 6 }} />
                            <ThemedText className="text-sm">{feature}</ThemedText>
                        </View>
                    ))}
                </View>
            ) : null}

            {action.kind === "scheduled" ? (
                <View className="flex-row items-center mt-4">
                    <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} style={{ marginRight: 6 }} />
                    <ThemedText tone="muted" className="text-sm flex-1">
                        {action.label} — starts after your current plan ends.
                    </ThemedText>
                </View>
            ) : null}

            {purchasable ? (
                <Pressable
                    testID={`plan-action-${plan.id}`}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={`${action.label}, ${formatPlanPrice(plan)}`}
                    accessibilityState={{ disabled }}
                    onPress={() =>
                        onSelect({
                            plan,
                            action: action.kind,
                            explanation: purchaseExplanation(action.kind, plan.id, current, availablePlans),
                        })
                    }
                    style={{
                        opacity: disabled ? 0.6 : 1,
                        backgroundColor: action.kind === "downgrade" ? "transparent" : accent,
                        borderWidth: action.kind === "downgrade" ? 1 : 0,
                        borderColor: accent,
                    }}
                    className="rounded-2xl p-3.5 items-center mt-4"
                >
                    {action.kind === "downgrade" ? (
                        <ThemedText tone="accent" className="text-base font-semibold">
                            {action.label}
                        </ThemedText>
                    ) : (
                        <Text className="text-base font-semibold text-white">{action.label}</Text>
                    )}
                </Pressable>
            ) : null}
        </Card>
    );
}

export default function PlansScreen() {
    const { colors } = useAppTheme();
    const { currentPlan, availablePlans, loading, error, refresh } = usePlan();
    const { state, checkout } = usePaymentCheckout();
    const [selection, setSelection] = useState<CheckoutSelection | null>(null);
    const [sheetVisible, setSheetVisible] = useState(false);

    // Always show the server's current answer when this screen comes into view
    // (e.g. after paying outside the app and coming back).
    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    // A remembered payment resumed on open, or a result arriving while the
    // sheet was closed, brings the sheet back so the user sees the outcome.
    useEffect(() => {
        if (state.phase !== "idle" && state.phase !== "confirming_plan") setSheetVisible(true);
    }, [state.phase]);

    const inFlight = state.phase === "starting" || state.phase === "pending" || state.phase === "confirming_plan";

    const closeSheet = () => {
        setSheetVisible(false);
        // A pending payment keeps polling while this screen is open; anything
        // else returns to a clean slate.
        if (state.phase !== "pending") {
            checkout.reset();
            setSelection(null);
        }
    };

    const paidPlans = purchasablePlans(availablePlans);

    return (
        <ThemedSafeAreaView>
            <View className="flex-row items-center px-5 pt-5 pb-2">
                <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" className="mr-3">
                    <ThemedText tone="accent" className="font-semibold">
                        {"< Back"}
                    </ThemedText>
                </Pressable>
            </View>
            <ThemedText className="text-3xl font-extrabold px-5 pb-4">Plans</ThemedText>

            <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
                {!currentPlan && loading ? (
                    <View className="items-center py-16" accessibilityLabel="Loading your plan">
                        <ActivityIndicator color={colors.foreground} />
                        <ThemedText tone="muted" className="mt-3">
                            Loading your plan...
                        </ThemedText>
                    </View>
                ) : !currentPlan ? (
                    <Card className="rounded-2xl p-5 items-center">
                        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
                        <ThemedText className="text-base font-semibold mt-3 text-center">Couldn&apos;t load your plan</ThemedText>
                        <ThemedText tone="muted" className="text-sm mt-1 text-center">
                            {error ?? "Please try again."}
                        </ThemedText>
                        <Pressable
                            onPress={() => refresh()}
                            accessibilityRole="button"
                            accessibilityLabel="Try again"
                            className="mt-4 px-5 py-2.5 rounded-2xl bg-primary"
                        >
                            <Text className="text-base font-semibold text-white">Try again</Text>
                        </Pressable>
                    </Card>
                ) : (
                    <>
                        <CurrentPlanCard current={currentPlan} availablePlans={availablePlans} />

                        {state.phase === "pending" && !sheetVisible ? (
                            <Pressable
                                onPress={() => setSheetVisible(true)}
                                accessibilityRole="button"
                                accessibilityLabel="Payment pending. View payment status"
                                className="flex-row items-center rounded-2xl p-4 mb-4"
                                style={{ borderWidth: 1, borderColor: colors.border }}
                            >
                                <ActivityIndicator color={colors.mutedForeground} style={{ marginRight: 10 }} />
                                <ThemedText className="flex-1">Payment pending — checking for confirmation</ThemedText>
                                <ThemedText tone="accent" className="font-semibold">
                                    View
                                </ThemedText>
                            </Pressable>
                        ) : null}

                        {error ? (
                            <ThemedText tone="muted" className="text-sm mb-4">
                                Couldn&apos;t refresh your plan: {error}
                            </ThemedText>
                        ) : null}

                        <ThemedText tone="muted" className="text-sm font-semibold mb-2">
                            Available plans
                        </ThemedText>
                        {paidPlans.map((plan) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                current={currentPlan}
                                availablePlans={availablePlans}
                                disabled={inFlight}
                                onSelect={(next) => {
                                    setSelection(next);
                                    setSheetVisible(true);
                                }}
                            />
                        ))}
                        <ThemedText tone="muted" className="text-xs mt-2">
                            Prices are set by our server and charged in MWK. Plans last one month and don&apos;t renew
                            automatically.
                        </ThemedText>
                    </>
                )}
            </ScrollView>

            <CheckoutSheet
                visible={sheetVisible}
                selection={selection}
                state={state}
                availablePlans={availablePlans}
                onStart={(input) => {
                    void checkout.start(input);
                }}
                onCheckAgain={() => checkout.checkAgain()}
                onRetry={() => {
                    checkout.reset();
                    // A payment resumed after a restart has no selection to
                    // return to — let the user pick a plan again instead.
                    if (!selection) setSheetVisible(false);
                }}
                onDone={() => {
                    checkout.reset();
                    setSheetVisible(false);
                    setSelection(null);
                    goBack();
                }}
                onClose={closeSheet}
            />
        </ThemedSafeAreaView>
    );
}
