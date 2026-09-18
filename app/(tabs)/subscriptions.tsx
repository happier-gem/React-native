import { FlatList, Pressable, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { formatRenewalDate } from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import { Subscription, useSubscriptions } from "@/context/subscriptions-context";

const SubscriptionRow = ({ item }: { item: Subscription }) => {
  const { format } = useCurrency();
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
              {format(item.price)}
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

const ListHeader = () => {
  const { format } = useCurrency();
  const { activeSubscriptions, totalMonthlySpend } = useSubscriptions();
  return (
    <View>
      <ThemedText className="text-3xl font-extrabold mb-5">
        Subscriptions
      </ThemedText>

      <View className="bg-primary rounded-2xl p-5 mb-5">
        <Text className="text-sm text-white/70">Monthly total</Text>
        <Text className="text-3xl font-extrabold text-white mt-1">
          {format(totalMonthlySpend)}
        </Text>
        <Text className="text-xs text-white/70 mt-1">
          Across {activeSubscriptions.length} active subscriptions
        </Text>
      </View>
    </View>
  );
};

const Subscriptions = () => {
  const { subscriptions } = useSubscriptions();

  return (
    <ThemedSafeAreaView>
      <FlatList
        data={subscriptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SubscriptionRow item={item} />}
        ListHeaderComponent={ListHeader}
        showsVerticalScrollIndicator={false}
        className="px-5 pt-5"
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </ThemedSafeAreaView>
  );
};

export default Subscriptions;
