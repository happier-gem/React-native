import { useEffect } from 'react';
import { Stack } from "expo-router";
import '@/global.css';
import { useFonts } from "expo-font";
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useAppTheme } from '@/context/theme-context';
import { AccountProvider } from '@/context/account-context';
import { CurrencyProvider } from '@/context/currency-context';
import { SubscriptionsProvider } from '@/context/subscriptions-context';
import { PlanProvider } from '@/context/plan-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { NotificationReadProvider } from '@/context/notification-read-context';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env.local file');
}

function AppStatusBar() {
  const { resolvedScheme } = useAppTheme();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'sans-regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'sans-bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'sans-medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'sans-semibold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'sans-extrabold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
    'sans-light': require('../assets/fonts/PlusJakartaSans-Light.ttf'),
  })

  useEffect(() => {
    if(fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ClerkProvider publishableKey={publishableKey!} tokenCache={tokenCache}>
      <ThemeProvider>
        <AccountProvider>
          <CurrencyProvider>
            <NotificationsProvider>
              <NotificationReadProvider>
                <SubscriptionsProvider>
                  <PlanProvider>
                    <AppStatusBar />
                    <Stack screenOptions={{ headerShown: false }} />
                  </PlanProvider>
                </SubscriptionsProvider>
              </NotificationReadProvider>
            </NotificationsProvider>
          </CurrencyProvider>
        </AccountProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}