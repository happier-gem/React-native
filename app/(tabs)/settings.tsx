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
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAccount } from "@/context/account-context";
import { accentPresets, ThemeMode, useAppTheme } from "@/context/theme-context";

const SafeAreaView = styled(RNSafeAreaView);

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
      className={`flex-row items-center justify-between py-4 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <Text className="text-base text-foreground">{label}</Text>
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
          <Text className="text-sm text-muted-foreground mr-2">{value}</Text>
        ) : null}
        <Text className="text-muted-foreground">{">"}</Text>
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-background rounded-t-3xl p-6">
          <Text className="text-xl font-extrabold text-foreground mb-5">
            Edit Account
          </Text>

          <Text className="text-sm font-semibold text-foreground mb-2">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.mutedForeground}
            className="bg-card border border-border rounded-2xl px-4 py-3.5 text-foreground mb-4"
          />

          <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            className="bg-card border border-border rounded-2xl px-4 py-3.5 text-foreground mb-6"
          />

          <Pressable
            onPress={handleSave}
            className="rounded-2xl bg-primary p-4 items-center mb-3"
          >
            <Text className="text-base font-semibold text-white">Save</Text>
          </Pressable>
          <Pressable onPress={onClose} className="p-3 items-center">
            <Text className="text-base font-semibold text-muted-foreground">
              Cancel
            </Text>
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
        <View className="bg-background rounded-t-3xl p-6">
          <Text className="text-xl font-extrabold text-foreground mb-5">
            Accent Color
          </Text>

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
                  <Text className="text-xs text-muted-foreground mt-2">
                    {preset.name}
                  </Text>
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

const AppearanceModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { colors, accent, mode, setMode } = useAppTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-background rounded-t-3xl p-6">
          <Text className="text-xl font-extrabold text-foreground mb-5">
            Appearance
          </Text>

          {themeModeOptions.map((option) => {
            const selected = option.mode === mode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => setMode(option.mode)}
                className="flex-row items-center justify-between bg-card rounded-2xl p-4 mb-3"
              >
                <View className="flex-row items-center">
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={selected ? accent : colors.mutedForeground}
                  />
                  <Text className="text-base text-foreground ml-3">
                    {option.label}
                  </Text>
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

const Settings = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editAccountVisible, setEditAccountVisible] = useState(false);
  const [accentPickerVisible, setAccentPickerVisible] = useState(false);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const { account } = useAccount();
  const { colors, accent, mode, resolvedScheme } = useAppTheme();

  const accentName =
    accentPresets.find((preset) => preset.hex === accent)?.name ?? "Custom";
  const modeLabel =
    themeModeOptions.find((option) => option.mode === mode)?.label ?? "System";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="px-5 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <Text className="text-3xl font-extrabold text-foreground mb-5">
          Settings
        </Text>

        <Pressable onPress={() => setEditAccountVisible(true)}>
          <View className="flex-row items-center bg-card rounded-2xl p-4 mb-6">
            <Image
              source={require("@/assets/images/avatar.png")}
              resizeMode="cover"
              className="w-14 h-14 rounded-full mr-4"
            />
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                {account.name}
              </Text>
              <Text className="text-sm text-muted-foreground mt-0.5">
                {account.email}
              </Text>
            </View>
            <Text className="text-muted-foreground">{">"}</Text>
          </View>
        </Pressable>

        <Text className="text-sm font-semibold text-muted-foreground mb-2">
          Preferences
        </Text>
        <View className="bg-card rounded-2xl px-4 mb-6">
          <View className="flex-row items-center justify-between py-4 border-b border-border">
            <Text className="text-base text-foreground">Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: accent }}
              thumbColor="#ffffff"
            />
          </View>
          <SettingsRow label="Currency" value="USD" />
          <Pressable onPress={() => setAppearanceVisible(true)}>
            <SettingsRow
              label="Appearance"
              value={modeLabel}
              icon={resolvedScheme === "dark" ? "moon" : "sunny"}
            />
          </Pressable>
          <Pressable onPress={() => setAccentPickerVisible(true)}>
            <SettingsRow
              label="Accent Color"
              value={accentName}
              swatchColor={accent}
              last
            />
          </Pressable>
        </View>

        <Text className="text-sm font-semibold text-muted-foreground mb-2">
          About
        </Text>
        <View className="bg-card rounded-2xl px-4 mb-6">
          <SettingsRow label="Version" value="1.0.0" last />
        </View>

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
      <AppearanceModal
        visible={appearanceVisible}
        onClose={() => setAppearanceVisible(false)}
      />
    </SafeAreaView>
  );
};

export default Settings;
