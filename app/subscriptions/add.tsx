import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import React, { useState } from "react";
import { Link, router } from "expo-router";
import { BillingCycle } from "@/constants/data";
import { BrandPreset, BRAND_PRESETS, DEFAULT_BRAND_PRESET } from "@/constants/brand-presets";
import { ThemedSafeAreaView, ThemedText } from "@/components/themed";
import { BrandIcon } from "@/components/brand-icon";
import { useAppTheme } from "@/context/theme-context";
import { currencyOptions, useCurrency } from "@/context/currency-context";
import { useSubscriptions } from "@/context/subscriptions-context";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const AddSubscription = () => {
  const { colors, accent } = useAppTheme();
  const { currency } = useCurrency();
  const { addSubscription } = useSubscriptions();

  const [name, setName] = useState("");
  // Tracks the label we auto-filled into Name, so a later icon change can
  // still safely update it — but only while the user hasn't typed their own
  // name over it (see handleSelectPreset).
  const [lastAutoFilledName, setLastAutoFilledName] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [subCurrency, setSubCurrency] = useState(currency.code);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [category, setCategory] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [preset, setPreset] = useState(DEFAULT_BRAND_PRESET);
  const [saving, setSaving] = useState(false);

  const handleSelectPreset = (option: BrandPreset) => {
    setPreset(option);
    // Auto-fill only when Name is empty, or still holds a value we auto-filled
    // ourselves — a name the user typed by hand is never overwritten.
    if (name.trim() === "" || name === lastAutoFilledName) {
      setName(option.label);
      setLastAutoFilledName(option.label);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value !== lastAutoFilledName) setLastAutoFilledName(null);
  };

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
      Alert.alert("Invalid price", "Enter a valid, non-negative amount.");
      return;
    }
    if (!category.trim()) {
      Alert.alert("Missing category", "Enter a category, e.g. Music or Design.");
      return;
    }
    if (!renewalDate.trim() || isNaN(new Date(renewalDate).getTime())) {
      Alert.alert("Invalid date", "Enter the renewal date as YYYY-MM-DD.");
      return;
    }

    setSaving(true);
    try {
      await addSubscription({
        name: name.trim(),
        price: parsedPrice,
        currency: subCurrency,
        cycle,
        category: category.trim(),
        renewalDate: renewalDate.trim(),
        icon: preset.icon,
        brandColor: preset.brandColor,
      });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't add subscription", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    color: colors.foreground,
  };

  return (
    <ThemedSafeAreaView>
      {/* Fixed header — stays put while the form beneath it scrolls */}
      <View className="px-5 pt-5 pb-2">
        <Link href="/subscriptions" asChild>
          <Pressable className="mb-4">
            <ThemedText tone="accent" className="font-semibold">
              {"< Back"}
            </ThemedText>
          </Pressable>
        </Link>
        <ThemedText className="text-3xl font-extrabold">
          Add subscription
        </ThemedText>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="px-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 64 }}
        >
          <ThemedText className="text-sm font-semibold mb-2">Icon</ThemedText>
          <View className="flex-row flex-wrap mb-5" style={{ gap: 10 }}>
            {BRAND_PRESETS.map((option) => {
              const selected = option.icon === preset.icon;
              return (
                <Pressable
                  key={option.icon}
                  onPress={() => handleSelectPreset(option)}
                  style={{
                    borderWidth: selected ? 2 : 0,
                    borderColor: accent,
                    borderRadius: 999,
                    padding: selected ? 2 : 4,
                  }}
                >
                  <BrandIcon icon={option.icon} brandColor={option.brandColor} size={44} />
                </Pressable>
              );
            })}
          </View>

          <ThemedText className="text-sm font-semibold mb-2">Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={handleNameChange}
            placeholder="e.g. Spotify"
            placeholderTextColor={colors.mutedForeground}
            style={fieldStyle}
            className="border rounded-2xl px-4 py-3.5 mb-4"
          />

          <ThemedText className="text-sm font-semibold mb-2">Price</ThemedText>
          <View style={fieldStyle} className="flex-row items-center border rounded-2xl mb-2">
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground }}
              className="flex-1 px-4 py-3.5"
            />
          </View>
          <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
            {currencyOptions.map((option) => {
              const selected = option.code === subCurrency;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => setSubCurrency(option.code)}
                  className="px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: selected ? accent : colors.card }}
                >
                  <ThemedText tone={selected ? "white" : "muted"} className="text-xs font-semibold">
                    {option.code}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText className="text-sm font-semibold mb-2">Billing cycle</ThemedText>
          <View style={{ backgroundColor: colors.card }} className="flex-row rounded-2xl p-1.5 mb-4">
            {(["monthly", "yearly"] as BillingCycle[]).map((option) => {
              const selected = option === cycle;
              return (
                <Pressable
                  key={option}
                  onPress={() => handleCycleChange(option)}
                  className="flex-1 items-center py-3 rounded-xl"
                  style={{ backgroundColor: selected ? accent : "transparent" }}
                >
                  <ThemedText tone={selected ? "white" : "muted"} className="text-sm font-semibold">
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
            style={fieldStyle}
            className="border rounded-2xl px-4 py-3.5 mb-4"
          />

          <ThemedText className="text-sm font-semibold mb-2">Category</ThemedText>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. Music, Design, AI"
            placeholderTextColor={colors.mutedForeground}
            style={fieldStyle}
            className="border rounded-2xl px-4 py-3.5 mb-6"
          />

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.7 : 1 }}
            className="rounded-2xl bg-primary p-4 items-center"
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">Add Subscription</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedSafeAreaView>
  );
};

export default AddSubscription;
