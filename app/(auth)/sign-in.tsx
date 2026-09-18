import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

const SignIn = () => {
    const { colors } = useAppTheme()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")

    const handleSignIn = () => {
        if (!email.trim() || !password.trim()) {
            setError("Enter your email and password to continue.")
            return
        }
        setError("")
        router.replace("/home")
    }

    const inputStyle = {
        backgroundColor: colors.card,
        borderColor: colors.border,
        color: colors.foreground,
    }

    return (
        <ThemedSafeAreaView>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    className="px-6"
                    contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
                    keyboardShouldPersistTaps="handled"
                >
                    <ThemedText className="text-3xl font-extrabold mb-2">
                        Welcome back
                    </ThemedText>
                    <ThemedText tone="muted" className="text-base mb-8">
                        Sign in to manage your subscriptions.
                    </ThemedText>

                    <ThemedText className="text-sm font-semibold mb-2">
                        Email
                    </ThemedText>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.mutedForeground}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        style={inputStyle}
                        className="border rounded-2xl px-4 py-3.5 mb-4"
                    />

                    <ThemedText className="text-sm font-semibold mb-2">
                        Password
                    </ThemedText>
                    <View
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        className="flex-row items-center border rounded-2xl mb-2"
                    >
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••••"
                            placeholderTextColor={colors.mutedForeground}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ color: colors.foreground }}
                            className="flex-1 px-4 py-3.5"
                        />
                        <Pressable onPress={() => setShowPassword((v) => !v)} className="px-4">
                            <Ionicons
                                name={showPassword ? "eye-outline" : "eye-off-outline"}
                                size={20}
                                color={colors.mutedForeground}
                            />
                        </Pressable>
                    </View>

                    {error ? (
                        <Text className="text-sm text-destructive mb-2">{error}</Text>
                    ) : null}

                    <Pressable
                        onPress={handleSignIn}
                        className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                    >
                        <Ionicons name="log-in-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text className="text-base font-semibold text-white">Sign In</Text>
                    </Pressable>

                    <View className="flex-row justify-center mt-6">
                        <ThemedText tone="muted">Don't have an account? </ThemedText>
                        <Link href="/(auth)/sign-up" asChild>
                            <Pressable>
                                <ThemedText tone="accent" className="font-semibold">
                                    Create Account
                                </ThemedText>
                            </Pressable>
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedSafeAreaView>
    )
}
export default SignIn
