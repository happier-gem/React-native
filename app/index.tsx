import "@/global.css";
import { Redirect } from "expo-router";
import React from "react";
import { useAuth } from "@clerk/expo";

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
