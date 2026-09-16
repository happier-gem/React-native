import { Image, ScrollView, Text, View } from "react-native";
import React from "react";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  monthlyEquivalent,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";

const SafeAreaView = styled(RNSafeAreaView);

const ranked = [...subscriptions].sort(
  (a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)
);
const maxMonthly = Math.max(...ranked.map(monthlyEquivalent));

const Insights = () => {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
      <Text className="text-3xl font-extrabold text-foreground mb-5">
        Insights
      </Text>

      <View className="flex-row mb-6" style={{ gap: 12 }}>
        <View className="flex-1 bg-card rounded-2xl p-4">
          <Text className="text-xs text-muted-foreground">Monthly</Text>
          <Text className="text-2xl font-extrabold text-foreground mt-1">
            {formatCurrency(totalMonthlySpend)}
          </Text>
        </View>
        <View className="flex-1 bg-card rounded-2xl p-4">
          <Text className="text-xs text-muted-foreground">Yearly</Text>
          <Text className="text-2xl font-extrabold text-foreground mt-1">
            {formatCurrency(totalMonthlySpend * 12)}
          </Text>
        </View>
      </View>

      <Text className="text-sm font-semibold text-muted-foreground mb-3">
        Spending by subscription
      </Text>

      {ranked.map((sub) => {
        const monthly = monthlyEquivalent(sub);
        const widthPct = maxMonthly > 0 ? (monthly / maxMonthly) * 100 : 0;
        return (
          <View key={sub.id} className="mb-4">
            <View className="flex-row items-center mb-1.5">
              <Image
                source={icons[sub.icon]}
                resizeMode="contain"
                className="w-5 h-5 mr-2"
              />
              <Text className="flex-1 text-sm font-medium text-foreground">
                {sub.name}
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {formatCurrency(monthly)}
                <Text className="text-xs text-muted-foreground">/mo</Text>
              </Text>
            </View>
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View
                className="h-2 bg-accent rounded-full"
                style={{ width: `${widthPct}%` }}
              />
            </View>
          </View>
        );
      })}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Insights;
