import { Pressable, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/context/theme-context";
import { Card, ThemedText } from "@/components/themed";

export const SegmentedControl = <T extends string>({
    options,
    value,
    onChange,
}: {
    options: { key: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}) => {
    const { colors, accent } = useAppTheme();
    return (
        <View style={{ backgroundColor: colors.card }} className="flex-row rounded-2xl p-1.5">
            {options.map((option) => {
                const selected = option.key === value;
                return (
                    <Pressable
                        key={option.key}
                        onPress={() => onChange(option.key)}
                        className="flex-1 items-center py-2 rounded-xl"
                        style={{ backgroundColor: selected ? accent : "transparent" }}
                    >
                        <ThemedText tone={selected ? "white" : "muted"} className="text-xs font-semibold">
                            {option.label}
                        </ThemedText>
                    </Pressable>
                );
            })}
        </View>
    );
};

export const StatCard = ({
    label,
    value,
    icon,
    caption,
}: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    caption?: string;
}) => {
    const { accent } = useAppTheme();

    return (
        <Card className="rounded-2xl p-4 flex-1">
            <View
                className="w-9 h-9 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: accent + "26" }}
            >
                <Ionicons name={icon} size={18} color={accent} />
            </View>
            <ThemedText className="text-2xl font-extrabold">{value}</ThemedText>
            <ThemedText tone="muted" className="text-xs mt-0.5">{label}</ThemedText>
            {caption ? (
                <ThemedText tone="muted" className="text-[10px] mt-1">
                    {caption}
                </ThemedText>
            ) : null}
        </Card>
    );
};

export const DemoTag = () => {
    const { colors } = useAppTheme();
    return (
        <View
            className="px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.mutedForeground + "26" }}
        >
            <ThemedText tone="muted" className="text-[10px] font-bold">DEMO</ThemedText>
        </View>
    );
};

export const DemoBanner = ({ message }: { message: string }) => {
    const { colors } = useAppTheme();
    return (
        <View
            className="flex-row items-start rounded-2xl p-3.5 mb-5"
            style={{ backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }}
        >
            <Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8, marginTop: 1 }} />
            <ThemedText tone="muted" className="text-xs flex-1">{message}</ThemedText>
        </View>
    );
};

export const EmptyState = ({
    icon,
    message,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    message: string;
}) => {
    const { colors } = useAppTheme();
    return (
        <View className="items-center py-10">
            <Ionicons name={icon} size={36} color={colors.mutedForeground} />
            <ThemedText tone="muted" className="text-sm mt-3 text-center">{message}</ThemedText>
        </View>
    );
};
