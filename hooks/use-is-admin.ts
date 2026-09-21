import { useUser } from "@clerk/expo";

export function useIsAdmin() {
    const { isLoaded, user } = useUser();
    if (!isLoaded) return false;
    return user?.publicMetadata?.role === "admin";
}
