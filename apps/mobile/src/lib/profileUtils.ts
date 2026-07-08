import type { BottomNavTab } from '@mobile/components/BottomNav';

export type ProfileReturnTo =
  | BottomNavTab
  | 'home-dashboard'
  | 'customer-support'
  | 'events-meetups'
  | 'mother-profile';

const RETURN_HREF: Record<ProfileReturnTo, string> = {
  home: '/(parent)/home',
  bookings: '/(parent)/bookings',
  community: '/(parent)/community',
  messages: '/(parent)/messages',
  'home-dashboard': '/(parent)/home-dashboard',
  'customer-support': '/(parent)/customer-support',
  'events-meetups': '/(parent)/events-meetups',
  'mother-profile': '/(parent)/mother-profile',
};

export function getProfileReturnHref(returnTo?: string): string {
  if (returnTo && returnTo in RETURN_HREF) {
    return RETURN_HREF[returnTo as ProfileReturnTo];
  }
  return RETURN_HREF.home;
}

export const PARENT_TAB_SEGMENTS = ['home', 'bookings', 'community', 'messages'] as const;

export function getReturnToFromSegments(segments: string[]): ProfileReturnTo {
  const tab = segments.find((s): s is BottomNavTab =>
    (PARENT_TAB_SEGMENTS as readonly string[]).includes(s),
  );
  if (tab) return tab;

  if (segments.includes('home-dashboard')) return 'home-dashboard';
  if (segments.includes('customer-support')) return 'customer-support';
  if (segments.includes('events-meetups')) return 'events-meetups';

  return 'home';
}
