import { FlatList, Image, Pressable, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  Subscription,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";

const SafeAreaView = styled(RNSafeAreaView);

const SubscriptionRow = ({ item }: { item: Subscription }) => (
  <Link
    href={{ pathname: "/subscriptions/[id]", params: { id: item.id } }}
    asChild
  >
    <Pressable className="flex-row items-center bg-card rounded-2xl p-4 mb-3">
      <Image
        source={icons[item.icon]}
        resizeMode="contain"
        className="w-11 h-11 rounded-xl mr-4"
      />
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">
          {item.name}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          {item.category} · Renews {formatRenewalDate(item.renewalDate)}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-base font-semibold text-foreground">
          {formatCurrency(item.price)}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          {item.cycle === "monthly" ? "/mo" : "/yr"}
        </Text>
      </View>
    </Pressable>
  </Link>
);

const Subscriptions = () => {
  return (
    <SafeAreaView className="flex-1 bg-background px-5 pt-5">
      <Text className="text-3xl font-extrabold text-foreground mb-5">
        Subscriptions
      </Text>

      <View className="bg-primary rounded-2xl p-5 mb-5">
        <Text className="text-sm text-white/70">Monthly total</Text>
        <Text className="text-3xl font-extrabold text-white mt-1">
          {formatCurrency(totalMonthlySpend)}
        </Text>
        <Text className="text-xs text-white/70 mt-1">
          Across {subscriptions.length} subscriptions
        </Text>
      </View>

      <FlatList
        data={subscriptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SubscriptionRow item={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </SafeAreaView>
  );
};

export default Subscriptions;
