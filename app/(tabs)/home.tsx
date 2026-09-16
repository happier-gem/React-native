import "@/global.css";
import { Link } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="text-4xl font-extrabold text-foreground mb-6">
        Home
      </Text>

      <Link href="/onboarding" className="rounded-2xl bg-primary text-white p-4 mb-3">
        Go to Onboarding
      </Link>
      <Link href="/(auth)/sign-in" className="rounded-2xl bg-primary text-white p-4 mb-3">
        Go to Sign in
      </Link>
      <Link href="/(auth)/sign-up" className="rounded-2xl bg-primary text-white p-4 mb-3">
        Go to Sign up
      </Link>

      <Link
        href={{
          pathname: "/subscriptions/[id]",
          params: { id: "spotify" },
        }}
        className="text-foreground"
      >
        Spotify Subscription
      </Link>
      <Link
        href={{
          pathname: "/subscriptions/[id]",
          params: { id: "claude" },
        }}
        className="text-foreground"
      >
        Claude Max Subscription
      </Link>
    </SafeAreaView>
  );
}