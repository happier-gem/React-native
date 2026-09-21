import { Pressable, ScrollView, View } from "react-native";
import React, { useMemo } from "react";
import { Link } from "expo-router";
import { formatDaysUntil } from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import { useSubscriptionAlerts } from "@/hooks/use-subscription-alerts";
import { useReadNotifications } from "@/hooks/use-read-notifications";
import { AdminHeader } from "@/components/admin-header";
import { EmptyState } from "@/components/admin-ui";

const AdminNotifications = () => {
    const { format } = useCurrency();
    const { colors, accent } = useAppTheme();
    const { renewingSoon, canceled, hasAlerts } = useSubscriptionAlerts();
    const { isRead, markRead, markAllRead } = useReadNotifications();

    const renewalKeys = renewingSoon.map(({ sub }) => `renewal-${sub.id}`);
    const canceledKeys = canceled.map((sub) => `canceled-${sub.id}`);
    const allKeys = [...renewalKeys, ...canceledKeys];
    const unreadCount = allKeys.filter((key) => !isRead(key)).length;

    const UnreadDot = ({ read }: { read: boolean }) =>
        read ? null : (
            <View
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: accent }}
            />
        );

    return (
        <ThemedSafeAreaView>
            <ScrollView
                className="px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <AdminHeader
                    title="Alerts"
                    subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
                />

                {allKeys.length > 0 ? (
                    <Pressable onPress={() => markAllRead(allKeys)} className="self-end mb-4">
                        <ThemedText tone="accent" className="text-sm font-semibold">
                            Mark all as read
                        </ThemedText>
                    </Pressable>
                ) : null}

                {!hasAlerts ? (
                    <EmptyState icon="checkmark-done-outline" message="No renewal or cancellation alerts right now." />
                ) : null}

                {renewingSoon.length > 0 ? (
                    <>
                        <ThemedText tone="muted" className="text-sm font-semibold mb-3">
                            Renewing soon
                        </ThemedText>
                        {renewingSoon.map(({ sub, days }) => {
                            const key = `renewal-${sub.id}`;
                            const read = isRead(key);
                            return (
                                <Link
                                    key={key}
                                    href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
                                    asChild
                                >
                                    <Pressable onPress={() => markRead(key)}>
                                        <Card
                                            className="flex-row items-center rounded-2xl p-4 mb-3"
                                            style={{ opacity: read ? 0.65 : 1 }}
                                        >
                                            <UnreadDot read={read} />
                                            <View className="mr-4">
                                                <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={40} />
                                            </View>
                                            <View className="flex-1">
                                                <ThemedText className="text-base font-semibold">
                                                    {sub.name} renews {formatDaysUntil(days).toLowerCase()}
                                                </ThemedText>
                                                <ThemedText tone="muted" className="text-xs mt-0.5">
                                                    {format(sub.price)} {sub.cycle === "monthly" ? "/mo" : "/yr"}
                                                </ThemedText>
                                            </View>
                                        </Card>
                                    </Pressable>
                                </Link>
                            );
                        })}
                    </>
                ) : null}

                {canceled.length > 0 ? (
                    <>
                        <ThemedText tone="muted" className="text-sm font-semibold mb-3 mt-2">
                            Canceled subscriptions
                        </ThemedText>
                        {canceled.map((sub) => {
                            const key = `canceled-${sub.id}`;
                            const read = isRead(key);
                            return (
                                <Link
                                    key={key}
                                    href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
                                    asChild
                                >
                                    <Pressable onPress={() => markRead(key)}>
                                        <Card
                                            className="flex-row items-center rounded-2xl p-4 mb-3"
                                            style={{ opacity: read ? 0.65 : 1 }}
                                        >
                                            <UnreadDot read={read} />
                                            <View className="mr-4">
                                                <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={40} />
                                            </View>
                                            <View className="flex-1">
                                                <ThemedText className="text-base font-semibold">
                                                    {sub.name} was canceled
                                                </ThemedText>
                                                <ThemedText tone="muted" className="text-xs mt-0.5">
                                                    Tap to view details
                                                </ThemedText>
                                            </View>
                                        </Card>
                                    </Pressable>
                                </Link>
                            );
                        })}
                    </>
                ) : null}
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default AdminNotifications;
