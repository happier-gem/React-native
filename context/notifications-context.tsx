import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    cancelAllScheduledNotifications,
    configureNotificationChannel,
    requestNotificationPermission,
} from "@/lib/notifications";

const ENABLED_STORAGE_KEY = "notifications:enabled";

type NotificationsContextValue = {
    enabled: boolean;
    setEnabled: (enabled: boolean) => Promise<boolean>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
    const [enabled, setEnabledState] = useState(true);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        configureNotificationChannel();
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(ENABLED_STORAGE_KEY);
                if (saved !== null) setEnabledState(saved === "true");
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(ENABLED_STORAGE_KEY, String(enabled)).catch(() => {});
    }, [enabled, hydrated]);

    const setEnabled = async (value: boolean) => {
        if (value) {
            const granted = await requestNotificationPermission();
            if (!granted) return false;
        } else {
            await cancelAllScheduledNotifications();
        }
        setEnabledState(value);
        return true;
    };

    return (
        <NotificationsContext.Provider value={{ enabled, setEnabled }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotificationsSettings() {
    const ctx = useContext(NotificationsContext);
    if (!ctx) {
        throw new Error("useNotificationsSettings must be used within a NotificationsProvider");
    }
    return ctx;
}
