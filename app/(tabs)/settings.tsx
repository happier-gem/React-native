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
import React, { useState } from "react";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAccount } from "@/context/account-context";
import { accentPresets, ThemeMode, useAppTheme } from "@/context/theme-context";
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
  const { account, updateAccount } = useAccount();
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);

  const handleSave = () => {
    updateAccount({ name: name.trim() || account.name, email: email.trim() || account.email });
    onClose();
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
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={fieldStyle}
            className="border rounded-2xl px-4 py-3.5 mb-6"
          />

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editAccountVisible, setEditAccountVisible] = useState(false);
  const [accentPickerVisible, setAccentPickerVisible] = useState(false);
  const { account } = useAccount();
  const { colors, accent } = useAppTheme();

  const accentName =
    accentPresets.find((preset) => preset.hex === accent)?.name ?? "Custom";

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
              source={require("@/assets/images/avatar.png")}
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
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: accent }}
              thumbColor="#ffffff"
            />
          </View>
          <SettingsRow label="Currency" value="USD" />
          <Pressable onPress={() => setAccentPickerVisible(true)}>
            <SettingsRow
              label="Accent Color"
              value={accentName}
              swatchColor={accent}
              last
            />
          </Pressable>
        </Card>

        <ThemedText tone="muted" className="text-sm font-semibold mb-2">
          About
        </ThemedText>
        <Card className="rounded-2xl px-4 mb-6">
          <SettingsRow label="Version" value="1.0.0" last />
        </Card>

        <Link href="/(auth)/sign-in" asChild>
          <Pressable className="rounded-2xl border border-destructive p-4 items-center">
            <Text className="text-base font-semibold text-destructive">
              Sign Out
            </Text>
          </Pressable>
        </Link>
      </ScrollView>

      <EditAccountModal
        visible={editAccountVisible}
        onClose={() => setEditAccountVisible(false)}
      />
      <AccentPickerModal
        visible={accentPickerVisible}
        onClose={() => setAccentPickerVisible(false)}
      />
    </ThemedSafeAreaView>
  );
};

export default Settings;
