import { useEffect, useState } from "react";
import { Keyboard, KeyboardEvent, Platform } from "react-native";

/**
 * Tracks live keyboard height via Keyboard events rather than relying on
 * KeyboardAvoidingView's native resize/pan behavior — that behavior is
 * unreliable in Expo Go on Android combined with edge-to-edge (the OS-level
 * resize doesn't hand off cleanly), so this drives extra scroll padding
 * directly from JS instead, which works identically in Expo Go and a dev
 * client on both platforms.
 */
export function useKeyboardHeight() {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
            setHeight(e.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    return height;
}
