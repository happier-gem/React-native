import { LogBox } from "react-native";
import { isRunningInExpoGo } from "expo";

/**
 * Expo Go only (never in development builds or the production app):
 * expo-notifications warns that PUSH notifications aren't available in Expo Go
 * since SDK 53. This app doesn't use push notifications — renewal reminders are
 * LOCAL notifications, which work in Expo Go — so these two messages are noise.
 * Only these exact messages are hidden; every other warning/error still shows.
 */
const EXPO_GO_NOTIFICATION_NOTICES = [
    "`expo-notifications` functionality is not fully supported in Expo Go",
    "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go",
];

if (__DEV__ && isRunningInExpoGo()) {
    LogBox.ignoreLogs(EXPO_GO_NOTIFICATION_NOTICES);
    for (const level of ["warn", "error"] as const) {
        const original = console[level];
        console[level] = (...args: unknown[]) => {
            const first = args[0];
            if (typeof first === "string" && EXPO_GO_NOTIFICATION_NOTICES.some((notice) => first.includes(notice))) return;
            original(...args);
        };
    }
}
