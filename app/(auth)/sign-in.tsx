import { Text } from "react-native"
import React from "react"
import { Link } from "expo-router"
import { styled } from "nativewind"
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context"

const SafeAreaView = styled(RNSafeAreaView)

const SignIn = () => {
    return (
        <SafeAreaView className="flex-1 bg-background p-5">
            <Text className="text-xl font-bold text-primary">SignIn</Text>
            <Link href="/(auth)/sign-up" className="mt-4 text-primary">Create Account</Link>
        </SafeAreaView>
    )
}
export default SignIn
