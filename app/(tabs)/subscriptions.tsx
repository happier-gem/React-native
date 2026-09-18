import { FlatList, Image, Pressable, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  Subscription,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";

const SubscriptionRow = ({ item }: { item: Subscription }) => (
  <Link
    href={{ pathname: "/subscriptions/[id]", params: { id: item.id } }}
    asChild
  >
    <Pressable>
      <Card className="flex-row items-center rounded-2xl p-4 mb-3">
        <Image
          source={icons[item.icon]}
          resizeMode="contain"
          className="w-11 h-11 rounded-xl mr-4"
        />
        <View className="flex-1">
          <ThemedText className="text-base font-semibold">
            {item.name}
          </ThemedText>
          <ThemedText tone="muted" className="text-xs mt-0.5">
            {item.category} · Renews {formatRenewalDate(item.renewalDate)}
          </ThemedText>
        </View>
        <View className="items-end">
          <ThemedText className="text-base font-semibold">
            {formatCurrency(item.price)}
          </ThemedText>
          <ThemedText tone="muted" className="text-xs mt-0.5">
            {item.cycle === "monthly" ? "/mo" : "/yr"}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  </Link>
);

const ListHeader = () => (
  <View>
    <ThemedText className="text-3xl font-extrabold mb-5">
      Subscriptions
    </ThemedText>

    <View className="bg-primary rounded-2xl p-5 mb-5">
      <Text className="text-sm text-white/70">Monthly total</Text>
      <Text className="text-3xl font-extrabold text-white mt-1">
        {formatCurrency(totalMonthlySpend)}
      </Text>
      <Text className="text-xs text-white/70 mt-1">
        Across {subscriptions.length} subscriptions
      </Text>
    </View>
  </View>
);

const Subscriptions = () => {
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
