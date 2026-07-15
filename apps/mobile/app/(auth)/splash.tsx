import { useRouter } from 'expo-router';

import SplashScreen from '@mobile/screens/auth/SplashScreen';
import { useGuestStore } from '@mobile/store/guestStore';

export default function SplashRoute() {
  const router = useRouter();
  return (
    <SplashScreen
      onGetStarted={() => router.push('/(auth)/role-selection')}
      onContinueAsGuest={() => {
        useGuestStore.getState().enterGuestMode();
        router.replace('/(parent)/home');
      }}
    />
  );
}
