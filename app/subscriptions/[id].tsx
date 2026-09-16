import { Alert, Image, Pressable, Text, View } from "react-native";
import React from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  monthlyEquivalent,
  subscriptions,
} from "@/constants/data";

const SafeAreaView = styled(RNSafeAreaView);

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subscription = subscriptions.find((sub) => sub.id === id);

  if (!subscription) {
    return (
      <SafeAreaView className="flex-1 bg-background p-5">
        <Text className="text-lg font-semibold text-foreground mb-4">
          Subscription not found
        </Text>
        <Link href="/subscriptions" className="text-accent font-semibold">
          Go back
        </Link>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Link href="/subscriptions" className="text-accent font-semibold mb-6">
        {"< Back"}
      </Link>

      <View className="items-center mb-6">
        <Image
          source={icons[subscription.icon]}
          resizeMode="contain"
          className="w-16 h-16 rounded-2xl mb-4"
        />
        <Text className="text-2xl font-extrabold text-foreground">
          {subscription.name}
        </Text>
        <Text className="text-sm text-muted-foreground mt-1">
          {subscription.category}
        </Text>
      </View>

      <View className="bg-card rounded-2xl p-5 mb-4">
        <View className="flex-row items-center justify-between py-2">
          <Text className="text-muted-foreground">Price</Text>
          <Text className="font-semibold text-foreground">
            {formatCurrency(subscription.price)}{" "}
            {subscription.cycle === "monthly" ? "/mo" : "/yr"}
          </Text>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <Text className="text-muted-foreground">Monthly equivalent</Text>
          <Text className="font-semibold text-foreground">
            {formatCurrency(monthlyEquivalent(subscription))}
          </Text>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <Text className="text-muted-foreground">Next renewal</Text>
          <Text className="font-semibold text-foreground">
            {formatRenewalDate(subscription.renewalDate)}
          </Text>
        </View>
      </View>

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
    </SafeAreaView>
  );
};

export default SubscriptionDetails;
