import { Text } from "react-native"
import { styled } from "nativewind"
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context"

const SafeAreaView = styled(RNSafeAreaView)

const Onboarding = () => {
    return (
        <SafeAreaView className="flex-1 bg-background p-5">
            <Text className="text-xl font-bold text-primary">Onboarding</Text>
        </SafeAreaView>
    )
}
export default Onboarding
