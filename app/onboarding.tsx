import { Text } from "react-native"
import { Link } from "expo-router"
import { styled } from "nativewind"
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context"

const SafeAreaView = styled(RNSafeAreaView)

const Onboarding = () => {
    return (
        <SafeAreaView className="flex-1 bg-background p-5">
            <Text className="text-xl font-bold text-primary">Onboarding</Text>
            <Link href="/home" className="mt-4 rounded-2xl bg-primary text-white p-4">
                Get Started
            </Link>
        </SafeAreaView>
    )
}
export default Onboarding
