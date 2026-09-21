import { View } from "react-native";
import React from "react";
import { useAppTheme } from "@/context/theme-context";
import { ThemedText } from "@/components/themed";

export const AdminHeader = ({
    title,
    subtitle,
}: {
    title: string;
    subtitle?: string;
}) => {
    const { accent } = useAppTheme();

    return (
        <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 pr-3">
                <ThemedText className="text-3xl font-extrabold">{title}</ThemedText>
                {subtitle ? (
                    <ThemedText tone="muted" className="text-sm mt-1">
                        {subtitle}
                    </ThemedText>
                ) : null}
            </View>
            <View
                className="px-2.5 py-1 rounded-full"
                style={{ backgroundColor: accent + "26" }}
            >
                <ThemedText tone="accent" className="text-xs font-bold">
                    ADMIN
                </ThemedText>
            </View>
        </View>
    );
};
