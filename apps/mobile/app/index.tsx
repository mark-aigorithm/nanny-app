import { Redirect } from 'expo-router';

// ASSUMPTION: Auth is not yet implemented. Routing directly to the parent home
// screen so the UI can be developed and tested. Restore the auth check below
// once Firebase login is wired up.
//
// import { useAuthStore } from '@mobile/store/authStore';
// const user = useAuthStore((s) => s.user);
// if (!user) return <Redirect href="/(auth)/login" />;

export default function Index() {
  return <Redirect href="/(parent)/home" />;
}
