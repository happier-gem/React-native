import { Image, ScrollView, Text, View } from "react-native";
import React from "react";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  monthlyEquivalent,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";
import { useAppTheme } from "@/context/theme-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";

const ranked = [...subscriptions].sort(
  (a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)
);
const maxMonthly = Math.max(...ranked.map(monthlyEquivalent));

const Insights = () => {
  const { colors, accent } = useAppTheme();

  return (
    <ThemedSafeAreaView>
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
      <ThemedText className="text-3xl font-extrabold mb-5">
        Insights
      </ThemedText>

      <View className="flex-row mb-6" style={{ gap: 12 }}>
        <Card className="flex-1 rounded-2xl p-4">
          <ThemedText tone="muted" className="text-xs">Monthly</ThemedText>
          <ThemedText className="text-2xl font-extrabold mt-1">
            {formatCurrency(totalMonthlySpend)}
          </ThemedText>
        </Card>
        <Card className="flex-1 rounded-2xl p-4">
          <ThemedText tone="muted" className="text-xs">Yearly</ThemedText>
          <ThemedText className="text-2xl font-extrabold mt-1">
            {formatCurrency(totalMonthlySpend * 12)}
          </ThemedText>
        </Card>
      </View>

      <ThemedText tone="muted" className="text-sm font-semibold mb-3">
        Spending by subscription
      </ThemedText>

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
              <ThemedText className="flex-1 text-sm font-medium">
                {sub.name}
              </ThemedText>
              <ThemedText className="text-sm font-semibold">
                {formatCurrency(monthly)}
                <Text style={{ color: colors.mutedForeground }} className="text-xs">/mo</Text>
              </ThemedText>
            </View>
            <View
              style={{ backgroundColor: colors.muted }}
              className="h-2 rounded-full overflow-hidden"
            >
              <View
                style={{ width: `${widthPct}%`, backgroundColor: accent }}
                className="h-2 rounded-full"
              />
            </View>
          </View>
        );
      })}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Insights;
