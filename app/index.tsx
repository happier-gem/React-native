import "@/global.css";
import { Link } from "expo-router";
import React from "react";
import { Image, Text, View } from "react-native";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

export default function Welcome() {
  return (
    <SafeAreaView className="flex-1 bg-background px-6">
      <View className="flex-1 items-center justify-center">
        <Image
          source={require("../assets/images/icon.png")}
          resizeMode="contain"
          className="w-20 h-20 rounded-2xl mb-6"
        />
        <Text className="text-4xl font-extrabold text-foreground text-center mb-3">
          Welcome
        </Text>
        <Text className="text-base text-muted-foreground text-center leading-6">
          Keep track of every subscription in one place, and never get
          surprised by a renewal again.
        </Text>
      </View>

      <View className="pb-6">
        <Link
          href="/(auth)/sign-in"
          className="rounded-2xl bg-primary text-white text-center text-base font-semibold p-4 mb-3"
        >
          Sign In
        </Link>
        <Link
          href="/(auth)/sign-up"
          className="rounded-2xl bg-transparent border border-border text-foreground text-center text-base font-semibold p-4 mb-3"
        >
          Create Account
        </Link>
        <Link
          href="/onboarding"
          className="text-center text-sm font-medium text-muted-foreground p-2"
        >
          Continue as guest
        </Link>
      </View>
    </SafeAreaView>
  );
}
