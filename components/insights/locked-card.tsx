import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, ThemedText } from "@/components/themed";
import { useAppTheme } from "@/context/theme-context";

/** A card telling the user what an upgrade unlocks here. */
export const LockedCard = ({ title, detail }: { title: string; detail: string }) => {
  const { colors, accent } = useAppTheme();
  return (
    <Pressable
      onPress={() => router.push("/plans")}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}. See plans`}
    >
      <Card className="rounded-2xl p-4 mb-4 flex-row items-center">
        <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: accent + "26" }}>
          <Ionicons name="lock-closed" size={16} color={accent} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-base font-semibold">{title}</ThemedText>
          <ThemedText tone="muted" className="text-xs mt-0.5">{detail}</ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </Card>
    </Pressable>
  );
};

