import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed";
import { useAppTheme } from "@/context/theme-context";
import { usePlan } from "@/context/plan-context";
import { showUpgradePromptIfPlanLimit } from "@/lib/upgrade-prompt";

/** Every option any plan offers; locked ones are shown so users see what an
 * upgrade gets them. What's actually allowed comes from the server. */
const ALL_DAY_OPTIONS = [1, 3, 7];

const dayLabel = (d: number) => (d === 1 ? "1 day before" : `${d} days before`);

export const reminderSummary = (days: number[]) =>
    days.length === 1 ? dayLabel(days[0]) : `${days.join(", ")} days before`;

export function ReminderSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { colors, accent } = useAppTheme();
    const { entitlements, reminderSettings, updateReminderSettings } = usePlan();
    const [saving, setSaving] = useState<number | null>(null);

    const selected = reminderSettings.reminderDays;
    const multi = entitlements.maxRemindersPerSubscription > 1;

    const toggle = async (day: number) => {
        if (!entitlements.reminderDayOptions.includes(day)) {
            Alert.alert(
                "Upgrade to choose",
                "Starter lets you choose when you're reminded, and Pro gives you up to 3 reminders per renewal.",
                [
                    { text: "Not now", style: "cancel" },
                    { text: "See plans", onPress: () => { onClose(); router.push("/plans"); } },
                ]
            );
            return;
        }
        let next: number[];
        if (!multi) next = [day];
        else if (selected.includes(day)) next = selected.length > 1 ? selected.filter((d) => d !== day) : selected;
        else next = [...selected, day].slice(-entitlements.maxRemindersPerSubscription);
        if (next.join() === selected.join()) return;

        setSaving(day);
        try {
            await updateReminderSettings({ reminderDays: next });
        } catch (e) {
            if (!showUpgradePromptIfPlanLimit("Not on your plan", e)) {
                Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
            }
        } finally {
            setSaving(null);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/40">
                <View style={{ backgroundColor: colors.background }} className="rounded-t-3xl p-6">
                    <ThemedText className="text-xl font-extrabold mb-1">Renewal reminders</ThemedText>
                    <ThemedText tone="muted" className="text-sm mb-5">
                        {multi
                            ? `Choose up to ${entitlements.maxRemindersPerSubscription} reminders before each renewal.`
                            : entitlements.reminderDayOptions.length > 1
                              ? "Choose when you're reminded before each renewal."
                              : "You're reminded 1 day before each renewal. Upgrade to choose."}
                    </ThemedText>

                    {ALL_DAY_OPTIONS.map((day) => {
                        const allowed = entitlements.reminderDayOptions.includes(day);
                        const isOn = selected.includes(day);
                        return (
                            <Pressable
                                key={day}
                                onPress={() => toggle(day)}
                                disabled={saving !== null}
                                accessibilityRole={multi ? "checkbox" : "radio"}
                                accessibilityLabel={`${dayLabel(day)}${allowed ? "" : ", upgrade to unlock"}`}
                                accessibilityState={{ checked: isOn, disabled: saving !== null }}
                                style={{ backgroundColor: colors.card, opacity: allowed ? 1 : 0.6 }}
                                className="flex-row items-center justify-between rounded-2xl p-4 mb-3"
                            >
                                <ThemedText className="text-base">{dayLabel(day)}</ThemedText>
                                {saving === day ? (
                                    <ActivityIndicator color={accent} />
                                ) : !allowed ? (
                                    <View className="flex-row items-center">
                                        <Ionicons name="lock-closed" size={16} color={colors.mutedForeground} />
                                        <ThemedText tone="muted" className="text-xs ml-1">Upgrade</ThemedText>
                                    </View>
                                ) : (
                                    <Ionicons
                                        name={isOn ? "checkmark-circle" : "ellipse-outline"}
                                        size={22}
                                        color={isOn ? accent : colors.mutedForeground}
                                    />
                                )}
                            </Pressable>
                        );
                    })}

                    <Pressable onPress={onClose} className="rounded-2xl bg-primary p-4 items-center mt-5">
                        <Text className="text-base font-semibold text-white">Done</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}
