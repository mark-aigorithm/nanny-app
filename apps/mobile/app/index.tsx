import { Redirect } from 'expo-router';

// ASSUMPTION: Auth is not yet implemented. Routing through splash so the
// onboarding flow can be tested. Once Firebase login is wired up, restore:
//   import { useAuthStore } from '@mobile/store/authStore';
//   const user = useAuthStore((s) => s.user);
//   if (!user) return <Redirect href="/(auth)/splash" />;

export default function Index() {
  return <Redirect href="/(auth)/splash" />;
}
