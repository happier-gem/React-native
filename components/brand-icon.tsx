import React from "react";
import { Image, View } from "react-native";
import { icons, IconKey } from "@/constants/icons";

export function BrandIcon({
    icon,
    brandColor,
    size = 44,
}: {
    icon: IconKey;
    brandColor: string;
    size?: number;
}) {
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 4,
                backgroundColor: brandColor,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Image
                source={icons[icon]}
                resizeMode="contain"
                style={{ width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 }}
            />
        </View>
    );
}
