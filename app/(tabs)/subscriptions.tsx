import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import React, { useState } from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, formatRenewalDate } from "@/constants/data";
import { BRAND_PRESETS } from "@/constants/brand-presets";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useAppTheme } from "@/context/theme-context";
import { NewSubscriptionInput, Subscription, useSubscriptions } from "@/context/subscriptions-context";

const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const SAMPLE_SUBSCRIPTIONS: NewSubscriptionInput[] = [
  { name: "Spotify", icon: "spotify", brandColor: BRAND_PRESETS[0].brandColor, price: 11.99, currency: "USD", cycle: "monthly", category: "Music", renewalDate: daysFromNow(10) },
  { name: "Claude Max", icon: "claude", brandColor: BRAND_PRESETS[1].brandColor, price: 100, currency: "USD", cycle: "monthly", category: "AI", renewalDate: daysFromNow(14) },
  { name: "Figma", icon: "figma", brandColor: BRAND_PRESETS[2].brandColor, price: 15, currency: "USD", cycle: "monthly", category: "Design", renewalDate: daysFromNow(27) },
  { name: "Adobe Creative Cloud", icon: "adobe", brandColor: BRAND_PRESETS[3].brandColor, price: 59.99, currency: "USD", cycle: "monthly", category: "Design", renewalDate: daysFromNow(18) },
  { name: "Notion", icon: "notion", brandColor: BRAND_PRESETS[4].brandColor, price: 96, currency: "USD", cycle: "yearly", category: "Productivity", renewalDate: daysFromNow(160) },
  { name: "GitHub Pro", icon: "github", brandColor: BRAND_PRESETS[5].brandColor, price: 4, currency: "USD", cycle: "monthly", category: "Developer Tools", renewalDate: daysFromNow(31) },
];

const SubscriptionRow = ({ item }: { item: Subscription }) => {
  const { colors } = useAppTheme();
  const canceled = item.status === "canceled";
  return (
    <Link
      href={{ pathname: "/subscriptions/[id]", params: { id: item.id } }}
      asChild
    >
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
              <ThemedText className="text-base font-semibold">
                {item.name}
              </ThemedText>
              {canceled ? (
                <View
                  className="ml-2 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.destructive + "26" }}
                >
                  <Text className="text-xs font-semibold text-destructive">
                    Canceled
                  </Text>
                </View>
              ) : null}
            </View>
            <ThemedText tone="muted" className="text-xs mt-0.5">
              {item.category} ·{" "}
              {canceled
                ? "Renew to reactivate"
                : `Renews ${formatRenewalDate(item.renewalDate)}`}
            </ThemedText>
          </View>
          <View className="items-end">
            <ThemedText className="text-base font-semibold">
              {formatMoney(item.price, item.currency)}
            </ThemedText>
            <ThemedText tone="muted" className="text-xs mt-0.5">
              {item.cycle === "monthly" ? "/mo" : "/yr"}
            </ThemedText>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
};

const ListHeader = ({
  onTrySampleData,
  loadingSample,
}: {
  onTrySampleData: () => void;
  loadingSample: boolean;
}) => {
  const { activeSubscriptions, spendByCurrency, subscriptions, loading } = useSubscriptions();
  const { colors, accent } = useAppTheme();

  return (
    <View>
      {spendByCurrency.length > 0 ? (
        <View className="mb-5">
          {spendByCurrency.map((row) => (
            <View key={row.currency} className="mb-3">
              <View className="flex-row mb-3" style={{ gap: 12 }}>
                <View className="flex-1 rounded-2xl p-5" style={{ backgroundColor: colors.primary }}>
                  <Text className="text-sm text-white/70">Monthly{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</Text>
                  <Text className="text-2xl font-extrabold text-white mt-1">
                    {formatMoney(row.monthly, row.currency)}
                  </Text>
                </View>
                <View className="flex-1 rounded-2xl p-5" style={{ backgroundColor: accent }}>
                  <Text className="text-sm text-white/70">Yearly{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</Text>
                  <Text className="text-2xl font-extrabold text-white mt-1">
                    {formatMoney(row.yearly, row.currency)}
                  </Text>
                </View>
              </View>
              <Text className="text-xs" style={{ color: colors.mutedForeground }}>
                Across {activeSubscriptions.length} active subscription{activeSubscriptions.length === 1 ? "" : "s"}
              </Text>
            </View>
          ))}
        </View>
      ) : !loading && subscriptions.length === 0 ? (
        <Card className="rounded-2xl p-6 items-center mb-5">
          <Ionicons name="card-outline" size={32} color={colors.mutedForeground} />
          <ThemedText className="text-base font-semibold mt-3 text-center">
            No subscriptions yet
          </ThemedText>
          <ThemedText tone="muted" className="text-sm mt-1 mb-4 text-center">
            Tap + to add your first subscription, or try it out with sample data.
          </ThemedText>
          <Pressable onPress={onTrySampleData} disabled={loadingSample}>
            <ThemedText tone="accent" className="text-sm font-semibold">
              {loadingSample ? "Adding sample data..." : "Try with sample data"}
            </ThemedText>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
};

const Subscriptions = () => {
  const { subscriptions, loading, error, refresh, addSubscription } = useSubscriptions();
  const { colors } = useAppTheme();
  const [loadingSample, setLoadingSample] = useState(false);

  const handleTrySampleData = async () => {
    setLoadingSample(true);
    try {
      for (const sample of SAMPLE_SUBSCRIPTIONS) {
        await addSubscription(sample);
      }
    } finally {
      setLoadingSample(false);
    }
  };

  if (loading && subscriptions.length === 0) {
    return (
      <ThemedSafeAreaView>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.foreground} />
        </View>
      </ThemedSafeAreaView>
    );
  }

  if (error) {
    return (
      <ThemedSafeAreaView>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
          <ThemedText className="text-base font-semibold mt-3 text-center">
            Couldn&apos;t load subscriptions
          </ThemedText>
          <ThemedText tone="muted" className="text-sm mt-1 mb-4 text-center">{error}</ThemedText>
          <Pressable onPress={refresh} className="rounded-2xl bg-primary px-5 py-3">
            <Text className="text-white font-semibold">Try again</Text>
          </Pressable>
        </View>
      </ThemedSafeAreaView>
    );
  }

  return (
    <ThemedSafeAreaView>
      <View className="flex-row items-center justify-between px-5 pt-5 pb-2">
        <ThemedText className="text-3xl font-extrabold">
          Subscriptions
        </ThemedText>
        <Link href="/subscriptions/add" asChild>
          <Pressable
            className="w-10 h-10 rounded-full bg-primary items-center justify-center"
            accessibilityLabel="Add subscription"
          >
            <Ionicons name="add" size={22} color="#ffffff" />
          </Pressable>
        </Link>
      </View>
      <FlatList
        data={subscriptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SubscriptionRow item={item} />}
        ListHeaderComponent={
          <ListHeader onTrySampleData={handleTrySampleData} loadingSample={loadingSample} />
        }
        showsVerticalScrollIndicator={false}
        className="px-5"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 96 }}
      />
    </ThemedSafeAreaView>
  );
};

export default Subscriptions;
