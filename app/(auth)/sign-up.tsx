import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

const SignUp = () => {
    const { colors } = useAppTheme()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState("")

    const handleSignUp = () => {
        if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
            setError("Fill in every field to continue.")
            return
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.")
            return
        }
        setError("")
        router.replace("/home")
    }

    const fieldWrapStyle = { backgroundColor: colors.card, borderColor: colors.border }

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
                        Create account
                    </ThemedText>
                    <ThemedText tone="muted" className="text-base mb-8">
                        Start tracking your subscriptions in one place.
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
                        style={{ ...fieldWrapStyle, color: colors.foreground }}
                        className="border rounded-2xl px-4 py-3.5 mb-4"
                    />

                    <ThemedText className="text-sm font-semibold mb-2">
                        Password
                    </ThemedText>
                    <View style={fieldWrapStyle} className="flex-row items-center border rounded-2xl mb-4">
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

                    <ThemedText className="text-sm font-semibold mb-2">
                        Confirm password
                    </ThemedText>
                    <View style={fieldWrapStyle} className="flex-row items-center border rounded-2xl mb-2">
                        <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="••••••••"
                            placeholderTextColor={colors.mutedForeground}
                            secureTextEntry={!showConfirmPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ color: colors.foreground }}
                            className="flex-1 px-4 py-3.5"
                        />
                        <Pressable onPress={() => setShowConfirmPassword((v) => !v)} className="px-4">
                            <Ionicons
                                name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                                size={20}
                                color={colors.mutedForeground}
                            />
                        </Pressable>
                    </View>

                    {error ? (
                        <Text className="text-sm text-destructive mb-2">{error}</Text>
                    ) : null}

                    <Pressable
                        onPress={handleSignUp}
                        className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                    >
                        <Ionicons name="person-add-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text className="text-base font-semibold text-white">Create Account</Text>
                    </Pressable>

                    <View className="flex-row justify-center mt-6">
                        <ThemedText tone="muted">Already have an account? </ThemedText>
                        <Link href="/(auth)/sign-in" asChild>
                            <Pressable>
                                <ThemedText tone="accent" className="font-semibold">
                                    Sign In
                                </ThemedText>
                            </Pressable>
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedSafeAreaView>
    )
}
export default SignUp
