import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { nannyStatusRoute } from '@mobile/lib/nannyStatusRoute';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { ApprovalStatus, Role } from '@shared/auth';

/**
 * Keeps a nanny inside the nanny screens only while she is APPROVED. The
 * launch gate decides once; an admin can send her ID back while she's in the
 * app, so this watches the profile and moves her the moment it changes. It
 * also re-reads `/auth/me` when the app comes back to the foreground — the
 * push that announces the change may have been missed.
 */
export function useNannyAccessGuard(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useUserProfileStore((s) => s.profile);
  const status = profile?.role === Role.NANNY ? profile.approvalStatus : null;

  useEffect(() => {
    if (status && status !== ApprovalStatus.APPROVED) {
      router.replace(nannyStatusRoute(status));
    }
  }, [status, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    return () => subscription.remove();
  }, [queryClient]);
}
