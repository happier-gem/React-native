import React from "react";
import { Text, View } from "react-native";

export default function App() {
  return React.createElement(
    View,
    { className: "flex-1 items-center justify-center bg-white" },
    React.createElement(
      Text,
      { className: "text-xl font-bold text-blue-500" },
      "Welcome to Nativewind!"
    )
  );
}