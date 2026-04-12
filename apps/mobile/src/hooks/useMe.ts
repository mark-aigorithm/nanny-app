import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UserResponse } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/**
 * Fetches the current user's application profile from the backend
 * (`GET /auth/me`) whenever a Firebase user is signed in. The result is
 * mirrored into the `userProfileStore` so screens can read it without
 * holding a React Query subscription.
 *
 * Returns the React Query result so screens can show loading / error states
 * if they care, but most screens should just read `useUserProfileStore`.
 */
export function useMe() {
  const firebaseUser = useAuthStore((s) => s.user);
  const setProfile = useUserProfileStore((s) => s.setProfile);

  const query = useQuery<UserResponse>({
    queryKey: ['auth', 'me', firebaseUser?.uid],
    enabled: !!firebaseUser,
    queryFn: async () => unwrap(api.get('/auth/me')),
    // 404 from /auth/me is a real signal (not registered) — don't retry
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message.toLowerCase().includes('not found')) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (query.data) {
      setProfile(query.data);
    } else if (!firebaseUser) {
      setProfile(null);
    }
  }, [query.data, firebaseUser, setProfile]);

  return query;
}
