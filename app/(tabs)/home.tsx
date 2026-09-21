import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { daysUntil, formatMoney, formatRenewalDate } from "@/constants/data";
import { ThemedSafeAreaView, ThemedText, Card } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useAppTheme } from "@/context/theme-context";
import { useSubscriptions } from "@/context/subscriptions-context";

const NOTIFICATION_WINDOW_DAYS = 7;

const Home = () => {
  const { colors } = useAppTheme();
  const { activeSubscriptions, subscriptions, spendByCurrency, loading, error, refresh } = useSubscriptions();

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

        {loading && subscriptions.length === 0 ? (
          <View className="items-center py-16">
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : error ? (
          <Card className="rounded-2xl p-5 mb-6">
            <ThemedText className="text-sm font-semibold mb-1">Couldn&apos;t load subscriptions</ThemedText>
            <ThemedText tone="muted" className="text-xs mb-3">{error}</ThemedText>
            <Pressable onPress={refresh}>
              <ThemedText tone="accent" className="text-sm font-semibold">Try again</ThemedText>
            </Pressable>
          </Card>
        ) : (
          <View className="mb-6">
            {spendByCurrency.length === 0 ? (
              <View className="bg-primary rounded-2xl p-5">
                <Text className="text-sm text-white/70">No active subscriptions yet</Text>
                <Link href="/subscriptions" className="text-white/80 text-sm mt-3">
                  Add your first subscription →
                </Link>
              </View>
            ) : (
              spendByCurrency.map((row) => (
                <View key={row.currency} className="bg-primary rounded-2xl p-5 mb-3">
                  <View className="flex-row">
                    <View className="flex-1">
                      <Text className="text-sm text-white/70">Monthly total{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</Text>
                      <Text className="text-3xl font-extrabold text-white mt-1">
                        {formatMoney(row.monthly, row.currency)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm text-white/70">Yearly total{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</Text>
                      <Text className="text-3xl font-extrabold text-white mt-1">
                        {formatMoney(row.yearly, row.currency)}
                      </Text>
                    </View>
                  </View>
                  <Link href="/subscriptions" className="text-white/80 text-sm mt-3">
                    View all subscriptions →
                  </Link>
                </View>
              ))
            )}
          </View>
        )}

        {!loading || subscriptions.length > 0 ? (
          <>
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
                        {formatMoney(sub.price, sub.currency)}
                      </ThemedText>
                    </Card>
                  </Pressable>
                </Link>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Home;
