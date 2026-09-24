import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "notifications:read-keys";

type NotificationReadContextValue = {
    isRead: (key: string) => boolean;
    markRead: (keys: string[]) => void;
};

const NotificationReadContext = createContext<NotificationReadContextValue | undefined>(undefined);

export function NotificationReadProvider({ children }: { children: ReactNode }) {
    const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) setReadKeys(new Set(JSON.parse(saved) as string[]));
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    // Guarded on `hydrated` so an early markRead() (e.g. Notifications screen
    // mounting before storage finishes loading) can't overwrite the persisted
    // set with an incomplete one.
    const markRead = useCallback(
        (keys: string[]) => {
            if (!hydrated || keys.length === 0) return;
            setReadKeys((prev) => {
                if (keys.every((key) => prev.has(key))) return prev;
                const next = new Set(prev);
                keys.forEach((key) => next.add(key));
                AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
                return next;
            });
        },
        [hydrated]
    );

    const isRead = useCallback((key: string) => readKeys.has(key), [readKeys]);

    return (
        <NotificationReadContext.Provider value={{ isRead, markRead }}>
            {children}
        </NotificationReadContext.Provider>
    );
}

export function useNotificationReadState() {
    const ctx = useContext(NotificationReadContext);
    if (!ctx) {
        throw new Error("useNotificationReadState must be used within a NotificationReadProvider");
    }
    return ctx;
}
