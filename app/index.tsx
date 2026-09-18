import "@/global.css";
import { Link } from "expo-router";
import React from "react";
import { Text } from "react-native";
import { ThemedSafeAreaView } from "@/components/themed";

export default function App() {
  return (
    <ThemedSafeAreaView className="p-5">
      <Text className="text-xl font-bold text-success">
        Welcome to Nativewind!
      </Text>
      <Link href="/onboarding" className="mt-4 rounded-2xl bg-primary text-white p-4">
        Go to Onboarding
      </Link>
      <Link href="/(auth)/sign-in" className="mt-4 rounded-2xl bg-primary text-white p-4">
        Go to Sign in
      </Link>
      <Link href="/(auth)/sign-up" className="mt-4 rounded-2xl bg-primary text-white p-4">
        Go to Sign up
      </Link>
    </ThemedSafeAreaView>
  );
}
