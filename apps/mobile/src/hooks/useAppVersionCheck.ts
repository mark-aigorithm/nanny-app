import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import type { AppPlatform, AppVersionCheckResult } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { APP_VERSION_CHECK_KEY } from '@mobile/lib/queryClient';

export { APP_VERSION_CHECK_KEY };

/** The version the store installed; the JS config version only as a fallback when the native version is unavailable. */
export function installedAppVersion(): string | null {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
}

function apiPlatform(): AppPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

/**
 * Whether this install is current. Runs without sign-in, again whenever the
 * app returns to the foreground (React Query's focusManager is bound to
 * AppState in the root layout). Errors are left to the caller, which fails open.
 */
export function useAppVersionCheck() {
  const platform = apiPlatform();
  const version = installedAppVersion();
  return useQuery({
    queryKey: [APP_VERSION_CHECK_KEY, platform, version],
    queryFn: () =>
      unwrap<AppVersionCheckResult>(
        api.get('/app-version/check', { params: { platform, version } }),
      ),
    enabled: platform !== null && version !== null,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

/**
 * True while this install is below the newest mandatory release. Hosts that
 * open their own Modals (rating, shift prompts) render nothing meanwhile, so
 * nothing can sit above the update blocker. React Query shares the request.
 */
export function useIsUpdateRequired(): boolean {
  const { data } = useAppVersionCheck();
  return data?.status === 'update_required';
}

/**
 * True once the check has answered or failed (or never runs here). Hosts that
 * yield to the blocker wait for this before opening a Modal, so theirs never
 * has to unmount in the same commit the blocker mounts.
 */
export function useIsVersionCheckSettled(): boolean {
  const { isFetched, isError } = useAppVersionCheck();
  const runs = apiPlatform() !== null && installedAppVersion() !== null;
  return !runs || isFetched || isError;
}
