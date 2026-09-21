import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "admin:notifications:read";

export function useReadNotifications() {
    const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) setReadKeys(new Set(JSON.parse(saved)));
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...readKeys])).catch(() => {});
    }, [readKeys, hydrated]);

    const markRead = (key: string) => {
        setReadKeys((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    };

    const markAllRead = (keys: string[]) => {
        setReadKeys((prev) => new Set([...prev, ...keys]));
    };

    const isRead = (key: string) => readKeys.has(key);

    return { isRead, markRead, markAllRead };
}
