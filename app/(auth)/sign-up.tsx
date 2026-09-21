import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSignUp } from "@clerk/expo"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

const SignUp = () => {
    const { colors } = useAppTheme()
    const { signUp, fetchStatus } = useSignUp()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [code, setCode] = useState("")
    const [pendingVerification, setPendingVerification] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState("")

    const isSubmitting = fetchStatus === "fetching"

    const finishAndEnter = async () => {
        const { error: finalizeError } = await signUp.finalize()
        if (finalizeError) {
            setError(finalizeError.longMessage ?? finalizeError.message)
            return
        }
        router.replace("/home")
    }

    const handleSignUp = async () => {
        if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
            setError("Fill in every field to continue.")
            return
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.")
            return
        }
        setError("")

        const { error: passwordError } = await signUp.password({
            emailAddress: email.trim(),
            password,
        })
        if (passwordError) {
            setError(passwordError.longMessage ?? passwordError.message)
            return
        }

        if (signUp.status === "complete") {
            await finishAndEnter()
            return
        }

        const { error: sendCodeError } = await signUp.verifications.sendEmailCode()
        if (sendCodeError) {
            setError(sendCodeError.longMessage ?? sendCodeError.message)
            return
        }
        setPendingVerification(true)
    }

    const handleVerify = async () => {
        if (!code.trim()) {
            setError("Enter the code we emailed you.")
            return
        }
        setError("")

        const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code: code.trim() })
        if (verifyError) {
            setError(verifyError.longMessage ?? verifyError.message)
            return
        }

        await finishAndEnter()
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
                        {pendingVerification
                            ? `Enter the code we sent to ${email.trim()}.`
                            : "Start tracking your subscriptions in one place."}
                    </ThemedText>

                    {pendingVerification ? (
                        <>
                            <ThemedText className="text-sm font-semibold mb-2">
                                Verification code
                            </ThemedText>
                            <TextInput
                                value={code}
                                onChangeText={setCode}
                                placeholder="123456"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="number-pad"
                                style={{ ...fieldWrapStyle, color: colors.foreground }}
                                className="border rounded-2xl px-4 py-3.5 mb-2"
                            />
                        </>
                    ) : (
                        <>
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
                        </>
                    )}

                    {error ? (
                        <Text className="text-sm text-destructive mb-2">{error}</Text>
                    ) : null}

                    <Pressable
                        onPress={pendingVerification ? handleVerify : handleSignUp}
                        disabled={isSubmitting}
                        className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                        style={{ opacity: isSubmitting ? 0.7 : 1 }}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                        ) : (
                            <Ionicons
                                name={pendingVerification ? "checkmark-circle-outline" : "person-add-outline"}
                                size={18}
                                color="#ffffff"
                                style={{ marginRight: 8 }}
                            />
                        )}
                        <Text className="text-base font-semibold text-white">
                            {pendingVerification ? "Verify Email" : "Create Account"}
                        </Text>
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
