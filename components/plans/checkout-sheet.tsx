import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { ThemedText } from "@/components/themed";
import { useAppTheme } from "@/context/theme-context";
import type { AvailablePlan, PaidTierId } from "@/context/plan-context";
import { formatLongDate, formatPlanPrice, intervalLabel, planName, type PlanAction } from "@/lib/plan-display";
import {
    checkPhoneForNetwork,
    NETWORK_PREFIXES,
    PAYMENT_PROVIDERS,
    type CheckoutState,
    type InitiateInput,
    type PaymentProvider,
} from "@/lib/payment-flow";

export type CheckoutSelection = {
    plan: AvailablePlan & { id: PaidTierId };
    action: Extract<PlanAction, { kind: "upgrade" | "downgrade" | "renew" }>["kind"];
    explanation: string;
};

type Props = {
    visible: boolean;
    selection: CheckoutSelection | null;
    state: CheckoutState;
    availablePlans: AvailablePlan[];
    onStart: (input: InitiateInput) => void;
    onCheckAgain: () => void;
    /** Back to the confirmation step for another attempt. */
    onRetry: () => void;
    onDone: () => void;
    onClose: () => void;
};

const Button = ({
    label,
    onPress,
    variant = "primary",
    disabled,
    loading,
    testID,
}: {
    label: string;
    onPress: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
    loading?: boolean;
    testID?: string;
}) => {
    const { accent } = useAppTheme();
    const inactive = disabled || loading;
    return (
        <Pressable
            testID={testID}
            onPress={onPress}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!inactive, busy: !!loading }}
            style={{
                alignSelf: "stretch",
                opacity: inactive ? 0.6 : 1,
                backgroundColor: variant === "primary" ? accent : "transparent",
            }}
            className={variant === "primary" ? "w-full rounded-2xl p-4 items-center mb-3" : "w-full p-3 items-center"}
        >
            {loading ? (
                <ActivityIndicator color="#ffffff" />
            ) : variant === "primary" ? (
                <Text className="text-base font-semibold text-white">{label}</Text>
            ) : (
                <ThemedText tone="muted" className="text-base font-semibold">
                    {label}
                </ThemedText>
            )}
        </Pressable>
    );
};

/** Status headline with an icon AND words — never color alone. */
const StatusHeader = ({
    icon,
    color,
    title,
    busy,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    busy?: boolean;
}) => (
    <View className="items-center mb-4" accessible accessibilityRole="header" accessibilityLabel={title}>
        {busy ? (
            <ActivityIndicator size="large" color={color} />
        ) : (
            <Ionicons name={icon} size={48} color={color} />
        )}
        <ThemedText className="text-xl font-extrabold mt-3 text-center">{title}</ThemedText>
    </View>
);

const Body = ({ children }: { children: React.ReactNode }) => (
    <ThemedText tone="muted" className="text-base text-center mb-3">
        {children}
    </ThemedText>
);

type PayerDetails = { provider: PaymentProvider; phone: string };

function ConfirmStep({
    selection,
    payer,
    onPayerChange,
    onStart,
    onClose,
}: {
    selection: CheckoutSelection;
    payer: PayerDetails;
    onPayerChange: (next: PayerDetails) => void;
    onStart: (input: InitiateInput) => void;
    onClose: () => void;
}) {
    const { colors, accent } = useAppTheme();
    const { provider, phone } = payer;
    const setProvider = (next: PaymentProvider) => onPayerChange({ ...payer, provider: next });
    const setPhone = (next: string) => onPayerChange({ ...payer, phone: next });
    const [touched, setTouched] = useState(false);
    const phoneNumber = phone.replace(/\s+/g, "");
    const phoneValid = checkPhoneForNetwork(phoneNumber, provider) !== null;
    const providerName = PAYMENT_PROVIDERS.find((p) => p.id === provider)?.name ?? "";

    return (
        <>
            <ThemedText className="text-xl font-extrabold text-center mb-5">Confirm payment</ThemedText>

            <View style={{ backgroundColor: colors.card }} className="rounded-2xl p-5 mb-4">
                <ThemedText className="text-lg font-bold">{selection.plan.name}</ThemedText>
                <ThemedText className="text-2xl font-extrabold mt-1" testID="confirm-price">
                    {formatPlanPrice({ ...selection.plan, interval: null })}
                </ThemedText>
                <ThemedText tone="muted" className="text-sm mt-1">
                    {intervalLabel(selection.plan.interval)}
                </ThemedText>
            </View>

            <ThemedText className="text-sm mb-5" testID="confirm-explanation">
                {selection.explanation}
            </ThemedText>

            <ThemedText className="text-sm font-semibold mb-2">Pay with</ThemedText>
            <View className="flex-row mb-4" style={{ gap: 10 }} accessibilityRole="radiogroup">
                {PAYMENT_PROVIDERS.map((p) => {
                    const selected = p.id === provider;
                    return (
                        <Pressable
                            key={p.id}
                            onPress={() => setProvider(p.id)}
                            accessibilityRole="radio"
                            accessibilityLabel={p.name}
                            accessibilityState={{ selected }}
                            style={{
                                flex: 1,
                                borderWidth: 2,
                                borderColor: selected ? accent : colors.border,
                                backgroundColor: colors.card,
                            }}
                            className="rounded-2xl p-3 flex-row items-center justify-center"
                        >
                            <Ionicons
                                name={selected ? "radio-button-on" : "radio-button-off"}
                                size={18}
                                color={selected ? accent : colors.mutedForeground}
                                style={{ marginRight: 6 }}
                            />
                            <ThemedText className="font-semibold">{p.name}</ThemedText>
                        </Pressable>
                    );
                })}
            </View>

            <ThemedText className="text-sm font-semibold mb-2">Mobile money number</ThemedText>
            <TextInput
                testID="phone-input"
                value={phone}
                onChangeText={setPhone}
                onBlur={() => setTouched(true)}
                placeholder="e.g. 0991234567"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel="Mobile money number"
                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
                className="border rounded-2xl px-4 py-3.5 mb-2"
            />
            {touched && phone.length > 0 && !phoneValid ? (
                <Text className="text-sm text-destructive mb-2">
                    Enter a {providerName} number starting {NETWORK_PREFIXES[provider].join(" or ")}.
                </Text>
            ) : null}

            <View className="mt-4">
                <Button
                    testID="continue-to-payment"
                    label="Continue to payment"
                    disabled={!phoneValid}
                    onPress={() => onStart({ plan: selection.plan.id, provider, phoneNumber })}
                />
                <Button label="Cancel" variant="secondary" onPress={onClose} />
            </View>
        </>
    );
}

function resultForSuccess(state: Extract<CheckoutState, { phase: "success" }>, availablePlans: AvailablePlan[]) {
    const name = planName(state.plan, availablePlans);
    const server = state.serverPlan;
    if (!state.planUpdated || !server) {
        return "Your payment was received. Your plan is still being updated — it will appear here shortly.";
    }
    if (server.plan === state.plan) {
        return server.expiresAt ? `Your ${name} plan is active until ${formatLongDate(server.expiresAt)}.` : `Your ${name} plan is now active.`;
    }
    // Queued downgrade: the server kept the current plan and scheduled this one.
    const currentName = planName(server.plan, availablePlans);
    return server.expiresAt
        ? `${name} will begin after your ${currentName} plan ends on ${formatLongDate(server.expiresAt)}.`
        : `${name} is scheduled.`;
}

export function CheckoutSheet({ visible, selection, state, availablePlans, onStart, onCheckAgain, onRetry, onDone, onClose }: Props) {
    const { colors, accent } = useAppTheme();
    // Kept here (not in ConfirmStep) so "Try again" after an error resubmits
    // the same details — and therefore reuses the same idempotency key.
    const [payer, setPayer] = useState<PayerDetails>({ provider: PAYMENT_PROVIDERS[0].id, phone: "" });
    // Can't dismiss while the request that creates the payment is in flight.
    const dismissable = state.phase !== "starting" && state.phase !== "confirming_plan";
    const planLabel = (plan: PaidTierId) => planName(plan, availablePlans);

    let content: React.ReactNode = null;
    switch (state.phase) {
        case "idle":
            content = selection ? <ConfirmStep selection={selection} payer={payer} onPayerChange={setPayer} onStart={onStart} onClose={onClose} /> : null;
            break;
        case "starting":
            content = <StatusHeader icon="hourglass-outline" color={accent} title="Starting payment..." busy />;
            break;
        case "pending":
            content = (
                <>
                    <StatusHeader icon="time-outline" color={accent} title="Payment pending" busy />
                    <Body>Complete the payment on your phone using the instructions provided.</Body>
                    <Body>We&apos;re checking for confirmation...</Body>
                    <Button label="Close — keep checking in the background" variant="secondary" onPress={onClose} />
                </>
            );
            break;
        case "confirming_plan":
            content = <StatusHeader icon="checkmark-circle-outline" color={colors.success} title="Payment received — updating your plan..." busy />;
            break;
        case "success":
            content = (
                <>
                    <StatusHeader icon="checkmark-circle" color={colors.success} title="Payment successful!" />
                    <Body>{resultForSuccess(state, availablePlans)}</Body>
                    <Button testID="checkout-done" label="Done" onPress={onDone} />
                </>
            );
            break;
        case "failed":
        case "cancelled":
            content = (
                <>
                    <StatusHeader
                        icon={state.phase === "failed" ? "close-circle" : "remove-circle"}
                        color={colors.destructive}
                        title={state.phase === "failed" ? "Payment failed" : "Payment cancelled"}
                    />
                    <Body>
                        {state.phase === "failed" ? "Your plan has not been changed." : "No changes were made to your plan."}
                    </Body>
                    <Button testID="checkout-retry" label="Try again" onPress={onRetry} />
                    <Button label="Close" variant="secondary" onPress={onClose} />
                </>
            );
            break;
        case "still_pending":
            content = (
                <>
                    <StatusHeader icon="time-outline" color={accent} title="Payment is still being confirmed" />
                    <Body>
                        We haven&apos;t heard back about your {planLabel(state.plan)} payment yet. This doesn&apos;t mean it failed.
                    </Body>
                    <Body>You can return to your plan later and we&apos;ll refresh the status.</Body>
                    <Button testID="checkout-check-again" label="Check again" onPress={onCheckAgain} />
                    <Button label="Close" variant="secondary" onPress={onClose} />
                </>
            );
            break;
        case "error":
            content = (
                <>
                    <StatusHeader icon="alert-circle" color={colors.destructive} title="Something went wrong" />
                    <Body>{state.message}</Body>
                    {state.payment ? (
                        <>
                            <Body>Your payment may still go through — checking again is safe.</Body>
                            <Button label="Check again" onPress={onCheckAgain} />
                        </>
                    ) : (
                        <Button testID="checkout-retry" label="Try again" onPress={onRetry} />
                    )}
                    <Button label="Close" variant="secondary" onPress={onClose} />
                </>
            );
            break;
    }

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={dismissable ? onClose : () => {}}>
            <View className="flex-1 justify-end bg-black/40">
                <View style={{ backgroundColor: colors.background, maxHeight: "90%" }} className="rounded-t-3xl">
                    <KeyboardAwareScrollView
                        contentContainerStyle={{ padding: 24 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        enableOnAndroid
                        extraScrollHeight={20}
                    >
                        {content}
                    </KeyboardAwareScrollView>
                </View>
            </View>
        </Modal>
    );
}
