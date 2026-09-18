import { Alert, Pressable, Text, View } from "react-native";
import React from "react";
import { Link, useLocalSearchParams } from "expo-router";
import {
  formatRenewalDate,
  monthlyEquivalent,
  subscriptions,
} from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";

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
  const { format } = useCurrency();

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
        <View className="mb-4">
          <BrandIcon icon={subscription.icon} brandColor={subscription.brandColor} size={64} />
        </View>
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
            {format(subscription.price)}{" "}
            {subscription.cycle === "monthly" ? "/mo" : "/yr"}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Monthly equivalent</ThemedText>
          <ThemedText className="font-semibold">
            {format(monthlyEquivalent(subscription))}
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
