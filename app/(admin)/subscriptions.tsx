import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import React, { useMemo, useState } from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatRenewalDate } from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import { Subscription, useSubscriptions } from "@/context/subscriptions-context";
import { AdminHeader } from "@/components/admin-header";
import { DemoBanner, EmptyState, SegmentedControl } from "@/components/admin-ui";

type StatusFilter = "all" | "active" | "canceled";
type CycleFilter = "all" | "monthly" | "yearly";

const SubscriptionRow = ({ item }: { item: Subscription }) => {
    const { format } = useCurrency();
    const { colors } = useAppTheme();
    const canceled = item.status === "canceled";
    return (
        <Link href={{ pathname: "/subscriptions/[id]", params: { id: item.id } }} asChild>
            <Pressable>
                <Card
                    className="flex-row items-center rounded-2xl p-4 mb-3"
                    style={{ opacity: canceled ? 0.6 : 1 }}
                >
                    <View className="mr-4">
                        <BrandIcon icon={item.icon} brandColor={item.brandColor} size={44} />
                    </View>
                    <View className="flex-1">
                        <View className="flex-row items-center">
                            <ThemedText className="text-base font-semibold">{item.name}</ThemedText>
                            {canceled ? (
                                <View
                                    className="ml-2 px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: colors.destructive + "26" }}
                                >
                                    <Text className="text-xs font-semibold text-destructive">Canceled</Text>
                                </View>
                            ) : null}
                        </View>
                        <ThemedText tone="muted" className="text-xs mt-0.5">
                            {item.category} ·{" "}
                            {canceled ? "Renew to reactivate" : `Renews ${formatRenewalDate(item.renewalDate)}`}
                        </ThemedText>
                    </View>
                    <View className="items-end">
                        <ThemedText className="text-base font-semibold">{format(item.price)}</ThemedText>
                        <ThemedText tone="muted" className="text-xs mt-0.5">
                            {item.cycle === "monthly" ? "/mo" : "/yr"}
                        </ThemedText>
                    </View>
                </Card>
            </Pressable>
        </Link>
    );
};

const AdminSubscriptions = () => {
    const { subscriptions } = useSubscriptions();
    const { colors } = useAppTheme();
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [cycleFilter, setCycleFilter] = useState<CycleFilter>("all");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return subscriptions.filter((sub) => {
            if (q && !sub.name.toLowerCase().includes(q) && !sub.category.toLowerCase().includes(q)) return false;
            if (statusFilter !== "all" && sub.status !== statusFilter) return false;
            if (cycleFilter !== "all" && sub.cycle !== cycleFilter) return false;
            return true;
        });
    }, [subscriptions, query, statusFilter, cycleFilter]);

    const header = (
        <View>
            <AdminHeader title="Subscriptions" subtitle="All subscription records on this account" />

            <DemoBanner message="This app has no backend yet, so subscriptions aren't tied to individual users — every subscription shown here belongs to your own account. A multi-user directory would require per-subscription ownership in a real database." />

            <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name or category"
                placeholderTextColor={colors.mutedForeground}
                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
                className="border rounded-2xl px-4 py-3.5 mb-3"
            />

            <View className="mb-3">
                <SegmentedControl
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                        { key: "all", label: "All" },
                        { key: "active", label: "Active" },
                        { key: "canceled", label: "Canceled" },
                    ]}
                />
            </View>
            <View className="mb-5">
                <SegmentedControl
                    value={cycleFilter}
                    onChange={setCycleFilter}
                    options={[
                        { key: "all", label: "Any cycle" },
                        { key: "monthly", label: "Monthly" },
                        { key: "yearly", label: "Yearly" },
                    ]}
                />
            </View>

            <ThemedText tone="muted" className="text-xs font-semibold mb-3">
                {filtered.length} of {subscriptions.length} subscriptions
            </ThemedText>
        </View>
    );

    return (
        <ThemedSafeAreaView>
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <SubscriptionRow item={item} />}
                ListHeaderComponent={header}
                ListEmptyComponent={
                    <EmptyState icon="search-outline" message="No subscriptions match your search or filters." />
                }
                showsVerticalScrollIndicator={false}
                className="px-5 pt-5"
                contentContainerStyle={{ paddingBottom: 120 }}
            />
        </ThemedSafeAreaView>
    );
};

export default AdminSubscriptions;
