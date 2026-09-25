// Native modules that have no implementation under Jest.
jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.test";

// Icon fonts load through expo-asset, which isn't resolvable under Jest.
// Icons are decorative here (every status also has text), so render nothing.
jest.mock("@expo/vector-icons", () => {
    const Icon = () => null;
    return new Proxy({}, { get: () => Icon });
});
