import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import React, { useMemo } from "react";
import { usePlan } from "@/context/plan-context";
import { LockedCard } from "@/components/insights/locked-card";
import { BudgetsSection } from "@/components/insights/budgets-section";
import { useAppTheme } from "@/context/theme-context";
import { formatMoney } from "@/constants/data";
import { monthlyEquivalent, useSubscriptions } from "@/context/subscriptions-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";

const Insights = () => {
  const { colors, accent } = useAppTheme();
  const { activeSubscriptions, spendByCurrency, loading, subscriptions } = useSubscriptions();
  // What this screen shows depends on the plan (admin/lib/entitlements.ts).
  const { entitlements } = usePlan();
  const level = entitlements.insights;

  // Pro: monthly spend per category (kept per currency — never summed across).
  const byCategory = useMemo(() => {
    const totals = new Map<string, { category: string; currency: string; monthly: number }>();
    for (const sub of activeSubscriptions) {
      const key = `${sub.category}|${sub.currency}`;
      const row = totals.get(key) ?? { category: sub.category, currency: sub.currency, monthly: 0 };
      row.monthly += monthlyEquivalent(sub);
      totals.set(key, row);
    }
    return [...totals.values()].sort((a, b) => b.monthly - a.monthly);
  }, [activeSubscriptions]);
  const maxCategory = Math.max(0, ...byCategory.map((r) => r.monthly));
  const categories = useMemo(() => [...new Set(activeSubscriptions.map((s) => s.category))].sort(), [activeSubscriptions]);

  const ranked = [...activeSubscriptions].sort(
    (a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)
  );
  const maxMonthly = Math.max(0, ...ranked.map(monthlyEquivalent));

  if (loading && subscriptions.length === 0) {
    return (
      <ThemedSafeAreaView>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.foreground} />
        </View>
      </ThemedSafeAreaView>
    );
  }

  return (
    <ThemedSafeAreaView>
      <ThemedText className="text-3xl font-extrabold px-5 pt-5 pb-2">
        Insights
      </ThemedText>
      <ScrollView
        className="px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 96 }}
      >
      {spendByCurrency.length === 0 ? (
        <ThemedText tone="muted" className="text-sm mb-6">
          No active subscriptions yet.
        </ThemedText>
      ) : (
        spendByCurrency.map((row) => (
          <View key={row.currency} className="flex-row mb-3" style={{ gap: 12 }}>
            <Card className="flex-1 rounded-2xl p-4" style={{ backgroundColor: colors.primary }}>
              <ThemedText tone="white" className="text-xs opacity-70">Monthly{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</ThemedText>
              <ThemedText tone="white" className="text-2xl font-extrabold mt-1">
                {formatMoney(row.monthly, row.currency)}
              </ThemedText>
            </Card>
            {level !== "basic" ? (
              <Card className="flex-1 rounded-2xl p-4" style={{ backgroundColor: accent }}>
                <ThemedText tone="white" className="text-xs opacity-70">Yearly{spendByCurrency.length > 1 ? ` (${row.currency})` : ""}</ThemedText>
                <ThemedText tone="white" className="text-2xl font-extrabold mt-1">
                  {formatMoney(row.yearly, row.currency)}
                </ThemedText>
              </Card>
            ) : null}
          </View>
        ))
      )}

      <View className="mt-3">
        <BudgetsSection categories={categories} />
      </View>

      {level === "basic" ? (
        <View className="mt-3">
          <LockedCard
            title="See where your money goes"
            detail="Starter adds yearly totals and spending per subscription."
          />
        </View>
      ) : (
      <>
      <ThemedText tone="muted" className="text-sm font-semibold mb-3 mt-3">
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
                  {formatMoney(monthly, sub.currency)}
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

      {level === "full" ? (
        <>
          <ThemedText tone="muted" className="text-sm font-semibold mb-3 mt-5">
            Spending by category
          </ThemedText>
          {byCategory.map((row) => (
            <View key={`${row.category}|${row.currency}`} className="mb-4">
              <View className="flex-row items-center mb-1.5">
                <ThemedText className="flex-1 text-sm font-medium">{row.category}</ThemedText>
                <ThemedText className="text-sm font-semibold">
                  {formatMoney(row.monthly, row.currency)}
                  <Text style={{ color: colors.mutedForeground }} className="text-xs">/mo</Text>
                </ThemedText>
              </View>
              <View style={{ backgroundColor: colors.muted }} className="h-2 rounded-full overflow-hidden">
                <View
                  style={{ width: `${maxCategory > 0 ? (row.monthly / maxCategory) * 100 : 0}%`, backgroundColor: accent }}
                  className="h-2 rounded-full"
                />
              </View>
            </View>
          ))}
        </>
      ) : ranked.length > 0 ? (
        <View className="mt-3">
          <LockedCard title="Spending by category" detail="Pro shows which categories cost you the most." />
        </View>
      ) : null}
      </>
      )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Insights;
