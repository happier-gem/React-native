import { ScrollView, Text, View } from "react-native";
import React from "react";
import { useAppTheme } from "@/context/theme-context";
import { useCurrency } from "@/context/currency-context";
import { monthlyEquivalent, useSubscriptions } from "@/context/subscriptions-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";

const Insights = () => {
  const { colors, accent } = useAppTheme();
  const { format } = useCurrency();
  const { activeSubscriptions, totalMonthlySpend } = useSubscriptions();

  const ranked = [...activeSubscriptions].sort(
    (a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)
  );
  const maxMonthly = Math.max(0, ...ranked.map(monthlyEquivalent));

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
            {format(totalMonthlySpend)}
          </ThemedText>
        </Card>
        <Card className="flex-1 rounded-2xl p-4">
          <ThemedText tone="muted" className="text-xs">Yearly</ThemedText>
          <ThemedText className="text-2xl font-extrabold mt-1">
            {format(totalMonthlySpend * 12)}
          </ThemedText>
        </Card>
      </View>

      <ThemedText tone="muted" className="text-sm font-semibold mb-3">
        Spending by subscription
      </ThemedText>

      {ranked.length === 0 ? (
        <ThemedText tone="muted" className="text-sm">
          No active subscriptions.
        </ThemedText>
      ) : (
        ranked.map((sub) => {
          const monthly = monthlyEquivalent(sub);
          const widthPct = maxMonthly > 0 ? (monthly / maxMonthly) * 100 : 0;
          return (
            <View key={sub.id} className="mb-4">
              <View className="flex-row items-center mb-1.5">
                <View className="mr-2">
                  <BrandIcon icon={sub.icon} brandColor={sub.brandColor} size={20} />
                </View>
                <ThemedText className="flex-1 text-sm font-medium">
                  {sub.name}
                </ThemedText>
                <ThemedText className="text-sm font-semibold">
                  {format(monthly)}
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
        })
      )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Insights;
