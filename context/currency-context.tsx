import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CURRENCY_STORAGE_KEY = "currency:code";

export const currencyOptions = [
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "JPY", symbol: "¥", name: "Japanese Yen" },
    { code: "INR", symbol: "₹", name: "Indian Rupee" },
] as const;

export type CurrencyCode = typeof currencyOptions[number]["code"];

type CurrencyContextValue = {
    currency: (typeof currencyOptions)[number];
    setCurrencyCode: (code: CurrencyCode) => void;
    format: (amount: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [code, setCode] = useState<CurrencyCode>("USD");
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(CURRENCY_STORAGE_KEY);
                if (saved && currencyOptions.some((c) => c.code === saved)) {
                    setCode(saved as CurrencyCode);
                }
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(CURRENCY_STORAGE_KEY, code).catch(() => {});
    }, [code, hydrated]);

    const currency = currencyOptions.find((c) => c.code === code) ?? currencyOptions[0];

    const format = (amount: number) => `${currency.symbol}${amount.toFixed(2)}`;

    return (
        <CurrencyContext.Provider value={{ currency, setCurrencyCode: setCode, format }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const ctx = useContext(CurrencyContext);
    if (!ctx) {
        throw new Error("useCurrency must be used within a CurrencyProvider");
    }
    return ctx;
}
