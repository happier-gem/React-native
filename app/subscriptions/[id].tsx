import { Alert, Image, Pressable, Text, View } from "react-native";
import React from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  monthlyEquivalent,
  subscriptions,
} from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";

const BackLink = () => (
  <Link href="/subscriptions" asChild>
    <Pressable className="mb-6">
      <ThemedText tone="accent" className="font-semibold">
        {"< Back"}
      </ThemedText>
    </Pressable>
  </Link>
);

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subscription = subscriptions.find((sub) => sub.id === id);

  if (!subscription) {
    return (
      <ThemedSafeAreaView className="p-5">
        <ThemedText className="text-lg font-semibold mb-4">
          Subscription not found
        </ThemedText>
        <BackLink />
      </ThemedSafeAreaView>
    );
  }

  return (
    <ThemedSafeAreaView className="p-5">
      <BackLink />

      <View className="items-center mb-6">
        <Image
          source={icons[subscription.icon]}
          resizeMode="contain"
          className="w-16 h-16 rounded-2xl mb-4"
        />
        <ThemedText className="text-2xl font-extrabold">
          {subscription.name}
        </ThemedText>
        <ThemedText tone="muted" className="text-sm mt-1">
          {subscription.category}
        </ThemedText>
      </View>

      <Card className="rounded-2xl p-5 mb-4">
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Price</ThemedText>
          <ThemedText className="font-semibold">
            {formatCurrency(subscription.price)}{" "}
            {subscription.cycle === "monthly" ? "/mo" : "/yr"}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Monthly equivalent</ThemedText>
          <ThemedText className="font-semibold">
            {formatCurrency(monthlyEquivalent(subscription))}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Next renewal</ThemedText>
          <ThemedText className="font-semibold">
            {formatRenewalDate(subscription.renewalDate)}
          </ThemedText>
        </View>
      </Card>

      <Pressable
        className="rounded-2xl border border-destructive p-4 items-center"
        onPress={() =>
          Alert.alert(
            "Cancel subscription?",
            `You're about to cancel ${subscription.name}.`,
            [
              { text: "Keep subscription", style: "cancel" },
              { text: "Cancel subscription", style: "destructive" },
            ]
          )
        }
      >
        <Text className="text-base font-semibold text-destructive">
          Cancel Subscription
        </Text>
      </Pressable>
    </ThemedSafeAreaView>
  );
};

export default SubscriptionDetails;
