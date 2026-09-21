import { Tabs, Redirect } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { colors, components } from "@/constants/theme";
import { useAppTheme } from "@/context/theme-context";
import { useIsAdmin } from "@/hooks/use-is-admin";

const tabBar = components.tabBar;

const adminTabs: {
    name: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
}[] = [
    { name: "index", title: "Overview", icon: "grid-outline" },
    { name: "users", title: "Users", icon: "people-outline" },
    { name: "subscriptions", title: "Subscriptions", icon: "card-outline" },
    { name: "analytics", title: "Analytics", icon: "bar-chart-outline" },
    { name: "notifications", title: "Alerts", icon: "notifications-outline" },
    { name: "settings", title: "Settings", icon: "settings-outline" },
];

const AdminTabIcon = ({ focused, icon }: { focused: boolean; icon: keyof typeof Ionicons.glyphMap }) => {
    const { accent } = useAppTheme();
    return (
        <View className="tabs-icon">
            <View
                className="tabs-pill"
                style={{ backgroundColor: focused ? accent : "transparent" }}
            >
                <Ionicons name={icon} size={20} color={focused ? "#ffffff" : "rgba(255,255,255,0.6)"} />
            </View>
        </View>
    );
};

const AdminLayout = () => {
    const { isSignedIn, isLoaded } = useAuth();
    const isAdmin = useIsAdmin();
    const insets = useSafeAreaInsets();

    if (!isLoaded) {
        return null;
    }

    if (!isSignedIn) {
        return <Redirect href="/(auth)/sign-in" />;
    }

    if (!isAdmin) {
        return <Redirect href="/(tabs)/home" />;
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                tabBarStyle: {
                    position: "absolute",
                    bottom: Math.max(insets.bottom, tabBar.horizontalInset),
                    height: tabBar.height,
                    marginHorizontal: tabBar.horizontalInset,
                    borderRadius: tabBar.radius,
                    backgroundColor: colors.primary,
                    borderTopWidth: 0,
                    elevation: 0,
                },
                tabBarItemStyle: {
                    paddingVertical: tabBar.height / 2 - tabBar.iconFrame / 1.6,
                },
                tabBarIconStyle: {
                    width: tabBar.iconFrame,
                    height: tabBar.iconFrame,
                    alignItems: "center",
                },
            }}
        >
            {adminTabs.map((tab) => (
                <Tabs.Screen
                    key={tab.name}
                    name={tab.name}
                    options={{
                        title: tab.title,
                        tabBarIcon: ({ focused }) => (
                            <AdminTabIcon focused={focused} icon={tab.icon} />
                        ),
                    }}
                />
            ))}
        </Tabs>
    );
};

export default AdminLayout;
