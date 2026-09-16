import "@/global.css";
import { Link } from "expo-router";
import React from "react";
import { Text } from "react-native";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

export default function Home() {
  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="text-4xl font-extrabold text-foreground mb-6">
        Home
      </Text>

      <Text className="text-sm font-semibold text-muted-foreground mb-2">
        Your subscriptions
      </Text>
      <Link
        href={{
          pathname: "/subscriptions/[id]",
          params: { id: "spotify" },
        }}
        className="rounded-2xl bg-primary text-white p-4 mb-3"
      >
        Spotify Subscription
      </Link>
      <Link
        href={{
          pathname: "/subscriptions/[id]",
          params: { id: "claude" },
        }}
        className="rounded-2xl bg-primary text-white p-4"
      >
        Claude Max Subscription
      </Link>
    </SafeAreaView>
  );
}
