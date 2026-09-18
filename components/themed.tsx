import React from "react";
import { Text, TextProps, View, ViewProps } from "react-native";
import { SafeAreaView as RNSafeAreaView, SafeAreaViewProps } from "react-native-safe-area-context";
import { styled } from "nativewind";
import { useAppTheme } from "@/context/theme-context";

const StyledSafeAreaView = styled(RNSafeAreaView);

export function ThemedSafeAreaView({ style, ...props }: SafeAreaViewProps) {
    const { colors } = useAppTheme();
    return <StyledSafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, style]} {...props} />;
}

export function ThemedView({ style, ...props }: ViewProps) {
    const { colors } = useAppTheme();
    return <View style={[{ backgroundColor: colors.background }, style]} {...props} />;
}

export function Card({ style, ...props }: ViewProps) {
    const { colors } = useAppTheme();
    return <View style={[{ backgroundColor: colors.card }, style]} {...props} />;
}

export function Divider({ style, ...props }: ViewProps) {
    const { colors } = useAppTheme();
    return <View style={[{ borderBottomWidth: 1, borderBottomColor: colors.border }, style]} {...props} />;
}

type ThemedTextTone = "foreground" | "muted" | "accent" | "white";

export function ThemedText({
    style,
    tone = "foreground",
    ...props
}: TextProps & { tone?: ThemedTextTone }) {
    const { colors, accent } = useAppTheme();
    const toneColor =
        tone === "muted" ? colors.mutedForeground :
        tone === "accent" ? accent :
        tone === "white" ? "#ffffff" :
        colors.foreground;
    return <Text style={[{ color: toneColor }, style]} {...props} />;
}
