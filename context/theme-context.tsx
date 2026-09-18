import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme, View } from "react-native";
import { vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MODE_STORAGE_KEY = "theme:mode";
const ACCENT_STORAGE_KEY = "theme:accent";

export const accentPresets = [
    { name: "Coral", hex: "#ea7a53" },
    { name: "Teal", hex: "#14b8a6" },
    { name: "Violet", hex: "#8b5cf6" },
    { name: "Blue", hex: "#3b82f6" },
    { name: "Rose", hex: "#f43f5e" },
] as const;

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedScheme = "light" | "dark";

const lightColors = {
    background: "#fff9e3",
    foreground: "#081126",
    card: "#fff8e7",
    muted: "#f6eecf",
    mutedForeground: "rgba(0, 0, 0, 0.6)",
    primary: "#081126",
    border: "rgba(0, 0, 0, 0.1)",
    success: "#16a34a",
    destructive: "#dc2626",
    subscription: "#8fd1bd",
};

const darkColors = {
    background: "#0b0f1a",
    foreground: "#f5f2e6",
    card: "#161c2c",
    muted: "#1f2536",
    mutedForeground: "rgba(255, 255, 255, 0.6)",
    primary: "#081126",
    border: "rgba(255, 255, 255, 0.12)",
    success: "#16a34a",
    destructive: "#dc2626",
    subscription: "#8fd1bd",
};

const palettes: Record<ResolvedScheme, typeof lightColors> = {
    light: lightColors,
    dark: darkColors,
};

type ThemeContextValue = {
    accent: string;
    setAccent: (color: string) => void;
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    resolvedScheme: ResolvedScheme;
    colors: typeof lightColors;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const [accent, setAccent] = useState<string>(accentPresets[0].hex);
    const [mode, setMode] = useState<ThemeMode>("system");
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [savedMode, savedAccent] = await Promise.all([
                    AsyncStorage.getItem(MODE_STORAGE_KEY),
                    AsyncStorage.getItem(ACCENT_STORAGE_KEY),
                ]);
                if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
                    setMode(savedMode);
                }
                if (savedAccent) {
                    setAccent(savedAccent);
                }
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(MODE_STORAGE_KEY, mode).catch(() => {});
    }, [mode, hydrated]);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(ACCENT_STORAGE_KEY, accent).catch(() => {});
    }, [accent, hydrated]);

    const resolvedScheme: ResolvedScheme =
        mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
    const colors = palettes[resolvedScheme];

    const themeVars = useMemo(
        () =>
            vars({
                "--color-accent": accent,
                "--color-background": colors.background,
                "--color-foreground": colors.foreground,
                "--color-card": colors.card,
                "--color-muted": colors.muted,
                "--color-muted-foreground": colors.mutedForeground,
                "--color-primary": colors.primary,
                "--color-border": colors.border,
                "--color-success": colors.success,
                "--color-destructive": colors.destructive,
                "--color-subscription": colors.subscription,
            }),
        [accent, colors]
    );

    return (
        <ThemeContext.Provider value={{ accent, setAccent, mode, setMode, resolvedScheme, colors }}>
            <View style={[{ flex: 1 }, themeVars]}>{children}</View>
        </ThemeContext.Provider>
    );
}

export function useAppTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error("useAppTheme must be used within a ThemeProvider");
    }
    return ctx;
}
