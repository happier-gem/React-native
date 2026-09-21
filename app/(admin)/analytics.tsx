import { ScrollView, Text, View } from "react-native";
import React from "react";
import { useAppTheme } from "@/context/theme-context";
import { formatMoney } from "@/constants/data";
import { monthlyEquivalent, useSubscriptions } from "@/context/subscriptions-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { AdminHeader } from "@/components/admin-header";
import { DemoBanner, EmptyState, StatCard } from "@/components/admin-ui";

const DEMO_TOTAL_USERS = 128;
const DEMO_ACTIVE_USERS = 94;

const AdminAnalytics = () => {
    const { colors, accent } = useAppTheme();
    const { subscriptions, activeSubscriptions, spendByCurrency } = useSubscriptions();

    const canceledCount = subscriptions.length - activeSubscriptions.length;
    const activePct = subscriptions.length > 0 ? (activeSubscriptions.length / subscriptions.length) * 100 : 0;

    const ranked = [...activeSubscriptions].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
    const maxMonthly = Math.max(0, ...ranked.map(monthlyEquivalent));

    return (
        <ThemedSafeAreaView>
            <ScrollView
                className="px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <AdminHeader title="Analytics" subtitle="Live subscription data + illustrative user metrics" />

                <View className="flex-row mb-3" style={{ gap: 12 }}>
                    <View className="flex-1">
                        <StatCard label="Total users" value={String(DEMO_TOTAL_USERS)} icon="people-outline" caption="Demo data" />
                    </View>
                    <View className="flex-1">
                        <StatCard label="Active users" value={String(DEMO_ACTIVE_USERS)} icon="pulse-outline" caption="Demo data" />
                    </View>
                </View>

                {spendByCurrency.length === 0 ? (
                    <ThemedText tone="muted" className="text-sm mb-6">No active subscriptions to calculate spend from yet.</ThemedText>
                ) : (
                    <View className="mb-6" style={{ gap: 12 }}>
                        {spendByCurrency.map((row) => (
                            <View key={row.currency} className="flex-row" style={{ gap: 12 }}>
                                <Card className="flex-1 rounded-2xl p-4">
                                    <ThemedText tone="muted" className="text-xs">{row.currency} monthly</ThemedText>
                                    <ThemedText className="text-2xl font-extrabold mt-1">{formatMoney(row.monthly, row.currency)}</ThemedText>
                                </Card>
                                <Card className="flex-1 rounded-2xl p-4">
                                    <ThemedText tone="muted" className="text-xs">{row.currency} yearly</ThemedText>
                                    <ThemedText className="text-2xl font-extrabold mt-1">{formatMoney(row.yearly, row.currency)}</ThemedText>
                                </Card>
                            </View>
                        ))}
                    </View>
                )}

                <ThemedText tone="muted" className="text-sm font-semibold mb-3">
                    Subscription status breakdown
                </ThemedText>
                <Card className="rounded-2xl p-4 mb-6">
                    <View
                        style={{ backgroundColor: colors.muted }}
                        className="h-3 rounded-full overflow-hidden flex-row"
                    >
                        <View style={{ width: `${activePct}%`, backgroundColor: accent }} />
                        <View style={{ width: `${100 - activePct}%`, backgroundColor: colors.destructive }} />
                    </View>
                    <View className="flex-row justify-between mt-3">
                        <View className="flex-row items-center">
                            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: accent }} />
                            <ThemedText tone="muted" className="text-xs">
                                Active ({activeSubscriptions.length})
                            </ThemedText>
                        </View>
                        <View className="flex-row items-center">
                            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: colors.destructive }} />
                            <ThemedText tone="muted" className="text-xs">
                                Canceled ({canceledCount})
                            </ThemedText>
                        </View>
                    </View>
                </Card>

                <ThemedText tone="muted" className="text-sm font-semibold mb-3">
                    Spending by subscription
                </ThemedText>
                {ranked.length === 0 ? (
                    <ThemedText tone="muted" className="text-sm mb-6">No active subscriptions.</ThemedText>
                ) : (
                    <View className="mb-6">
                        {ranked.map((sub) => {
                            const monthly = monthlyEquivalent(sub);
                            const widthPct = maxMonthly > 0 ? (monthly / maxMonthly) * 100 : 0;
                            return (
                                <View key={sub.id} className="mb-4">
                                    <View className="flex-row items-center mb-1.5">
                                        <View className="mr-2">
                                            <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={20} />
                                        </View>
                                        <ThemedText className="flex-1 text-sm font-medium">{sub.name}</ThemedText>
                                        <ThemedText className="text-sm font-semibold">
                                            {formatMoney(monthly, sub.currency)}
                                            <Text style={{ color: colors.mutedForeground }} className="text-xs">/mo</Text>
                                        </ThemedText>
                                    </View>
                                    <View style={{ backgroundColor: colors.muted }} className="h-2 rounded-full overflow-hidden">
                                        <View style={{ width: `${widthPct}%`, backgroundColor: accent }} className="h-2 rounded-full" />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                <ThemedText tone="muted" className="text-sm font-semibold mb-3">
                    Renewal trends
                </ThemedText>
                <EmptyState
                    icon="trending-up-outline"
                    message="Not enough historical data yet. Renewal trends will appear once subscription history is tracked over time."
                />

                <View style={{ height: 8 }} />
                <DemoBanner message="Total/active user figures above are demo placeholders — this app has no backend to count real registered users. Every other number on this screen is computed live from your actual subscription data." />
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default AdminAnalytics;
