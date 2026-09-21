import { Pressable, ScrollView, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { formatRenewalDate } from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAccount } from "@/context/account-context";
import { useSubscriptions } from "@/context/subscriptions-context";
import { AdminHeader } from "@/components/admin-header";
import { DemoBanner, DemoTag, StatCard } from "@/components/admin-ui";

// This app has no backend, so there is no way to count real registered users
// from the client. These two numbers are illustrative placeholders only.
const DEMO_TOTAL_USERS = 128;
const DEMO_ACTIVE_USERS = 94;

const AdminOverview = () => {
    const { format } = useCurrency();
    const { account } = useAccount();
    const { subscriptions, activeSubscriptions, totalMonthlySpend } = useSubscriptions();

    const canceledCount = subscriptions.length - activeSubscriptions.length;

    const upcoming = [...activeSubscriptions]
        .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))
        .slice(0, 3);

    return (
        <ThemedSafeAreaView>
            <ScrollView
                className="px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <AdminHeader title="Overview" subtitle={`Welcome back, ${account.name}`} />

                <DemoBanner message="This app has no backend yet, so there's no real user directory or cross-account revenue to report. User counts below are clearly-marked demo numbers; subscription figures are computed live from this account's real data." />

                <View className="flex-row mb-3" style={{ gap: 12 }}>
                    <View className="flex-1">
                        <StatCard label="Total users" value={String(DEMO_TOTAL_USERS)} icon="people-outline" caption="Demo data" />
                    </View>
                    <View className="flex-1">
                        <StatCard label="Active users" value={String(DEMO_ACTIVE_USERS)} icon="pulse-outline" caption="Demo data" />
                    </View>
                </View>

                <View className="flex-row mb-3" style={{ gap: 12 }}>
                    <View className="flex-1">
                        <StatCard label="Total subscriptions" value={String(subscriptions.length)} icon="card-outline" />
                    </View>
                    <View className="flex-1">
                        <StatCard label="Active subscriptions" value={String(activeSubscriptions.length)} icon="checkmark-circle-outline" />
                    </View>
                </View>

                <View className="flex-row mb-6" style={{ gap: 12 }}>
                    <View className="flex-1">
                        <StatCard label="Canceled subscriptions" value={String(canceledCount)} icon="close-circle-outline" />
                    </View>
                    <View className="flex-1">
                        <StatCard
                            label="Est. monthly revenue"
                            value={format(totalMonthlySpend)}
                            icon="cash-outline"
                            caption="This account's spend"
                        />
                    </View>
                </View>

                <ThemedText tone="muted" className="text-sm font-semibold mb-3">
                    Upcoming renewals
                </ThemedText>
                {upcoming.length === 0 ? (
                    <ThemedText tone="muted" className="text-sm mb-6">
                        No active subscriptions.
                    </ThemedText>
                ) : (
                    <View className="mb-6">
                        {upcoming.map((sub) => (
                            <Link key={sub.id} href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }} asChild>
                                <Pressable>
                                    <Card className="flex-row items-center rounded-2xl p-4 mb-3">
                                        <View className="mr-4">
                                            <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={40} />
                                        </View>
                                        <View className="flex-1">
                                            <ThemedText className="text-base font-semibold">{sub.name}</ThemedText>
                                            <ThemedText tone="muted" className="text-xs mt-0.5">
                                                Renews {formatRenewalDate(sub.renewalDate)}
                                            </ThemedText>
                                        </View>
                                        <ThemedText className="text-base font-semibold">{format(sub.price)}</ThemedText>
                                    </Card>
                                </Pressable>
                            </Link>
                        ))}
                    </View>
                )}

                <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
                    <ThemedText tone="muted" className="text-sm font-semibold">
                        Recently registered users
                    </ThemedText>
                    <DemoTag />
                </View>
                <Card className="rounded-2xl p-4 mb-6">
                    <View className="flex-row items-center">
                        <View className="flex-1">
                            <ThemedText className="text-base font-semibold">{account.name}</ThemedText>
                            <ThemedText tone="muted" className="text-xs mt-0.5">{account.email} · you</ThemedText>
                        </View>
                    </View>
                    <ThemedText tone="muted" className="text-xs mt-3">
                        A real signup feed needs a backend with Clerk&apos;s Backend API — this app only knows about the current
                        signed-in account.
                    </ThemedText>
                </Card>
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default AdminOverview;
