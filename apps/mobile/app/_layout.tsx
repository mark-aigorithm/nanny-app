import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@mobile/lib/queryClient';

// TODO: Install font packages then uncomment:
//   pnpm add expo-font @expo-google-fonts/manrope --filter @nanny-app/mobile
//
// import { useFonts } from 'expo-font';
// import {
//   Manrope_400Regular,
//   Manrope_500Medium,
//   Manrope_600SemiBold,
//   Manrope_700Bold,
//   Manrope_800ExtraBold,
// } from '@expo-google-fonts/manrope';
// import * as SplashScreen from 'expo-splash-screen';
// SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // TODO: Uncomment once font packages are installed:
  // const [fontsLoaded] = useFonts({
  //   Manrope_400Regular,
  //   Manrope_500Medium,
  //   Manrope_600SemiBold,
  //   Manrope_700Bold,
  //   Manrope_800ExtraBold,
  // });
  // useEffect(() => {
  //   if (fontsLoaded) SplashScreen.hideAsync();
  // }, [fontsLoaded]);
  // if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
