import { useEffect, useState } from 'react';
import type { Href } from 'expo-router';

import { useSignOut } from '@mobile/hooks/useAuth';
import { useMe } from '@mobile/hooks/useMe';
import { isNotFound } from '@mobile/lib/api';
import { auth } from '@mobile/lib/firebase';
import { seedDraftFromAccount } from '@mobile/lib/resumeSignUp';
import { useAuthStore } from '@mobile/store/authStore';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { ApprovalStatus, Role } from '@shared/auth';

/**
 * What `app/index.tsx` renders: nothing yet (`wait`), a `Redirect`, or
 * `CouldNotConnectScreen` with its Retry and Sign out.
 */
export type RootGate =
  | { kind: 'wait' }
  | { kind: 'redirect'; href: Href }
  | { kind: 'error'; retry: () => void; signOut: () => void; isSigningOut: boolean };

/**
 * Where the app root sends whoever opens it.
 *
 * A Firebase account with no `users` row (`/auth/me` 404) is a sign-up that
 * stopped between Firebase creating the account and /auth/register writing the
 * row. It is resumed, not signed out: the draft is seeded from the account —
 * once per uid, and not at all when a wizard for this account is already under
 * way — and role selection opens in "Finish setting up your account" mode.
 *
 * Any other failure is not evidence of anything about the account, so it is
 * never grounds to sign out: the root shows "Couldn't connect" with Retry, and
 * signing out is left to her.
 */
export function useRootGate(): RootGate {
  const user = useAuthStore((s) => s.user);
  const isGuest = useGuestStore((s) => s.isGuest);
  const profile = useUserProfileStore((s) => s.profile);
  const meQuery = useMe();
  const signOut = useSignOut();

  const needsSetup = !!user && !profile && !meQuery.isFetching && isNotFound(meQuery.error);
  // The uid whose draft is ready for role selection. Redirecting waits for it
  // so role selection never renders before the seed lands.
  const [seededUid, setSeededUid] = useState<string | null>(null);

  useEffect(() => {
    if (!needsSetup || !user || seededUid === user.uid) return;
    if (useRegistrationDraftStore.getState().signUpUid !== user.uid) {
      const current = auth().currentUser;
      seedDraftFromAccount(current && current.uid === user.uid ? current : user);
    }
    setSeededUid(user.uid);
  }, [needsSetup, user, seededUid]);

  // No Firebase user: guests browse the read-only parent experience,
  // everyone else lands on sign-in.
  if (!user) {
    return { kind: 'redirect', href: isGuest ? '/(parent)/(tabs)/home' : '/(auth)/sign-in' };
  }

  // Firebase user but profile fetch in flight — a blank frame while
  // `/auth/me` loads, rather than routing anywhere yet.
  if (meQuery.isFetching && !profile) return { kind: 'wait' };

  // Firebase user + backend profile — route by role.
  if (profile) {
    // Registration proves the address for both roles, so an unverified one
    // means an account created before that rule: it still carries the
    // phone-derived placeholder in users.email. Bookings are gated on a proven
    // address, and receipts have nowhere to go without one, so collect it here
    // rather than letting them wander into the app.
    if (!profile.isEmailVerified) return { kind: 'redirect', href: '/(auth)/verify-email' };

    if (profile.role === Role.NANNY) {
      // Nannies are approved by an admin before they can use the app. If their
      // ID is missing (PENDING_ID) or the application was rejected (REJECTED),
      // force a re-upload; once uploaded (PENDING_REVIEW) they wait; APPROVED
      // lets them in.
      switch (profile.approvalStatus) {
        case ApprovalStatus.APPROVED:
          return { kind: 'redirect', href: '/(nanny)/dashboard' };
        case ApprovalStatus.PENDING_ID:
        case ApprovalStatus.REJECTED:
          return { kind: 'redirect', href: '/(auth)/upload-id' };
        default:
          return { kind: 'redirect', href: '/(auth)/pending-review' };
      }
    }
    return { kind: 'redirect', href: '/(parent)/(tabs)/home' };
  }

  // Firebase user with no row — finish setting it up.
  if (needsSetup) {
    return seededUid === user.uid ? { kind: 'redirect', href: '/(auth)/role-selection' } : { kind: 'wait' };
  }

  if (meQuery.isError) {
    return {
      kind: 'error',
      retry: () => void meQuery.refetch(),
      signOut: () => signOut.mutate(),
      isSigningOut: signOut.isPending,
    };
  }

  // No profile, no error, not fetching — the profile store is about to catch
  // up with the query.
  return { kind: 'wait' };
}
