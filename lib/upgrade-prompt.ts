import { Alert } from "react-native";
import { router } from "expo-router";
import { isPlanLimitError } from "@/lib/api-client";

/**
 * If the server refused because the user's plan doesn't include something
 * (ApiError code "plan_limit"), shows its message with a way to the Plans
 * screen and returns true. Otherwise returns false and does nothing.
 */
export function showUpgradePromptIfPlanLimit(title: string, error: unknown): boolean {
    if (!isPlanLimitError(error)) return false;
    Alert.alert(title, error.message, [
        { text: "Not now", style: "cancel" },
        { text: "See plans", onPress: () => router.push("/plans") },
    ]);
    return true;
}
