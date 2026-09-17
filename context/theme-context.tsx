import React, { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { View } from "react-native";
import { vars } from "nativewind";

export const accentPresets = [
    { name: "Coral", value: "#ea7a53" },
    { name: "Teal", value: "#14b8a6" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Rose", value: "#f43f5e" },
] as const;

type ThemeContextValue = {
    accent: string;
    setAccent: (color: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [accent, setAccent] = useState<string>(accentPresets[0].value);
    const themeVars = useMemo(() => vars({ "--color-accent": accent }), [accent]);

    return (
        <ThemeContext.Provider value={{ accent, setAccent }}>
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
