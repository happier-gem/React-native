import { Pressable, ScrollView, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { daysUntil, formatDaysUntil } from "@/constants/data";
import { useSubscriptions } from "@/context/subscriptions-context";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";

const RENEWAL_WINDOW_DAYS = 7;

const BackLink = () => (
  <Link href="/home" asChild>
    <Pressable className="mb-6">
      <ThemedText tone="accent" className="font-semibold">
        {"< Back"}
      </ThemedText>
    </Pressable>
  </Link>
);

const Notifications = () => {
  const { activeSubscriptions, subscriptions } = useSubscriptions();
  const { format } = useCurrency();
  const { colors, accent } = useAppTheme();

  const renewingSoon = activeSubscriptions
    .map((sub) => ({ sub, days: daysUntil(sub.renewalDate) }))
    .filter(({ days }) => days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  const canceled = subscriptions.filter((sub) => sub.status === "canceled");

  const hasNotifications = renewingSoon.length > 0 || canceled.length > 0;

  return (
    <ThemedSafeAreaView>
      <View className="flex-1 px-5 pt-5">
      <BackLink />
      <ThemedText className="text-3xl font-extrabold mb-5">
        Notifications
      </ThemedText>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        {!hasNotifications ? (
          <View className="items-center mt-16">
            <Ionicons name="notifications-outline" size={40} color={colors.mutedForeground} />
            <ThemedText tone="muted" className="text-sm mt-3">
              You're all caught up.
            </ThemedText>
          </View>
        ) : null}

        {renewingSoon.length > 0 ? (
          <>
            <ThemedText tone="muted" className="text-sm font-semibold mb-3">
              Renewing soon
            </ThemedText>
            {renewingSoon.map(({ sub, days }) => (
              <Link
                key={sub.id}
                href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
                asChild
              >
                <Pressable>
                  <Card className="flex-row items-center rounded-2xl p-4 mb-3">
                    <View className="mr-4">
                      <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={40} />
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-base font-semibold">
                        {sub.name} renews {formatDaysUntil(days).toLowerCase()}
                      </ThemedText>
                      <ThemedText tone="muted" className="text-xs mt-0.5">
                        {format(sub.price)} {sub.cycle === "monthly" ? "/mo" : "/yr"} · charges to your account
                      </ThemedText>
                    </View>
                    <View
                      className="px-2 py-1 rounded-full"
                      style={{ backgroundColor: days <= 2 ? colors.destructive + "26" : accent + "26" }}
                    >
                      <ThemedText
                        tone={days <= 2 ? "foreground" : "accent"}
                        className="text-xs font-semibold"
                        style={days <= 2 ? { color: colors.destructive } : undefined}
                      >
                        {formatDaysUntil(days)}
                      </ThemedText>
                    </View>
                  </Card>
                </Pressable>
              </Link>
            ))}
          </>
        ) : null}

        {canceled.length > 0 ? (
          <>
            <ThemedText tone="muted" className="text-sm font-semibold mb-3 mt-2">
              Canceled subscriptions
            </ThemedText>
            {canceled.map((sub) => (
              <Link
                key={sub.id}
                href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
                asChild
              >
                <Pressable>
                  <Card className="flex-row items-center rounded-2xl p-4 mb-3">
                    <View className="mr-4">
                      <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={40} />
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-base font-semibold">
                        {sub.name} was canceled
                      </ThemedText>
                      <ThemedText tone="muted" className="text-xs mt-0.5">
                        Tap to renew and reactivate
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Card>
                </Pressable>
              </Link>
            ))}
          </>
        ) : null}
      </ScrollView>
      </View>
    </ThemedSafeAreaView>
  );
};

export default Notifications;
