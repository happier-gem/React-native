import { Pressable, ScrollView, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { daysUntil, formatRenewalDate } from "@/constants/data";
import { ThemedSafeAreaView, ThemedText, Card } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import { useSubscriptions } from "@/context/subscriptions-context";

const NOTIFICATION_WINDOW_DAYS = 7;

const Home = () => {
  const { format } = useCurrency();
  const { colors } = useAppTheme();
  const { activeSubscriptions, subscriptions, totalMonthlySpend } = useSubscriptions();

  const upcoming = [...activeSubscriptions]
    .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))
    .slice(0, 3);

  const notificationCount =
    activeSubscriptions.filter((sub) => daysUntil(sub.renewalDate) <= NOTIFICATION_WINDOW_DAYS).length +
    subscriptions.filter((sub) => sub.status === "canceled").length;

  return (
    <ThemedSafeAreaView>
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View className="flex-row items-center justify-between mb-5">
          <ThemedText className="text-3xl font-extrabold">
            Home
          </ThemedText>
          <Link href="/notifications" asChild>
            <Pressable style={{ padding: 4 }}>
              <View>
                <Ionicons name="notifications-outline" size={26} color={colors.foreground} />
                {notificationCount > 0 ? (
                  <View
                    className="absolute -top-1 -right-1 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.destructive, minWidth: 16, height: 16, paddingHorizontal: 3 }}
                  >
                    <Text className="text-white text-[10px] font-bold">
                      {notificationCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </Link>
        </View>

        <View className="bg-primary rounded-2xl p-5 mb-6">
          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-sm text-white/70">Monthly total</Text>
              <Text className="text-3xl font-extrabold text-white mt-1">
                {format(totalMonthlySpend)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-white/70">Yearly total</Text>
              <Text className="text-3xl font-extrabold text-white mt-1">
                {format(totalMonthlySpend * 12)}
              </Text>
            </View>
          </View>
          <Link href="/subscriptions" className="text-white/80 text-sm mt-3">
            View all subscriptions →
          </Link>
        </View>

        <ThemedText tone="muted" className="text-sm font-semibold mb-3">
          Upcoming renewals
        </ThemedText>

        {upcoming.length === 0 ? (
          <ThemedText tone="muted" className="text-sm">
            No active subscriptions.
          </ThemedText>
        ) : (
          upcoming.map((sub) => (
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
                      {sub.name}
                    </ThemedText>
                    <ThemedText tone="muted" className="text-xs mt-0.5">
                      Renews {formatRenewalDate(sub.renewalDate)}
                    </ThemedText>
                  </View>
                  <ThemedText className="text-base font-semibold">
                    {format(sub.price)}
                  </ThemedText>
                </Card>
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Home;
