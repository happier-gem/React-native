import { Image, Pressable, ScrollView, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";
import { ThemedSafeAreaView, ThemedText, Card } from "@/components/themed";

const upcoming = [...subscriptions]
  .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))
  .slice(0, 3);

const Home = () => {
  return (
    <ThemedSafeAreaView>
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <ThemedText className="text-3xl font-extrabold mb-5">
          Home
        </ThemedText>

        <View className="bg-primary rounded-2xl p-5 mb-6">
          <Text className="text-sm text-white/70">Monthly total</Text>
          <Text className="text-3xl font-extrabold text-white mt-1">
            {formatCurrency(totalMonthlySpend)}
          </Text>
          <Link href="/subscriptions" className="text-white/80 text-sm mt-3">
            View all subscriptions →
          </Link>
        </View>

        <ThemedText tone="muted" className="text-sm font-semibold mb-3">
          Upcoming renewals
        </ThemedText>

        {upcoming.map((sub) => (
          <Link
            key={sub.id}
            href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
            asChild
          >
            <Pressable>
              <Card className="flex-row items-center rounded-2xl p-4 mb-3">
                <Image
                  source={icons[sub.icon]}
                  resizeMode="contain"
                  className="w-10 h-10 rounded-xl mr-4"
                />
                <View className="flex-1">
                  <ThemedText className="text-base font-semibold">
                    {sub.name}
                  </ThemedText>
                  <ThemedText tone="muted" className="text-xs mt-0.5">
                    Renews {formatRenewalDate(sub.renewalDate)}
                  </ThemedText>
                </View>
                <ThemedText className="text-base font-semibold">
                  {formatCurrency(sub.price)}
                </ThemedText>
              </Card>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </ThemedSafeAreaView>
  );
};

export default Home;
