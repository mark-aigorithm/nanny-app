import { useEffect } from 'react';

import { api } from '@mobile/lib/api';
import { subscribeAppActive } from '@mobile/lib/queryClient';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/** At most one ping per account per five minutes; the server throttles to 60 s on top. */
export const APP_OPEN_PING_INTERVAL_MS = 5 * 60 * 1000;

// In memory on purpose: a new process is a new app open, so a cold start always
// pings. Keyed by account, so switching accounts pings for the new one at once.
let lastPing: { uid: string; at: number } | null = null;

/**
 * Tells the backend she opened the app (`users.last_app_open_at`, which dynamic
 * groups such as "not opened in 30 days" read). Best effort: a failure is
 * dropped — it must never surface, retry or block anything.
 */
export function pingAppOpen(uid: string): void {
  const now = Date.now();
  if (lastPing && lastPing.uid === uid && now - lastPing.at < APP_OPEN_PING_INTERVAL_MS) return;
  lastPing = { uid, at: now };
  void api.post('/me/app-open').catch(() => undefined);
}

/** Forgets the last ping. For tests. */
export function resetAppOpenPing(): void {
  lastPing = null;
}

/**
 * Pings on a cold start and on every return to the foreground, once she is
 * signed in and her profile has loaded (so the backend has a row to stamp).
 * Guests have no Firebase user and never ping. Mounted once, in ProfileLoader.
 */
export function useAppOpenPing(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const hasProfile = useUserProfileStore((s) => s.profile !== null);

  useEffect(() => {
    if (!uid || !hasProfile) return undefined;
    pingAppOpen(uid);
    return subscribeAppActive((isActive) => {
      if (isActive) pingAppOpen(uid);
    });
  }, [uid, hasProfile]);
}
