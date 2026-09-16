import { Image, Pressable, ScrollView, Text, View } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { icons } from "@/constants/icons";
import {
  formatCurrency,
  formatRenewalDate,
  subscriptions,
  totalMonthlySpend,
} from "@/constants/data";

const SafeAreaView = styled(RNSafeAreaView);

const upcoming = [...subscriptions]
  .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))
  .slice(0, 3);

const Home = () => {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <Text className="text-3xl font-extrabold text-foreground mb-5">
          Home
        </Text>

        <View className="bg-primary rounded-2xl p-5 mb-6">
          <Text className="text-sm text-white/70">Monthly total</Text>
          <Text className="text-3xl font-extrabold text-white mt-1">
            {formatCurrency(totalMonthlySpend)}
          </Text>
          <Link href="/subscriptions" className="text-white/80 text-sm mt-3">
            View all subscriptions →
          </Link>
        </View>

        <Text className="text-sm font-semibold text-muted-foreground mb-3">
          Upcoming renewals
        </Text>

        {upcoming.map((sub) => (
          <Link
            key={sub.id}
            href={{ pathname: "/subscriptions/[id]", params: { id: sub.id } }}
            asChild
          >
            <Pressable className="flex-row items-center bg-card rounded-2xl p-4 mb-3">
              <Image
                source={icons[sub.icon]}
                resizeMode="contain"
                className="w-10 h-10 rounded-xl mr-4"
              />
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">
                  {sub.name}
                </Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  Renews {formatRenewalDate(sub.renewalDate)}
                </Text>
              </View>
              <Text className="text-base font-semibold text-foreground">
                {formatCurrency(sub.price)}
              </Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Home;
