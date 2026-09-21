import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useAccount } from "@/context/account-context";
import { accentPresets, ThemeMode, useAppTheme } from "@/context/theme-context";
import { currencyOptions, useCurrency } from "@/context/currency-context";
import { useNotificationsSettings } from "@/context/notifications-context";
import { sendTestNotifications } from "@/lib/notifications";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Card, ThemedSafeAreaView, ThemedText } from "@/components/themed";

const SettingsRow = ({
  label,
  value,
  swatchColor,
  icon,
  last,
}: {
  label: string;
  value?: string;
  swatchColor?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  last?: boolean;
}) => {
  const { colors } = useAppTheme();
  return (
    <View
      style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}
      className="flex-row items-center justify-between py-4"
    >
      <ThemedText className="text-base">{label}</ThemedText>
      <View className="flex-row items-center">
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={colors.mutedForeground}
            style={{ marginRight: 8 }}
          />
        ) : null}
        {swatchColor ? (
          <View
            className="w-7 h-7 rounded-full mr-2"
            style={{
              backgroundColor: swatchColor,
              borderWidth: 2,
              borderColor: colors.foreground,
            }}
          />
        ) : null}
        {value ? (
          <ThemedText tone="muted" className="text-sm mr-2">{value}</ThemedText>
        ) : null}
        <ThemedText tone="muted">{">"}</ThemedText>
      </View>
    </View>
  );
};

const EditAccountModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { colors } = useAppTheme();
  const { account, updateAccount, updateAvatar } = useAccount();
  const [name, setName] = useState(account.name);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  useEffect(() => {
    if (!avatarSuccess) return;
    const timer = setTimeout(() => setAvatarSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [avatarSuccess]);

  const handleSave = async () => {
    setSaving(true);
    await updateAccount({ name: name.trim() || account.name });
    setSaving(false);
    onClose();
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setAvatarError("");
    setAvatarSuccess(false);
    setUploadingAvatar(true);
    try {
      const mimeType = result.assets[0].mimeType ?? "image/jpeg";
      await updateAvatar(`data:${mimeType};base64,${result.assets[0].base64}`);
      setAvatarSuccess(true);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't upload photo. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const fieldStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    color: colors.foreground,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View style={{ backgroundColor: colors.background }} className="rounded-t-3xl p-6">
          <ThemedText className="text-xl font-extrabold mb-5">
            Edit Account
          </ThemedText>

          <Pressable
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
            className="items-center mb-6"
          >
            <View>
              <Image
                source={account.imageUrl ? { uri: account.imageUrl } : require("@/assets/images/avatar.png")}
                resizeMode="cover"
                className="w-24 h-24 rounded-full"
                style={{ opacity: uploadingAvatar ? 0.5 : 1 }}
              />
              <View
                style={{ backgroundColor: colors.primary, borderColor: colors.background }}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center"
              >
                <Ionicons name="camera-outline" size={16} color="#ffffff" />
              </View>
            </View>
            <ThemedText tone={avatarSuccess ? "accent" : "muted"} className="text-sm mt-2">
              {uploadingAvatar ? "Uploading..." : avatarSuccess ? "Profile picture updated" : "Tap to change photo"}
            </ThemedText>
            {avatarError ? (
              <Text className="text-sm text-destructive mt-1 text-center">{avatarError}</Text>
            ) : null}
          </Pressable>

          <ThemedText className="text-sm font-semibold mb-2">Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.mutedForeground}
            style={fieldStyle}
            className="border rounded-2xl px-4 py-3.5 mb-4"
          />

          <ThemedText className="text-sm font-semibold mb-2">Email</ThemedText>
          <View
            style={{ backgroundColor: colors.muted, borderColor: colors.border }}
            className="border rounded-2xl px-4 py-3.5 mb-1"
          >
            <ThemedText tone="muted">{account.email}</ThemedText>
          </View>
          <ThemedText tone="muted" className="text-xs mb-6">
            Your email is tied to your account and can&apos;t be changed here.
          </ThemedText>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.7 : 1 }}
            className="rounded-2xl bg-primary p-4 items-center mb-3"
          >
            <Text className="text-base font-semibold text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
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

const AccentPickerModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { colors, accent, setAccent } = useAppTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View style={{ backgroundColor: colors.background }} className="rounded-t-3xl p-6">
          <ThemedText className="text-xl font-extrabold mb-5">
            Accent Color
          </ThemedText>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            {accentPresets.map((preset) => {
              const selected = preset.hex === accent;
              return (
                <Pressable
                  key={preset.hex}
                  onPress={() => setAccent(preset.hex)}
                  className="items-center"
                  style={{ width: 64 }}
                >
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: preset.hex,
                      borderWidth: selected ? 4 : 2,
                      borderColor: selected ? colors.foreground : colors.card,
                      shadowColor: "#000",
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    }}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={26} color="#ffffff" />
                    ) : null}
                  </View>
                  <ThemedText tone="muted" className="text-xs mt-2">
                    {preset.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            className="rounded-2xl bg-primary p-4 items-center mt-8"
          >
            <Text className="text-base font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const CurrencyPickerModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { colors, accent } = useAppTheme();
  const { currency, setCurrencyCode } = useCurrency();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View style={{ backgroundColor: colors.background }} className="rounded-t-3xl p-6">
          <ThemedText className="text-xl font-extrabold mb-5">
            Currency
          </ThemedText>

          {currencyOptions.map((option) => {
            const selected = option.code === currency.code;
            return (
              <Pressable
                key={option.code}
                onPress={() => setCurrencyCode(option.code)}
                style={{ backgroundColor: colors.card }}
                className="flex-row items-center justify-between rounded-2xl p-4 mb-3"
              >
                <View className="flex-row items-center">
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: selected ? accent : colors.muted }}
                  >
                    <ThemedText
                      tone={selected ? "white" : "muted"}
                      className="text-sm font-bold"
                    >
                      {option.symbol}
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText className="text-base">{option.name}</ThemedText>
                    <ThemedText tone="muted" className="text-xs">{option.code}</ThemedText>
                  </View>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={accent} />
                ) : null}
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClose}
            className="rounded-2xl bg-primary p-4 items-center mt-3"
          >
            <Text className="text-base font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const themeModeOptions: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: "light", label: "Light", icon: "sunny-outline" },
  { mode: "dark", label: "Dark", icon: "moon-outline" },
  { mode: "system", label: "System", icon: "phone-portrait-outline" },
];

const ThemeSwitcher = () => {
  const { colors, accent, mode, setMode } = useAppTheme();

  return (
    <View
      style={{ backgroundColor: colors.card }}
      className="flex-row rounded-2xl p-1.5 mb-6"
    >
      {themeModeOptions.map((option) => {
        const selected = option.mode === mode;
        return (
          <Pressable
            key={option.mode}
            onPress={() => setMode(option.mode)}
            className="flex-1 items-center py-3 rounded-xl"
            style={{ backgroundColor: selected ? accent : "transparent" }}
          >
            <Ionicons
              name={option.icon}
              size={20}
              color={selected ? "#ffffff" : colors.mutedForeground}
            />
            <ThemedText
              tone={selected ? "white" : "muted"}
              className="text-xs font-semibold mt-1"
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
};

const Settings = () => {
  const [editAccountVisible, setEditAccountVisible] = useState(false);
  const [accentPickerVisible, setAccentPickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const { account } = useAccount();
  const { colors, accent } = useAppTheme();
  const { currency } = useCurrency();
  const { signOut } = useAuth();
  const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } = useNotificationsSettings();
  const isAdmin = useIsAdmin();

  const accentName =
    accentPresets.find((preset) => preset.hex === accent)?.name ?? "Custom";

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const handleSendTestNotification = async () => {
    if (!notificationsEnabled) {
      const granted = await setNotificationsEnabled(true);
      if (!granted) return;
    }
    await sendTestNotifications();
  };

  return (
    <ThemedSafeAreaView>
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <ThemedText className="text-3xl font-extrabold mb-5">
          Settings
        </ThemedText>

        <ThemeSwitcher />

        <Pressable onPress={() => setEditAccountVisible(true)}>
          <Card className="flex-row items-center rounded-2xl p-4 mb-6">
            <Image
              source={account.imageUrl ? { uri: account.imageUrl } : require("@/assets/images/avatar.png")}
              resizeMode="cover"
              className="w-14 h-14 rounded-full mr-4"
            />
            <View className="flex-1">
              <ThemedText className="text-base font-semibold">
                {account.name}
              </ThemedText>
              <ThemedText tone="muted" className="text-sm mt-0.5">
                {account.email}
              </ThemedText>
            </View>
            <ThemedText tone="muted">{">"}</ThemedText>
          </Card>
        </Pressable>

        <ThemedText tone="muted" className="text-sm font-semibold mb-2">
          Preferences
        </ThemedText>
        <Card className="rounded-2xl px-4 mb-6">
          <View
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            className="flex-row items-center justify-between py-4"
          >
            <ThemedText className="text-base">Notifications</ThemedText>
            <Switch
              value={notificationsEnabled}
              onValueChange={(value) => { void setNotificationsEnabled(value); }}
              trackColor={{ false: colors.border, true: accent }}
              thumbColor="#ffffff"
            />
          </View>
          <Pressable onPress={handleSendTestNotification}>
            <SettingsRow label="Send test notification" icon="paper-plane-outline" />
          </Pressable>
          <Pressable onPress={() => setCurrencyPickerVisible(true)}>
            <SettingsRow label="Currency" value={currency.code} />
          </Pressable>
          <Pressable onPress={() => setAccentPickerVisible(true)}>
            <SettingsRow
              label="Accent Color"
              value={accentName}
              swatchColor={accent}
              last
            />
          </Pressable>
        </Card>

        {isAdmin ? (
          <Pressable onPress={() => router.push("/(admin)/index")}>
            <Card className="flex-row items-center rounded-2xl p-4 mb-6">
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: accent + "26" }}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={accent} />
              </View>
              <ThemedText className="text-base font-semibold flex-1">Admin Dashboard</ThemedText>
              <ThemedText tone="muted">{">"}</ThemedText>
            </Card>
          </Pressable>
        ) : null}

        <ThemedText tone="muted" className="text-sm font-semibold mb-2">
          About
        </ThemedText>
        <Card className="rounded-2xl px-4 mb-6">
          <SettingsRow label="Version" value="1.0.0" last />
        </Card>

        <Pressable
          onPress={handleSignOut}
          className="rounded-2xl border border-destructive p-4 items-center"
        >
          <Text className="text-base font-semibold text-destructive" numberOfLines={1}>
            Sign Out
          </Text>
        </Pressable>
      </ScrollView>

      <EditAccountModal
        visible={editAccountVisible}
        onClose={() => setEditAccountVisible(false)}
      />
      <AccentPickerModal
        visible={accentPickerVisible}
        onClose={() => setAccentPickerVisible(false)}
      />
      <CurrencyPickerModal
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
      />
    </ThemedSafeAreaView>
  );
};

export default Settings;
