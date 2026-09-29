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
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")
    // "verify": Clerk wants an emailed code before it creates the session —
    // e.g. Device Trust on a new device ("needs_client_trust") or email 2FA.
    const [step, setStep] = useState<"credentials" | "verify">("credentials")
    const [code, setCode] = useState("")
    const [notice, setNotice] = useState("")

    const isSubmitting = fetchStatus === "fetching"

    // Clerk can also throw (not just return { error }) — never let that escape
    // as an unhandled promise, which looks like "nothing happens".
    const describe = (e: unknown) =>
        e instanceof Error && e.message ? e.message : "Something went wrong. Please try again."

    const finish = async () => {
        const { error: finalizeError } = await signIn.finalize()
        if (finalizeError) {
            setError(finalizeError.longMessage ?? finalizeError.message)
            return
        }
        router.replace("/home")
    }

    const canVerifyByEmail = () =>
        (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") &&
        signIn.supportedSecondFactors.some((factor) => factor.strategy === "email_code")

    const sendCode = async () => {
        const { error: sendError } = await signIn.mfa.sendEmailCode()
        if (sendError) {
            setError(sendError.longMessage ?? sendError.message)
            return false
        }
        return true
    }

    const handleSignIn = async () => {
        if (!email.trim() || !password.trim()) {
            setError("Enter your email and password to continue.")
            return
        }
        setError("")
        setNotice("")

        try {
            const { error: passwordError } = await signIn.password({
                identifier: email.trim(),
                password,
            })
            if (passwordError) {
                setError(passwordError.longMessage ?? passwordError.message)
                return
            }

            if (signIn.status === "complete") {
                await finish()
                return
            }
            if (canVerifyByEmail()) {
                if (await sendCode()) {
                    setCode("")
                    setStep("verify")
                }
                return
            }
            setError("This account needs a verification step the app doesn't support yet. Please contact support.")
        } catch (e) {
            setError(describe(e))
        }
    }

    const handleVerify = async () => {
        if (!code.trim()) {
            setError("Enter the code from your email.")
            return
        }
        setError("")
        setNotice("")
        try {
            const { error: verifyError } = await signIn.mfa.verifyEmailCode({ code: code.trim() })
            if (verifyError) {
                setError(verifyError.longMessage ?? verifyError.message)
                return
            }
            if (signIn.status === "complete") {
                await finish()
                return
            }
            setError("That didn't finish signing you in. Request a new code and try again.")
        } catch (e) {
            setError(describe(e))
        }
    }

    const handleResend = async () => {
        setError("")
        setNotice("")
        try {
            if (await sendCode()) setNotice("A new code is on its way.")
        } catch (e) {
            setError(describe(e))
        }
    }

    const startOver = () => {
        setStep("credentials")
        setCode("")
        setError("")
        setNotice("")
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
                    {step === "verify" ? (
                        <>
                            <ThemedText className="text-3xl font-extrabold mb-2">
                                Check your email
                            </ThemedText>
                            <ThemedText tone="muted" className="text-base mb-8">
                                For your security, we sent a verification code to {email.trim()}. Enter it to
                                finish signing in on this device.
                            </ThemedText>

                            <ThemedText className="text-sm font-sans-semibold mb-2">
                                Verification code
                            </ThemedText>
                            <TextInput
                                value={code}
                                onChangeText={setCode}
                                placeholder="123456"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="number-pad"
                                autoComplete="one-time-code"
                                textContentType="oneTimeCode"
                                accessibilityLabel="Verification code"
                                style={inputStyle}
                                className="border rounded-2xl pl-5 pr-4 py-3.5 mb-2"
                            />

                            {error ? (
                                <Text className="text-sm text-destructive mb-2">{error}</Text>
                            ) : null}
                            {notice ? (
                                <ThemedText tone="muted" className="text-sm mb-2">{notice}</ThemedText>
                            ) : null}

                            <Pressable
                                onPress={handleVerify}
                                disabled={isSubmitting}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                                className="flex-row rounded-2xl bg-primary p-4 items-center justify-center mt-6"
                                style={{ opacity: isSubmitting ? 0.7 : 1 }}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                                ) : (
                                    <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                                )}
                                <Text className="text-base font-sans-semibold text-white">Verify</Text>
                            </Pressable>

                            <Pressable onPress={handleResend} disabled={isSubmitting} accessibilityRole="button" className="items-center mt-6">
                                <ThemedText tone="accent" className="font-sans-semibold">Resend code</ThemedText>
                            </Pressable>
                            <Pressable onPress={startOver} accessibilityRole="button" className="items-center mt-4">
                                <ThemedText tone="muted" className="font-sans-semibold">Use a different account</ThemedText>
                            </Pressable>
                        </>
                    ) : (
                    <>
                    <ThemedText className="text-3xl font-extrabold mb-2">
                        Welcome back
                    </ThemedText>
                    <ThemedText tone="muted" className="text-base mb-8">
                        Sign in to manage your subscriptions.
                    </ThemedText>

                    <ThemedText className="text-sm font-sans-semibold mb-2">
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

                    <ThemedText className="text-sm font-sans-semibold mb-2">
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
                            <ThemedText tone="accent" className="text-sm font-sans-semibold">
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
                        <Text className="text-base font-sans-semibold text-white">Sign In</Text>
                    </Pressable>

                    <View className="flex-row justify-center mt-6">
                        <ThemedText tone="muted">Don&apos;t have an account? </ThemedText>
                        <Link href="/(auth)/sign-up" asChild>
                            <Pressable>
                                <ThemedText tone="accent" className="font-sans-semibold">
                                    Create Account
                                </ThemedText>
                            </Pressable>
                        </Link>
                    </View>
                    </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedSafeAreaView>
    )
}
export default SignIn
