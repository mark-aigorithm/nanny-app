import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';

import { queryClient } from '@mobile/lib/queryClient';
import { auth } from '@mobile/lib/firebase';
import { useAuthStore } from '@mobile/store/authStore';
import { useMe } from '@mobile/hooks/useMe';

SplashScreen.preventAutoHideAsync();

/**
 * Side-effect-only component that fetches the application user profile
 * from the backend whenever a Firebase user is signed in. Lives inside
 * QueryClientProvider so it can use React Query.
 */
function ProfileLoader() {
  useMe();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const isHydrating = useAuthStore((s) => s.isHydrating);

  // Subscribe to Firebase auth state changes for the whole app lifecycle.
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((user) => {
      useAuthStore.getState().setUser(user);
      useAuthStore.getState().markHydrated();
    });
    return unsubscribe;
  }, []);

  // Keep the splash up until fonts are loaded AND we've received the first
  // auth state callback — prevents a flash of the auth stack for signed-in
  // users on cold launch.
  useEffect(() => {
    if (fontsLoaded && !isHydrating) SplashScreen.hideAsync();
  }, [fontsLoaded, isHydrating]);

  if (!fontsLoaded || isHydrating) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <ProfileLoader />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
