import { useRouter } from 'expo-router';

import SplashScreen from '@mobile/screens/auth/SplashScreen';

export default function SplashRoute() {
  const router = useRouter();
  return <SplashScreen onGetStarted={() => router.replace('/(parent)/home')} />;
}
