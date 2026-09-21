import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSignIn } from "@clerk/expo"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

const SignIn = () => {
    const { colors } = useAppTheme()
    const { signIn, fetchStatus } = useSignIn()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(true)
    const [error, setError] = useState("")

    const isSubmitting = fetchStatus === "fetching"

    const handleSignIn = async () => {
        if (!email.trim() || !password.trim()) {
            setError("Enter your email and password to continue.")
            return
        }
        setError("")

        const { error: passwordError } = await signIn.password({
            identifier: email.trim(),
            password,
        })
        if (passwordError) {
            setError(passwordError.longMessage ?? passwordError.message)
            return
        }

        const { error: finalizeError } = await signIn.finalize()
        if (finalizeError) {
            setError(finalizeError.longMessage ?? finalizeError.message)
            return
        }

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
                behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                        className="border rounded-2xl pl-5 pr-4 py-3.5 mb-4"
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
                            className="flex-1 pl-5 pr-4 py-3.5"
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

                    <Link href="/(auth)/forgot-password" asChild>
                        <Pressable className="self-end mt-2">
                            <ThemedText tone="accent" className="text-sm font-semibold">
                                Forgot password?
                            </ThemedText>
                        </Pressable>
                    </Link>

                    <Pressable
                        onPress={handleSignIn}
                        disabled={isSubmitting}
                        className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                        style={{ opacity: isSubmitting ? 0.7 : 1 }}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                        ) : (
                            <Ionicons name="log-in-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                        )}
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
