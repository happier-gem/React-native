import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import React, { useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BillingCycle, formatRenewalDate } from "@/constants/data";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useCurrency } from "@/context/currency-context";
import { useAppTheme } from "@/context/theme-context";
import {
  monthlyEquivalent,
  Subscription,
  useSubscriptions,
} from "@/context/subscriptions-context";

const BackLink = () => (
  <Link href="/subscriptions" asChild>
    <Pressable>
      <ThemedText tone="accent" className="font-semibold">
        {"< Back"}
      </ThemedText>
    </Pressable>
  </Link>
);

const EditSubscriptionModal = ({
  visible,
  onClose,
  subscription,
}: {
  visible: boolean;
  onClose: () => void;
  subscription: Subscription;
}) => {
  const { colors, accent } = useAppTheme();
  const { currency } = useCurrency();
  const { updateSubscription } = useSubscriptions();
  const [price, setPrice] = useState(subscription.price.toString());
  const [cycle, setCycle] = useState<BillingCycle>(subscription.cycle);

  const handleSave = () => {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid price", "Enter a valid amount.");
      return;
    }
    updateSubscription(subscription.id, { price: parsed, cycle });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View style={{ backgroundColor: colors.background }} className="rounded-t-3xl p-6">
          <ThemedText className="text-xl font-extrabold mb-5">
            Edit {subscription.name}
          </ThemedText>

          <ThemedText className="text-sm font-semibold mb-2">Price</ThemedText>
          <View
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
            className="flex-row items-center border rounded-2xl mb-5"
          >
            <ThemedText tone="muted" className="pl-4 text-base">
              {currency.symbol}
            </ThemedText>
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground }}
              className="flex-1 px-2 py-3.5"
            />
          </View>

          <ThemedText className="text-sm font-semibold mb-2">Billing cycle</ThemedText>
          <View
            style={{ backgroundColor: colors.card }}
            className="flex-row rounded-2xl p-1.5 mb-6"
          >
            {(["monthly", "yearly"] as BillingCycle[]).map((option) => {
              const selected = option === cycle;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCycle(option)}
                  className="flex-1 items-center py-3 rounded-xl"
                  style={{ backgroundColor: selected ? accent : "transparent" }}
                >
                  <ThemedText
                    tone={selected ? "white" : "muted"}
                    className="text-sm font-semibold"
                  >
                    {option === "monthly" ? "Monthly" : "Yearly"}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={handleSave}
            className="rounded-2xl bg-primary p-4 items-center mb-3"
          >
            <Text className="text-base font-semibold text-white">Save</Text>
          </Pressable>
          <Pressable onPress={onClose} className="p-3 items-center">
            <ThemedText tone="muted" className="text-base font-semibold">
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSubscription, cancelSubscription, renewSubscription } = useSubscriptions();
  const subscription = getSubscription(id);
  const { format } = useCurrency();
  const { colors, accent } = useAppTheme();
  const [editVisible, setEditVisible] = useState(false);

  if (!subscription) {
    return (
      <ThemedSafeAreaView className="p-5">
        <ThemedText className="text-lg font-semibold mb-4">
          Subscription not found
        </ThemedText>
        <BackLink />
      </ThemedSafeAreaView>
    );
  }

  const canceled = subscription.status === "canceled";

  const handleCancel = () => {
    Alert.alert(
      "Cancel subscription?",
      `You're about to cancel ${subscription.name}.`,
      [
        { text: "Keep subscription", style: "cancel" },
        {
          text: "Cancel subscription",
          style: "destructive",
          onPress: () => cancelSubscription(subscription.id),
        },
      ]
    );
  };

  const handleRenew = () => {
    Alert.alert(
      canceled ? "Reactivate subscription?" : "Renew now?",
      canceled
        ? `${subscription.name} will become active again with a new renewal date.`
        : `This moves ${subscription.name}'s renewal date forward by one ${
            subscription.cycle === "monthly" ? "month" : "year"
          }.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: canceled ? "Reactivate" : "Renew", onPress: () => renewSubscription(subscription.id) },
      ]
    );
  };

  return (
    <ThemedSafeAreaView className="p-5">
      <View className="flex-row items-center justify-between mb-6">
        <BackLink />
        <Pressable onPress={() => setEditVisible(true)} className="flex-row items-center">
          <Ionicons name="pencil-outline" size={16} color={accent} style={{ marginRight: 4 }} />
          <ThemedText tone="accent" className="font-semibold">
            Edit
          </ThemedText>
        </Pressable>
      </View>

      <View className="items-center mb-6">
        <View className="mb-4">
          <BrandIcon icon={subscription.icon} brandColor={subscription.brandColor} size={64} />
        </View>
        <ThemedText className="text-2xl font-extrabold">
          {subscription.name}
        </ThemedText>
        <ThemedText tone="muted" className="text-sm mt-1">
          {subscription.category}
        </ThemedText>
        {canceled ? (
          <View
            className="mt-3 px-3 py-1 rounded-full"
            style={{ backgroundColor: colors.destructive + "26" }}
          >
            <Text className="text-xs font-semibold text-destructive">
              Canceled
            </Text>
          </View>
        ) : null}
      </View>

      <Card className="rounded-2xl p-5 mb-4">
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Price</ThemedText>
          <ThemedText className="font-semibold">
            {format(subscription.price)}{" "}
            {subscription.cycle === "monthly" ? "/mo" : "/yr"}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Monthly equivalent</ThemedText>
          <ThemedText className="font-semibold">
            {format(monthlyEquivalent(subscription))}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">
            {canceled ? "Canceled — last renewal" : "Next renewal"}
          </ThemedText>
          <ThemedText className="font-semibold">
            {formatRenewalDate(subscription.renewalDate)}
          </ThemedText>
        </View>
      </Card>

      {canceled ? (
        <Pressable
          className="rounded-2xl p-4 items-center"
          style={{ backgroundColor: accent }}
          onPress={handleRenew}
        >
          <Text className="text-base font-semibold text-white">
            Renew Subscription
          </Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            className="rounded-2xl bg-primary p-4 items-center mb-3"
            onPress={handleRenew}
          >
            <Text className="text-base font-semibold text-white">
              Renew Now
            </Text>
          </Pressable>
          <Pressable
            className="rounded-2xl border border-destructive p-4 items-center"
            onPress={handleCancel}
          >
            <Text className="text-base font-semibold text-destructive">
              Cancel Subscription
            </Text>
          </Pressable>
        </>
      )}

      <EditSubscriptionModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        subscription={subscription}
      />
    </ThemedSafeAreaView>
  );
};

export default SubscriptionDetails;
