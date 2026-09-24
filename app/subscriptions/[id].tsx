import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import React, { useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BillingCycle, formatMoney, formatRenewalDate } from "@/constants/data";
import { BRAND_PRESETS } from "@/constants/brand-presets";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useAppTheme } from "@/context/theme-context";
import {
  monthlyEquivalent,
  Subscription,
  SubscriptionEdits,
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

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

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
  const { updateSubscription } = useSubscriptions();
  const [name, setName] = useState(subscription.name);
  const [price, setPrice] = useState(subscription.price.toString());
  const [cycle, setCycle] = useState<BillingCycle>(subscription.cycle);
  const [category, setCategory] = useState(subscription.category);
  const [renewalDate, setRenewalDate] = useState(subscription.renewalDate);
  const [icon, setIcon] = useState(subscription.icon);
  const [saving, setSaving] = useState(false);

  const handleCycleChange = (nextCycle: BillingCycle) => {
    if (nextCycle === cycle) return;
    const current = parseFloat(price);
    if (!isNaN(current)) {
      const converted = nextCycle === "yearly" ? current * 12 : current / 12;
      setPrice((Math.round(converted * 100) / 100).toString());
    }
    setCycle(nextCycle);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Enter a subscription name.");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert("Invalid price", "Enter a valid amount.");
      return;
    }
    if (!category.trim()) {
      Alert.alert("Missing category", "Enter a category.");
      return;
    }
    if (isNaN(new Date(renewalDate).getTime())) {
      Alert.alert("Invalid date", "Enter the renewal date as YYYY-MM-DD.");
      return;
    }

    // Only derive a new color from the preset table when the icon actually
    // changed — otherwise always keep the subscription's existing color
    // exactly as-is, so saving unrelated edits (price, date, ...) can never
    // shift an icon's color.
    const iconChanged = icon !== subscription.icon;
    const preset = iconChanged ? BRAND_PRESETS.find((p) => p.icon === icon) : undefined;
    const edits: SubscriptionEdits = {
      name: name.trim(),
      price: parsedPrice,
      cycle,
      category: category.trim(),
      renewalDate,
      icon,
      brandColor: iconChanged ? (preset?.brandColor ?? subscription.brandColor) : subscription.brandColor,
    };

    setSaving(true);
    try {
      await updateSubscription(subscription.id, edits);
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save changes", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        {/* Fixed title — stays put while the fields below it scroll */}
        <View style={{ backgroundColor: colors.background, maxHeight: "88%" }} className="rounded-t-3xl">
          <ThemedText className="text-xl font-extrabold px-6 pt-6 pb-4 text-center">
            Edit subscription
          </ThemedText>

          <KeyboardAwareScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={20}
          >
          <ThemedText className="text-sm font-semibold mb-2">Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Subscription name"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
            className="border rounded-2xl px-4 py-3.5 mb-4"
          />

          <ThemedText className="text-sm font-semibold mb-2">Icon</ThemedText>
          <View className="flex-row flex-wrap mb-4" style={{ gap: 10 }}>
            {BRAND_PRESETS.map((preset) => {
              const selected = preset.icon === icon;
              return (
                <Pressable
                  key={preset.icon}
                  onPress={() => setIcon(preset.icon)}
                  style={{
                    borderWidth: selected ? 2 : 0,
                    borderColor: accent,
                    borderRadius: 999,
                    padding: selected ? 2 : 4,
                  }}
                >
                  <BrandIcon icon={preset.icon} brandColor={preset.brandColor} size={40} />
                </Pressable>
              );
            })}
          </View>

          <ThemedText className="text-sm font-semibold mb-2">Price</ThemedText>
          <View
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
            className="flex-row items-center border rounded-2xl mb-4"
          >
            <ThemedText tone="muted" className="pl-4 text-base">
              {subscription.currency}
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
            className="flex-row rounded-2xl p-1.5 mb-4"
          >
            {(["monthly", "yearly"] as BillingCycle[]).map((option) => {
              const selected = option === cycle;
              return (
                <Pressable
                  key={option}
                  onPress={() => handleCycleChange(option)}
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

          <ThemedText className="text-sm font-semibold mb-2">Renewal date</ThemedText>
          <TextInput
            value={renewalDate}
            onChangeText={setRenewalDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
            className="border rounded-2xl px-4 py-3.5 mb-4"
          />

          <ThemedText className="text-sm font-semibold mb-2">Category</ThemedText>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. Design, Music"
            placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
            className="border rounded-2xl px-4 py-3.5 mb-6"
          />

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.7 : 1 }}
            className="rounded-2xl bg-primary p-4 items-center mb-3"
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-semibold text-white">Save</Text>}
          </Pressable>
          <Pressable onPress={onClose} className="p-3 items-center">
            <ThemedText tone="muted" className="text-base font-semibold">
              Cancel
            </ThemedText>
          </Pressable>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
};

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSubscription, cancelSubscription, renewSubscription, deleteSubscription, loading } = useSubscriptions();
  const subscription = getSubscription(id);
  const { colors, accent } = useAppTheme();
  const [editVisible, setEditVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!subscription) {
    return (
      <ThemedSafeAreaView>
        <View className="flex-1 p-5">
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : (
            <>
              <ThemedText className="text-lg font-semibold mb-4">
                Subscription not found
              </ThemedText>
              <BackLink />
            </>
          )}
        </View>
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
          onPress: async () => {
            setBusy(true);
            try {
              await cancelSubscription(subscription.id);
            } catch (e) {
              Alert.alert("Couldn't cancel", errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
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
        {
          text: canceled ? "Reactivate" : "Renew",
          onPress: async () => {
            setBusy(true);
            try {
              await renewSubscription(subscription.id);
            } catch (e) {
              Alert.alert("Couldn't renew", errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete subscription?",
      `This permanently deletes ${subscription.name} and its history. This can't be undone — if you just want to stop being billed, use Cancel instead.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteSubscription(subscription.id);
              router.replace("/subscriptions");
            } catch (e) {
              setBusy(false);
              Alert.alert("Couldn't delete", errorMessage(e));
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedSafeAreaView>
      <View className="flex-1 p-5">
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
            {formatMoney(subscription.price, subscription.currency)}{" "}
            {subscription.cycle === "monthly" ? "/mo" : "/yr"}
          </ThemedText>
        </View>
        <View className="flex-row items-center justify-between py-2">
          <ThemedText tone="muted">Monthly equivalent</ThemedText>
          <ThemedText className="font-semibold">
            {formatMoney(monthlyEquivalent(subscription), subscription.currency)}
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
          className="rounded-2xl p-4 items-center mb-3"
          style={{ backgroundColor: accent, opacity: busy ? 0.7 : 1 }}
          disabled={busy}
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
            style={{ opacity: busy ? 0.7 : 1 }}
            disabled={busy}
            onPress={handleRenew}
          >
            <Text className="text-base font-semibold text-white">
              Renew Now
            </Text>
          </Pressable>
          <Pressable
            className="rounded-2xl border border-destructive p-4 items-center mb-3"
            style={{ opacity: busy ? 0.7 : 1 }}
            disabled={busy}
            onPress={handleCancel}
          >
            <Text className="text-base font-semibold text-destructive">
              Cancel Subscription
            </Text>
          </Pressable>
        </>
      )}

      <Pressable className="p-3 items-center" disabled={busy} onPress={handleDelete}>
        <ThemedText tone="muted" className="text-sm font-semibold" style={{ color: colors.destructive }}>
          Delete permanently
        </ThemedText>
      </Pressable>

      <EditSubscriptionModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        subscription={subscription}
      />
      </View>
    </ThemedSafeAreaView>
  );
};

export default SubscriptionDetails;
