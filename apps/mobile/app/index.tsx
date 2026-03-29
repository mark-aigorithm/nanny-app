import { Redirect } from 'expo-router';

import { useAuthStore } from '@mobile/store/authStore';

export default function Index() {
  const user = useAuthStore((s) => s.user);

  if (user) {
    return <Redirect href="/(parent)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}
