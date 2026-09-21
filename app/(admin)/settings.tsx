import { Image, Pressable, ScrollView, Switch, Text, View } from "react-native";
import React from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { accentPresets, ThemeMode, useAppTheme } from "@/context/theme-context";
import { currencyOptions, useCurrency } from "@/context/currency-context";
import { useAccount } from "@/context/account-context";
import { useNotificationsSettings } from "@/context/notifications-context";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { AdminHeader } from "@/components/admin-header";

const themeModeOptions: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: "light", label: "Light", icon: "sunny-outline" },
    { mode: "dark", label: "Dark", icon: "moon-outline" },
    { mode: "system", label: "System", icon: "phone-portrait-outline" },
];

const AdminSettings = () => {
    const { colors, accent, setAccent, mode, setMode } = useAppTheme();
    const { currency, setCurrencyCode } = useCurrency();
    const { account } = useAccount();
    const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } = useNotificationsSettings();
    const { signOut } = useAuth();

    const handleSignOut = async () => {
        await signOut();
        router.replace("/(auth)/sign-in");
    };

    return (
        <ThemedSafeAreaView>
            <ScrollView
                className="px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <AdminHeader title="Settings" subtitle="Admin profile & preferences" />

                <Pressable onPress={() => router.replace("/(tabs)/home")} className="mb-5">
                    <View className="flex-row items-center">
                        <Ionicons name="arrow-back-outline" size={16} color={accent} style={{ marginRight: 6 }} />
                        <ThemedText tone="accent" className="text-sm font-semibold">Back to app</ThemedText>
                    </View>
                </Pressable>

                <Card className="flex-row items-center rounded-2xl p-4 mb-6">
                    <Image
                        source={account.imageUrl ? { uri: account.imageUrl } : require("@/assets/images/avatar.png")}
                        resizeMode="cover"
                        className="w-14 h-14 rounded-full mr-4"
                    />
                    <View className="flex-1">
                        <ThemedText className="text-base font-semibold">{account.name}</ThemedText>
                        <ThemedText tone="muted" className="text-sm mt-0.5">{account.email}</ThemedText>
                    </View>
                </Card>

                <ThemedText tone="muted" className="text-sm font-semibold mb-2">Theme</ThemedText>
                <View style={{ backgroundColor: colors.card }} className="flex-row rounded-2xl p-1.5 mb-6">
                    {themeModeOptions.map((option) => {
                        const selected = option.mode === mode;
                        return (
                            <Pressable
                                key={option.mode}
                                onPress={() => setMode(option.mode)}
                                className="flex-1 items-center py-3 rounded-xl"
                                style={{ backgroundColor: selected ? accent : "transparent" }}
                            >
                                <Ionicons name={option.icon} size={18} color={selected ? "#ffffff" : colors.mutedForeground} />
                                <ThemedText tone={selected ? "white" : "muted"} className="text-xs font-semibold mt-1">
                                    {option.label}
                                </ThemedText>
                            </Pressable>
                        );
                    })}
                </View>

                <ThemedText tone="muted" className="text-sm font-semibold mb-2">Accent color</ThemedText>
                <View className="flex-row flex-wrap mb-6" style={{ gap: 12 }}>
                    {accentPresets.map((preset) => {
                        const selected = preset.hex === accent;
                        return (
                            <Pressable
                                key={preset.hex}
                                onPress={() => setAccent(preset.hex)}
                                className="items-center"
                                style={{ width: 56 }}
                            >
                                <View
                                    className="w-12 h-12 rounded-full items-center justify-center"
                                    style={{
                                        backgroundColor: preset.hex,
                                        borderWidth: selected ? 3 : 0,
                                        borderColor: colors.foreground,
                                    }}
                                >
                                    {selected ? <Ionicons name="checkmark" size={20} color="#ffffff" /> : null}
                                </View>
                                <ThemedText tone="muted" className="text-[10px] mt-1">{preset.name}</ThemedText>
                            </Pressable>
                        );
                    })}
                </View>

                <ThemedText tone="muted" className="text-sm font-semibold mb-2">Currency</ThemedText>
                <View className="flex-row flex-wrap mb-6" style={{ gap: 10 }}>
                    {currencyOptions.map((option) => {
                        const selected = option.code === currency.code;
                        return (
                            <Pressable
                                key={option.code}
                                onPress={() => setCurrencyCode(option.code)}
                                className="flex-row items-center rounded-full px-3.5 py-2"
                                style={{ backgroundColor: selected ? accent : colors.card }}
                            >
                                <ThemedText tone={selected ? "white" : "muted"} className="text-xs font-semibold">
                                    {option.symbol} {option.code}
                                </ThemedText>
                            </Pressable>
                        );
                    })}
                </View>

                <Card className="rounded-2xl p-4 mb-6">
                    <View className="flex-row items-center justify-between">
                        <ThemedText className="text-base">Notifications</ThemedText>
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={(value) => { void setNotificationsEnabled(value); }}
                            trackColor={{ false: colors.border, true: accent }}
                            thumbColor="#ffffff"
                        />
                    </View>
                </Card>

                <Pressable
                    onPress={handleSignOut}
                    className="rounded-2xl border border-destructive p-4 items-center"
                >
                    <Text className="text-base font-semibold text-destructive">Sign Out</Text>
                </Pressable>
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default AdminSettings;
