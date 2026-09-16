import { Image, Pressable, ScrollView, Switch, Text, View } from "react-native";
import React, { useState } from "react";
import { Link } from "expo-router";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/constants/theme";

const SafeAreaView = styled(RNSafeAreaView);

const SettingsRow = ({
  label,
  value,
  last,
}: {
  label: string;
  value?: string;
  last?: boolean;
}) => (
  <View
    className={`flex-row items-center justify-between py-4 ${
      last ? "" : "border-b border-border"
    }`}
  >
    <Text className="text-base text-foreground">{label}</Text>
    <View className="flex-row items-center">
      {value ? (
        <Text className="text-sm text-muted-foreground mr-2">{value}</Text>
      ) : null}
      <Text className="text-muted-foreground">{">"}</Text>
    </View>
  </View>
);

const Settings = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <Text className="text-3xl font-extrabold text-foreground mb-5">
          Settings
        </Text>

        <View className="flex-row items-center bg-card rounded-2xl p-4 mb-6">
          <Image
            source={require("@/assets/images/avatar.png")}
            resizeMode="cover"
            className="w-14 h-14 rounded-full mr-4"
          />
          <View>
            <Text className="text-base font-semibold text-foreground">
              Your Account
            </Text>
            <Text className="text-sm text-muted-foreground mt-0.5">
              you@example.com
            </Text>
          </View>
        </View>

        <Text className="text-sm font-semibold text-muted-foreground mb-2">
          Preferences
        </Text>
        <View className="bg-card rounded-2xl px-4 mb-6">
          <View className="flex-row items-center justify-between py-4 border-b border-border">
            <Text className="text-base text-foreground">Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#ffffff"
            />
          </View>
          <SettingsRow label="Currency" value="USD" />
          <SettingsRow label="Appearance" value="System" last />
        </View>

        <Text className="text-sm font-semibold text-muted-foreground mb-2">
          About
        </Text>
        <View className="bg-card rounded-2xl px-4 mb-6">
          <SettingsRow label="Version" value="1.0.0" last />
        </View>

        <Link href="/(auth)/sign-in" asChild>
          <Pressable className="rounded-2xl border border-destructive p-4 items-center">
            <Text className="text-base font-semibold text-destructive">
              Sign Out
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Settings;
