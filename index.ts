// App entry. Runs the Expo Go log filter before expo-router loads any screen
// (screens import expo-notifications, which logs as soon as it's loaded).
import "./lib/dev-log-filters";
import "expo-router/entry";
