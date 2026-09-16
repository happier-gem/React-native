import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { styled } from "nativewind"
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { colors } from "@/constants/theme"

const SafeAreaView = styled(RNSafeAreaView)

const SignUp = () => {
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
                        Create account
                    </Text>
                    <Text className="text-base text-muted-foreground mb-8">
                        Start tracking your subscriptions in one place.
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
                    <View className="flex-row items-center bg-card border border-border rounded-2xl mb-4">
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

                    <Text className="text-sm font-semibold text-foreground mb-2">
                        Confirm password
                    </Text>
                    <View className="flex-row items-center bg-card border border-border rounded-2xl mb-2">
                        <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="••••••••"
                            placeholderTextColor={colors.mutedForeground}
                            secureTextEntry={!showConfirmPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            className="flex-1 px-4 py-3.5 text-foreground"
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
                        <Text className="text-muted-foreground">Already have an account? </Text>
                        <Link href="/(auth)/sign-in" className="font-semibold text-accent">
                            Sign In
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}
export default SignUp
