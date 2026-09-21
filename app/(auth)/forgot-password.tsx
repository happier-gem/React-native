import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import React, { useState } from "react"
import { Link, router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSignIn } from "@clerk/expo"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

type Step = "email" | "reset"

const ForgotPassword = () => {
    const { colors } = useAppTheme()
    const { signIn, fetchStatus } = useSignIn()
    const [step, setStep] = useState<Step>("email")
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")

    const isSubmitting = fetchStatus === "fetching"

    const inputStyle = {
        backgroundColor: colors.card,
        borderColor: colors.border,
        color: colors.foreground,
    }

    const handleSendCode = async () => {
        if (!email.trim()) {
            setError("Enter the email address on your account.")
            return
        }
        setError("")

        const { error: createError } = await signIn.create({ identifier: email.trim() })
        if (createError) {
            setError(createError.longMessage ?? createError.message)
            return
        }

        const { error: sendCodeError } = await signIn.resetPasswordEmailCode.sendCode()
        if (sendCodeError) {
            setError(sendCodeError.longMessage ?? sendCodeError.message)
            return
        }

        setStep("reset")
    }

    const handleResetPassword = async () => {
        if (!code.trim() || !password.trim() || !confirmPassword.trim()) {
            setError("Fill in every field to continue.")
            return
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.")
            return
        }
        setError("")

        const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() })
        if (verifyError) {
            setError(verifyError.longMessage ?? verifyError.message)
            return
        }

        const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({
            password,
            signOutOfOtherSessions: true,
        })
        if (submitError) {
            setError(submitError.longMessage ?? submitError.message)
            return
        }

        const { error: finalizeError } = await signIn.finalize()
        if (finalizeError) {
            setError(finalizeError.longMessage ?? finalizeError.message)
            return
        }

        router.replace("/home")
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
                        Reset password
                    </ThemedText>
                    <ThemedText tone="muted" className="text-base mb-8">
                        {step === "email"
                            ? "Enter your email and we'll send you a reset code."
                            : `Enter the code we sent to ${email.trim()} and choose a new password.`}
                    </ThemedText>

                    {step === "email" ? (
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
                                style={inputStyle}
                                className="border rounded-2xl px-4 py-3.5 mb-4"
                            />

                            {error ? (
                                <Text className="text-sm text-destructive mb-2">{error}</Text>
                            ) : null}

                            <Pressable
                                onPress={handleSendCode}
                                disabled={isSubmitting}
                                className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                                style={{ opacity: isSubmitting ? 0.7 : 1 }}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                                ) : (
                                    <Ionicons name="mail-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                                )}
                                <Text className="text-base font-semibold text-white">Send Code</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <ThemedText className="text-sm font-semibold mb-2">
                                Reset code
                            </ThemedText>
                            <TextInput
                                value={code}
                                onChangeText={setCode}
                                placeholder="123456"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="number-pad"
                                style={inputStyle}
                                className="border rounded-2xl px-4 py-3.5 mb-4"
                            />

                            <ThemedText className="text-sm font-semibold mb-2">
                                New password
                            </ThemedText>
                            <View
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                className="flex-row items-center border rounded-2xl mb-4"
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

                            <ThemedText className="text-sm font-semibold mb-2">
                                Confirm new password
                            </ThemedText>
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="••••••••"
                                placeholderTextColor={colors.mutedForeground}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={inputStyle}
                                className="border rounded-2xl px-4 py-3.5 mb-2"
                            />

                            {error ? (
                                <Text className="text-sm text-destructive mb-2">{error}</Text>
                            ) : null}

                            <Pressable
                                onPress={handleResetPassword}
                                disabled={isSubmitting}
                                className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                                style={{ opacity: isSubmitting ? 0.7 : 1 }}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                                ) : (
                                    <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                                )}
                                <Text className="text-base font-semibold text-white">Reset Password</Text>
                            </Pressable>

                            <Pressable onPress={() => { setStep("email"); setError("") }} className="mt-4 self-center">
                                <ThemedText tone="muted" className="text-sm">
                                    Use a different email
                                </ThemedText>
                            </Pressable>
                        </>
                    )}

                    <View className="flex-row justify-center mt-6">
                        <ThemedText tone="muted">Remembered your password? </ThemedText>
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
export default ForgotPassword
