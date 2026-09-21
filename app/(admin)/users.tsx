import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Card, ThemedText } from "@/components/themed";
import { ThemedSafeAreaView } from "@/components/themed";
import { useAppTheme } from "@/context/theme-context";
import { useAccount } from "@/context/account-context";
import { AdminHeader } from "@/components/admin-header";
import { DemoBanner, DemoTag, EmptyState, SegmentedControl } from "@/components/admin-ui";

type UserStatus = "active" | "suspended";
type StatusFilter = "all" | UserStatus;

type AdminUserRow = {
    id: string;
    name: string;
    email: string;
    status: UserStatus;
    isDemo: boolean;
};

const demoUsers: Omit<AdminUserRow, "isDemo">[] = [
    { id: "demo-1", name: "Amara Whitfield", email: "amara.whitfield@example.com", status: "active" },
    { id: "demo-2", name: "Kenji Osei", email: "kenji.osei@example.com", status: "active" },
    { id: "demo-3", name: "Priya Nandakumar", email: "priya.n@example.com", status: "suspended" },
];

const explainBackendRequired = (action: string) => {
    Alert.alert(
        "Backend required",
        `${action} another user isn't possible from this app yet. Clerk only lets the client manage the currently signed-in user's own account — managing other accounts requires a server using Clerk's Backend API with a secret key.`
    );
};

const UserRow = ({ user }: { user: AdminUserRow }) => {
    const { colors } = useAppTheme();
    const suspended = user.status === "suspended";

    return (
        <Card className="rounded-2xl p-4 mb-3">
            <View className="flex-row items-center">
                <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: colors.muted }}
                >
                    <ThemedText className="text-base font-bold">
                        {user.name.charAt(0).toUpperCase()}
                    </ThemedText>
                </View>
                <View className="flex-1">
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                        <ThemedText className="text-base font-semibold">{user.name}</ThemedText>
                        {user.isDemo ? <DemoTag /> : (
                            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.mutedForeground + "26" }}>
                                <ThemedText tone="muted" className="text-[10px] font-bold">YOU</ThemedText>
                            </View>
                        )}
                    </View>
                    <ThemedText tone="muted" className="text-xs mt-0.5">{user.email}</ThemedText>
                </View>
                <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: (suspended ? colors.destructive : colors.success) + "26" }}
                >
                    <ThemedText
                        className="text-xs font-semibold"
                        style={{ color: suspended ? colors.destructive : colors.success }}
                    >
                        {suspended ? "Suspended" : "Active"}
                    </ThemedText>
                </View>
            </View>

            <View className="flex-row mt-3" style={{ gap: 10 }}>
                <Pressable
                    onPress={() =>
                        Alert.alert(user.name, `${user.email}\nStatus: ${suspended ? "Suspended" : "Active"}`)
                    }
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{ borderWidth: 1, borderColor: colors.border }}
                >
                    <Ionicons name="eye-outline" size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
                    <ThemedText tone="muted" className="text-xs font-semibold">View</ThemedText>
                </Pressable>
                <Pressable
                    onPress={() => explainBackendRequired(suspended ? "Reactivating" : "Suspending")}
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{ borderWidth: 1, borderColor: colors.border }}
                >
                    <Ionicons
                        name={suspended ? "checkmark-circle-outline" : "ban-outline"}
                        size={14}
                        color={colors.mutedForeground}
                        style={{ marginRight: 6 }}
                    />
                    <ThemedText tone="muted" className="text-xs font-semibold">
                        {suspended ? "Reactivate" : "Suspend"}
                    </ThemedText>
                </Pressable>
                <Pressable
                    onPress={() => explainBackendRequired("Deleting")}
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{ borderWidth: 1, borderColor: colors.destructive }}
                >
                    <Ionicons name="trash-outline" size={14} color={colors.destructive} style={{ marginRight: 6 }} />
                    <ThemedText className="text-xs font-semibold" style={{ color: colors.destructive }}>
                        Delete
                    </ThemedText>
                </Pressable>
            </View>
        </Card>
    );
};

const AdminUsers = () => {
    const { colors } = useAppTheme();
    const { account } = useAccount();
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const allUsers = useMemo<AdminUserRow[]>(() => {
        const you: AdminUserRow = {
            id: "you",
            name: account.name,
            email: account.email,
            status: "active",
            isDemo: false,
        };
        return [you, ...demoUsers.map((u) => ({ ...u, isDemo: true }))];
    }, [account]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allUsers.filter((user) => {
            if (q && !user.name.toLowerCase().includes(q) && !user.email.toLowerCase().includes(q)) return false;
            if (statusFilter !== "all" && user.status !== statusFilter) return false;
            return true;
        });
    }, [allUsers, query, statusFilter]);

    return (
        <ThemedSafeAreaView>
            <ScrollView
                className="px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                <AdminHeader title="Users" subtitle="Account directory" />

                <DemoBanner message="Listing, suspending, reactivating and deleting other users requires Clerk's Backend API on a server, which this app doesn't have. Your own real account is shown below alongside a few clearly-labeled demo rows so you can try the search, filter and layout." />

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by name or email"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }}
                    className="border rounded-2xl px-4 py-3.5 mb-3"
                />

                <View className="mb-5">
                    <SegmentedControl
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                            { key: "all", label: "All" },
                            { key: "active", label: "Active" },
                            { key: "suspended", label: "Suspended" },
                        ]}
                    />
                </View>

                <ThemedText tone="muted" className="text-xs font-semibold mb-3">
                    {filtered.length} of {allUsers.length} users
                </ThemedText>

                {filtered.length === 0 ? (
                    <EmptyState icon="search-outline" message="No users match your search or filter." />
                ) : (
                    filtered.map((user) => <UserRow key={user.id} user={user} />)
                )}
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default AdminUsers;
