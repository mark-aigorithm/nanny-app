import { useEffect } from 'react';
import { Redirect } from 'expo-router';

import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { useMe } from '@mobile/hooks/useMe';
import { useSignOut } from '@mobile/hooks/useAuth';

export default function Index() {
  const user = useAuthStore((s) => s.user);
  const profile = useUserProfileStore((s) => s.profile);
  const meQuery = useMe();
  const signOut = useSignOut();

  // Auto-sign-out for orphan Firebase sessions: a user that has a Firebase
  // account but no backend profile (i.e. they bailed mid-registration on a
  // previous visit). Without this, they would land on /(parent)/home with
  // no data. Sign them out so they can re-register cleanly. This is the
  // signal the `/auth/me` 404 was designed to surface.
  useEffect(() => {
    if (
      user &&
      !meQuery.isFetching &&
      meQuery.isError &&
      !profile &&
      !signOut.isPending
    ) {
      signOut.mutate();
    }
  }, [user, profile, meQuery.isError, meQuery.isFetching, signOut.isPending, signOut]);

  // No Firebase user — go to the auth flow.
  if (!user) return <Redirect href="/(auth)/splash" />;

  // Firebase user but profile fetch in flight — keep the splash up.
  if (meQuery.isFetching && !profile) return null;

  // Firebase user + backend profile — main app.
  // TODO(role-routing): when nanny screens exist, route NANNY → /(nanny)/dashboard.
  if (profile) return <Redirect href="/(parent)/home" />;

  // Firebase user with no profile (404 from /me) — useEffect above is
  // signing them out; render nothing while it processes.
  return null;
}
