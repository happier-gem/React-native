import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { styled } from "nativewind"
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { colors } from "@/constants/theme"

const SafeAreaView = styled(RNSafeAreaView)

const SignIn = () => {
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

    return (
        <SafeAreaView className="flex-1 bg-background">
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    className="px-6"
                    contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text className="text-3xl font-extrabold text-foreground mb-2">
                        Welcome back
                    </Text>
                    <Text className="text-base text-muted-foreground mb-8">
                        Sign in to manage your subscriptions.
                    </Text>

                    <Text className="text-sm font-semibold text-foreground mb-2">
                        Email
                    </Text>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.mutedForeground}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        className="bg-card border border-border rounded-2xl px-4 py-3.5 text-foreground mb-4"
                    />

                    <Text className="text-sm font-semibold text-foreground mb-2">
                        Password
                    </Text>
                    <View className="flex-row items-center bg-card border border-border rounded-2xl mb-2">
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••••"
                            placeholderTextColor={colors.mutedForeground}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            className="flex-1 px-4 py-3.5 text-foreground"
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
                        <Text className="text-muted-foreground">Don't have an account? </Text>
                        <Link href="/(auth)/sign-up" className="font-semibold text-accent">
                            Create Account
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}
export default SignIn
