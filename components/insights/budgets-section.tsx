import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Card, ThemedText } from "@/components/themed";
import { LockedCard } from "@/components/insights/locked-card";
import { useAppTheme } from "@/context/theme-context";
import { usePlan } from "@/context/plan-context";
import { useNotificationsSettings } from "@/context/notifications-context";
import { formatMoney } from "@/constants/data";
import { budgetName, useBudgets, type Budget, type BudgetInput } from "@/hooks/use-budgets";
import { showUpgradePromptIfPlanLimit } from "@/lib/upgrade-prompt";

const STATUS_TEXT: Record<Budget["status"], string> = { ok: "On track", near: "Almost at limit", over: "Over budget" };
const NEAR_COLOR = "#d97706";

function BudgetEditor({
    visible,
    budget,
    categories,
    allowCategories,
    onSave,
    onDelete,
    onClose,
}: {
    visible: boolean;
    budget: Budget | null;
    categories: string[];
    allowCategories: boolean;
    onSave: (input: BudgetInput) => Promise<void>;
    onDelete: () => Promise<void>;
    onClose: () => void;
}) {
    const { colors, accent } = useAppTheme();
    const [category, setCategory] = useState(budget?.category ?? "");
    const [limit, setLimit] = useState(budget ? String(budget.monthlyLimit) : "");
    const [busy, setBusy] = useState(false);

    const amount = Number(limit.replace(/,/g, ""));
    const valid = Number.isFinite(amount) && amount > 0;

    const save = async () => {
        setBusy(true);
        try {
            await onSave({ category: category.trim() || null, monthlyLimit: amount, currency: budget?.currency ?? "MWK" });
            onClose();
        } catch (e) {
            if (!showUpgradePromptIfPlanLimit("Not on your plan", e)) {
                Alert.alert("Couldn't save budget", e instanceof Error ? e.message : "Please try again.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/40">
                <View style={{ backgroundColor: colors.background, maxHeight: "88%" }} className="rounded-t-3xl">
                    <KeyboardAwareScrollView
                        contentContainerStyle={{ padding: 24 }}
                        keyboardShouldPersistTaps="handled"
                        enableOnAndroid
                        extraScrollHeight={20}
                    >
                        <ThemedText className="text-xl font-extrabold mb-5">{budget ? "Edit budget" : "New budget"}</ThemedText>

                        {allowCategories ? (
                            <>
                                <ThemedText className="text-sm font-semibold mb-2">Category (leave empty for overall)</ThemedText>
                                <TextInput
                                    value={category}
                                    onChangeText={setCategory}
                                    placeholder="e.g. Entertainment"
                                    placeholderTextColor={colors.mutedForeground}
                                    accessibilityLabel="Budget category"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
                                    className="border rounded-2xl px-4 py-3.5 mb-2"
                                />
                                <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
                                    {categories.map((c) => (
                                        <Pressable
                                            key={c}
                                            onPress={() => setCategory(c)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Use category ${c}`}
                                            className="px-3 py-1.5 rounded-full"
                                            style={{ backgroundColor: category === c ? accent : colors.card }}
                                        >
                                            <ThemedText tone={category === c ? "white" : "muted"} className="text-xs font-semibold">
                                                {c}
                                            </ThemedText>
                                        </Pressable>
                                    ))}
                                </View>
                            </>
                        ) : (
                            <ThemedText tone="muted" className="text-sm mb-4">
                                Your overall monthly budget for all subscriptions. Pro adds budgets per category.
                            </ThemedText>
                        )}

                        <ThemedText className="text-sm font-semibold mb-2">Monthly limit ({budget?.currency ?? "MWK"})</ThemedText>
                        <TextInput
                            value={limit}
                            onChangeText={setLimit}
                            keyboardType="decimal-pad"
                            placeholder="e.g. 20000"
                            placeholderTextColor={colors.mutedForeground}
                            accessibilityLabel="Monthly limit"
                            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
                            className="border rounded-2xl px-4 py-3.5 mb-6"
                        />

                        <Pressable
                            onPress={save}
                            disabled={!valid || busy}
                            accessibilityRole="button"
                            accessibilityLabel="Save budget"
                            accessibilityState={{ disabled: !valid || busy, busy }}
                            style={{ opacity: !valid || busy ? 0.6 : 1, backgroundColor: accent }}
                            className="rounded-2xl p-4 items-center mb-3"
                        >
                            {busy ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-semibold text-white">Save</Text>}
                        </Pressable>
                        {budget ? (
                            <Pressable
                                onPress={async () => {
                                    setBusy(true);
                                    try {
                                        await onDelete();
                                        onClose();
                                    } catch (e) {
                                        Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Please try again.");
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                                disabled={busy}
                                accessibilityRole="button"
                                className="p-3 items-center"
                            >
                                <Text className="text-base font-semibold text-destructive">Delete budget</Text>
                            </Pressable>
                        ) : null}
                        <Pressable onPress={onClose} accessibilityRole="button" className="p-3 items-center">
                            <ThemedText tone="muted" className="text-base font-semibold">Cancel</ThemedText>
                        </Pressable>
                    </KeyboardAwareScrollView>
                </View>
            </View>
        </Modal>
    );
}

/** Budgets block for the Insights screen — by plan: Free locked, Starter one
 * overall budget, Pro per category. */
export function BudgetsSection({ categories }: { categories: string[] }) {
    const { colors, accent } = useAppTheme();
    const { entitlements } = usePlan();
    const { enabled: notificationsEnabled } = useNotificationsSettings();
    const allowed = entitlements.budgets !== "none";
    const { budgets, loading, error, refresh, save, remove } = useBudgets({ enabled: allowed, alerts: notificationsEnabled });
    const [editing, setEditing] = useState<Budget | "new" | null>(null);

    // Spending changes when subscriptions do — re-check whenever Insights opens.
    useFocusEffect(
        useCallback(() => {
            void refresh();
        }, [refresh])
    );

    if (!allowed) {
        return <LockedCard title="Monthly budget alerts" detail="Starter adds a monthly budget that alerts you before you overspend." />;
    }

    const canAdd = entitlements.budgets === "per_category" || !budgets.some((b) => b.category === null);

    return (
        <View className="mb-2">
            <View className="flex-row items-center justify-between mb-3">
                <ThemedText tone="muted" className="text-sm font-semibold">Budgets</ThemedText>
                {canAdd ? (
                    <Pressable onPress={() => setEditing("new")} accessibilityRole="button" accessibilityLabel="Add budget" className="flex-row items-center">
                        <Ionicons name="add-circle-outline" size={18} color={accent} />
                        <ThemedText tone="accent" className="text-sm font-semibold ml-1">Add</ThemedText>
                    </Pressable>
                ) : null}
            </View>

            {loading && budgets.length === 0 ? <ActivityIndicator color={colors.foreground} /> : null}
            {error ? <ThemedText tone="muted" className="text-sm mb-3">{error}</ThemedText> : null}
            {!loading && !error && budgets.length === 0 ? (
                <ThemedText tone="muted" className="text-sm mb-3">
                    Set a monthly limit and we&apos;ll tell you when your subscriptions get close to it.
                </ThemedText>
            ) : null}

            {budgets.map((b) => {
                const barColor = !b.active ? colors.mutedForeground : b.status === "over" ? colors.destructive : b.status === "near" ? NEAR_COLOR : accent;
                return (
                    <Pressable
                        key={b.id}
                        onPress={() => setEditing(b)}
                        accessibilityRole="button"
                        accessibilityLabel={`${budgetName(b)} budget: ${formatMoney(b.spent, b.currency)} of ${formatMoney(b.monthlyLimit, b.currency)}, ${b.active ? STATUS_TEXT[b.status] : "not on your current plan"}. Edit`}
                    >
                        <Card className="rounded-2xl p-4 mb-3" style={{ opacity: b.active ? 1 : 0.6 }}>
                            <View className="flex-row items-center justify-between mb-2">
                                <ThemedText className="text-base font-semibold">{budgetName(b)}</ThemedText>
                                <ThemedText className="text-xs font-semibold" style={{ color: barColor }}>
                                    {b.active ? STATUS_TEXT[b.status] : "Not on your plan"}
                                </ThemedText>
                            </View>
                            <View style={{ backgroundColor: colors.muted }} className="h-2 rounded-full overflow-hidden mb-2">
                                <View style={{ width: `${Math.min(100, b.percent)}%`, backgroundColor: barColor }} className="h-2 rounded-full" />
                            </View>
                            <ThemedText tone="muted" className="text-xs">
                                {formatMoney(b.spent, b.currency)} of {formatMoney(b.monthlyLimit, b.currency)} a month ({b.percent}%)
                            </ThemedText>
                        </Card>
                    </Pressable>
                );
            })}

            {editing ? (
                <BudgetEditor
                    visible
                    budget={editing === "new" ? null : editing}
                    categories={categories}
                    allowCategories={entitlements.budgets === "per_category"}
                    onSave={(input) => save(input, editing === "new" ? undefined : editing.id)}
                    onDelete={() => (editing === "new" ? Promise.resolve() : remove(editing.id))}
                    onClose={() => setEditing(null)}
                />
            ) : null}
        </View>
    );
}
