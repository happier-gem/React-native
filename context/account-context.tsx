import React, { createContext, ReactNode, useContext, useMemo } from "react";
import { useUser } from "@clerk/expo";

export type Account = {
    name: string;
    email: string;
    imageUrl: string | null;
};

type AccountContextValue = {
    account: Account;
    updateAccount: (update: { name: string }) => Promise<void>;
    updateAvatar: (dataUri: string) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();

    const account = useMemo<Account>(() => ({
        name: user?.fullName?.trim() || user?.firstName?.trim() || "Your Account",
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        imageUrl: user?.imageUrl ?? null,
    }), [user]);

    const updateAccount = async ({ name }: { name: string }) => {
        const trimmed = name.trim();
        if (!user || !trimmed) return;

        const [firstName, ...rest] = trimmed.split(" ");
        const lastName = rest.join(" ");
        await user.update({ firstName, lastName: lastName || undefined });
    };

    const updateAvatar = async (dataUri: string) => {
        if (!user) return;
        await user.setProfileImage({ file: dataUri });
    };

    return (
        <AccountContext.Provider value={{ account, updateAccount, updateAvatar }}>
            {children}
        </AccountContext.Provider>
    );
}

export function useAccount() {
    const ctx = useContext(AccountContext);
    if (!ctx) {
        throw new Error("useAccount must be used within an AccountProvider");
    }
    return ctx;
}
