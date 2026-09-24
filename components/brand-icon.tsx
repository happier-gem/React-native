import React from "react";
import { Image, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { icons, isVectorIcon, vectorIcons, IconKey } from "@/constants/icons";

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
            {isVectorIcon(icon) ? (
                <MaterialCommunityIcons name={vectorIcons[icon]} size={size * 0.6} color="#ffffff" />
            ) : (
                <Image
                    source={icons[icon]}
                    resizeMode="contain"
                    style={{ width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 }}
                />
            )}
        </View>
    );
}
