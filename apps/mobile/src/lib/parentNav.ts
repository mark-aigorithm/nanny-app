import type { Router } from 'expo-router';

export type ParentTabHref =
  | '/(parent)/(tabs)/home'
  | '/(parent)/(tabs)/services'
  | '/(parent)/(tabs)/bookings'
  | '/(parent)/(tabs)/mother-profile';

/**
 * Opens a parent tab from wherever she is. The parent area is a Stack over the
 * (tabs) group, and each kind of navigation only works from one side:
 *
 * - from a tab, `navigate` switches tabs (`dismissTo` would silently do nothing);
 * - from a stack screen, `dismissTo` pops back to the tabs (`push`/`navigate`
 *   would stack a second copy of them).
 *
 * `segments` is `useSegments()` read at the moment of the call.
 */
export function goToParentTab(
  router: Router,
  segments: readonly string[],
  href: ParentTabHref,
): void {
  const onATab = segments[0] === '(parent)' && segments[1] === '(tabs)';
  if (onATab) {
    router.navigate(href);
  } else {
    router.dismissTo(href);
  }
}
