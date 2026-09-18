import {
    Dimensions,
    Image,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native"
import React, { useRef, useState } from "react"
import { Link, router } from "expo-router"
import { icons } from "@/constants/icons"
import { useAppTheme } from "@/context/theme-context"
import { ThemedSafeAreaView, ThemedText } from "@/components/themed"

const { width } = Dimensions.get("window")

const slides = [
    {
        icon: icons.wallet,
        title: "Track every subscription",
        description:
            "See all your subscriptions in one place, from Spotify to Adobe Creative Cloud.",
    },
    {
        icon: icons.activity,
        title: "Understand your spending",
        description:
            "Get a clear breakdown of what you're paying each month and each year.",
    },
    {
        icon: icons.setting,
        title: "Never miss a renewal",
        description:
            "Stay ahead of upcoming renewals so nothing surprises you.",
    },
]

const Onboarding = () => {
    const { colors, accent } = useAppTheme()
    const scrollRef = useRef<ScrollView>(null)
    const [index, setIndex] = useState(0)
    const isLastSlide = index === slides.length - 1

    const handleMomentumScrollEnd = (
        e: NativeSyntheticEvent<NativeScrollEvent>
    ) => {
        const newIndex = Math.round(e.nativeEvent.contentOffset.x / width)
        setIndex(newIndex)
    }

    const goToSlide = (i: number) => {
        scrollRef.current?.scrollTo({ x: i * width, animated: true })
        setIndex(i)
    }

    return (
        <ThemedSafeAreaView>
            <View className="flex-row justify-end px-5 pt-2">
                <Link href="/home" asChild>
                    <Pressable className="p-2">
                        <ThemedText tone="muted" className="text-sm font-semibold">
                            Skip
                        </ThemedText>
                    </Pressable>
                </Link>
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleMomentumScrollEnd}
            >
                {slides.map((slide) => (
                    <View
                        key={slide.title}
                        style={{ width }}
                        className="flex-1 items-center justify-center px-8"
                    >
                        <View className="w-28 h-28 rounded-full bg-primary items-center justify-center mb-8">
                            <Image
                                source={slide.icon}
                                resizeMode="contain"
                                className="w-12 h-12"
                            />
                        </View>
                        <ThemedText className="text-2xl font-extrabold text-center mb-3">
                            {slide.title}
                        </ThemedText>
                        <ThemedText tone="muted" className="text-base text-center leading-6">
                            {slide.description}
                        </ThemedText>
                    </View>
                ))}
            </ScrollView>

            <View className="flex-row justify-center mb-8" style={{ gap: 8 }}>
                {slides.map((slide, i) => (
                    <Pressable
                        key={slide.title}
                        onPress={() => goToSlide(i)}
                        className="h-2 rounded-full"
                        style={{
                            width: i === index ? 24 : 8,
                            backgroundColor: i === index ? accent : colors.border,
                        }}
                    />
                ))}
            </View>

            <View className="px-6 pb-6">
                <Pressable
                    onPress={() =>
                        isLastSlide ? router.replace("/home") : goToSlide(index + 1)
                    }
                    className="rounded-2xl bg-primary p-4 items-center"
                >
                    <Text className="text-base font-semibold text-white">
                        {isLastSlide ? "Get Started" : "Next"}
                    </Text>
                </Pressable>
            </View>
        </ThemedSafeAreaView>
    )
}
export default Onboarding
