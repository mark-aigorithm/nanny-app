/**
 * Where a pushed-over screen (rewards, refer, support…) returns to.
 * Keys are historical route names, NOT tab keys — 'bookings' is the
 * Activity tab's route, 'mother-profile' the Account tab's.
 */
export type ProfileReturnTo =
  | 'home'
  | 'services'
  | 'bookings'
  | 'community'
  | 'messages'
  | 'customer-support'
  | 'events-meetups'
  | 'mother-profile';

const RETURN_HREF: Record<ProfileReturnTo, string> = {
  home: '/(parent)/home',
  services: '/(parent)/services',
  bookings: '/(parent)/bookings',
  community: '/(parent)/community',
  messages: '/(parent)/messages',
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

export const PARENT_TAB_SEGMENTS = ['home', 'services', 'bookings', 'community', 'messages'] as const;

export function getReturnToFromSegments(segments: string[]): ProfileReturnTo {
  const tab = segments.find((s): s is (typeof PARENT_TAB_SEGMENTS)[number] =>
    (PARENT_TAB_SEGMENTS as readonly string[]).includes(s),
  );
  if (tab) return tab;

  if (segments.includes('customer-support')) return 'customer-support';
  if (segments.includes('events-meetups')) return 'events-meetups';

  return 'home';
}
