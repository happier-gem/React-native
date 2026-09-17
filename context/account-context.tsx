import React, { createContext, ReactNode, useContext, useState } from "react";

export type Account = {
    name: string;
    email: string;
};

type AccountContextValue = {
    account: Account;
    updateAccount: (account: Account) => void;
};

const defaultAccount: Account = {
    name: "Your Account",
    email: "you@example.com",
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
    const [account, setAccount] = useState<Account>(defaultAccount);

    return (
        <AccountContext.Provider value={{ account, updateAccount: setAccount }}>
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
