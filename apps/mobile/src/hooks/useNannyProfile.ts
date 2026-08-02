import { useQuery } from '@tanstack/react-query';
import type { NannyProfileResponse } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';

export const NANNY_PROFILE_KEY = 'nanny-profile';

export function useNannyProfile() {
  const firebaseUser = useAuthStore((s) => s.user);
  return useQuery<NannyProfileResponse>({
    queryKey: [NANNY_PROFILE_KEY, firebaseUser?.uid],
    enabled: !!firebaseUser,
    queryFn: () => unwrap(api.get('/nanny/profile')),
  });
}
