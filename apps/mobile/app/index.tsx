import { useEffect } from 'react';
import { Redirect } from 'expo-router';

import { useAuthStore } from '@mobile/store/authStore';
import { useGuestStore } from '@mobile/store/guestStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { useMe } from '@mobile/hooks/useMe';
import { useSignOut } from '@mobile/hooks/useAuth';
import { Role } from '@shared/auth';
import { IdVerificationStatus } from '@shared/nanny';

export default function Index() {
  const user = useAuthStore((s) => s.user);
  const isGuest = useGuestStore((s) => s.isGuest);
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

  // No Firebase user — guests browse the read-only parent experience,
  // everyone else goes to the auth flow.
  if (!user) {
    return isGuest
      ? <Redirect href="/(parent)/home" />
      : <Redirect href="/(auth)/splash" />;
  }

  // Firebase user but profile fetch in flight — keep the splash up.
  if (meQuery.isFetching && !profile) return null;

  // Firebase user + backend profile — route by role.
  if (profile) {
    if (profile.role === Role.NANNY) {
      // Nannies are vetted by an admin before they can use the app. If their ID
      // is missing (PENDING_ID) or was rejected (REJECTED), force a re-upload;
      // once uploaded (PENDING_REVIEW) they wait; APPROVED lets them in.
      switch (profile.idVerificationStatus) {
        case IdVerificationStatus.APPROVED:
          return <Redirect href="/(nanny)/dashboard" />;
        case IdVerificationStatus.PENDING_ID:
        case IdVerificationStatus.REJECTED:
          return <Redirect href="/(auth)/upload-id" />;
        default:
          return <Redirect href="/(auth)/pending-review" />;
      }
    }
    return <Redirect href="/(parent)/home" />;
  }

  // Firebase user with no profile (404 from /me) — useEffect above is
  // signing them out; render nothing while it processes.
  return null;
}
