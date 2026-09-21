import "@/global.css";
import { Redirect } from "expo-router";
import React from "react";
import { useAuth } from "@clerk/expo";
import { useIsAdmin } from "@/hooks/use-is-admin";

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();
  const isAdmin = useIsAdmin();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href={isAdmin ? "/(admin)/index" : "/(tabs)/home"} />;
}
