import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubmitIdRequest, UpdateProfileRequest, UserResponse } from '@nanny-app/shared';

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

  // If a *different* Firebase account signs in (logout → login as another
  // role), drop the previous user's profile immediately so the role-based
  // router never routes by stale data while /auth/me refetches.
  const lastUidRef = useRef(firebaseUser?.uid);
  useEffect(() => {
    if (lastUidRef.current !== firebaseUser?.uid) {
      lastUidRef.current = firebaseUser?.uid;
      setProfile(null);
    }
  }, [firebaseUser?.uid, setProfile]);

  useEffect(() => {
    if (query.data) {
      setProfile(query.data);
    } else if (!firebaseUser) {
      setProfile(null);
    }
  }, [query.data, firebaseUser, setProfile]);

  return query;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const firebaseUser = useAuthStore((s) => s.user);
  const setProfile = useUserProfileStore((s) => s.setProfile);

  return useMutation<UserResponse, Error, UpdateProfileRequest>({
    mutationFn: (body) => unwrap(api.patch('/auth/me', body)),
    onSuccess: (updated) => {
      setProfile(updated);
      queryClient.setQueryData(['auth', 'me', firebaseUser?.uid], updated);
    },
  });
}

/**
 * Submits (or re-submits) the user's identity document to `POST /auth/id`.
 * Used by both the nanny forced re-upload screen and the mother booking-gate
 * modal. The response moves the account to PENDING_REVIEW; mirror it into the
 * profile store so gating recomputes immediately.
 */
export function useSubmitId() {
  const queryClient = useQueryClient();
  const firebaseUser = useAuthStore((s) => s.user);
  const setProfile = useUserProfileStore((s) => s.setProfile);

  return useMutation<UserResponse, Error, SubmitIdRequest>({
    mutationFn: (body) => unwrap(api.post('/auth/id', body)),
    onSuccess: (updated) => {
      setProfile(updated);
      queryClient.setQueryData(['auth', 'me', firebaseUser?.uid], updated);
    },
  });
}
